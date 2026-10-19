/// <reference path="../pb_data/types.d.ts" />
// Пересчёт уровня и роста персонажа: после регистрации, отметок в трекере, экзамена и игры,
// комментариев, сообщений Даше, чтения статей, лайков, вещей на барахолке —
// и когда Даша меняет условия уровней или правила роста.

// Обработчики PocketBase не видят переменные верхнего уровня — модуль подключаем внутри каждого.

onRecordAfterCreateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.id) }, "users")
onRecordAfterUpdateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.id) }, "users")

onRecordAfterCreateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("owner")) }, "habits")
onRecordAfterUpdateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("owner")) }, "habits")

onRecordAfterCreateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("author")) }, "reviews", "comments", "feedback")
onRecordAfterDeleteSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("author")) }, "reviews", "comments", "feedback")

onRecordAfterCreateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("user")) }, "reads", "likes")
onRecordAfterDeleteSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("user")) }, "likes")

onRecordAfterCreateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("seller")) }, "listings")
onRecordAfterUpdateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("seller")) }, "listings")
onRecordAfterDeleteSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("seller")) }, "listings")

onRecordAfterCreateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recomputeAll(e.app) }, "levels", "growth_rules", "growth_stages")
onRecordAfterUpdateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recomputeAll(e.app) }, "levels", "growth_rules", "growth_stages")

// Раз в сутки пересчитываем всех — на случай ручных правок в админке.
cronAdd("levels-recompute", "17 3 * * *", () => { require(`${__hooks}/levels.js`).recomputeAll($app) })
