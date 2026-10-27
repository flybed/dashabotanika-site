/// <reference path="../pb_data/types.d.ts" />
// Место: координаты всегда грубые (~1 км); вещь получает район и примерное место из профиля автора.
// Если браузер точку не определил — сервер находит её по городу и району (geo.js).
// (обработчики PocketBase не видят переменных снаружи — округление внутри каждого)
onRecordCreateRequest((e) => {
  for (const f of ["lat", "lon"]) if (e.record.get(f)) e.record.set(f, Math.round(Number(e.record.get(f)) * 100) / 100)
  e.next()
  if (e.record.getString("city")) try { require(`${__hooks}/geo.js`).profilePoint(e.app, e.record) } catch (err) {}
}, "profiles")
onRecordUpdateRequest((e) => {
  for (const f of ["lat", "lon"]) if (e.record.get(f)) e.record.set(f, Math.round(Number(e.record.get(f)) * 100) / 100)
  // сменили город или район без новой точки — старая точка уже не годится
  const o = e.record.original()
  const moved = ["country", "city", "district"].some((f) => o.getString(f) !== e.record.getString(f))
  if (moved && o.get("lat") === e.record.get("lat") && o.get("lon") === e.record.get("lon")) { e.record.set("lat", 0); e.record.set("lon", 0) }
  const changed = moved || o.get("lat") !== e.record.get("lat") || o.get("lon") !== e.record.get("lon")
  e.next()
  // новое место — вещам автора, которые ещё не отданы
  if (changed && e.record.getString("city")) try { const geo = require(`${__hooks}/geo.js`); geo.profilePoint(e.app, e.record); geo.syncListings(e.app, e.record, { city: o.getString("city"), district: o.getString("district") }) } catch (err) {}
}, "profiles")
onRecordCreateRequest((e) => {
  // пустые город и район — из профиля; точка — по месту самой вещи
  try {
    const p = e.app.findFirstRecordByFilter("profiles", "owner = {:u}", { u: e.record.getString("seller") })
    if (!e.record.getString("city") && p.getString("city")) { e.record.set("city", p.getString("city")); if (!e.record.getString("district")) e.record.set("district", p.getString("district")) }
  } catch (err) {}
  e.record.set("lat", 0); e.record.set("lon", 0)
  try { const pt = require(`${__hooks}/geo.js`).listingPoint(e.app, e.record); if (pt) { e.record.set("lat", pt.lat); e.record.set("lon", pt.lon) } } catch (err) {}
  e.next()
}, "listings")
onRecordUpdateRequest((e) => {
  // автор поменял город или район вещи — точка следом
  const o = e.record.original()
  if (!same2(o, e.record)) {
    e.record.set("lat", 0); e.record.set("lon", 0)
    try { const pt = require(`${__hooks}/geo.js`).listingPoint(e.app, e.record); if (pt) { e.record.set("lat", pt.lat); e.record.set("lon", pt.lon) } } catch (err) {}
  }
  e.next()
  function same2(a, b) { return a.getString("city") === b.getString("city") && a.getString("district") === b.getString("district") }
}, "listings")
// вещи без точки (старые или когда сервис был недоступен) — раз в час
cronAdd("geo-backfill", "37 * * * *", () => { require(`${__hooks}/geo.js`).backfill($app, 10) })
// запустить сейчас, не дожидаясь часа (админ или модератор); говорит, что не вышло
routerAdd("POST", "/api/geo/backfill", (e) => {
  const role = e.auth ? e.auth.getString("role") : ""
  if (role !== "admin" && role !== "moderator") return e.json(403, { message: "Только для администратора" })
  const geo = require(`${__hooks}/geo.js`)
  const body = e.requestInfo().body || {}
  // {"q": "…"} — что отвечает сервис карт (проверить, почему точка не там)
  if (body.q) return e.json(200, { found: geo.search(String(body.q)).map((x) => ({ name: x.display_name, type: x.addresstype || x.type, lat: x.lat, lon: x.lon })), error: geo.lastError() })
  const redo = String(body.redo || "")
  // {"redo": id вещи} — точка встала не туда: заново по месту вещи
  if (redo) try {
    const l = e.app.findRecordById("listings", redo)
    const pt = geo.listingPoint(e.app, l)
    if (pt) { l.set("lat", pt.lat); l.set("lon", pt.lon); e.app.saveNoValidate(l) }
  } catch (err) {}
  const done = geo.backfill(e.app, 10)
  return e.json(200, { done, left: e.app.findRecordsByFilter("listings", "lat = 0 && city != '' && status != 'gone'", "", 0, 0).length, error: geo.lastError() })
}, $apis.requireAuth("users"))
