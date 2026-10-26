/// <reference path="../pb_data/types.d.ts" />
// «Предложить кафе»: те же поля, что у карточки кафе (кухня, плюсы, минусы, до 3 блюд) и до 3 фото.
// Даша одной кнопкой переносит предложение в подборку кафе.
migrate((app) => {
  const s = app.findCollectionByNameOrId("suggestions")
  s.fields.add(new JSONField({ name: "cafe", maxSize: 20000 }))
  s.fields.add(new FileField({ name: "photos", maxSelect: 3, maxSize: 15728640, mimeTypes: ["image/jpeg", "image/png", "image/webp"], thumbs: ["600x450"] }))
  app.save(s)
}, (app) => {
  const s = app.findCollectionByNameOrId("suggestions")
  s.fields.removeByName("cafe"); s.fields.removeByName("photos")
  app.save(s)
})
