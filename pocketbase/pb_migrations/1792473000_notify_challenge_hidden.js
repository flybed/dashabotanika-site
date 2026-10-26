/// <reference path="../pb_data/types.d.ts" />
// 1) Напоминания о челлендже теперь можно получать и на почту: в notify добавлены темы challenge и nudge,
//    время напоминания (hour по местному времени, tz — смещение в минутах) и день последнего письма.
// 2) Признак «скрыт» у участника: такого нет в «Счастливом мире» и в рейтинге игры (сейчас — помощник статей).
//    Ставит его только администратор, сам участник поменять не может.
// 3) В админке (settings → TG_API) можно указать посредника для Telegram, если сервер не достаёт до api.telegram.org.
const HELPER = "dashabotanika.site+writer@yandex.com"
const NO_HIDDEN = "@request.body.hidden:isset = false"
migrate((app) => {
  const notify = app.findCollectionByNameOrId("notify")
  const topics = notify.fields.getByName("email_topics")
  topics.values = ["messages", "articles", "weekly", "challenge", "nudge"]
  topics.maxSelect = 5
  notify.fields.add(new NumberField({ name: "hour", onlyInt: true, min: 0, max: 23 }))
  notify.fields.add(new NumberField({ name: "tz", onlyInt: true, min: -720, max: 840 }))
  notify.fields.add(new TextField({ name: "last_challenge", max: 20 }))
  app.save(notify)

  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new BoolField({ name: "hidden" }))
  users.createRule = NO_HIDDEN + " && " + users.createRule
  users.updateRule = users.updateRule.replace("(id = @request.auth.id && ", "(id = @request.auth.id && " + NO_HIDDEN + " && ")
  app.save(users)
  try { const u = app.findAuthRecordByEmail("users", HELPER); u.set("hidden", true); app.save(u) } catch (e) {}

  const settings = app.findCollectionByNameOrId("settings")
  try { app.findFirstRecordByData("settings", "key", "TG_API") } catch (e) {
    const r = new Record(settings)
    r.set("key", "TG_API"); r.set("value", ""); r.set("note", "Адрес посредника для Telegram (если сервер не достаёт до api.telegram.org); пусто — напрямую")
    app.save(r)
  }
}, (app) => {
  const notify = app.findCollectionByNameOrId("notify")
  const topics = notify.fields.getByName("email_topics")
  topics.values = ["messages", "articles", "weekly"]; topics.maxSelect = 3
  for (const f of ["hour", "tz", "last_challenge"]) notify.fields.removeByName(f)
  app.save(notify)
  const users = app.findCollectionByNameOrId("users")
  users.createRule = users.createRule.replace(NO_HIDDEN + " && ", "")
  users.updateRule = users.updateRule.replace(NO_HIDDEN + " && ", "")
  users.fields.removeByName("hidden")
  app.save(users)
  try { app.delete(app.findFirstRecordByData("settings", "key", "TG_API")) } catch (e) {}
})
