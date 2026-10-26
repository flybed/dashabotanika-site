/// <reference path="../pb_data/types.d.ts" />
// Пересчёт уровня и роста персонажа: после регистрации, отметок в трекере, экзамена и игры,
// комментариев, сообщений Даше, чтения статей, лайков, вещей в «Вещах даром» —
// и когда Даша меняет условия уровней или правила роста.

// Обработчики PocketBase не видят переменные верхнего уровня — модуль подключаем внутри каждого.

onRecordAfterCreateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.id) }, "users")
onRecordAfterUpdateSuccess((e) => { e.next(); const L = require(`${__hooks}/levels.js`); L.recompute(e.app, e.record.id); L.recomputeInviter(e.app, e.record.id) }, "users")

onRecordAfterCreateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("owner")) }, "profiles")
onRecordAfterUpdateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("owner")) }, "profiles")
onRecordAfterCreateSuccess((e) => { e.next(); const L = require(`${__hooks}/levels.js`); L.recompute(e.app, e.record.getString("invited")); L.recompute(e.app, e.record.getString("inviter")) }, "referrals")

onRecordAfterCreateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("owner")) }, "habits")
onRecordAfterUpdateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("owner")) }, "habits")

onRecordAfterCreateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("author")) }, "reviews", "comments", "feedback")
onRecordAfterDeleteSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("author")) }, "reviews", "comments", "feedback")

onRecordAfterCreateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("user")) }, "reads", "likes")
onRecordAfterDeleteSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("user")) }, "likes")

onRecordAfterCreateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("seller")) }, "listings")
onRecordAfterUpdateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("seller")) }, "listings")
onRecordAfterDeleteSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("seller")) }, "listings")
// «спасибо» за отданную вещь — очки дарителю
onRecordAfterCreateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("giver")) }, "thanks")
onRecordAfterDeleteSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recompute(e.app, e.record.getString("giver")) }, "thanks")

onRecordAfterCreateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recomputeAll(e.app) }, "levels", "growth_rules")
onRecordAfterUpdateSuccess((e) => { e.next(); require(`${__hooks}/levels.js`).recomputeAll(e.app) }, "levels", "growth_rules")

// Раз в сутки пересчитываем всех — на случай ручных правок в админке.
cronAdd("levels-recompute", "17 3 * * *", () => { require(`${__hooks}/levels.js`).recomputeAll($app) })

// При запуске (в том числе после обновления правил миграцией) — пересчитать всех сразу.
onBootstrap((e) => {
  e.next()
  require(`${__hooks}/levels.js`).recomputeAll(e.app)
})

// Новые миграции применяются уже после bootstrap, поэтому пересчёт при запуске может не увидеть
// только что созданную историю очков. Раз в минуту дозаполняем историю тем, у кого её ещё нет.
cronAdd("xp-history-backfill", "* * * * *", () => { require(`${__hooks}/levels.js`).backfillHistory($app) })
