/// <reference path="../pb_data/types.d.ts" />
// Место: координаты всегда грубые (~1 км); вещь получает район и примерное место из профиля автора.
// (обработчики PocketBase не видят переменных снаружи — округление внутри каждого)
onRecordCreateRequest((e) => { for (const f of ["lat", "lon"]) if (e.record.get(f)) e.record.set(f, Math.round(Number(e.record.get(f)) * 100) / 100); e.next() }, "profiles")
onRecordUpdateRequest((e) => { for (const f of ["lat", "lon"]) if (e.record.get(f)) e.record.set(f, Math.round(Number(e.record.get(f)) * 100) / 100); e.next() }, "profiles")
onRecordCreateRequest((e) => {
  try {
    const p = e.app.findFirstRecordByFilter("profiles", "owner = {:u}", { u: e.record.getString("seller") })
    if (p.get("lat") && p.get("lon")) { e.record.set("lat", Math.round(Number(p.get("lat")) * 100) / 100); e.record.set("lon", Math.round(Number(p.get("lon")) * 100) / 100) }
    if (!e.record.getString("district") && p.getString("district")) e.record.set("district", p.getString("district"))
    if (!e.record.getString("city") && p.getString("city")) e.record.set("city", p.getString("city"))
  } catch (err) {}
  e.next()
}, "listings")
