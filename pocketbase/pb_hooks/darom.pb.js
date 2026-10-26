/// <reference path="../pb_data/types.d.ts" />
// «Вещи даром» (логика — darom.js).

// «спасибо» — только от того, кто договаривался о вещи, и только когда она отдана
onRecordCreateRequest((e) => { require(`${__hooks}/darom.js`).checkThanks(e.app, e.record); e.next() }, "thanks")

// автор продлил объявление — напоминание начнётся заново; «Одолжено» — срок возврата считается сам
onRecordUpdateRequest((e) => {
  const o = e.record.original()
  if (String(e.record.getString("until")) !== String(o.getString("until"))) e.record.set("reminded", "")
  require(`${__hooks}/darom.js`).onLent(e.app, e.record, o)
  // вернули вещь, взятую на время, — она снова свободна
  if (o.getString("status") === "lent" && e.record.getString("status") === "active") { e.record.set("chosen", ""); e.record.set("return_by", "") }
  e.next()
}, "listings")
// прошла проверку — тем, кто ищет такое, и подписчикам
onRecordAfterUpdateSuccess((e) => {
  e.next()
  if (e.record.getString("moderation") === "approved" && e.record.original().getString("moderation") !== "approved") require(`${__hooks}/darom.js`).onApproved(e.app, e.record)
}, "listings")

// «Хочу забрать»
onRecordCreateRequest((e) => { require(`${__hooks}/darom.js`).checkClaim(e.app, e.record); e.next() }, "claims")
onRecordAfterCreateSuccess((e) => { e.next(); require(`${__hooks}/darom.js`).claimsChanged(e.app, e.record.getString("listing"), e.record.getString("user")) }, "claims")
onRecordAfterDeleteSuccess((e) => { e.next(); require(`${__hooks}/darom.js`).claimsChanged(e.app, e.record.getString("listing"), "") }, "claims")
routerAdd("POST", "/api/darom/choose", (e) => {
  const body = e.requestInfo().body || {}
  return e.json(200, require(`${__hooks}/darom.js`).choose(e.app, e.auth.id, String(body.claim || "")))
}, $apis.requireAuth("users"))
cronAdd("darom-subs", "*/30 * * * *", () => { require(`${__hooks}/darom.js`).flushSubs($app) })
routerAdd("POST", "/api/darom/flush", (e) => {
  if (!e.auth || e.auth.getString("role") !== "admin") return e.json(403, { message: "Только для администратора" })
  return e.json(200, { sent: require(`${__hooks}/darom.js`).flushSubs(e.app) })
}, $apis.requireAuth("users"))

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
