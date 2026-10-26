/// <reference path="../pb_data/types.d.ts" />
// Уведомление админам и модераторам о новом участнике: тема signups в Telegram и на почте.
// Тем, у кого Telegram уже подключён, тема включается сразу; в кабинете её можно снять.
const ADMINS = "(user.role = 'admin' || user.role = 'moderator')"
migrate((app) => {
  const subs = app.findCollectionByNameOrId("tg_subs")
  const t = subs.fields.getByName("topics")
  t.values = ["challenge", "nudge", "messages", "articles", "weekly", "signups"]; t.maxSelect = 6
  app.save(subs)
  const notify = app.findCollectionByNameOrId("notify")
  const e = notify.fields.getByName("email_topics")
  e.values = ["messages", "articles", "weekly", "challenge", "nudge", "signups"]; e.maxSelect = 6
  app.save(notify)
  for (const s of app.findRecordsByFilter("tg_subs", ADMINS, "", 0, 0)) {
    const list = s.getStringSlice("topics")
    if (list.indexOf("signups") < 0) { s.set("topics", list.concat("signups")); app.save(s) }
  }
}, (app) => {
  for (const s of app.findRecordsByFilter("tg_subs", "id != ''", "", 0, 0)) { s.set("topics", s.getStringSlice("topics").filter((x) => x !== "signups")); app.save(s) }
  for (const r of app.findRecordsByFilter("notify", "id != ''", "", 0, 0)) { r.set("email_topics", r.getStringSlice("email_topics").filter((x) => x !== "signups")); app.save(r) }
  const subs = app.findCollectionByNameOrId("tg_subs")
  const t = subs.fields.getByName("topics"); t.values = ["challenge", "nudge", "messages", "articles", "weekly"]; t.maxSelect = 5
  app.save(subs)
  const notify = app.findCollectionByNameOrId("notify")
  const e = notify.fields.getByName("email_topics"); e.values = ["messages", "articles", "weekly", "challenge", "nudge"]; e.maxSelect = 5
  app.save(notify)
})
