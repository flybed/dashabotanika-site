// «Вещи даром»: счётчик пользы, доверие к людям, срок объявлений, «спасибо» дарителю.

// сколько в среднем весит вещь из категории, кг — грубая оценка для счётчика «спасено от свалки»
const KG = { "Одежда и обувь": 0.7, "Детское": 1.5, "Книги": 0.5, "Кухня и посуда": 1, "Техника": 3, "Мебель и дом": 10, "Растения": 1, "Для животных": 1, "Хобби и спорт": 2, "Другое": 1 }
const kgOf = (cat) => KG[cat] || KG["Другое"]
const list = (app, coll, filter, params) => { try { return app.findRecordsByFilter(coll, filter, "", 0, 0, params || {}) } catch (e) { return [] } }
const count = (app, coll, filter, params) => list(app, coll, filter, params).length

// общий счётчик и «доверие» к людям: отдал(а), получил(а) (сказал(а) спасибо), спасибо от других, заполнен ли профиль
function stats(app, ids) {
  const gone = list(app, "listings", "status = 'gone'")
  const out = { given: gone.length, kg: Math.round(gone.reduce((s, r) => s + kgOf(r.getString("category")), 0)), thanks: count(app, "thanks", "id != ''"), people: {} }
  const L = require(`${__hooks}/levels.js`)
  for (const id of (ids || []).slice(0, 60)) {
    if (!/^[a-z0-9]{15}$/.test(id)) continue
    out.people[id] = {
      given: count(app, "listings", "seller = {:u} && status = 'gone'", { u: id }),
      got: count(app, "thanks", "from = {:u}", { u: id }),
      thanks: count(app, "thanks", "giver = {:u}", { u: id }),
      profile: L.profileComplete ? L.profileComplete(app, id) === 1 : false,
    }
  }
  return out
}
// личный счётчик для кабинета
function mine(app, userId) {
  const gone = list(app, "listings", "seller = {:u} && status = 'gone'", { u: userId })
  return { given: gone.length, kg: Math.round(gone.reduce((s, r) => s + kgOf(r.getString("category")), 0) * 10) / 10 }
}

// «спасибо» можно сказать только за вещь, о которой вы переписывались с дарителем, и только когда она отдана
function checkThanks(app, rec) {
  const from = rec.getString("from"), lid = rec.getString("listing")
  let l
  try { l = app.findRecordById("listings", lid) } catch (e) { throw new BadRequestError("Не нашли вещь, за которую вы благодарите.") }
  if (l.getString("seller") !== rec.getString("giver")) throw new BadRequestError("Эту вещь отдавал(а) другой человек.")
  if (l.getString("status") !== "gone") throw new BadRequestError("Даритель ещё не отметил вещь как отданную. Как только отметит — можно сказать спасибо.")
  try { app.findFirstRecordByFilter("chats", "listing = {:l} && buyer = {:u}", { l: lid, u: from }) }
  catch (e) { throw new BadRequestError("Сказать спасибо может тот, кто договаривался о вещи в сообщениях.") }
  rec.set("title", l.getString("title"))
}

// срок объявления: за день после «актуально до» — напоминание автору, ещё через 3 дня без продления — в архив
function personal(app, userId, subject, title, html, button, url) {
  const N = require(`${__hooks}/notify.js`), T = require(`${__hooks}/tg.js`)
  try { for (const rec of N.wanting ? N.wanting(app, "messages", userId) : []) N.send(app, rec, "messages", subject, title, html, button, url) } catch (e) {}
  try { if (T.token()) for (const s of T.subsWith(app, "messages", userId)) T.send(s.getString("chat_id"), `<b>${title}</b>\n\n${html.replace(/<[^>]+>/g, "")}`, [button, url]) } catch (e) {}
}
function expire(app) {
  const now = new Date(), nowS = now.toISOString().replace("T", " ")
  const site = "https://dashabotanika.ru"
  let reminded = 0, archived = 0
  for (const l of list(app, "listings", "(status = 'active' || status = 'reserved' || status = '') && until != '' && until < {:n}", { n: nowS })) {
    const r = l.getString("reminded")
    if (!r) {
      l.set("reminded", nowS); app.saveNoValidate(l); reminded++
      personal(app, l.getString("seller"), `«${l.getString("title")}» ещё актуально? — DashaBotanika`, "Вещь ещё ждёт хозяина?",
        `<p>Объявлению «${l.getString("title").replace(/</g, "&lt;")}» пора обновиться. Если вещь ещё у вас — продлите его в кабинете на 14 дней. Если уже отдали — отметьте «Отдано».</p><p>Без ответа через 3 дня объявление уйдёт в архив, его можно будет вернуть одной кнопкой.</p>`,
        "Продлить или отметить", `${site}/kabinet?tab=things`)
    } else if (Date.parse(r.replace(" ", "T")) < now.getTime() - 3 * 86400000) {
      l.set("status", "archived"); app.saveNoValidate(l); archived++
    }
  }
  return { reminded, archived }
}

module.exports = { stats, mine, checkThanks, expire, KG }
