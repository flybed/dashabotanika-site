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
      got: Math.max(count(app, "thanks", "from = {:u}", { u: id }), count(app, "listings", "chosen = {:u} && (status = 'gone' || status = 'lent')", { u: id })),
      thanks: count(app, "thanks", "giver = {:u}", { u: id }),
      profile: L.profileComplete ? L.profileComplete(app, id) === 1 : false,
      badges: badgesOf(app, id),
    }
  }
  return out
}
// значки дарителя (за каждый — очки роста, правило darom_badge)
const BADGES = [["first", 1, "given"], ["ten", 10, "given"], ["neighbor", 5, "thanks"]]
function badgesOf(app, id) {
  const n = { given: count(app, "listings", "seller = {:u} && status = 'gone'", { u: id }), thanks: count(app, "thanks", "giver = {:u}", { u: id }) }
  return BADGES.filter(([, need, what]) => n[what] >= need).map(([k]) => k)
}
// надёжный даритель: 5 и больше отданных вещей и ни одного отклонённого объявления — публикуем без ожидания проверки
function trusted(app, id) {
  return count(app, "listings", "seller = {:u} && status = 'gone'", { u: id }) >= 5 && count(app, "listings", "seller = {:u} && moderation = 'rejected'", { u: id }) === 0
}
// личный счётчик для кабинета
function mine(app, userId) {
  const gone = list(app, "listings", "seller = {:u} && status = 'gone'", { u: userId })
  return { given: gone.length, kg: Math.round(gone.reduce((s, r) => s + kgOf(r.getString("category")), 0) * 10) / 10, trusted: trusted(app, userId), badges: badgesOf(app, userId) }
}

// «спасибо» можно сказать только за вещь, о которой вы переписывались с дарителем, и только когда она отдана
function checkThanks(app, rec) {
  const from = rec.getString("from"), lid = rec.getString("listing")
  let l
  try { l = app.findRecordById("listings", lid) } catch (e) { throw new BadRequestError("Не нашли вещь, за которую вы благодарите.") }
  if (l.getString("seller") !== rec.getString("giver")) throw new BadRequestError("Эту вещь отдавал(а) другой человек.")
  const status = l.getString("status")
  if (status !== "gone" && status !== "lent") throw new BadRequestError("Даритель ещё не отметил вещь как отданную. Как только отметит — можно сказать спасибо.")
  if (l.getString("chosen") !== from) {
    try { app.findFirstRecordByFilter("chats", "listing = {:l} && buyer = {:u}", { l: lid, u: from }) }
    catch (e) { throw new BadRequestError("Сказать спасибо может тот, кто договаривался о вещи в сообщениях.") }
  }
  rec.set("title", l.getString("title"))
}

// срок объявления: за день после «актуально до» — напоминание автору, ещё через 3 дня без продления — в архив
function personal(app, userId, subject, title, html, button, url) {
  const N = require(`${__hooks}/notify.js`), T = require(`${__hooks}/tg.js`)
  try { for (const rec of N.wanting ? N.wanting(app, "messages", userId) : []) N.send(app, rec, "messages", subject, title, html, button, url) } catch (e) {}
  try { if (T.token()) for (const s of T.subsWith(app, "messages", userId)) T.send(s.getString("chat_id"), `<b>${title}</b>\n\n${html.replace(/<[^>]+>/g, "")}`, [button, url]) } catch (e) {}
}
// --- часть 2: заявки, выбор получателя, «Ищу», подписки, «Одолжу» ---
const SITE = "https://dashabotanika.ru"
const safe = (t) => String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
const userName = (app, id) => { try { return app.findRecordById("users", id).getString("name") || "Участник" } catch (e) { return "Участник" } }

