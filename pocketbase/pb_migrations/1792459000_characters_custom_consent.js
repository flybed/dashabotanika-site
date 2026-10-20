/// <reference path="../pb_data/types.d.ts" />
// Ещё 22 персонажа (лев — царь зверей, морские обитатели и др.), «Свой персонаж» (участник сам выбирает
// значок и имя — хранятся в users.custom_emoji / custom_name) и отметка о согласии с политикой конфиденциальности.

migrate((app) => {
  const characters = app.findCollectionByNameOrId("characters");
  const kind = characters.fields.getByName("kind");
  if (kind.values.indexOf("custom") < 0) kind.values.push("custom");
  app.save(characters);

  const add = (name, emoji, k, group, sort) => {
    try { app.findFirstRecordByFilter("characters", "name = {:n}", { n: name }); return } catch (e) {}
    const r = new Record(characters);
    r.set("name", name); r.set("emoji", emoji); r.set("kind", k); r.set("group", group); r.set("sort", sort);
    app.save(r);
  };
  [["Лев", "🦁"], ["Медведь", "🐻"], ["Волк", "🐺"], ["Енот", "🦝"], ["Кролик", "🐇"], ["Белка", "🐿️"], ["Олень", "🦌"], ["Коала", "🐨"], ["Ленивец", "🦥"], ["Выдра", "🦦"]]
    .forEach(([n, e], i) => add(n, e, "animal", "Звери", 60 + (i + 1) * 0.5));
  [["Кактус", "🌵"], ["Тюльпан", "🌷"], ["Ромашка", "🌼"], ["Клевер", "🍀"], ["Гриб", "🍄"], ["Ель", "🌲"]]
    .forEach(([n, e], i) => add(n, e, "plant", "Растения", 100 + (i + 1) * 0.5));
  [["Орёл", "🦅"], ["Утка", "🦆"]].forEach(([n, e], i) => add(n, e, "bird", "Птицы", 350 + i + 1));
  [["Дельфин", "🐬"], ["Тюлень", "🦭"], ["Краб", "🦀"], ["Акула", "🦈"]].forEach(([n, e], i) => add(n, e, "animal", "Морские", 360 + (i + 1) * 5));
  [["Бабочка", "🦋"], ["Божья коровка", "🐞"], ["Улитка", "🐌"], ["Муравей", "🐜"]].forEach(([n, e], i) => add(n, e, "other", "Необычные", 450 + i + 1));
  add("Свой персонаж", "✨", "custom", "", 9999);

  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.getByName("custom_emoji")) users.fields.add(new TextField({ name: "custom_emoji", max: 16 }));
  if (!users.fields.getByName("custom_name")) users.fields.add(new TextField({ name: "custom_name", max: 30 }));
  if (!users.fields.getByName("consent_at")) users.fields.add(new TextField({ name: "consent_at", max: 40 }));
  app.save(users);
}, (app) => {});
