/// <reference path="../pb_data/types.d.ts" />
// Когда участник был на сайте последний раз. Пишет только сервер (/api/db/ping),
// видят только модераторы и администратор.
const MOD = '(@request.auth.role = "moderator" || @request.auth.role = "admin")';

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  app.save(new Collection({
    type: "base",
    name: "presence",
    listRule: MOD,
    viewRule: MOD,
    fields: [
      { name: "user", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "last_seen", type: "date" },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_presence_user ON presence (user)"],
  }));
}, (app) => {
  app.delete(app.findCollectionByNameOrId("presence"));
});
