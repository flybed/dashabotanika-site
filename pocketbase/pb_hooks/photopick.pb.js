/// <reference path="../pb_data/types.d.ts" />
// «✨ Подобрать другое фото» в черновиках статей (logic — photopick.js). Только админы и модераторы.
routerAdd("GET", "/api/photopick/search", (e) => {
  const q = e.request.url.query()
  return e.json(200, require(`${__hooks}/photopick.js`).search(e.app, e.auth.id, q.get("draft"), q.get("q"), parseInt(q.get("page") || "1", 10)))
}, $apis.requireAuth("users"))
routerAdd("POST", "/api/photopick/take", (e) => {
  const body = e.requestInfo().body || {}
  return e.json(200, require(`${__hooks}/photopick.js`).take(e.app, e.auth.id, { source: body.source, id: body.id }))
}, $apis.requireAuth("users"))
