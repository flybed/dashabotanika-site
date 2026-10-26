/// <reference path="../pb_data/types.d.ts" />
// «Друг проекта» (по образцу подписки Buy Nothing): всё основное бесплатно, а тем, кто поддержал проект,
// — значок, закладки на вещи и уведомления о новых вещах сразу, без ожидания. Статус до даты ставит администратор;
// ссылку «Поддержать» (CloudTips, Boosty, ЮMoney…) он вписывает в настройки, ключ SUPPORT_URL.
const MOD = '(@request.auth.role = "moderator" || @request.auth.role = "admin")'
const NO_FRIEND = "@request.body.friend_until:isset = false"
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new DateField({ name: "friend_until" }))
  users.createRule = NO_FRIEND + " && " + users.createRule
  users.updateRule = users.updateRule.replace("(id = @request.auth.id && ", "(id = @request.auth.id && " + NO_FRIEND + " && ")
  app.save(users)
  app.save(new Collection({
    type: "base", name: "bookmarks",
    listRule: "user = @request.auth.id", viewRule: "user = @request.auth.id",
    createRule: "@request.auth.id != '' && @request.body.user = @request.auth.id && @request.auth.friend_until > @now",
    deleteRule: "user = @request.auth.id",
    fields: [
      { name: "user", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "listing", type: "relation", collectionId: app.findCollectionByNameOrId("listings").id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "created", type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_bookmarks_user_listing ON bookmarks (`user`, `listing`)"],
  }))
  try { app.findFirstRecordByData("settings", "key", "SUPPORT_URL") } catch (e) {
    const r = new Record(app.findCollectionByNameOrId("settings"))
    r.set("key", "SUPPORT_URL"); r.set("value", ""); r.set("note", "Ссылка «Поддержать проект» для «Друга проекта»: CloudTips, Boosty, ЮMoney и т. п. Пусто — кнопки нет.")
    app.save(r)
  }
}, (app) => {
  app.delete(app.findCollectionByNameOrId("bookmarks"))
  const users = app.findCollectionByNameOrId("users")
  users.createRule = users.createRule.replace(NO_FRIEND + " && ", "")
  users.updateRule = users.updateRule.replace(NO_FRIEND + " && ", "")
  users.fields.removeByName("friend_until")
  app.save(users)
  try { app.delete(app.findFirstRecordByData("settings", "key", "SUPPORT_URL")) } catch (e) {}
})
