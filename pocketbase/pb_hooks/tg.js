// Telegram-бот: привязка из кабинета, напоминания о челлендже, раз в неделю — что нового.
// Токен бота — переменная окружения TG_TOKEN (файл /etc/dashabotanika/telegram.env, см. deploy/pocketbase.service).
// TG_API меняется только в тестах (подставной сервер вместо api.telegram.org).

const SITE = "https://dashabotanika.ru"
const token = () => String($os.getenv("TG_TOKEN") || "").trim()
// посредник для Telegram можно вписать в админке (settings → TG_API), если сервер не достаёт до api.telegram.org напрямую
function relay() { try { return String($app.findFirstRecordByData("settings", "key", "TG_API").getString("value") || "").trim() } catch (e) { return "" } }
const apiBase = () => String($os.getenv("TG_API") || relay() || "https://api.telegram.org").replace(/\/+$/, "")
// секрет для заголовка вебхука — из токена, чтобы не хранить ещё один
const hookSecret = () => $security.sha256("dashabotanika-hook:" + token()).slice(0, 48)
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// последняя ошибка Telegram — чтобы в кабинете было видно, что не так (токен, сеть)
let lastError = ""
// если Telegram недоступен (сеть сервера), на 5 минут перестаём к нему ходить: иначе каждый вызов ждёт таймаут и сайт тормозит
function call(method, payload) {
  if (!token()) return null
  const down = $app.store().get("tg_down_until") || 0
  if (Date.now() < down) { lastError = "нет связи с api.telegram.org"; return null }
  try {
    const res = $http.send({ url: `${apiBase()}/bot${token()}/${method}`, method: "POST", body: JSON.stringify(payload || {}),
      headers: { "content-type": "application/json" }, timeout: 4 })
    const j = res.json
    if (!j || j.ok === false) lastError = (j && j.description) || ("ответ " + res.statusCode)
    return j
  } catch (e) { lastError = "нет связи с api.telegram.org"; $app.store().set("tg_down_until", Date.now() + 5 * 60000); return null }
}
const errorText = () => lastError
function send(chatId, html, button) {
  const p = { chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true }
  if (button) p.reply_markup = { inline_keyboard: [[{ text: button[0], url: button[1] }]] }
  return call("sendMessage", p)
}

let botName = ""
function username() {
  if (botName) return botName
  const r = call("getMe")
  botName = r && r.ok && r.result ? r.result.username : ""
  return botName
}
// Сообщения боту сервер забирает сам (getUpdates) — раз в минуту и каждые несколько секунд, пока человек
// подключает бота в кабинете. Так не нужно, чтобы Telegram мог достучаться до сервера (вебхук на нашем
// сервере не доходил). Номер следующего сообщения и «замок» — в общем хранилище приложения.
function poll(app) {
  if (!token()) return 0
  const store = app.store()
  const busy = store.get("tg_poll_busy")
  if (busy && Date.now() - busy < 20000) return 0
  store.set("tg_poll_busy", Date.now())
  let n = 0
  try {
    if (!store.get("tg_hook_off")) { const r = call("deleteWebhook", {}); if (r && r.ok) store.set("tg_hook_off", true) }
    const offset = store.get("tg_offset") || 0
    const r = call("getUpdates", offset ? { offset, timeout: 0, allowed_updates: ["message"] } : { timeout: 0, allowed_updates: ["message"] })
    let next = offset
    for (const u of (r && r.ok && r.result) || []) {
      next = Math.max(next, u.update_id + 1)
      try { onMessage(app, u.message) } catch (e) {}
      n++
    }
    if (next !== offset) { store.set("tg_offset", next); call("getUpdates", { offset: next, limit: 1, timeout: 0 }) } // подтвердить полученное
  } finally { store.remove("tg_poll_busy") }
  return n
}

// код для ссылки t.me/<бот>?start=<код>
function linkFor(app, userId) {
  const col = app.findCollectionByNameOrId("tg_links")
  const r = new Record(col)
  const code = $security.randomString(24)
  r.set("user", userId); r.set("code", code)
  app.save(r)
  const name = username()
  return name ? `https://t.me/${name}?start=${code}` : ""
}

function nameOf(app, userId) { try { return app.findRecordById("users", userId).getString("name") } catch (e) { return "" } }

