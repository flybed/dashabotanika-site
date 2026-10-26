/// <reference path="../pb_data/types.d.ts" />
// «Вещи даром», часть 2: «Ищу» (запросы), даритель сам выбирает получателя (без «кто первый»),
// подписка на новые вещи по категориям и городу, «Одолжу на время».
const CATS = ["Одежда и обувь", "Детское", "Книги", "Кухня и посуда", "Техника", "Мебель и дом", "Растения", "Для животных", "Хобби и спорт", "Другое"]
const MOD = '(@request.auth.role = "moderator" || @request.auth.role = "admin")'
const CREATE = "@request.auth.id != '' && @request.body.seller = @request.auth.id && @request.body.moderation:isset = false && @request.body.reason:isset = false && @request.body.reminded:isset = false && @request.body.chosen:isset = false && @request.body.claims:isset = false && @request.body.return_by:isset = false"
const FREE = ' && (@request.body.kind = "Отдам даром" || @request.body.kind = "Одолжу") && (@request.body.price:isset = false || @request.body.price = "")'
const SELLER_KEEPS = ["moderation", "reason", "seller", "title", "kind", "price", "condition", "city", "note", "photo", "category", "pickup", "reminded", "chosen", "claims", "return_by", "lend_days"]
migrate((app) => {
  const users = "_pb_users_auth_"
  const l = app.findCollectionByNameOrId("listings")
  const kind = l.fields.getByName("kind"); if (kind.values.indexOf("Одолжу") < 0) kind.values.push("Одолжу")
  const st = l.fields.getByName("status"); if (st.values.indexOf("lent") < 0) st.values.push("lent")
  l.fields.add(new RelationField({ name: "chosen", collectionId: users, maxSelect: 1 }))
  l.fields.add(new NumberField({ name: "claims", onlyInt: true }))
  l.fields.add(new NumberField({ name: "lend_days", onlyInt: true, min: 0, max: 90 }))
  l.fields.add(new DateField({ name: "return_by" }))
  l.createRule = CREATE + FREE
  l.updateRule = "(seller = @request.auth.id && " + SELLER_KEEPS.map((f) => `@request.body.${f}:isset = false`).join(" && ") + ") || " + MOD
  app.save(l)

  // «Хочу забрать»: заявка с парой слов, зачем вещь; даритель выбирает сам
  app.save(new Collection({
    type: "base", name: "claims",
    listRule: "user = @request.auth.id || listing.seller = @request.auth.id || " + MOD,
    viewRule: "user = @request.auth.id || listing.seller = @request.auth.id || " + MOD,
    createRule: "@request.auth.id != '' && @request.body.user = @request.auth.id && @request.body.listing.seller != @request.auth.id",
    updateRule: "user = @request.auth.id && @request.body.user:isset = false && @request.body.listing:isset = false",
    deleteRule: "user = @request.auth.id || " + MOD,
    fields: [
      { name: "listing", type: "relation", collectionId: l.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "user", type: "relation", collectionId: users, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "note", type: "text", max: 300 },
      { name: "created", type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_claims_listing_user ON claims (`listing`, `user`)"],
  }))

  // «Ищу»: запросы участников
  app.save(new Collection({
    type: "base", name: "wants",
    listRule: "", viewRule: "",
    createRule: "@request.auth.id != '' && @request.body.author = @request.auth.id && (@request.body.status:isset = false || @request.body.status = 'open')",
    updateRule: "(author = @request.auth.id && @request.body.author:isset = false) || " + MOD,
    deleteRule: "author = @request.auth.id || " + MOD,
    fields: [
      { name: "author", type: "relation", collectionId: users, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "title", type: "text", required: true, max: 100 },
      { name: "category", type: "select", values: CATS, maxSelect: 1 },
      { name: "city", type: "text", max: 80 },
      { name: "note", type: "text", max: 600 },
      { name: "borrow", type: "bool" },
      { name: "status", type: "select", values: ["open", "found", "closed"], maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true },
    ],
  }))

  // подписка на новые вещи: какие категории, какой город, куда сообщать
  app.save(new Collection({
    type: "base", name: "darom_subs",
    listRule: "user = @request.auth.id", viewRule: "user = @request.auth.id",
    createRule: "@request.auth.id != '' && @request.body.user = @request.auth.id && @request.body.pending:isset = false",
    updateRule: "user = @request.auth.id && @request.body.user:isset = false && @request.body.pending:isset = false",
    deleteRule: "user = @request.auth.id",
    fields: [
      { name: "user", type: "relation", collectionId: users, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "cats", type: "select", values: CATS, maxSelect: CATS.length },
      { name: "city", type: "text", max: 80 },
      { name: "email", type: "bool" },
      { name: "tg", type: "bool" },
      { name: "pending", type: "json", hidden: true },
      { name: "created", type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_darom_subs_user ON darom_subs (`user`)"],
  }))
}, (app) => {
  for (const n of ["darom_subs", "wants", "claims"]) app.delete(app.findCollectionByNameOrId(n))
  const l = app.findCollectionByNameOrId("listings")
  for (const f of ["chosen", "claims", "lend_days", "return_by"]) l.fields.removeByName(f)
  app.save(l)
})
