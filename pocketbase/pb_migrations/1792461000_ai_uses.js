/// <reference path="../pb_data/types.d.ts" />
// ИИ-помощник по фото: учёт разборов для дневного лимита. Сами фото не хранятся. Видит только сервер.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  app.save(new Collection({
    type: "base",
    name: "ai_uses",
    fields: [
      { name: "user", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "kind", type: "select", values: ["food", "pack"], maxSelect: 1 },
      { name: "tokens", type: "number", onlyInt: true },
      { name: "created", type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE INDEX idx_ai_uses_user ON ai_uses (`user`, `created`)"],
  }));
}, (app) => {
  app.delete(app.findCollectionByNameOrId("ai_uses"));
});
