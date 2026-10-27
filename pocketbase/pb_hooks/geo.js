/// <reference path="../pb_data/types.d.ts" />
// Примерное место по городу и району (OpenStreetMap / Nominatim) — когда браузер его не определил.
// Точность ~1 км; адрес не нужен и не хранится. GEO_API — подмена сервиса в тестах.
const base = () => String($os.getenv("GEO_API") || "https://nominatim.openstreetmap.org").replace(/\/+$/, "")
const r2 = (x) => Math.round(Number(x) * 100) / 100

function lookup(country, city, district) {
  const tries = [[district, city, country], [city, country]].map((a) => a.filter(Boolean).join(", "))
  for (const q of tries) {
    if (!q || !city) continue
    try {
      const res = $http.send({ url: `${base()}/search?format=jsonv2&limit=1&accept-language=ru&q=${encodeURIComponent(q)}`, method: "GET",
        headers: { "user-agent": "DashaBotanikaBot/1.0 (https://dashabotanika.ru)" }, timeout: 6 })
      const j = res.json
      if (res.statusCode === 200 && j && j[0] && Number(j[0].lat)) return { lat: r2(j[0].lat), lon: r2(j[0].lon) }
    } catch (e) {}
  }
  return null
}

// у профиля нет координат, а город есть — находим и сохраняем
function profilePoint(app, p) {
  if (p.get("lat") && p.get("lon")) return { lat: r2(p.get("lat")), lon: r2(p.get("lon")) }
  const pt = lookup(p.getString("country"), p.getString("city"), p.getString("district"))
  if (pt) { p.set("lat", pt.lat); p.set("lon", pt.lon); try { app.saveNoValidate(p) } catch (e) {} }
  return pt
}

// место профиля → его вещам, которые ещё не отданы
function syncListings(app, p) {
  const pt = p.get("lat") && p.get("lon") ? { lat: r2(p.get("lat")), lon: r2(p.get("lon")) } : null
  let n = 0
  for (const l of app.findRecordsByFilter("listings", "seller = {:u} && status != 'gone'", "", 0, 0, { u: p.getString("owner") })) {
    const want = { lat: pt ? pt.lat : l.get("lat"), lon: pt ? pt.lon : l.get("lon"), city: p.getString("city") || l.getString("city"), district: p.getString("district") || l.getString("district") }
    if (Object.keys(want).every((k) => l.get(k) === want[k])) continue
    for (const k in want) l.set(k, want[k])
    app.saveNoValidate(l); n++
  }
  return n
}

// вещи без точки: берём из профиля, иначе ищем по городу и району вещи (не больше max за раз — у Nominatim лимит)
function backfill(app, max) {
  let done = 0, looked = 0
  for (const l of app.findRecordsByFilter("listings", "lat = 0 && city != '' && status != 'gone'", "-created", 50, 0)) {
    let pt = null
    try { const p = app.findFirstRecordByFilter("profiles", "owner = {:u}", { u: l.getString("seller") }); if (p.get("lat") || looked < (max || 10)) { if (!p.get("lat")) looked++; pt = profilePoint(app, p) } } catch (e) {}
    if (!pt && looked < (max || 10)) { looked++; pt = lookup("", l.getString("city"), l.getString("district")) }
    if (pt) { l.set("lat", pt.lat); l.set("lon", pt.lon); app.saveNoValidate(l); done++ }
  }
  return done
}

module.exports = { lookup, profilePoint, syncListings, backfill }
