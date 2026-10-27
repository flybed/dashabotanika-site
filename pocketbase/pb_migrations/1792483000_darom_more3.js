/// <reference path="../pb_data/types.d.ts" />
// «Вещи даром», третья волна: бронь на 48 часов с переходом к следующему желающему, лот «Переезжаю / Расхламляюсь»
// (список вещей и до 5 дополнительных фото), значки дарителя с очками роста.
const MOD = '(@request.auth.role = "moderator" || @request.auth.role = "admin")'
const KEEP = ["reserved_until", "lot", "items", "more_photos"]
migrate((app) => {
  const l = app.findCollectionByNameOrId("listings")
  l.fields.add(new DateField({ name: "reserved_until" }))
  l.fields.add(new BoolField({ name: "lot" }))
  l.fields.add(new TextField({ name: "items", max: 2000 }))
  l.fields.add(new FileField({ name: "more_photos", maxSelect: 5, maxSize: 15728640, mimeTypes: ["image/jpeg", "image/png", "image/webp"], thumbs: ["600x450"] }))
  l.createRule = l.createRule + " && @request.body.reserved_until:isset = false"
  l.updateRule = l.updateRule.replace("(seller = @request.auth.id && ", "(seller = @request.auth.id && " + KEEP.map((f) => `@request.body.${f}:isset = false`).join(" && ") + " && ")
  app.save(l)
  const c = app.findCollectionByNameOrId("claims")
  c.fields.add(new BoolField({ name: "skipped" }))
  c.createRule = c.createRule + " && @request.body.skipped:isset = false"
  c.updateRule = c.updateRule + " && @request.body.skipped:isset = false"
  app.save(c)
  const rules = app.findCollectionByNameOrId("growth_rules")
  const key = rules.fields.getByName("key")
  if (key.values.indexOf("darom_badge") < 0) key.values.push("darom_badge")
  app.save(rules)
  try { app.findFirstRecordByFilter("growth_rules", "key = 'darom_badge'") } catch (e) {
    const r = new Record(rules)
    r.set("key", "darom_badge"); r.set("title", "Получить значок в «Вещах даром»"); r.set("points", 20); r.set("per", "за значок"); r.set("sort", 15)
    app.save(r)
  }
}, (app) => {
  try { app.delete(app.findFirstRecordByFilter("growth_rules", "key = 'darom_badge'")) } catch (e) {}
  const l = app.findCollectionByNameOrId("listings")
  for (const f of ["reserved_until", "lot", "items", "more_photos"]) l.fields.removeByName(f)
  l.createRule = l.createRule.replace(" && @request.body.reserved_until:isset = false", "")
  l.updateRule = l.updateRule.replace(KEEP.map((f) => `@request.body.${f}:isset = false`).join(" && ") + " && ", "")
  app.save(l)
  const c = app.findCollectionByNameOrId("claims")
  c.fields.removeByName("skipped")
  app.save(c)
})
