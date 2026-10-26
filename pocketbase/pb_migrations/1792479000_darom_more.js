/// <reference path="../pb_data/types.d.ts" />
// «Вещи даром», часть 1 (по образцу Buy Nothing, Olio, Trash Nothing): категории, где и когда забрать,
// срок объявления с напоминанием и архивом, публичные «спасибо» дарителю и очки за них.
const CATS = ["Одежда и обувь", "Детское", "Книги", "Кухня и посуда", "Техника", "Мебель и дом", "Растения", "Для животных", "Хобби и спорт", "Другое"]
const MOD = '(@request.auth.role = "moderator" || @request.auth.role = "admin")'
const SHOWN = '(moderation = "approved" && status != "gone" && status != "archived") || seller = @request.auth.id || ' + MOD
// автор может менять только статус и срок (продлить); остальное — через модератора
const SELLER_KEEPS = ["moderation", "reason", "seller", "title", "kind", "price", "condition", "city", "note", "photo", "category", "pickup", "reminded"]
migrate((app) => {
  const l = app.findCollectionByNameOrId("listings")
  l.fields.add(new SelectField({ name: "category", values: CATS, maxSelect: 1 }))
  l.fields.add(new TextField({ name: "pickup", max: 120 }))
  l.fields.add(new DateField({ name: "until" }))
  l.fields.add(new DateField({ name: "reminded", hidden: true }))
  const st = l.fields.getByName("status")
  if (st.values.indexOf("archived") < 0) st.values.push("archived")
  l.listRule = SHOWN
  l.viewRule = SHOWN
  l.createRule = l.createRule + " && @request.body.reminded:isset = false"
  l.updateRule = "(seller = @request.auth.id && " + SELLER_KEEPS.map((f) => `@request.body.${f}:isset = false`).join(" && ") + ") || " + MOD
  app.save(l)
  // у уже выставленных вещей срок — месяц от сегодня, чтобы никто не получил напоминание в первый же день
  const until = new Date(Date.now() + 30 * 86400000).toISOString().replace("T", " ")
  for (const r of app.findRecordsByFilter("listings", "status != 'gone'", "", 0, 0)) { r.set("until", until); app.saveNoValidate(r) }

  app.save(new Collection({
    type: "base",
    name: "thanks",
    listRule: "",
    viewRule: "",
    // кто может сказать «спасибо», проверяет pb_hooks/darom.pb.js: только тот, кто переписывался о вещи, и только когда она отдана
    createRule: "@request.auth.id != '' && @request.body.from = @request.auth.id && @request.body.giver != @request.auth.id",
    deleteRule: "from = @request.auth.id || " + MOD,
    fields: [
      { name: "listing", type: "relation", collectionId: l.id, maxSelect: 1 },
      { name: "giver", type: "relation", collectionId: "_pb_users_auth_", required: true, maxSelect: 1, cascadeDelete: true },
      { name: "from", type: "relation", collectionId: "_pb_users_auth_", required: true, maxSelect: 1, cascadeDelete: true },
      { name: "title", type: "text", max: 100 },
      { name: "text", type: "text", required: true, max: 600 },
      { name: "photo", type: "file", maxSelect: 1, maxSize: 15728640, mimeTypes: ["image/jpeg", "image/png", "image/webp"], thumbs: ["600x450"] },
      { name: "created", type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_thanks_listing_from ON thanks (`listing`, `from`) WHERE `listing` != ''"],
  }))

  const rules = app.findCollectionByNameOrId("growth_rules")
  const key = rules.fields.getByName("key")
  if (key.values.indexOf("thanks_received") < 0) key.values.push("thanks_received")
  app.save(rules)
  try { app.findFirstRecordByFilter("growth_rules", "key = 'thanks_received'") } catch (e) {
    const r = new Record(rules)
    r.set("key", "thanks_received"); r.set("title", "Получить «спасибо» за отданную вещь"); r.set("points", 10); r.set("per", "за благодарность"); r.set("sort", 13)
    app.save(r)
  }
}, (app) => {
  try { app.delete(app.findFirstRecordByFilter("growth_rules", "key = 'thanks_received'")) } catch (e) {}
  app.delete(app.findCollectionByNameOrId("thanks"))
  const l = app.findCollectionByNameOrId("listings")
  for (const f of ["category", "pickup", "until", "reminded"]) l.fields.removeByName(f)
  l.listRule = '(moderation = "approved" && status != "gone") || seller = @request.auth.id || ' + MOD
  l.viewRule = l.listRule
  app.save(l)
})
