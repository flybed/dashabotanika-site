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
  if (changed && e.record.getString("city")) try { const geo = require(`${__hooks}/geo.js`); geo.profilePoint(e.app, e.record); geo.syncListings(e.app, e.record) } catch (err) {}
}, "profiles")
onRecordCreateRequest((e) => {
  try {
    const p = e.app.findFirstRecordByFilter("profiles", "owner = {:u}", { u: e.record.getString("seller") })
    if (!e.record.getString("district") && p.getString("district")) e.record.set("district", p.getString("district"))
    if (!e.record.getString("city") && p.getString("city")) e.record.set("city", p.getString("city"))
    const pt = require(`${__hooks}/geo.js`).profilePoint(e.app, p)
    if (pt) { e.record.set("lat", pt.lat); e.record.set("lon", pt.lon) }
  } catch (err) {}
  if (!e.record.get("lat") && e.record.getString("city")) {
    const pt = require(`${__hooks}/geo.js`).lookup("", e.record.getString("city"), e.record.getString("district"))
    if (pt) { e.record.set("lat", pt.lat); e.record.set("lon", pt.lon) }
  }
  e.next()
}, "listings")
// вещи без точки (старые или когда сервис был недоступен) — раз в час
cronAdd("geo-backfill", "37 * * * *", () => { require(`${__hooks}/geo.js`).backfill($app, 10) })
