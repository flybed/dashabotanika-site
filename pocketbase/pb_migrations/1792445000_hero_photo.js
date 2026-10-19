/// <reference path="../pb_data/types.d.ts" />
// Новое фото Даши на первом экране. Меняем, только если там ещё стоит прежнее фото,
// чтобы не перезаписать то, что Даша загрузила сама через «Редактировать сайт».
const OLD = "/img/hero.webp";
const NEW = "/img/hero-dasha.webp";

function setHero(app, from, to) {
  const rec = app.findFirstRecordByFilter("content", "key = 'site'");
  const data = JSON.parse(toString(rec.get("data")));
  if (!data.photos || data.photos.hero !== from) return;
  data.photos.hero = to;
  rec.set("data", data);
  app.save(rec);
}

migrate((app) => setHero(app, OLD, NEW), (app) => setHero(app, NEW, OLD));
