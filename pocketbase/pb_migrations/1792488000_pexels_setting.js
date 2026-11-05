/// <reference path="../pb_data/types.d.ts" />
// Ключ Pexels для «✨ Подобрать другое фото» в черновиках (pb_hooks/photopick.js). Пустой — Pexels выключен,
// подбор идёт по Wikimedia Commons и Openverse. Как получить ключ — docs/photo-picker.md.
migrate((app) => {
  try { app.findFirstRecordByData("settings", "key", "PEXELS_API_KEY") } catch (e) {
    const r = new Record(app.findCollectionByNameOrId("settings"))
    r.set("key", "PEXELS_API_KEY"); r.set("value", ""); r.set("note", "Ключ Pexels API для подбора фото в черновиках статей (pexels.com/api). Пусто — Pexels выключен.")
    app.save(r)
  }
}, (app) => {
  try { app.delete(app.findFirstRecordByData("settings", "key", "PEXELS_API_KEY")) } catch (e) {}
})
