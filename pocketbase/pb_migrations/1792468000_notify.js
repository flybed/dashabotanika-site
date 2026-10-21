/// <reference path="../pb_data/types.d.ts" />
// Какие письма участник хочет получать на почту (Telegram — в tg_subs). Галочка в кабинете = согласие,
// время согласия хранится; в каждом письме — ссылка «Отписаться» в один клик (по секретному token).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  const col = new Collection({
    type: "base",
    name: "notify",
    listRule: "user = @request.auth.id",
    viewRule: "user = @request.auth.id",
    createRule: "@request.auth.id != '' && @request.body.user = @request.auth.id && @request.body.token:isset = false",
    updateRule: "user = @request.auth.id && @request.body.user:isset = false && @request.body.token:isset = false",
    deleteRule: "user = @request.auth.id",
    fields: [
      { name: "user", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "email_topics", type: "select", values: ["messages", "articles", "weekly"], maxSelect: 3 },
      { name: "consent_at", type: "date" },
      { name: "token", type: "text", max: 64, hidden: true },
      { name: "last_weekly", type: "text", max: 20 },
      { name: "last_msg_mail", type: "date" },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_notify_user ON notify (`user`)"],
  })
  app.save(col)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("notify"))
})