function onMessage(app, msg) {
  if (!msg || !msg.chat) return
  const chatId = String(msg.chat.id), text = String(msg.text || "").trim()
  const m = text.match(/^\/start(?:\s+(\S+))?/)
  if (m && m[1]) {
    let link
    try { link = app.findFirstRecordByFilter("tg_links", "code = {:c}", { c: m[1] }) } catch (e) {}
    const fresh = link && Date.now() - new Date(link.getString("created").replace(" ", "T")).getTime() < 24 * 3600 * 1000
    if (!link) { try { app.findFirstRecordByFilter("tg_subs", "chat_id = {:c}", { c: chatId }); return } catch (e) {} } // это повтор: уже подключено
    if (!fresh) { send(chatId, "Ссылка устарела. Откройте кабинет на сайте и нажмите «Подключить Telegram» ещё раз.", ["Открыть кабинет", SITE + "/kabinet?tab=profile#notify"]); return }
    const userId = link.getString("user")
    let sub
    try { sub = app.findFirstRecordByFilter("tg_subs", "user = {:u}", { u: userId }) } catch (e) {
      sub = new Record(app.findCollectionByNameOrId("tg_subs")); sub.set("user", userId); sub.set("hour", 20); sub.set("tz", 180)
      // админам и модераторам — ещё и о новых участниках
      let role = ""
      try { role = app.findRecordById("users", userId).getString("role") } catch (e) {}
      sub.set("topics", ["challenge", "messages", "weekly"].concat(role === "admin" || role === "moderator" ? ["signups"] : []))
    }
    sub.set("chat_id", chatId); sub.set("enabled", true)
    app.save(sub)
    app.delete(link)
    send(chatId, `Готово, ${esc(nameOf(app, userId))}! 🌱 Telegram подключён.\n\nЧто присылать и во сколько, выберите в кабинете → «Профиль и настройки» → «Уведомления». Отключить всё — команда /stop.`, ["Выбрать уведомления", SITE + "/kabinet?tab=profile#notify"])
    return
  }
  if (/^\/stop/.test(text)) {
    try { app.delete(app.findFirstRecordByFilter("tg_subs", "chat_id = {:c}", { c: chatId })) } catch (e) {}
    send(chatId, "Напоминания выключены. Чтобы включить снова — кабинет на сайте → «Профиль и настройки» → «Подключить Telegram».")
    return
  }
  send(chatId, "Привет! Я бот сайта DashaBotanika 🌍 Напоминаю про эко-челленджи и рассказываю новости сообщества.\n\nЧтобы подключить напоминания, откройте личный кабинет → «Профиль и настройки» → «Подключить Telegram».", ["Открыть сайт", SITE + "/kabinet?tab=profile#notify"])
}

