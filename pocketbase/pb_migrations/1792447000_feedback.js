/// <reference path="../pb_data/types.d.ts" />
// Обратная связь для Даши: замечания и предложения участников с фото.
// Видят только автор и модераторы; Даша отвечает и ставит статус.
const MOD = '(@request.auth.role = "moderator" || @request.auth.role = "admin")';

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  app.save(new Collection({
    type: "base",
    name: "feedback",
    listRule: "author = @request.auth.id || " + MOD,
    viewRule: "author = @request.auth.id || " + MOD,
    createRule: "@request.auth.id != '' && @request.body.author = @request.auth.id && @request.body.status:isset = false && @request.body.reply:isset = false",
    updateRule: MOD,
    deleteRule: "author = @request.auth.id || " + MOD,
    fields: [
      { name: "author", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "text", type: "text", required: true, max: 3000 },
      { name: "photos", type: "file", maxSelect: 5, maxSize: 10485760, mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"], thumbs: ["300x300"] },
      { name: "status", type: "select", values: ["in_progress", "done", "declined"], maxSelect: 1 },
      { name: "reply", type: "text", max: 2000 },
      { name: "created", type: "autodate", onCreate: true },
    ],
  }));
}, (app) => {
  app.delete(app.findCollectionByNameOrId("feedback"));
});