// заявка «Хочу забрать»: только на опубликованную вещь, счётчик желающих на карточке, письмо автору
function checkClaim(app, rec) {
  let l
  try { l = app.findRecordById("listings", rec.getString("listing")) } catch (e) { throw new BadRequestError("Вещь не найдена.") }
  if (l.getString("moderation") !== "approved" || ["gone", "archived"].indexOf(l.getString("status")) >= 0) throw new BadRequestError("Эту вещь уже отдали или убрали.")
}
function claimsChanged(app, listingId, newUser) {
  try {
    const l = app.findRecordById("listings", listingId)
    l.set("claims", count(app, "claims", "listing = {:l}", { l: listingId })); app.saveNoValidate(l)
    if (newUser) personal(app, l.getString("seller"), `Хотят забрать «${l.getString("title")}» — DashaBotanika`, "Новый желающий",
      `<p><b>${safe(userName(app, newUser))}</b> хочет забрать «${safe(l.getString("title"))}». Всех желающих и их пару слов видно в кабинете — выберите, кому отдать.</p>`,
      "Выбрать получателя", `${SITE}/kabinet?tab=things`)
  } catch (e) {}
}
// даритель выбирает получателя: бронь, сообщение выбранному, вежливое письмо остальным
function choose(app, sellerId, claimId) {
  let c, l
  try { c = app.findRecordById("claims", claimId); l = app.findRecordById("listings", c.getString("listing")) } catch (e) { throw new BadRequestError("Заявка не найдена.") }
  if (l.getString("seller") !== sellerId) throw new ForbiddenError("Выбирать получателя может только тот, кто отдаёт вещь.")
  const to = c.getString("user"), title = l.getString("title")
  l.set("chosen", to)
  l.set("reserved_until", new Date(Date.now() + 48 * 3600000).toISOString().replace("T", " "))
  if (l.getString("status") === "active" || !l.getString("status")) l.set("status", "reserved")
  app.save(l)
  // переписка с выбранным — та же, что по «Хочу забрать»
  const key = "L" + l.id + "_" + to
  let chat
  try { chat = app.findFirstRecordByFilter("chats", "key = {:k}", { k: key }) } catch (e) {
    chat = new Record(app.findCollectionByNameOrId("chats"))
    chat.set("key", key); chat.set("title", title.slice(0, 120)); chat.set("listing", l.id); chat.set("seller", sellerId); chat.set("buyer", to)
    chat.set("last_from", sellerId); chat.set("last_at", Date.now()); chat.set("read_by", {}); app.save(chat)
  }
  personal(app, to, `Вам решили отдать «${title}» — DashaBotanika`, "Вещь ваша!",
    `<p><b>${safe(userName(app, sellerId))}</b> выбрал(а) вас, чтобы отдать «${safe(title)}». Договоритесь о встрече в сообщениях. Вещь ждёт вас 48 часов — потом перейдёт следующему желающему.</p>`,
    "Открыть переписку", `${SITE}/kabinet?tab=chats&t=${chat.id}`)
  for (const o of list(app, "claims", "listing = {:l} && user != {:u}", { l: l.id, u: to })) {
    personal(app, o.getString("user"), `«${title}» отдают другому человеку — DashaBotanika`, "В этот раз не получилось",
      `<p>Даритель выбрал другого человека для «${safe(title)}». Не расстраивайтесь: в «Вещах даром» появляются новые вещи, а ещё можно написать, что вы ищете, — в разделе «Ищу».</p>`,
      "Смотреть вещи", `${SITE}/darom`)
  }
  return { chat: chat.id }
}
// бронь на 48 часов: не забрали — вещь переходит следующему желающему (по порядку заявок), а если желающих нет — снова в ленте
function reservations(app) {
  const nowS = new Date().toISOString().replace("T", " ")
  let moved = 0, freed = 0
  for (const l of list(app, "listings", "status = 'reserved' && reserved_until != '' && reserved_until < {:n}", { n: nowS })) {
    const was = l.getString("chosen"), title = l.getString("title")
    try { const c = app.findFirstRecordByFilter("claims", "listing = {:l} && user = {:u}", { l: l.id, u: was }); c.set("skipped", true); app.saveNoValidate(c) } catch (e) {}
    const next = list(app, "claims", "listing = {:l} && skipped = false && user != {:u}", { l: l.id, u: was }).sort((a, b) => a.getString("created") < b.getString("created") ? -1 : 1)[0]
    if (was) personal(app, was, `Бронь на «${title}» закончилась — DashaBotanika`, "Бронь закончилась",
      `<p>За 48 часов не получилось договориться о «${safe(title)}», поэтому вещь переходит следующему желающему. Если всё же нужна — напишите дарителю.</p>`, "Смотреть вещи", `${SITE}/darom`)
    if (next) {
      l.set("chosen", next.getString("user")); l.set("reserved_until", new Date(Date.now() + 48 * 3600000).toISOString().replace("T", " ")); app.saveNoValidate(l); moved++
      try { choose(app, l.getString("seller"), next.id) } catch (e) {}
    } else {
      l.set("chosen", ""); l.set("reserved_until", ""); l.set("status", "active"); app.saveNoValidate(l); freed++
      personal(app, l.getString("seller"), `«${title}» снова свободна — DashaBotanika`, "Вещь снова в ленте",
        `<p>Бронь на «${safe(title)}» закончилась, а других желающих пока нет, — вещь снова видна всем.</p>`, "Открыть кабинет", `${SITE}/kabinet?tab=things`)
    }
  }
  return { moved, freed }
}
// даритель продлевает бронь на сутки (например, договорились на выходные)
function hold(app, sellerId, listingId) {
  let l; try { l = app.findRecordById("listings", listingId) } catch (e) { throw new BadRequestError("Вещь не найдена.") }
  if (l.getString("seller") !== sellerId) throw new ForbiddenError("Продлить бронь может только тот, кто отдаёт вещь.")
  if (l.getString("status") !== "reserved") throw new BadRequestError("Вещь не забронирована.")
  const base = Math.max(Date.now(), Date.parse(String(l.getString("reserved_until")).replace(" ", "T")) || 0)
  l.set("reserved_until", new Date(base + 24 * 3600000).toISOString().replace("T", " ")); app.saveNoValidate(l)
  return { reserved_until: l.getString("reserved_until") }
}
// «Одолжу»: когда автор отмечает «Одолжено», срок возврата считается сам
function onLent(app, rec, orig) {
  if (rec.getString("status") === "lent" && orig.getString("status") !== "lent") {
    const days = rec.getInt("lend_days") || 14
    rec.set("return_by", new Date(Date.now() + days * 86400000).toISOString().replace("T", " ")); rec.set("reminded", "")
  }
}
// новая вещь прошла проверку: тем, кто её ищет, и подписчикам на категорию
const norm = (s) => String(s || "").trim().toLowerCase()
function onApproved(app, l) {
  const cat = l.getString("category"), city = norm(l.getString("city")), seller = l.getString("seller"), title = l.getString("title")
  for (const w of list(app, "wants", "status = 'open' && category = {:c} && author != {:s}", { c: cat, s: seller })) {
    if (city && norm(w.getString("city")) && norm(w.getString("city")) !== city) continue
    personal(app, w.getString("author"), `Похоже, нашлось: «${title}» — DashaBotanika`, "Кто-то отдаёт то, что вы ищете",
      `<p>Вы искали «${safe(w.getString("title"))}». В «Вещах даром» появилось «${safe(title)}»${city ? " (" + safe(l.getString("city")) + ")" : ""}. Посмотрите — вдруг подойдёт.</p>`,
      "Посмотреть", `${SITE}/darom/v/${l.id}`)
  }
  for (const sub of list(app, "darom_subs", "user != {:s}", { s: seller })) {
    const cats = sub.getStringSlice("cats")
    if (cats.length && cats.indexOf(cat) < 0) continue
    if (city && norm(sub.getString("city")) && norm(sub.getString("city")) !== city) continue
    let pend = []; try { pend = JSON.parse(toString(sub.get("pending"))) || [] } catch (e) {}
    if (pend.indexOf(l.id) < 0) pend.push(l.id)
    sub.set("pending", pend); app.saveNoValidate(sub)
    if (isFriend(app, sub.getString("user"))) flushOne(app, sub)
  }
}
const isFriend = (app, id) => { try { const f = app.findRecordById("users", id).getString("friend_until"); return !!f && Date.parse(f.replace(" ", "T")) > Date.now() } catch (e) { return false } }
function support(app) { try { return String(app.findFirstRecordByData("settings", "key", "SUPPORT_URL").getString("value") || "").trim() } catch (e) { return "" } }
// подписчикам — одно письмо и одно сообщение в Telegram на несколько новых вещей (раз в 30 минут)
function flushSubs(app) {
  let sent = 0
  for (const sub of list(app, "darom_subs", "id != ''")) if (flushOne(app, sub)) sent++
  return sent
}
function flushOne(app, sub) {
  const N = require(`${__hooks}/notify.js`), T = require(`${__hooks}/tg.js`)
  {
    let pend = []; try { pend = JSON.parse(toString(sub.get("pending"))) || [] } catch (e) {}
    if (!pend.length) return false
    sub.set("pending", []); app.saveNoValidate(sub)
    const items = pend.map((id) => { try { return app.findRecordById("listings", id) } catch (e) { return null } }).filter((l) => l && l.getString("moderation") === "approved" && ["gone", "archived"].indexOf(l.getString("status")) < 0)
    if (!items.length) return false
    const u = sub.getString("user"), names = items.slice(0, 8).map((l) => "«" + l.getString("title") + "»" + (l.getString("city") ? " — " + l.getString("city") : ""))
    if (sub.getBool("email")) {
      let rec
      try { rec = app.findFirstRecordByFilter("notify", "user = {:u}", { u }) } catch (e) { rec = new Record(app.findCollectionByNameOrId("notify")); rec.set("user", u); app.save(rec) }
      N.send(app, rec, "darom", `Новые вещи даром: ${items.length} — DashaBotanika`, "Новые вещи даром",
        `<p>По вашей подписке появилось:</p><ul>${names.map((n) => `<li>${safe(n)}</li>`).join("")}</ul>`, "Посмотреть", `${SITE}/darom`)
    }
    if (sub.getBool("tg") && T.token()) {
      // «Отключить уведомления» выключает только эту подписку; в ссылке — случайный ключ, без id и данных человека
      const off = `${N.site(app)}/api/darom/tg-off?t=${unsubToken(app, sub)}`
      try { for (const s of list(app, "tg_subs", "user = {:u} && enabled = true", { u })) T.send(s.getString("chat_id"), "🎁 <b>Новые вещи даром</b>\n\n" + names.map((n) => "• " + safe(n)).join("\n"), [["Посмотреть", `${SITE}/darom`], ["🔕 Отключить уведомления", off]]) } catch (e) {}
    }
    return true
  }
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
  // «Одолжу»: за день до срока возврата — напоминание обоим
  let returns = 0
  const soon = new Date(now.getTime() + 86400000).toISOString().replace("T", " ")
  for (const l of list(app, "listings", "status = 'lent' && return_by != '' && return_by < {:s} && reminded = ''", { s: soon })) {
    l.set("reminded", nowS); app.saveNoValidate(l); returns++
    const t = safe(l.getString("title")), day = l.getString("return_by").slice(0, 10)
    personal(app, l.getString("chosen"), `Пора вернуть «${l.getString("title")}» — DashaBotanika`, "Напоминание о возврате",
      `<p>Вы брали на время «${t}». Срок возврата — ${day}. Договоритесь с владельцем о встрече в сообщениях.</p>`, "Открыть сообщения", `${site}/kabinet?tab=chats`)
    personal(app, l.getString("seller"), `«${l.getString("title")}» скоро вернут — DashaBotanika`, "Срок возврата завтра",
      `<p>«${t}» должны вернуть до ${day}. Когда вещь будет у вас, нажмите в кабинете «Вернули» — и она снова появится в ленте.</p>`, "Открыть кабинет", `${site}/kabinet?tab=things`)
  }
  // запросы «Ищу» живут месяц
  let closed = 0
  for (const w of list(app, "wants", "status = 'open' && created < {:d}", { d: new Date(now.getTime() - 30 * 86400000).toISOString().replace("T", " ") })) { w.set("status", "closed"); app.saveNoValidate(w); closed++ }
  return { reminded, archived, returns, closed }
}

