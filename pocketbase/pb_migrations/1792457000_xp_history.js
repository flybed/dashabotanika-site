/// <reference path="../pb_data/types.d.ts" />
// История очков роста: за что и когда начислены очки. Записи делает сервер (pb_hooks/levels.js),
// участник видит только свои, Даша — все. xp_state — служебные счётчики для сравнения, видит только сервер.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  app.save(new Collection({
    type: "base",
    name: "xp_log",
    listRule: 'user = @request.auth.id || @request.auth.role = "admin"',
    viewRule: 'user = @request.auth.id || @request.auth.role = "admin"',
    fields: [
      { name: "user", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "key", type: "text", max: 40 },
      { name: "title", type: "text", max: 200 },
      { name: "count", type: "number", onlyInt: true },
      { name: "points", type: "number", onlyInt: true },
      { name: "initial", type: "bool" },
      { name: "created", type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE INDEX idx_xp_log_user ON xp_log (`user`, `created`)"],
  }));
  app.save(new Collection({
    type: "base",
    name: "xp_state",
    fields: [
      { name: "user", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "parts", type: "json", maxSize: 20000 },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_xp_state_user ON xp_state (`user`)"],
  }));
}, (app) => {
  app.delete(app.findCollectionByNameOrId("xp_log"));
  app.delete(app.findCollectionByNameOrId("xp_state"));
});
