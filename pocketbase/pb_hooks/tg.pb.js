/// <reference path="../pb_data/types.d.ts" />
// Telegram-бот (логика — tg.js). Без TG_TOKEN всё молча выключено.

// кабинет просит ссылку для привязки: t.me/<бот>?start=<одноразовый код>
routerAdd("POST", "/api/tg/link", (e) => {
  const tg = require(`${__hooks}/tg.js`)
  if (!tg.token()) return e.json(200, { url: "", message: "Бот ещё не подключён к сайту" })
  tg.ensureWebhook()
  const url = tg.linkFor(e.app, e.auth.id)
  if (!url) return e.json(502, { message: "Telegram сейчас не отвечает, попробуйте позже" })
  return e.json(200, { url })
}, $apis.requireAuth("users"))

// сообщения боту приходят сюда; Telegram подписывает их секретом (см. ensureWebhook)
routerAdd("POST", "/api/tg/hook", (e) => {
  const tg = require(`${__hooks}/tg.js`)
  if (!tg.token() || e.request.header.get("X-Telegram-Bot-Api-Secret-Token") !== tg.hookSecret()) return e.json(403, {})
  try { tg.onMessage(e.app, e.requestInfo().body.message) } catch (err) {}
  return e.json(200, {})
})

// для проверки: разослать напоминания прямо сейчас (только суперпользователь)
routerAdd("POST", "/api/tg/run", (e) => e.json(200, { sent: require(`${__hooks}/tg.js`).remindAll(e.app, true) }), $apis.requireSuperuserAuth())

// раз в час: у кого сейчас выбранное время — напоминание; вебхук обновляем время от времени
cronAdd("tg-remind", "7 * * * *", () => { require(`${__hooks}/tg.js`).remindAll($app, false) })
cronAdd("tg-webhook", "17 */6 * * *", () => { require(`${__hooks}/tg.js`).ensureWebhook() })

onRecordAfterCreateSuccess((e) => { e.next(); require(`${__hooks}/tg.js`).onChatMessage(e.app, e.record) }, "messages")

// новые статьи в журнале (Даша опубликовала) — тем, кто выбрал «Новые статьи»
onRecordAfterUpdateSuccess((e) => {
  e.next()
  if (e.record.getString("key") !== "site") return
  const arts = (r) => { try { return JSON.parse(toString(r.get("data"))).articles || [] } catch (err) { return [] } }
  const before = {}
  arts(e.record.original()).forEach((a) => { before[a.id] = true })
  require(`${__hooks}/tg.js`).onNewArticles(e.app, arts(e.record).filter((a) => a && a.id && !before[a.id]))
}, "content")
