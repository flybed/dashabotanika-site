/// <reference path="../pb_data/types.d.ts" />
// Ключ Pixabay для «✨ Подобрать другое фото» в черновиках (pb_hooks/photopick.js). Пустой — Pixabay выключен.
// Pexels (PEXELS_API_KEY) остаётся на случай, если Pexels снова начнёт выдавать ключи. Как получить — docs/photo-picker.md.
migrate((app) => {
  try { app.findFirstRecordByData("settings", "key", "PIXABAY_API_KEY") } catch (e) {
    const r = new Record(app.findCollectionByNameOrId("settings"))
    r.set("key", "PIXABAY_API_KEY"); r.set("value", ""); r.set("note", "Ключ Pixabay API для подбора фото в черновиках статей (pixabay.com/api/docs). Пусто — Pixabay выключен.")
    app.save(r)
  }
}, (app) => {
  try { app.delete(app.findFirstRecordByData("settings", "key", "PIXABAY_API_KEY")) } catch (e) {}
})