// ---------- напоминания ----------
function jsonOf(record, field) { try { return JSON.parse(toString(record.get(field))) } catch (e) { return null } }
function addDays(isoDate, n) { const d = new Date(isoDate + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

// что не отмечено сегодня в идущих челленджах
function openToday(app, userId, today) {
  let rec
  try { rec = app.findFirstRecordByFilter("habits", "owner = {:id}", { id: userId }) } catch (e) { return { active: [], open: [] } }
  const data = jsonOf(rec, "data") || {}
  const active = [], open = []
  for (const ch of (Array.isArray(data.challenges) ? data.challenges : [])) {
    if (!ch || !ch.start) continue
    const end = addDays(ch.start, Math.max(1, ch.days | 0) - 1)
    if (today < ch.start || today > end) continue
    active.push(ch)
    const done = (ch.log || {})[today] || []
    for (const h of (ch.habits || [])) if (done.indexOf(h.id) < 0) open.push(h.name)
  }
  return { active, open }
}

function weekNews(app) {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().replace("T", " ")
  let members = 0, things = 0, arts = []
  try { members = app.countRecords("users", $dbx.exp("created >= {:s}", { s: since })) } catch (e) {}
  try { things = app.countRecords("listings", $dbx.exp("created >= {:s} AND moderation = 'approved'", { s: since })) } catch (e) {}
  try {
    const d = jsonOf(app.findFirstRecordByFilter("content", "key = 'site'"), "data") || {}
    const day = since.slice(0, 10)
    arts = (d.articles || []).filter((a) => (a.date || "") >= day).slice(0, 3)
  } catch (e) {}
  const lines = []
  if (members) lines.push(`🐾 В мире поселились новые участники: ${members}`)
  if (things) lines.push(`🎁 В «Вещах даром» новых вещей: ${things}`)
  arts.forEach((a) => lines.push(`📖 «${esc(a.title)}»`))
  return lines
}

function remindAll(app, force) {
  if (!token()) return 0
  let sent = 0
  for (const sub of app.findRecordsByFilter("tg_subs", "enabled = true", "", 0, 0)) {
    try {
      const local = new Date(Date.now() + sub.getInt("tz") * 60000)
      const today = local.toISOString().slice(0, 10), hour = local.getUTCHours(), sunday = local.getUTCDay() === 0
      if (!force && (hour !== sub.getInt("hour") || sub.getString("last_sent") === today)) continue
      const userId = sub.getString("user"), name = esc(nameOf(app, userId)), want = sub.getStringSlice("topics")
      const t = openToday(app, userId, today)
      const parts = []
      if (want.indexOf("challenge") >= 0 && t.open.length) parts.push(`🌱 ${name}, сегодня в челлендже ещё не отмечено:\n${t.open.slice(0, 8).map((n) => "• " + esc(n)).join("\n")}\n\nОтметьте, что получилось, — персонаж подрастёт!`)
      else if (want.indexOf("nudge") >= 0 && !t.active.length && sunday) parts.push(`🌱 ${name}, новая неделя — хороший повод для нового эко-челленджа. Выберите цель и 3–5 простых привычек.`)
      if (want.indexOf("weekly") >= 0 && sunday) { const news = weekNews(app); if (news.length) parts.push(`<b>Что нового в «Счастливом мире» за неделю</b>\n${news.join("\n")}`) }
      if (!parts.length) continue
      const r = send(sub.getString("chat_id"), parts.join("\n\n"), t.open.length || t.active.length || !sunday ? ["Отметить привычки", SITE + "/kabinet?tab=challenges#cabinet-tabs"] : ["Открыть сайт", SITE + "/"])
      if (r && r.ok === false && r.error_code === 403) { sub.set("enabled", false) } // человек заблокировал бота
      sub.set("last_sent", today)
      app.save(sub)
      sent++
    } catch (e) {}
  }
  return sent
}

// ---------- сразу: новое личное сообщение, новая статья ----------
function subsWith(app, topic, userId) {
  const f = userId ? "enabled = true && user = {:u}" : "enabled = true"
  try { return app.findRecordsByFilter("tg_subs", f, "", 0, 0, { u: userId || "" }).filter((s) => s.getStringSlice("topics").indexOf(topic) >= 0) } catch (e) { return [] }
}
function onChatMessage(app, msg) {
  if (!token()) return
  try {
    const chat = app.findRecordById("chats", msg.getString("chat")), from = msg.getString("from")
    const to = [chat.getString("buyer"), chat.getString("seller")].filter((u) => u && u !== from)
    for (const u of to) for (const sub of subsWith(app, "messages", u)) {
      send(sub.getString("chat_id"), `💬 Новое сообщение от <b>${esc(nameOf(app, from))}</b>:\n\n${esc(msg.getString("text").slice(0, 300))}`, ["Ответить", `${SITE}/kabinet?tab=chats&t=${chat.id}`])
    }
  } catch (e) {}
}
// публикация статьи только ставит её в очередь, рассылает cron раз в минуту: сохранение не ждёт Telegram
function onNewArticles(app, list) {
  if (!token() || !list.length) return
  const store = app.store(), q = store.get("tg_articles_queue") || []
  for (const a of list.slice(0, 3)) q.push({ title: a.title, lead: a.lead, slug: a.slug || a.id })
  store.set("tg_articles_queue", q)
}
function flushArticles(app) {
  const store = app.store(), list = store.get("tg_articles_queue") || []
  if (!list.length) return 0
  store.set("tg_articles_queue", [])
  for (const sub of subsWith(app, "articles")) {
    for (const a of list) send(sub.getString("chat_id"), `📖 Новая статья в журнале DashaBotanika:\n<b>${esc(a.title)}</b>\n\n${esc(String(a.lead || "").slice(0, 250))}`, ["Читать", `${SITE}/zhurnal/${a.slug || a.id}`])
  }
}

// для кабинета: есть ли токен и отвечает ли Telegram (getMe), чтобы честно показать, почему бот не подключается
function status() { return { token: !!token(), ok: token() ? !!username() : false, error: errorText() } }

module.exports = { send, errorText, token, hookSecret, poll, linkFor, onMessage, remindAll, onChatMessage, onNewArticles, flushArticles, openToday, status, subsWith }
