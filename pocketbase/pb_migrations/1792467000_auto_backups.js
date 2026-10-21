/// <reference path="../pb_data/types.d.ts" />
// Ежедневная резервная копия базы средствами PocketBase: она делается целиком и согласованно,
// в отличие от копирования папки «на ходу». 01:00 UTC = 04:00 по Москве, хранятся 7 последних.
// Если в админке уже настроено своё расписание — не трогаем.
migrate((app) => {
  const s = app.settings()
  if (!s.backups.cron) {
    s.backups.cron = "0 1 * * *"
    s.backups.cronMaxKeep = 7
    app.save(s)
  }
}, (app) => {})
