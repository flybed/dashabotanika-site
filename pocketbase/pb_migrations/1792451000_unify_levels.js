/// <reference path="../pb_data/types.d.ts" />
// Одна линия прогресса: уровни (Эко малыш … Эко Эксперт) = стадии роста персонажа.
// Уровень даётся за очки роста (min_xp); старые условия (листочки, экзамен, игра, отзывы)
// остаются как необязательные дополнительные требования — по умолчанию 0.
// Названия, пороги и тексты сертификатов администратор правит прямо на сайте.

migrate((app) => {
  const levels = app.findCollectionByNameOrId("levels");
  levels.fields.add(new NumberField({ name: "min_xp", onlyInt: true, min: 0, help: "Сколько очков роста нужно для уровня" }));
  levels.updateRule = '@request.auth.role = "admin"';
  app.save(levels);
  const XP = { 1: 0, 2: 60, 3: 180, 4: 400, 5: 800 };
  for (const l of app.findRecordsByFilter("levels", "rank > 0", "rank", 100, 0)) {
    const rank = l.getInt("rank");
    if (XP[rank] !== undefined) l.set("min_xp", XP[rank]);
    for (const f of ["min_leaves", "min_exam", "min_game", "min_reviews"]) l.set(f, 0);
    app.save(l);
  }

  const rules = app.findCollectionByNameOrId("growth_rules");
  rules.updateRule = '@request.auth.role = "admin"';
  app.save(rules);

  app.delete(app.findCollectionByNameOrId("growth_stages"));
}, (app) => {});
