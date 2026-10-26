/// <reference path="../pb_data/types.d.ts" />
// «Вещи даром» (логика — darom.js).

// «спасибо» — только от того, кто договаривался о вещи, и только когда она отдана
onRecordCreateRequest((e) => { require(`${__hooks}/darom.js`).checkThanks(e.app, e.record); e.next() }, "thanks")

// автор продлил объявление — напоминание начнётся заново
onRecordUpdateRequest((e) => {
  const o = e.record.original()
  if (String(e.record.getString("until")) !== String(o.getString("until"))) e.record.set("reminded", "")
  e.next()
}, "listings")

// счётчик пользы и «доверие» к людям (?u=id1,id2) — открыто всем
routerAdd("GET", "/api/darom/stats", (e) => {
  const ids = String(e.request.url.query().get("u") || "").split(",").filter(Boolean)
  return e.json(200, require(`${__hooks}/darom.js`).stats(e.app, ids))
})
routerAdd("GET", "/api/darom/mine", (e) => e.json(200, require(`${__hooks}/darom.js`).mine(e.app, e.auth.id)), $apis.requireAuth("users"))

// раз в день: напомнить о просроченных объявлениях и убрать в архив забытые
cronAdd("darom-expire", "23 7 * * *", () => { require(`${__hooks}/darom.js`).expire($app) })
// то же вручную (для администратора и проверок)
routerAdd("POST", "/api/darom/expire", (e) => {
  if (!e.auth || e.auth.getString("role") !== "admin") return e.json(403, { message: "Только для администратора" })
  return e.json(200, require(`${__hooks}/darom.js`).expire(e.app))
}, $apis.requireAuth("users"))
