/// <reference path="../pb_data/types.d.ts" />
// Telegram-напоминания. tg_links — одноразовые коды привязки (видит только сервер),
// tg_subs — кто подключил бота: участник видит и меняет только своё время и вкл/выкл.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  app.save(new Collection({
    type: "base",
    name: "tg_links",
    fields: [
      { name: "user", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "code", type: "text", required: true, max: 64 },
      { name: "created", type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_tg_links_code ON tg_links (`code`)"],
  }));
  app.save(new Collection({
    type: "base",
    name: "tg_subs",
    listRule: "user = @request.auth.id",
    viewRule: "user = @request.auth.id",
    updateRule: "user = @request.auth.id && @request.body.user:isset = false && @request.body.chat_id:isset = false && @request.body.last_sent:isset = false",
    deleteRule: "user = @request.auth.id",
    fields: [
      { name: "user", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "chat_id", type: "text", required: true, max: 40 },
      { name: "hour", type: "number", onlyInt: true, min: 0, max: 23 },
      { name: "tz", type: "number", onlyInt: true, min: -720, max: 840 },
      { name: "enabled", type: "bool" },
      // что присылать — выбирает сам участник в кабинете
      { name: "topics", type: "select", values: ["challenge", "nudge", "messages", "articles", "weekly"], maxSelect: 5 },
      { name: "last_sent", type: "text", max: 20 },
      { name: "created", type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_tg_subs_user ON tg_subs (`user`)"],
  }));
}, (app) => {
  app.delete(app.findCollectionByNameOrId("tg_subs"));
  app.delete(app.findCollectionByNameOrId("tg_links"));
});