// --- объявление из Telegram ---
// категория по словам из названия; не угадали — «Другое» (модератор поправит при проверке)
const CAT_WORDS = [["Детское", /детск|ребён|ребен|малыш|коляск|кроватк|автокресл|игрушк|пелен|комбинезон/i], ["Одежда и обувь", /куртк|пальто|плать|джинс|брюк|рубаш|свитер|кофт|юбк|обув|ботин|кроссов|сапог|шарф|шапк|одежд/i],
  ["Книги", /книг|учебник|журнал|роман|энциклопед/i], ["Кухня и посуда", /посуд|кастрюл|сковород|тарел|чашк|кружк|банк|чайник|блендер|мультиварк|кухон/i],
  ["Техника", /телефон|смартфон|ноутбук|компьютер|планшет|телевиз|монитор|наушник|зарядк|роутер|принтер|техник|пылесос|утюг|фен/i],
  ["Мебель и дом", /стол|стул|шкаф|диван|кресл|полк|комод|кроват|матрас|ламп|торшер|ковёр|ковер|штор|зеркал|мебел/i],
  ["Растения", /растени|цвет[оа]к|кактус|рассад|горшок|фикус|монстер/i], ["Для животных", /кошк|кот|собак|пёс|корм|лоток|переноск|аквариум|клетк/i],
  ["Хобби и спорт", /велосипед|самокат|лыж|коньк|санк|мяч|гантел|тренаж|палатк|рюкзак|удочк|гитар|спорт/i]]
