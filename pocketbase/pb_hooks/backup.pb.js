/// <reference path="../pb_data/types.d.ts" />
// Проверка резервных копий: каждое утро в 10:00 по Москве и по запросу из админки сайта.

cronAdd("backup-check", "0 7 * * *", () => { require(`${__hooks}/backup.js`).check($app) })
// 1-го числа в 10:05 по Москве — напоминание скачать копию на компьютер
cronAdd("backup-monthly", "5 7 1 * *", () => { require(`${__hooks}/backup.js`).monthly($app) })

// Состояние копий — только для администраторов сайта (role = admin) и суперпользователей.
routerAdd("GET", "/api/backup/status", (e) => {
  const a = e.auth
  if (!a || !(a.isSuperuser() || a.getString("role") === "admin")) throw new ForbiddenError("Только для администраторов")
  return e.json(200, require(`${__hooks}/backup.js`).status(e.app))
})

// Запустить утреннюю проверку вручную (суперпользователь): вернёт состояние, при проблеме напишет в Telegram.
routerAdd("POST", "/api/backup/check", (e) => e.json(200, require(`${__hooks}/backup.js`).check(e.app)), $apis.requireSuperuserAuth())

// Отправить месячное напоминание сейчас (суперпользователь) — для проверки.
routerAdd("POST", "/api/backup/monthly", (e) => { require(`${__hooks}/backup.js`).monthly(e.app); return e.json(200, { ok: true }) }, $apis.requireSuperuserAuth())
