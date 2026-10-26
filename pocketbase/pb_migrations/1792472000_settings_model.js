/// <reference path="../pb_data/types.d.ts" />
// Модель ИИ-помощника тоже можно поменять в админке (/_/ → settings → YC_MODEL). Пусто — gemma-3-27b-it.
migrate((app) => {
  const col = app.findCollectionByNameOrId("settings")
  try { app.findFirstRecordByData("settings", "key", "YC_MODEL"); return } catch (e) {}
  const r = new Record(col)
  r.set("key", "YC_MODEL"); r.set("value", ""); r.set("note", "Модель Yandex AI Studio с распознаванием фото; пусто — gemma-3-27b-it")
  app.save(r)
}, (app) => {
  try { app.delete(app.findFirstRecordByData("settings", "key", "YC_MODEL")) } catch (e) {}
})
