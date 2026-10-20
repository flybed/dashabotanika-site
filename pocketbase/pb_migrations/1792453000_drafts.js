/// <reference path="../pb_data/types.d.ts" />
// Черновики статей: их каждый день присылает автор-помощник (участник с ролью writer).
// Видят и правят только Даша и модераторы; публикуют в журнал из кабинета.
// Помощник может только добавлять черновики и видеть свои — чтобы не повторять темы.
const MOD = '(@request.auth.role = "moderator" || @request.auth.role = "admin")';

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const role = users.fields.getByName("role");
  role.values = ["member", "moderator", "admin", "writer"];
  app.save(users);

  app.save(new Collection({
    type: "base",
    name: "drafts",
    listRule: MOD + ' || (@request.auth.role = "writer" && author = @request.auth.id)',
    viewRule: MOD + ' || (@request.auth.role = "writer" && author = @request.auth.id)',
    createRule: '(@request.auth.role = "writer" || ' + MOD + ') && @request.body.author = @request.auth.id && @request.body.status:isset = false',
    updateRule: MOD,
    deleteRule: MOD,
    fields: [
      { name: "author", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "cat", type: "select", values: ["Статья", "Новость"], maxSelect: 1 },
      { name: "title", type: "text", required: true, max: 160 },
      { name: "lead", type: "text", max: 400 },
      { name: "body", type: "text", required: true, max: 20000 },
      { name: "keywords", type: "text", max: 300 },
      { name: "sources", type: "text", max: 2000 },
      { name: "note", type: "text", max: 1000 },
      { name: "status", type: "select", values: ["published", "rejected"], maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true },
    ],
  }));
}, (app) => {
  app.delete(app.findCollectionByNameOrId("drafts"));
  const users = app.findCollectionByNameOrId("users");
  users.fields.getByName("role").values = ["member", "moderator", "admin"];
  app.save(users);
});
