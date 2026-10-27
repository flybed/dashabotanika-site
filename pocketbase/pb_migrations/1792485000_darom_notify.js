/// <reference path="../pb_data/types.d.ts" />
// Служебные поля для уведомлений «Вещей даром» (скрыты из API, автор объявления их не меняет):
// listings: письмо дарителю о проверке — mod_due (ждёт отправки), mod_mail (что уже отправлено: «approved» или «rejected|причина»),
//           mod_tries (неудачных попыток), mod_next (не раньше этого времени — пауза между попытками);
// darom_subs: tg_unsub — случайный ключ для кнопки «Отключить уведомления» в Telegram (в ссылке нет ни id, ни данных человека).
const MOD = ["mod_due", "mod_mail", "mod_tries", "mod_next"]
migrate((app) => {
  const l = app.findCollectionByNameOrId("listings")
  l.fields.add(new BoolField({ name: "mod_due", hidden: true }))
  l.fields.add(new TextField({ name: "mod_mail", max: 300, hidden: true }))
  l.fields.add(new NumberField({ name: "mod_tries", onlyInt: true, min: 0, hidden: true }))
  l.fields.add(new DateField({ name: "mod_next", hidden: true }))
  l.updateRule = l.updateRule.replace("(seller = @request.auth.id && ", "(seller = @request.auth.id && " + MOD.map((f) => `@request.body.${f}:isset = false`).join(" && ") + " && ")
  l.createRule = l.createRule + " && " + MOD.map((f) => `@request.body.${f}:isset = false`).join(" && ")
  app.save(l)
  // то, что уже проверено до этой миграции, писем не получает
  for (const r of app.findRecordsByFilter("listings", "moderation != ''", "", 0, 0)) { r.set("mod_mail", r.getString("moderation") === "rejected" ? "rejected|" + r.getString("reason") : r.getString("moderation")); app.saveNoValidate(r) }
  const s = app.findCollectionByNameOrId("darom_subs")
  s.fields.add(new TextField({ name: "tg_unsub", max: 64, hidden: true }))
  s.updateRule = s.updateRule + " && @request.body.tg_unsub:isset = false"
  s.createRule = s.createRule + " && @request.body.tg_unsub:isset = false"
  app.save(s)
}, (app) => {
  const l = app.findCollectionByNameOrId("listings")
  l.updateRule = l.updateRule.replace(MOD.map((f) => `@request.body.${f}:isset = false`).join(" && ") + " && ", "")
  l.createRule = l.createRule.replace(" && " + MOD.map((f) => `@request.body.${f}:isset = false`).join(" && "), "")
  for (const f of MOD) l.fields.removeByName(f)
  app.save(l)
  const s = app.findCollectionByNameOrId("darom_subs")
  s.updateRule = s.updateRule.replace(" && @request.body.tg_unsub:isset = false", "")
  s.createRule = s.createRule.replace(" && @request.body.tg_unsub:isset = false", "")
  s.fields.removeByName("tg_unsub")
  app.save(s)
})
