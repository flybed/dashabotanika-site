/// <reference path="../pb_data/types.d.ts" />
// users.title — особый статус вместо уровня. Сейчас он один: «Эко-создатель» у Даши, создательницы проекта.
// У кого есть статус, тому не показываются уровни, очки роста и сертификаты: на сайте и в «Счастливом мире»
// видно только статус. Сам себе его поставить нельзя, менять может только администратор.
const NO_TITLE = "@request.body.title:isset = false"
const DASHA = "dashabotanika.site@yandex.com"
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new TextField({ name: "title", max: 40 }))
  users.createRule = NO_TITLE + " && " + users.createRule
  users.updateRule = users.updateRule.replace("(id = @request.auth.id && ", "(id = @request.auth.id && " + NO_TITLE + " && ")
  app.save(users)
  try { const d = app.findAuthRecordByEmail("users", DASHA); d.set("title", "Эко-создатель"); app.saveNoValidate(d) } catch (e) {}
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.createRule = users.createRule.replace(NO_TITLE + " && ", "")
  users.updateRule = users.updateRule.replace(NO_TITLE + " && ", "")
  users.fields.removeByName("title")
  app.save(users)
})
