// IndexNow: сайт сам сообщает Яндексу (и Bing через api.indexnow.org), что страница появилась или изменилась.
// Ключ публичный — лежит файлом в корне сайта (site/<ключ>.txt). Работает только на боевом сервере (INDEXNOW=on),
// адреса копятся в очереди и уходят раз в 5 минут, чтобы не задерживать сохранение.
const KEY = "1dcff34534a8b98ae5711b664244c85f"
const HOST = "dashabotanika.ru", ORIGIN = "https://" + HOST
const ENDPOINTS = () => ($os.getenv("INDEXNOW_API") ? [$os.getenv("INDEXNOW_API")] : ["https://yandex.com/indexnow", "https://api.indexnow.org/indexnow"])
const on = () => $os.getenv("INDEXNOW") === "on" || !!$os.getenv("INDEXNOW_API")

function queue(app, paths) {
  if (!on()) return
  const store = app.store(), q = store.get("indexnow_queue") || []
  for (const p of paths) { const u = /^https?:/.test(p) ? p : ORIGIN + p; if (q.indexOf(u) < 0) q.push(u) }
  store.set("indexnow_queue", q)
}

function flush(app) {
  if (!on()) return { sent: 0 }
  const store = app.store(), q = (store.get("indexnow_queue") || []).slice(0, 10000)
  if (!q.length) return { sent: 0 }
  store.set("indexnow_queue", [])
  const out = {}
  for (const url of ENDPOINTS()) {
    try {
      const r = $http.send({ url, method: "POST", timeout: 15, headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${ORIGIN}/${KEY}.txt`, urlList: q }) })
      out[url] = r.statusCode
    } catch (e) { out[url] = String(e) }
  }
  app.logger().info("indexnow", "urls", q.length, "result", JSON.stringify(out))
  return { sent: q.length, result: out }
}

// все адреса из карты сайта
function queueAll(app) {
  const xml = require(`${__hooks}/seo.js`).sitemap(app)
  queue(app, (xml.match(/<loc>[^<]+<\/loc>/g) || []).map((x) => x.slice(5, -6)))
}

// новые и изменённые статьи после сохранения контента сайта
function onContent(app, before, after) {
  const prev = {}
  ;(before || []).forEach((a) => { prev[a.id] = JSON.stringify([a.title, a.lead, a.body, a.slug, a.image]) })
  const slug = (a) => require(`${__hooks}/seo.js`).articleSlug(a)
  const changed = (after || []).filter((a) => a && a.id && prev[a.id] !== JSON.stringify([a.title, a.lead, a.body, a.slug, a.image]))
  if (changed.length) queue(app, changed.map((a) => "/zhurnal/" + slug(a)).concat(["/zhurnal", "/"]))
}

// объявление «Вещей даром»: только то, что видно публично (одобрено), и только когда меняется то, что на странице
const SEEN = ["moderation", "status", "title", "category", "condition", "city", "district", "note", "photo", "pickup", "lot", "items"]
function onListing(app, rec, before) {
  const pub = (r) => !!r && r.getString("moderation") === "approved"
  if (!pub(rec) && !pub(before)) return
  if (rec && before && SEEN.every((f) => String(rec.get(f)) === String(before.get(f)))) return
  const r = rec || before, seo = require(`${__hooks}/seo.js`), city = r.getString("city").trim()
  queue(app, ["/darom/v/" + r.id, "/darom"].concat(city ? ["/darom/" + seo.slugify(city)] : []))
}

module.exports = { KEY, queue, flush, queueAll, onContent, onListing }
