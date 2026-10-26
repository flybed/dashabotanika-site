/// <reference path="../pb_data/types.d.ts" />
// Настройки сервера, которые вписывают в админке (/_/ → settings), без входа на сервер по SSH.
// Правил доступа нет — коллекцию видит и правит только суперпользователь.
// Сейчас здесь ключ ИИ-помощника: YC_API_KEY и YC_FOLDER (см. docs/ai-helper.md).
// Переменные окружения сервера (/etc/dashabotanika/ai.env), если они заданы, важнее.
migrate((app) => {
  const col = new Collection({
    type: "base",
    name: "settings",
    fields: [
      { name: "key", type: "text", required: true, max: 64 },
      { name: "value", type: "text", max: 2000 },
      { name: "note", type: "text", max: 300 },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_settings_key ON settings (`key`)"],
  })
  app.save(col)
  for (const [key, note] of [
    ["YC_FOLDER", "ID каталога Yandex Cloud (вида b1g…) для ИИ-помощника"],
    ["YC_API_KEY", "API-ключ сервисного аккаунта Yandex Cloud для ИИ-помощника"],
  ]) {
    const r = new Record(col)
    r.set("key", key); r.set("value", ""); r.set("note", note)
    app.save(r)
  }
}, (app) => {
  app.delete(app.findCollectionByNameOrId("settings"))
})
