/// <reference path="../pb_data/types.d.ts" />
// Ещё 15 персонажей «Счастливого мира»: редкие и исчезающие, птицы, необычные.
// Поле group делит выбор при регистрации на разделы; Даша может переименовать раздел или персонажа в админке.

migrate((app) => {
  const characters = app.findCollectionByNameOrId("characters");
  if (!characters.fields.getByName("group")) characters.fields.add(new TextField({ name: "group", max: 60 }));
  const kind = characters.fields.getByName("kind");
  ;["bird", "reptile", "other"].forEach((k) => { if (kind.values.indexOf(k) < 0) kind.values.push(k) });
  app.save(characters);

  for (const r of app.findRecordsByFilter("characters", "group = ''", "sort", 0, 0)) {
    r.set("group", r.getString("kind") === "plant" ? "Растения" : "Звери");
    app.save(r);
  }

  ;[
    ["Редкие и исчезающие", "animal", [["Амурский тигр", "🐅"], ["Снежный барс", "🐆"], ["Белый медведь", "🐻‍❄️"], ["Большая панда", "🐼"], ["Носорог", "🦏"]]],
    ["Птицы", "bird", [["Фламинго", "🦩"], ["Павлин", "🦚"], ["Попугай", "🦜"], ["Лебедь", "🦢"], ["Пингвин", "🐧"]]],
    ["Необычные", "other", [["Хамелеон", "🦎"], ["Черепаха", "🐢"], ["Дождевой червь", "🪱"], ["Летучая мышь", "🦇"], ["Осьминог", "🐙"]]],
  ].forEach(([group, k, list], gi) => {
    list.forEach(([name, emoji], i) => {
      try { app.findFirstRecordByFilter("characters", "name = {:n}", { n: name }); return } catch (e) {}
      const r = new Record(characters);
      r.set("name", name); r.set("emoji", emoji); r.set("kind", name === "Хамелеон" || name === "Черепаха" ? "reptile" : k);
      r.set("group", group); r.set("sort", 200 + gi * 100 + (i + 1) * 10);
      app.save(r);
    });
  });
}, (app) => {});
