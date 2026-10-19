/// <reference path="../pb_data/types.d.ts" />
// Рост персонажа («тамагочи»): за действия на сайте начисляются очки роста,
// персонаж проходит стадии. За что и сколько — коллекция growth_rules,
// стадии — growth_stages; обе Даша меняет в админке. Считает сервер (pb_hooks/levels.js).

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new NumberField({ name: "xp", onlyInt: true }));
  users.fields.add(new NumberField({ name: "stage", onlyInt: true }));
  const PROTECTED = '@request.body.role:isset = false && @request.body.level:isset = false && @request.body.level_history:isset = false && @request.body.leaves:isset = false && @request.body.xp:isset = false && @request.body.stage:isset = false';
  users.createRule = PROTECTED + ' && @request.body.character != ""';
  users.updateRule = '(id = @request.auth.id && ' + PROTECTED + ') || @request.auth.role = "admin"';
  app.save(users);

  const rules = new Collection({
    type: "base",
    name: "growth_rules",
    listRule: "",
    viewRule: "",
    fields: [
      { name: "key", type: "select", required: true, maxSelect: 1, values: ["signup", "leaf", "exam_passed", "game", "article_read", "like", "comment", "feedback", "listing_approved", "deal_done"], help: "Какое действие считается (служебное поле, не меняйте)" },
      { name: "title", type: "text", required: true, max: 80, help: "Как действие называется в кабинете" },
      { name: "points", type: "number", onlyInt: true, min: 0, help: "Сколько очков роста даётся" },
      { name: "per", type: "text", max: 40, help: "За что именно: «за статью», «за листочек» и т. п." },
      { name: "sort", type: "number", onlyInt: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_growth_rules_key ON growth_rules (`key`)"],
  });
  app.save(rules);
  [
    ["signup", "Зарегистрироваться и выбрать персонажа", 10, "один раз"],
    ["leaf", "Отмечать эко-привычки в челлендже недели", 2, "за листочек"],
    ["exam_passed", "Сдать эко-экзамен на сертификат", 30, "один раз"],
    ["game", "Играть в эко-уборку", 3, "за каждые 10 очков рекорда"],
    ["article_read", "Читать статьи в журнале", 5, "за статью"],
    ["like", "Ставить лайки статьям", 1, "за лайк"],
    ["comment", "Комментировать", 3, "за комментарий"],
    ["feedback", "Помогать Даше советом в обратной связи", 5, "за сообщение"],
    ["listing_approved", "Выставить вещь на барахолку", 10, "за опубликованную вещь"],
    ["deal_done", "Отдать или продать вещь через барахолку", 20, "за сделку"],
  ].forEach(([key, title, points, per], i) => {
    const r = new Record(rules);
    r.set("key", key); r.set("title", title); r.set("points", points); r.set("per", per); r.set("sort", (i + 1) * 10);
    app.save(r);
  });

  const stages = new Collection({
    type: "base",
    name: "growth_stages",
    listRule: "",
    viewRule: "",
    fields: [
      { name: "stage", type: "number", required: true, onlyInt: true, min: 1 },
      { name: "name", type: "text", required: true, max: 40 },
      { name: "min_xp", type: "number", onlyInt: true, min: 0, help: "Сколько очков роста нужно для этой стадии" },
      { name: "description", type: "text", max: 200 },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_growth_stages_stage ON growth_stages (stage)"],
  });
  app.save(stages);
  [
    [1, "Малыш", 0, "Только появился в «Счастливом мире»."],
    [2, "Подросток", 60, "Уже освоился и пробует эко-привычки."],
    [3, "Взрослый", 180, "Уверенно живёт в ритме эко."],
    [4, "Мудрый", 400, "Знает, как помочь планете, и делится опытом."],
    [5, "Легенда", 800, "Гордость «Счастливого мира»."],
  ].forEach(([stage, name, min_xp, description]) => {
    const r = new Record(stages);
    r.set("stage", stage); r.set("name", name); r.set("min_xp", min_xp); r.set("description", description);
    app.save(r);
  });

  // прочитанные статьи и лайки — по одной записи на пару «участник + статья»
  const own = (name, field) => new Collection({
    type: "base",
    name,
    listRule: name === "likes" ? "" : "user = @request.auth.id",
    viewRule: name === "likes" ? "" : "user = @request.auth.id",
    createRule: "@request.auth.id != '' && @request.body.user = @request.auth.id",
    deleteRule: name === "likes" ? "user = @request.auth.id" : null,
    fields: [
      { name: "user", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: field, type: "text", required: true, max: 120 },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_" + name + "_pair ON " + name + " (user, `" + field + "`)"],
  });
  app.save(own("reads", "article"));
  app.save(own("likes", "target"));
}, (app) => {
  for (const name of ["likes", "reads", "growth_stages", "growth_rules"]) app.delete(app.findCollectionByNameOrId(name));
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("xp"); users.fields.removeByName("stage");
  app.save(users);
});
