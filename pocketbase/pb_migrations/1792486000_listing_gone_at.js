/// <reference path="../pb_data/types.d.ts" />
// listings.gone_at — когда вещь отдали. Ставит и снимает сервер (pb_hooks/darom.pb.js), автор объявления его не меняет.
// По нему страница отданной вещи 30 дней показывает «Уже отдана» и похожие вещи (noindex), потом отвечает 410.
migrate((app) => {
  const l = app.findCollectionByNameOrId("listings")
  l.fields.add(new DateField({ name: "gone_at" }))
  l.updateRule = l.updateRule.replace("(seller = @request.auth.id && ", "(seller = @request.auth.id && @request.body.gone_at:isset = false && ")
  l.createRule = l.createRule + " && @request.body.gone_at:isset = false"
  app.save(l)
  // уже отданные вещи: точной даты нет (у объявлений нет даты изменения) — считаем от дня миграции,
  // то есть их страницы ещё 30 дней покажут «Уже отдана» с похожими вещами, а потом ответят 410
  const now = new Date().toISOString()
  for (const r of app.findRecordsByFilter("listings", "status = 'gone'", "", 0, 0)) { r.set("gone_at", now); app.saveNoValidate(r) }
}, (app) => {
  const l = app.findCollectionByNameOrId("listings")
  l.updateRule = l.updateRule.replace("@request.body.gone_at:isset = false && ", "")
  l.createRule = l.createRule.replace(" && @request.body.gone_at:isset = false", "")
  l.fields.removeByName("gone_at")
  app.save(l)
})
