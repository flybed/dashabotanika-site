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

// ссылка «Поддержать проект» для блока «Друг проекта» (сама ссылка — в настройках, ключ SUPPORT_URL)
routerAdd("GET", "/api/darom/support", (e) => e.json(200, { url: require(`${__hooks}/darom.js`).support(e.app) }))

// бронь на 48 часов — проверяем каждый час
cronAdd("darom-reservations", "41 * * * *", () => { require(`${__hooks}/darom.js`).reservations($app) })
routerAdd("POST", "/api/darom/hold", (e) => {
  const body = e.requestInfo().body || {}
  return e.json(200, require(`${__hooks}/darom.js`).hold(e.app, e.auth.id, String(body.listing || "")))
}, $apis.requireAuth("users"))
routerAdd("POST", "/api/darom/reservations", (e) => {
  if (!e.auth || e.auth.getString("role") !== "admin") return e.json(403, { message: "Только для администратора" })
  return e.json(200, require(`${__hooks}/darom.js`).reservations(e.app))
}, $apis.requireAuth("users"))
// надёжные дарители (5+ отданных вещей, ни одного отказа) публикуются без ожидания проверки
onRecordCreateRequest((e) => {
  try { if (require(`${__hooks}/darom.js`).trusted(e.app, e.record.getString("seller"))) e.record.set("moderation", "approved") } catch (err) {}
  e.next()
}, "listings")
onRecordAfterCreateSuccess((e) => { e.next(); if (e.record.getString("moderation") === "approved") require(`${__hooks}/darom.js`).onApproved(e.app, e.record) }, "listings")

// ---------- письмо дарителю после проверки ----------
// служебные поля писем меняет только сервер (и суперпользователь при проверках), не запрос автора или модератора
onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) { const o = e.record.original(); for (const f of ["mod_due", "mod_mail", "mod_tries", "mod_next"]) e.record.set(f, o.get(f)) }
  e.next()
}, "listings")
// сменился статус проверки (или причина отказа) — письмо в очередь; то же самое ещё раз — нет
onRecordUpdate((e) => {
  const o = e.record.original()
  if (o.getString("moderation") !== e.record.getString("moderation") || o.getString("reason") !== e.record.getString("reason")) require(`${__hooks}/darom.js`).modChanged(e.record)
  e.next()
}, "listings")
// опубликовано сразу (надёжный даритель) — человек видит это сам, письма не нужно
onRecordCreate((e) => { if (e.record.getString("moderation")) e.record.set("mod_mail", require(`${__hooks}/darom.js`).modMark(e.record)); e.next() }, "listings")
cronAdd("darom-mod-mail", "* * * * *", () => { require(`${__hooks}/darom.js`).modMail($app, 20) })
routerAdd("POST", "/api/darom/mod-mail", (e) => {
  if (!e.auth || e.auth.getString("role") !== "admin") return e.json(403, { message: "Только для администратора" })
  return e.json(200, require(`${__hooks}/darom.js`).modMail(e.app, 20))
}, $apis.requireAuth("users"))

// ---------- «Отключить уведомления» из сообщения в Telegram ----------
routerAdd("GET", "/api/darom/tg-off", (e) => {
  const D = require(`${__hooks}/darom.js`), r = D.tgOff(e.app, String(e.request.url.query().get("t") || ""))
  return e.html(r === "unknown" ? 404 : 200, D.tgOffPage(r))
})
