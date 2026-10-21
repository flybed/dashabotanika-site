/// <reference path="../pb_data/types.d.ts" />
// IndexNow (логика — indexnow.js): новые статьи и сервисы — сразу в очередь, раз в неделю — вся карта сайта.

onRecordAfterUpdateSuccess((e) => {
  e.next()
  if (e.record.getString("key") !== "site") return
  const arts = (r) => { try { return JSON.parse(toString(r.get("data"))).articles || [] } catch (err) { return [] } }
  require(`${__hooks}/indexnow.js`).onContent(e.app, arts(e.record.original()), arts(e.record))
}, "content")

onRecordAfterUpdateSuccess((e) => {
  e.next()
  if (e.record.getString("status") === "approved" && e.record.original().getString("status") !== "approved") {
    const city = e.record.getString("city"), slug = require(`${__hooks}/seo.js`).slugify(city)
    require(`${__hooks}/indexnow.js`).queue(e.app, ["/servisy"].concat(city && city !== "Вся Россия" ? ["/kuda-sdat/" + slug] : []))
  }
}, "services")

cronAdd("indexnow-flush", "*/5 * * * *", () => { require(`${__hooks}/indexnow.js`).flush($app) })
cronAdd("indexnow-weekly", "13 5 * * 1", () => { require(`${__hooks}/indexnow.js`).queueAll($app) })

// отправить всю карту сайта прямо сейчас (суперпользователь) — например, после крупного обновления
routerAdd("POST", "/api/indexnow/all", (e) => {
  const ix = require(`${__hooks}/indexnow.js`)
  ix.queueAll(e.app)
  return e.json(200, ix.flush(e.app))
}, $apis.requireSuperuserAuth())

// отправить очередь сейчас, не дожидаясь пяти минут (суперпользователь) — для проверки
routerAdd("POST", "/api/indexnow/flush", (e) => e.json(200, require(`${__hooks}/indexnow.js`).flush(e.app)), $apis.requireSuperuserAuth())
