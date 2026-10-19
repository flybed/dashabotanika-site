/// <reference path="../pb_data/types.d.ts" />
// Эко-челленджи: новое действие для роста — «пройти челлендж» (≥70% отметок к последнему дню).
// Сами челленджи хранятся в habits.data.challenges; засчитывает сервер (pb_hooks/levels.js).

migrate((app) => {
  const rules = app.findCollectionByNameOrId("growth_rules");
  const key = rules.fields.getByName("key");
  if (key.values.indexOf("challenge_done") < 0) key.values.push("challenge_done");
  app.save(rules);
  try {
    app.findFirstRecordByFilter("growth_rules", "key = 'challenge_done'");
  } catch (e) {
    const r = new Record(rules);
    r.set("key", "challenge_done");
    r.set("title", "Пройти эко-челлендж до конца");
    r.set("points", 50);
    r.set("per", "за челлендж, если отмечено от 70%");
    r.set("sort", 25);
    app.save(r);
  }
  // формулировка листочков теперь про челленджи
  try {
    const leaf = app.findFirstRecordByFilter("growth_rules", "key = 'leaf'");
    if (leaf.getString("title") === "Отмечать эко-привычки в челлендже недели") {
      leaf.set("title", "Отмечать привычки в своих эко-челленджах");
      leaf.set("per", "за отметку");
      app.save(leaf);
    }
  } catch (e) {}
}, (app) => {});
