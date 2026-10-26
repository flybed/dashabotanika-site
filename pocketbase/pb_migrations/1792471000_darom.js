/// <reference path="../pb_data/types.d.ts" />
// «Барахолка» стала «Вещами даром» (решение владельца сайта, 26.10.2026): участники только отдают вещи бесплатно,
// без продажи и обмена между собой. Продаёт сам сайт — в «Эко-товарах».
// Новое объявление принимается только как «Отдам даром» и без цены; названия очков роста — под новое имя.
const CREATE = "@request.auth.id != '' && @request.body.seller = @request.auth.id && @request.body.moderation:isset = false && @request.body.reason:isset = false"
const ONLY_FREE = ' && @request.body.kind = "Отдам даром" && (@request.body.price:isset = false || @request.body.price = "")'
const TITLES = {
  listing_approved: ["Отдать вещь даром", "Выставить вещь на барахолку"],
  deal_done: ["Передать вещь тому, кому она нужна", "Отдать или продать вещь через барахолку"],
}
const PER = { deal_done: ["за отданную вещь", "за сделку"] }
function retitle(app, i) {
  for (const key of Object.keys(TITLES)) {
    try {
      const r = app.findFirstRecordByData("growth_rules", "key", key)
      // меняем, только если Даша не переименовала действие сама
      if (r.getString("title") === TITLES[key][1 - i]) r.set("title", TITLES[key][i])
      if (PER[key] && r.getString("per") === PER[key][1 - i]) r.set("per", PER[key][i])
      app.save(r)
    } catch (e) {}
  }
}
migrate((app) => {
  const listings = app.findCollectionByNameOrId("listings")
  listings.createRule = CREATE + ONLY_FREE
  app.save(listings)
  retitle(app, 0)
}, (app) => {
  const listings = app.findCollectionByNameOrId("listings")
  listings.createRule = CREATE
  app.save(listings)
  retitle(app, 1)
})
