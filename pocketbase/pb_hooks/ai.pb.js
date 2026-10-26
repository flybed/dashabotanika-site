/// <reference path="../pb_data/types.d.ts" />
// ИИ-помощник по фото еды и упаковки — модель Yandex AI Studio с распознаванием изображений.
// Ключ и каталог — в /etc/dashabotanika/ai.env (YC_API_KEY, YC_FOLDER; см. docs/ai-helper.md). Без ключа помощник выключен.
// Лимит — AI_DAILY фото в день на участника (по умолчанию 5). Фото не сохраняются, считается только число разборов.

routerAdd("GET", "/api/ai/left", (e) => e.json(200, require(`${__hooks}/ai.js`).status(e.app, e.auth.id)), $apis.requireAuth("users"))

routerAdd("POST", "/api/ai/photo", (e) => {
  const ai = require(`${__hooks}/ai.js`)
  const body = e.requestInfo().body || {}
  return e.json(200, ai.analyze(e.app, e.auth.id, String(body.kind || ""), String(body.image || "")))
}, $apis.requireAuth("users"))

// для админов: на каком шаге Yandex AI Studio отказывает (базовая модель, наша модель, картинка)
routerAdd("GET", "/api/ai/check", (e) => e.json(200, require(`${__hooks}/ai.js`).check(e.app, e.auth.id, e.request.url.query().get("models"))), $apis.requireAuth("users"))
