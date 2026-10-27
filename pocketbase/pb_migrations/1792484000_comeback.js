/// <reference path="../pb_data/types.d.ts" />
// Письмо «ОН ТЕБЯ ОЧЕНЬ ЖДЕТ...»: если участник не заходил больше 3 дней — что он ещё не пробовал на сайте.
// Тема comeback: галочка при регистрации (стоит по умолчанию, можно снять) и строка в настройках уведомлений.
// last_comeback — когда письмо ушло: следующее — только если человек вернулся и снова пропал.
migrate((app) => {
  const notify = app.findCollectionByNameOrId("notify")
  const e = notify.fields.getByName("email_topics")
  e.values = ["messages", "articles", "weekly", "challenge", "nudge", "signups", "comeback"]; e.maxSelect = 7
  notify.fields.add(new DateField({ name: "last_comeback" }))
  app.save(notify)
}, (app) => {
  for (const r of app.findRecordsByFilter("notify", "id != ''", "", 0, 0)) { r.set("email_topics", r.getStringSlice("email_topics").filter((x) => x !== "comeback")); app.save(r) }
  const notify = app.findCollectionByNameOrId("notify")
  const e = notify.fields.getByName("email_topics"); e.values = ["messages", "articles", "weekly", "challenge", "nudge", "signups"]; e.maxSelect = 6
  notify.fields.removeByName("last_comeback")
  app.save(notify)
})
