/// <reference path="../pb_data/types.d.ts" />
// Примерное место по городу и району (OpenStreetMap / Nominatim) — когда браузер его не определил.
// Точность ~1 км; адрес не нужен и не хранится. GEO_API — подмена сервиса в тестах.
const base = () => String($os.getenv("GEO_API") || "https://nominatim.openstreetmap.org").replace(/\/+$/, "")
const r2 = (x) => Math.round(Number(x) * 100) / 100

let lastError = ""
// для района годится сам район, квартал или станция метро; город — только когда района нет
const PLACE_TYPES = ["suburb", "city_district", "borough", "quarter", "neighbourhood", "district", "station", "railway", "residential", "road"]
function search(q) {
  try {
    const res = $http.send({ url: `${base()}/search?format=jsonv2&limit=8&accept-language=ru&q=${encodeURIComponent(q)}`, method: "GET",
      headers: { "user-agent": "DashaBotanikaBot/1.0 (https://dashabotanika.ru)" }, timeout: 6 })
    if (res.statusCode !== 200) { lastError = "ответ " + res.statusCode; return [] }
    return (res.json || []).filter((x) => Number(x.lat))
  } catch (e) { lastError = "нет связи с сервисом карт"; return [] }
}
function lookup(country, city, district) {
  if (!city) return null
  const d = String(district || "").trim(), tail = [city, country].filter(Boolean).join(", ")
  // «Академический» в OSM — «Академический район»; «м. Академическая» — «метро Академическая»
  const names = []
  if (d) {
    const m = d.match(/^(м\.?|метро)\s*(.+)$/i)
    if (m) names.push("метро " + m[2], m[2])
    else { names.push(d); if (!/район/i.test(d)) names.push(d + " район") }
  }
  for (const n of names) {
    const j = search(n + ", " + tail)
    // одноимённых мест много (институт, посёлок, сам город) — берём район, квартал, станцию; ближе к началу списка — лучше
    const rank = (x) => { const i = PLACE_TYPES.indexOf(x.addresstype || x.type); return i < 0 ? 99 : i }
    const ok = j.filter((x) => rank(x) < 99).sort((a, b) => rank(a) - rank(b))
    if (ok[0]) return { lat: r2(ok[0].lat), lon: r2(ok[0].lon) }
    if (!lastError || lastError.indexOf("связи") < 0) lastError = "не нашли: " + n + ", " + tail
  }
  const j = search(tail)
  if (j[0]) return { lat: r2(j[0].lat), lon: r2(j[0].lon) }
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

module.exports = { search, lookup, profilePoint, syncListings, backfill, lastError: () => lastError }
