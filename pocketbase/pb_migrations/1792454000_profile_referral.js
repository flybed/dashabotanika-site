/// <reference path="../pb_data/types.d.ts" />
// Профиль участника (возраст, пол, страна и город, эко-цели) — виден только ему и Даше.
// Приглашения: кто пришёл по ссылке друга. Запись создаёт сам новичок в первые сутки после регистрации.
// Новые правила роста: заполнить профиль, прийти по приглашению, пригласить друга (с подтверждённой почтой).
const ADMIN = '@request.auth.role = "admin"';
const GOALS = ["Меньше мусора и пластика", "Научиться сортировать отходы", "Покупать осознанно: меньше и лучше",
  "Питаться экологичнее", "Экономить воду и энергию", "Экологичный гардероб", "Здоровье и чистый воздух",
  "Научить детей заботиться о планете", "Пока просто интересуюсь"];

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  app.save(new Collection({
    type: "base",
    name: "profiles",
    listRule: "owner = @request.auth.id || " + ADMIN,
    viewRule: "owner = @request.auth.id || " + ADMIN,
    createRule: "@request.auth.id != '' && @request.body.owner = @request.auth.id",
    updateRule: "owner = @request.auth.id && @request.body.owner:isset = false",
    deleteRule: "owner = @request.auth.id",
    fields: [
      { name: "owner", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "age", type: "number", onlyInt: true, min: 6, max: 110 },
      { name: "gender", type: "select", values: ["Женский", "Мужской", "Не хочу указывать"], maxSelect: 1 },
      { name: "country", type: "text", max: 60 },
      { name: "city", type: "text", max: 80 },
      { name: "goals", type: "select", values: GOALS, maxSelect: GOALS.length },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_profiles_owner ON profiles (`owner`)"],
  }));

  app.save(new Collection({
    type: "base",
    name: "referrals",
    listRule: "inviter = @request.auth.id || invited = @request.auth.id || " + ADMIN,
    viewRule: "inviter = @request.auth.id || invited = @request.auth.id || " + ADMIN,
    createRule: "@request.body.invited = @request.auth.id && @request.body.inviter != @request.auth.id && @request.auth.created >= @yesterday",
    fields: [
      { name: "inviter", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "invited", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "created", type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_referrals_invited ON referrals (`invited`)"],
  }));

  const rules = app.findCollectionByNameOrId("growth_rules");
  const key = rules.fields.getByName("key");
  ;["profile_complete", "invited", "invite_friend"].forEach((k) => { if (key.values.indexOf(k) < 0) key.values.push(k) });
  app.save(rules);
  ;[
    ["profile_complete", "Заполнить профиль полностью", 20, "один раз", 12],
    ["invited", "Прийти на сайт по приглашению друга", 50, "один раз", 14],
    ["invite_friend", "Пригласить друга по своей ссылке", 40, "за друга, когда он подтвердит почту", 16],
  ].forEach(([k, title, points, per, sort]) => {
    try { app.findFirstRecordByFilter("growth_rules", "key = {:k}", { k }) } catch (e) {
      const r = new Record(rules)
      r.set("key", k); r.set("title", title); r.set("points", points); r.set("per", per); r.set("sort", sort)
      app.save(r)
    }
  });
}, (app) => {
  app.delete(app.findCollectionByNameOrId("referrals"));
  app.delete(app.findCollectionByNameOrId("profiles"));
});
