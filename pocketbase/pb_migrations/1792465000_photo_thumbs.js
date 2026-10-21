/// <reference path="../pb_data/types.d.ts" />
// Миниатюры для фото сайта: телефону хватает 480 px по ширине, компьютеру 960 px, а оригинал бывает до 15 МБ.
migrate((app) => {
  const col = app.findCollectionByNameOrId("photos");
  col.fields.getByName("file").thumbs = ["480x0", "960x0"];
  app.save(col);
}, (app) => {
  const col = app.findCollectionByNameOrId("photos");
  col.fields.getByName("file").thumbs = [];
  app.save(col);
});
