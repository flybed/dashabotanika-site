/// <reference path="../pb_data/types.d.ts" />
// «Волшебная палочка»: к замечанию сама прикладывается страница, с которой человек его написал.
migrate((app) => {
  const fb = app.findCollectionByNameOrId("feedback")
  fb.fields.add(new TextField({ name: "page", max: 300 }))
  app.save(fb)
}, (app) => {
  const fb = app.findCollectionByNameOrId("feedback")
  fb.fields.removeByName("page")
  app.save(fb)
})
