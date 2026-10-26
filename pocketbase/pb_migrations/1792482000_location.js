/// <reference path="../pb_data/types.d.ts" />
// Привязка к месту (как в Buy Nothing): город и район в профиле — вручную или «определить автоматически».
// Координаты храним грубо (2 знака после запятой, ~1 км), чтобы показывать «≈ 2 км от вас», но не адрес.
// Вещь берёт район и примерные координаты из профиля автора (pb_hooks/location.pb.js).
migrate((app) => {
  const p = app.findCollectionByNameOrId("profiles")
  p.fields.add(new TextField({ name: "district", max: 80 }))
  p.fields.add(new NumberField({ name: "lat", min: -90, max: 90 }))
  p.fields.add(new NumberField({ name: "lon", min: -180, max: 180 }))
  app.save(p)
  const l = app.findCollectionByNameOrId("listings")
  l.fields.add(new TextField({ name: "district", max: 80 }))
  l.fields.add(new NumberField({ name: "lat", min: -90, max: 90 }))
  l.fields.add(new NumberField({ name: "lon", min: -180, max: 180 }))
  // координаты вещи ставит сервер, автор их не меняет
  l.createRule = l.createRule + " && @request.body.lat:isset = false && @request.body.lon:isset = false"
  l.updateRule = l.updateRule.replace("(seller = @request.auth.id && ", "(seller = @request.auth.id && @request.body.lat:isset = false && @request.body.lon:isset = false && @request.body.district:isset = false && ")
  app.save(l)
}, (app) => {
  const p = app.findCollectionByNameOrId("profiles")
  for (const f of ["district", "lat", "lon"]) p.fields.removeByName(f)
  app.save(p)
  const l = app.findCollectionByNameOrId("listings")
  for (const f of ["district", "lat", "lon"]) l.fields.removeByName(f)
  l.createRule = l.createRule.replace(" && @request.body.lat:isset = false && @request.body.lon:isset = false", "")
  l.updateRule = l.updateRule.replace("@request.body.lat:isset = false && @request.body.lon:isset = false && @request.body.district:isset = false && ", "")
  app.save(l)
})
