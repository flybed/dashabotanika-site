/// <reference path="../pb_data/types.d.ts" />
// Жалобы на комментарии: участник отмечает плохой комментарий, Даша и модераторы решают — удалить или оставить.
const MOD = '(@request.auth.role = "moderator" || @request.auth.role = "admin")';
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const comments = app.findCollectionByNameOrId("comments");
  app.save(new Collection({
    type: "base",
    name: "reports",
    listRule: "reporter = @request.auth.id || " + MOD,
    viewRule: "reporter = @request.auth.id || " + MOD,
    createRule: "@request.auth.id != '' && @request.body.reporter = @request.auth.id && @request.body.status:isset = false",
    updateRule: MOD,
    deleteRule: MOD,
    fields: [
      { name: "comment", type: "relation", collectionId: comments.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "reporter", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "reason", type: "select", values: ["Спам или реклама", "Грубость или оскорбление", "Не по теме", "Другое"], maxSelect: 1, required: true },
      { name: "status", type: "select", values: ["kept"], maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_reports_once ON reports (`comment`, `reporter`)"],
  }));
}, (app) => {
  app.delete(app.findCollectionByNameOrId("reports"));
});