const guessCat = (t) => (CAT_WORDS.find(([, re]) => re.test(t)) || ["Другое"])[0]
function fromTelegram(app, msg) {
  const T = require(`${__hooks}/tg.js`), chatId = String(msg.chat.id)
  let sub
  try { sub = app.findFirstRecordByFilter("tg_subs", "chat_id = {:c}", { c: chatId }) } catch (e) {
    T.send(chatId, "Чтобы отдавать вещи через бота, сначала подключите его к своему аккаунту: кабинет на сайте → «Профиль и настройки» → «Подключить Telegram».", ["Открыть кабинет", SITE + "/kabinet?tab=profile#notify"]); return
  }
  const userId = sub.getString("user"), store = app.store()
  const photo = msg.photo && msg.photo.length ? msg.photo[msg.photo.length - 1] : null
  // несколько фото одним альбомом — к первому объявлению, дополнительными фото (до 5)
  const mg = msg.media_group_id ? "tg_mg_" + msg.media_group_id : ""
  if (mg && store.get(mg)) {
    try {
      const l = app.findRecordById("listings", store.get(mg)), have = l.getStringSlice("more_photos")
      const bytes = photo && have.length < 5 ? T.fileBytes(photo.file_id) : null
      if (bytes) { l.set("more_photos+", [$filesystem.fileFromBytes(bytes, "tg-" + (have.length + 1) + ".jpg")]); app.saveNoValidate(l) }
    } catch (e) {}
    return
  }
  const raw = String(msg.caption || msg.text || "").replace(/^\/otdam(@\S+)?/i, "").trim()
  const lines = raw.split("\n").map((x) => x.trim()).filter(Boolean)
  const title = String(lines[0] || "").replace(/^(отдам даром|отдаю даром|отдам|отдаю)[:\s—-]*/i, "").replace(/^./, (c) => c.toUpperCase()).slice(0, 100)
  if (title.length < 2) {
    T.send(chatId, "🎁 Чтобы отдать вещь, пришлите её фото и подпишите: первая строка — что это (например, «Детский велосипед»), дальше — состояние, размер, где и когда удобно забрать.\n\nМожно и без фото: «Отдам книги о садоводстве, 5 штук».")
    return
  }
  const l = new Record(app.findCollectionByNameOrId("listings"))
  l.set("seller", userId); l.set("title", title); l.set("kind", "Отдам даром"); l.set("status", "active")
  l.set("note", lines.slice(1).join("\n").slice(0, 1500)); l.set("category", guessCat(raw))
  l.set("until", new Date(Date.now() + 14 * 86400000).toISOString().replace("T", " "))
  try {
    const p = app.findFirstRecordByFilter("profiles", "owner = {:u}", { u: userId })
    l.set("city", p.getString("city")); l.set("district", p.getString("district"))
    const pt = require(`${__hooks}/geo.js`).profilePoint(app, p)
    if (pt) { l.set("lat", pt.lat); l.set("lon", pt.lon) }
  } catch (e) {}
  let photoOk = !photo
  if (photo) { const bytes = T.fileBytes(photo.file_id); if (bytes) { l.set("photo", $filesystem.fileFromBytes(bytes, "tg.jpg")); photoOk = true } }
  const trust = trusted(app, userId)
  if (trust) l.set("moderation", "approved")
  app.save(l)
  if (mg) store.set(mg, l.id)
  if (trust) onApproved(app, l)
  T.send(chatId, (trust ? `✅ Опубликовано: «${safe(title)}»` : `✅ Отправлено на проверку: «${safe(title)}». Даша обычно проверяет в течение дня.`) +
    `\nКатегория: ${l.getString("category")}${l.getString("city") ? " · " + safe(l.getString("city")) : ""}` + (photoOk ? "" : "\n\n⚠️ Фото не загрузилось — можно удалить объявление в кабинете и выставить заново на сайте.") +
    "\n\nЖелающие напишут вам на сайте, а вы сами выберете, кому отдать.", trust ? ["Открыть объявление", `${SITE}/darom/v/${l.id}`] : ["Мои вещи", `${SITE}/kabinet?tab=things`])
}

