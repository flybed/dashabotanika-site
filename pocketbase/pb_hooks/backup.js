// Резервные копии: есть ли свежая копия базы. Используется утренней проверкой и админкой сайта.
const MAX_AGE_H = 30

function filesOf(app) {
  const fs = app.newBackupsFilesystem()
  try {
    return fs.list("").map((f) => {
      // время копии: из файловой системы, а если не разобралось — из имени файла (…_20261021010000.zip)
      let at = Date.parse(String(f.modTime).replace(" ", "T").replace(/(\.\d+)? \+0000 UTC$/, "Z"))
      if (!at) { const m = String(f.key).match(/(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)\.zip$/); if (m) at = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) }
      return { key: String(f.key), size: f.size, at: at || 0 }
    }).sort((a, b) => b.at - a.at)
  } catch (err) { return [] } finally { fs.close() }
}

function status(app) {
  const s = app.settings().backups, files = filesOf(app), newest = files[0]
  const ageH = newest ? (Date.now() - newest.at) / 3600000 : null
  return { cron: s.cron, keep: s.cronMaxKeep, count: files.length, newest: newest || null, ageH, ok: !!newest && newest.size > 0 && ageH < MAX_AGE_H, files: files.slice(0, 10) }
}

// Каждое утро: если свежей копии нет — сообщение в Telegram администраторам, которые подключили бота.
function check(app) {
  const st = status(app)
  if (st.ok) return st
  const why = !st.cron ? "автоматические копии выключены" : !st.newest ? "копий нет совсем" : `последняя копия была ${Math.round(st.ageH)} ч назад`
  try {
    const tg = require(`${__hooks}/tg.js`)
    for (const u of app.findRecordsByFilter("users", "role = 'admin'", "", 20, 0)) {
      let sub = null
      try { sub = app.findFirstRecordByFilter("tg_subs", "user = {:u} && enabled = true", { u: u.id }) } catch (e) {}
      if (sub) tg.send(sub.getString("chat_id"), `⚠️ <b>Резервная копия сайта</b>: ${why}.\nПроверьте: https://dashabotanika.ru/_/#/settings/backups`)
    }
  } catch (e) {}
  return st
}

// 1-го числа: напомнить скачать копию на компьютер — на случай, если пропадёт сам сервер.
function monthly(app) {
  const st = status(app)
  const when = st.newest ? new Date(st.newest.at + 3 * 3600000).toISOString().slice(0, 10) : null
  try {
    const tg = require(`${__hooks}/tg.js`)
    for (const u of app.findRecordsByFilter("users", "role = 'admin'", "", 20, 0)) {
      let sub = null
      try { sub = app.findFirstRecordByFilter("tg_subs", "user = {:u} && enabled = true", { u: u.id }) } catch (e) {}
      if (sub) tg.send(sub.getString("chat_id"), `💾 <b>Раз в месяц — копия сайта на компьютер</b>\n${when ? `Свежая копия от ${when}.` : "Копий пока нет."} Откройте страницу, нажмите значок скачивания у верхней копии и сохраните файл в надёжное место (диск, облако).`, ["Скачать копию", "https://dashabotanika.ru/_/#/settings/backups"])
    }
  } catch (e) {}
}

module.exports = { status, check, monthly }
