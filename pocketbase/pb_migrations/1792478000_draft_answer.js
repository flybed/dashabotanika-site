/// <reference path="../pb_data/types.d.ts" />
// Черновик приходит с «Коротко» — прямым ответом на вопрос из заголовка (его цитируют поисковики и ИИ-ответы).
migrate((app) => {
  const d = app.findCollectionByNameOrId("drafts")
  d.fields.add(new TextField({ name: "answer", max: 600 }))
  app.save(d)
}, (app) => {
  const d = app.findCollectionByNameOrId("drafts")
  d.fields.removeByName("answer")
  app.save(d)
})
