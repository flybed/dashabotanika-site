/// <reference path="../pb_data/types.d.ts" />
// Страницы сайта с готовым текстом для поисковиков и карта сайта (см. seo.js и deploy/Caddyfile).

routerAdd("GET", "/api/seo/page", (e) => {
  // адрес страницы передаёт Caddy; ?p= — для проверки вручную
  const raw = String(e.request.header.get("X-Seo-Path") || e.request.url.query().get("p") || "/")
  const path = raw.replace(/\/+$/, "") || "/"
  // переименованные страницы: старый адрес навсегда ведёт на новый (тот же список — OLD_PATHS в site/js/app.js)
  const moved = { "/baraholka": "/darom" }[path]
  if (moved) return e.redirect(301, moved)
  // статья переехала на новый адрес (old_slugs) или её открыли по id — навсегда на основной адрес
  const art = require(`${__hooks}/seo.js`).articleMoved(e.app, path)
  if (art) return e.redirect(301, art)
  const r = require(`${__hooks}/seo.js`).render(e.app, path)
  e.response.header().set("Cache-Control", "no-cache")
  return e.html(r.status, r.html)
})

// /sitemap.xml и, когда вещей много, его части /sitemap-pages.xml, /sitemap-darom-N.xml (адрес передаёт Caddy; ?f= — для проверки)
routerAdd("GET", "/api/seo/sitemap", (e) => {
  const raw = String(e.request.header.get("X-Seo-Path") || e.request.url.query().get("f") || "/sitemap.xml")
  const m = raw.match(/^\/?sitemap(?:-([a-z0-9-]+))?\.xml$/)
  const xml = m ? require(`${__hooks}/seo.js`).sitemap(e.app, m[1] || "") : null
  if (!xml) return e.string(404, "Not found")
  e.response.header().set("Content-Type", "application/xml; charset=utf-8")
  return e.string(200, xml)
})
// пересчитать, какие вещи в поиске (после ручных правок базы); обычно это делается само при сохранении вещи
routerAdd("POST", "/api/seo/reindex", (e) => e.json(200, require(`${__hooks}/seo.js`).reindexAll(e.app, true)), $apis.requireSuperuserAuth())
