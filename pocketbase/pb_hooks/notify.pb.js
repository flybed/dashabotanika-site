/// <reference path="../pb_data/types.d.ts" />
// Письма по выбору участника (логика — notify.js).

// секрет для ссылки «Отписаться» и время согласия — ставит сервер, не браузер
onRecordCreate((e) => {
  e.record.set("token", $security.randomString(40))
  if (e.record.getStringSlice("email_topics").length) e.record.set("consent_at", new Date().toISOString().replace("T", " "))
  e.next()
}, "notify")
onRecordUpdate((e) => {
  if (e.record.getStringSlice("email_topics").length && !e.record.getString("consent_at")) e.record.set("consent_at", new Date().toISOString().replace("T", " "))
  e.next()
}, "notify")

onRecordAfterCreateSuccess((e) => { e.next(); require(`${__hooks}/notify.js`).onChatMessage(e.app, e.record) }, "messages")
onRecordAfterUpdateSuccess((e) => {
  e.next()
  if (e.record.getString("key") !== "site") return
  const arts = (r) => { try { return JSON.parse(toString(r.get("data"))).articles || [] } catch (err) { return [] } }
  const before = {}
  arts(e.record.original()).forEach((a) => { before[a.id] = true })
  require(`${__hooks}/notify.js`).onNewArticles(e.app, arts(e.record).filter((a) => a && a.id && !before[a.id]))
}, "content")

// письмо недели — по воскресеньям в 11:00 по Москве
cronAdd("notify-articles", "* * * * *", () => { require(`${__hooks}/notify.js`).flushArticles($app) })
cronAdd("notify-weekly", "0 8 * * 0", () => { require(`${__hooks}/notify.js`).weekly($app, false) })
// напоминания о челлендже на почту — раз в час, у кого сейчас выбранное время
cronAdd("notify-remind", "9 * * * *", () => { require(`${__hooks}/notify.js`).remindAll($app, false) })
routerAdd("POST", "/api/notify/remind", (e) => e.json(200, { sent: require(`${__hooks}/notify.js`).remindAll(e.app, true) }), $apis.requireSuperuserAuth())
routerAdd("POST", "/api/notify/weekly", (e) => e.json(200, { sent: require(`${__hooks}/notify.js`).weekly(e.app, true) }), $apis.requireSuperuserAuth())

// «Отписаться» из письма: одна ссылка, без входа на сайт (почтовые программы отписывают одним POST)
routerAdd("GET", "/api/notify/unsub", (e) => require(`${__hooks}/notify.js`).unsubRoute(e))
routerAdd("POST", "/api/notify/unsub", (e) => require(`${__hooks}/notify.js`).unsubRoute(e))
