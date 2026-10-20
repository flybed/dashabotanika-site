/// <reference path="../pb_data/types.d.ts" />
// Страницы сайта с готовым текстом для поисковиков и карта сайта (см. seo.js и deploy/Caddyfile).

routerAdd("GET", "/api/seo/page", (e) => {
  // адрес страницы передаёт Caddy; ?p= — для проверки вручную
  const raw = String(e.request.header.get("X-Seo-Path") || e.request.url.query().get("p") || "/")
  const path = raw.replace(/\/+$/, "") || "/"
  const r = require(`${__hooks}/seo.js`).render(e.app, path)
  e.response.header().set("Cache-Control", "no-cache")
  return e.html(r.status, r.html)
})

routerAdd("GET", "/api/seo/sitemap", (e) => {
  e.response.header().set("Content-Type", "application/xml; charset=utf-8")
  return e.string(200, require(`${__hooks}/seo.js`).sitemap(e.app))
})
