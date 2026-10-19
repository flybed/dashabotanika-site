/// <reference path="../pb_data/types.d.ts" />
// Сайт раз в пару минут сообщает, что участник на месте; время ставит сервер.

routerAdd("POST", "/api/db/ping", (e) => {
  const uid = e.auth.id
  let rec
  try {
    rec = e.app.findFirstRecordByFilter("presence", "user = {:u}", { u: uid })
  } catch (err) {
    rec = new Record(e.app.findCollectionByNameOrId("presence"))
    rec.set("user", uid)
  }
  rec.set("last_seen", new Date().toISOString())
  e.app.save(rec)
  return e.json(200, { ok: true })
}, $apis.requireAuth("users"))
