/// <reference path="../pb_data/types.d.ts" />
// Черновики приходят сразу с картинкой: обложка (адрес фото на сайте) и её описание для alt.
migrate((app) => {
  const d = app.findCollectionByNameOrId("drafts")
  d.fields.add(new TextField({ name: "image", max: 300 }))
  d.fields.add(new TextField({ name: "image_alt", max: 150 }))
  app.save(d)
}, (app) => {
  const d = app.findCollectionByNameOrId("drafts")
  d.fields.removeByName("image")
  d.fields.removeByName("image_alt")
  app.save(d)
})