// ---------- отписка от Telegram-уведомлений о новых вещах ----------
function unsubToken(app, sub) {
  let t = sub.getString("tg_unsub")
  if (!t) { t = $security.randomString(40); sub.set("tg_unsub", t); app.saveNoValidate(sub) }
  return t
}
// повторное нажатие — безопасно: «уже отключены»; запланированное не уйдёт — flushOne смотрит на tg в момент отправки
function tgOff(app, token) {
  if (!/^[A-Za-z0-9]{20,64}$/.test(token || "")) return "unknown"
  let sub
  try { sub = app.findFirstRecordByFilter("darom_subs", "tg_unsub = {:t}", { t: token }) } catch (e) { return "unknown" }
  if (!sub.getBool("tg")) return "already"
  sub.set("tg", false); app.saveNoValidate(sub)
  return sub.getBool("email") ? "off-email-stays" : "off"
}

// страница после нажатия кнопки (без входа на сайт)
function tgOffPage(r) {
  const [title, text] = r === "unknown" ? ["Ссылка устарела", "Не нашли такую подписку. Настроить уведомления можно на странице «Вещи даром»."]
    : r === "already" ? ["Уже отключено", "Уведомления о новых вещах в Telegram уже отключены — больше не пришлём."]
    : ["Уведомления отключены", "Больше не пришлём в Telegram сообщения о новых вещах даром." + (r === "off-email-stays" ? " Письма на почту по этой подписке остаются — их можно выключить на странице «Вещи даром» или по ссылке в письме." : "")]
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} — DashaBotanika</title></head>
<body style="margin:0;background:#EDE6D6;font-family:Arial,Helvetica,sans-serif;color:#232A1E"><div style="max-width:520px;margin:12vh auto;background:#F7F3EA;border:1px solid #D8CEB9;border-radius:16px;padding:28px">
<h1 style="font-family:Georgia,serif;color:#3A6234;font-size:26px;margin:0 0 12px">${title}</h1><p style="font-size:16px;line-height:1.5">${text}</p>
<p><a href="/darom#darom-sub" style="color:#3A6234;font-weight:bold">Настроить подписку</a> · <a href="/darom" style="color:#3A6234">Вещи даром</a></p></div></body></html>`
}

// ---------- письмо дарителю после проверки объявления ----------
// Очередь — поля объявления: mod_due ждёт, mod_mail — что уже отправлено. Письмо считается отправленным,
// только если почтовый сервер принял его; иначе попытка повторится с паузой (до 6 раз).
const modMark = (l) => l.getString("moderation") === "rejected" ? "rejected|" + l.getString("reason") : l.getString("moderation")
function modChanged(l) {
  if (!l.getString("moderation") || modMark(l) === l.getString("mod_mail")) return
  l.set("mod_due", true); l.set("mod_tries", 0); l.set("mod_next", "")
}
const MOD_PAUSE = [1, 5, 15, 60, 180, 720] // минут до следующей попытки
function modMail(app, limit) {
  const N = require(`${__hooks}/notify.js`)
  const now = new Date().toISOString().replace("T", " ")
  let sent = 0, failed = 0
  for (const l of list(app, "listings", "mod_due = true && (mod_next = '' || mod_next <= {:now})", { now }).slice(0, limit || 20)) {
    const mark = modMark(l)
    if (!l.getString("moderation") || mark === l.getString("mod_mail")) { l.set("mod_due", false); app.saveNoValidate(l); continue } // повторное сохранение того же статуса
    let user
    try { user = app.findRecordById("users", l.getString("seller")) } catch (e) { l.set("mod_due", false); app.saveNoValidate(l); continue }
    const to = user.getString("email")
    if (!to) { l.set("mod_due", false); app.saveNoValidate(l); continue }
    const ok = l.getString("moderation") === "approved"
    const title = ok ? "Ваше объявление опубликовано" : "Объявление не прошло проверку"
    const html = ok
      ? `<p style="margin:0 0 12px;font-size:16px;line-height:1.55">«${safe(l.getString("title"))}» теперь в «Вещах даром». Те, кому вещь нужна, напишут вам, а кому отдать — решаете вы.</p>`
      : `<p style="margin:0 0 12px;font-size:16px;line-height:1.55">«${safe(l.getString("title"))}» пока не опубликовано.</p>` +
        (l.getString("reason") ? `<p style="margin:0 0 12px;font-size:16px;line-height:1.55"><b>Причина:</b> ${safe(l.getString("reason"))}</p>` : "") +
        `<p style="margin:0 0 12px;font-size:16px;line-height:1.55">Исправьте и отправьте объявление заново — форма в личном кабинете.</p>`
    const url = ok ? `${N.site(app)}/darom/v/${l.id}` : `${N.site(app)}/kabinet?tab=things#cabinet-tabs`
    let done = false
    try {
      const meta = app.settings().meta
      app.newMailClient().send(new MailerMessage({
        from: { address: meta.senderAddress, name: meta.senderName || "DashaBotanika" },
        to: [{ address: to, name: user.getString("name") }],
        subject: ok ? `Опубликовано: ${l.getString("title")} — DashaBotanika` : `Объявление не прошло проверку — DashaBotanika`,
        html: N.letter(app, title, html, ok ? "Посмотреть объявление" : "Исправить и отправить заново", url, ""),
      }))
      done = true
    } catch (e) { app.logger().warn("moderation mail failed", "listing", l.id, "error", String(e)) }
    if (done) { l.set("mod_mail", mark); l.set("mod_due", false); l.set("mod_tries", 0); l.set("mod_next", ""); sent++ }
    else {
      const tries = l.getInt("mod_tries") + 1
      l.set("mod_tries", tries)
      if (tries >= MOD_PAUSE.length) l.set("mod_due", false) // сдаёмся: в журнале — предупреждения о каждой попытке
      else l.set("mod_next", new Date(Date.now() + MOD_PAUSE[tries] * 60000).toISOString().replace("T", " "))
      failed++
    }
    app.saveNoValidate(l)
  }
  return { sent, failed }
}

module.exports = { tgOff, tgOffPage, unsubToken, modChanged, modMark, modMail, fromTelegram, guessCat, stats, mine, checkThanks, expire, KG, checkClaim, claimsChanged, choose, onLent, onApproved, flushSubs, support, isFriend, badgesOf, trusted, reservations, hold }
