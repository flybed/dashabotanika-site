/// <reference path="../pb_data/types.d.ts" />
// Автоматическое повышение уровня: после регистрации, отметок в трекере,
// результатов экзамена и игры, отзывов и комментариев, и когда Даша меняет условия.

onRecordAfterCreateSuccess((e) => {
  e.next()
  require(`${__hooks}/levels.js`).recompute(e.app, e.record.id)
}, "users")

onRecordAfterUpdateSuccess((e) => {
  e.next()
  require(`${__hooks}/levels.js`).recompute(e.app, e.record.id)
}, "users")

onRecordAfterCreateSuccess((e) => {
  e.next()
  require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("owner"))
}, "habits")

onRecordAfterUpdateSuccess((e) => {
  e.next()
  require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("owner"))
}, "habits")

onRecordAfterCreateSuccess((e) => {
  e.next()
  require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("author"))
}, "reviews", "comments", "feedback")

onRecordAfterUpdateSuccess((e) => {
  e.next()
  require(`${__hooks}/levels.js`).recomputeAll(e.app)
}, "levels")

onRecordAfterCreateSuccess((e) => {
  e.next()
  require(`${__hooks}/levels.js`).recomputeAll(e.app)
}, "levels")

// Раз в сутки пересчитываем всех — на случай ручных правок в админке.
cronAdd("levels-recompute", "17 3 * * *", () => {
  require(`${__hooks}/levels.js`).recomputeAll($app)
})
