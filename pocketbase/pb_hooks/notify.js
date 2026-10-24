// Письма участникам по их выбору (коллекция notify): личные сообщения, новые статьи, письмо недели.
// Отправляются через почтовые настройки PocketBase (Unisender Go). В каждом письме — «Отписаться» в один клик.
const SITE = "https://dashabotanika.ru"
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const TOPIC_NAME = { messages: "личные сообщения", articles: "новые статьи", weekly: "письмо недели" }

function site(app) { const u = String(app.settings().meta.appURL || "").replace(/\/+$/, ""); return /^https?:\/\//.test(u) && !/localhost|127\.0\.0\.1/.test(u) ? u : SITE }

function letter(app, title, html, button, url, unsub) {
  return `<div style="background:#EDE6D6;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#232A1E">
<div style="max-width:560px;margin:0 auto;background:#F7F3EA;border:1px solid #D8CEB9;border-radius:16px;padding:28px">
<p style="margin:0 0 6px;font-size:13px;font-weight:bold;letter-spacing:.1em;text-transform:uppercase;color:#AD5E39">DashaBotanika</p>
<h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:26px;color:#3A6234">${esc(title)}</h1>
${html}
${button ? `<p style="margin:22px 0"><a href="${url}" style="display:inline-block;background:#3A6234;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">${esc(button)}</a></p>` : ""}
<p style="margin:18px 0 0;font-size:13px;color:#61655A">Разумный человек — счастливая планета 🌿<br>Даша, DashaBotanika</p>
<p style="margin:16px 0 0;font-size:12px;color:#8A8C80;line-height:1.5">Вы получили это письмо, потому что выбрали его в личном кабинете.
<a href="${unsub}" style="color:#8A8C80">Отписаться</a> · <a href="${site(app)}/kabinet?tab=profile#notify" style="color:#8A8C80">Настроить уведомления</a></p>
</div></div>`
}

function unsubUrl(app, rec, topic) { return `${site(app)}/api/notify/unsub?n=${rec.id}&t=${rec.getString("token")}&k=${topic || "all"}` }

function send(app, rec, topic, subject, title, html, button, url) {
  let user
  try { user = app.findRecordById("users", rec.getString("user")) } catch (e) { return false }
  const to = user.getString("email")
  if (!to) return false
  const meta = app.settings().meta
  const unsub = unsubUrl(app, rec, topic)
  try {
    app.newMailClient().send(new MailerMessage({
      from: { address: meta.senderAddress, name: meta.senderName || "DashaBotanika" },
      to: [{ address: to, name: user.getString("name") }],
      subject: subject,
      html: letter(app, title, html, button, url, unsub),
      headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }))
    return true
  } catch (e) { app.logger().error("notify mail failed", "topic", topic, "error", String(e)); return false }
}

function wanting(app, topic, userId) {
  const f = userId ? "user = {:u}" : "id != ''"
  try { return app.findRecordsByFilter("notify", f, "", 0, 0, { u: userId || "" }).filter((r) => r.getStringSlice("email_topics").indexOf(topic) >= 0) } catch (e) { return [] }
}
const nameOf = (app, id) => { try { return app.findRecordById("users", id).getString("name") || "Участник" } catch (e) { return "Участник" } }
const p = (t) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.55">${t}</p>`

// новое личное сообщение — не чаще раза в 3 часа на человека, чтобы не засыпать почту
function onChatMessage(app, msg) {
  try {
    const chat = app.findRecordById("chats", msg.getString("chat")), from = msg.getString("from")
    for (const u of [chat.getString("buyer"), chat.getString("seller")].filter((x) => x && x !== from)) {
      for (const rec of wanting(app, "messages", u)) {
        const last = Date.parse(String(rec.getString("last_msg_mail")).replace(" ", "T")) || 0
        if (Date.now() - last < 3 * 3600000) continue
        if (send(app, rec, "messages", `Вам написал(а) ${nameOf(app, from)} — DashaBotanika`, "Новое сообщение",
          p(`<b>${esc(nameOf(app, from))}</b> пишет вам на DashaBotanika:`) + `<blockquote style="margin:0 0 12px;padding:12px 16px;background:#fff;border-radius:12px;border:1px solid #D8CEB9">${esc(msg.getString("text").slice(0, 400))}</blockquote>`,
          "Ответить", `${site(app)}/kabinet?tab=chats&t=${chat.id}`)) { rec.set("last_msg_mail", new Date().toISOString().replace("T", " ")); app.save(rec) }
      }
    }
  } catch (e) {}
}

// публикация статьи только ставит её в очередь, письма уходят из cron раз в минуту: сохранение не ждёт почтовый сервер
function onNewArticles(app, list) {
  if (!list.length) return
  const store = app.store(), q = store.get("notify_articles_queue") || []
  for (const a of list.slice(0, 3)) q.push({ title: a.title, lead: a.lead, slug: a.slug || a.id })
  store.set("notify_articles_queue", q)
}
function flushArticles(app) {
  const store = app.store(), list = store.get("notify_articles_queue") || []
  if (!list.length) return 0
  store.set("notify_articles_queue", [])
  const arts = list.slice(0, 3)
  const html = arts.map((a) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5"><a href="${site(app)}/zhurnal/${esc(a.slug || a.id)}" style="color:#3A6234;font-weight:bold;font-size:18px">${esc(a.title)}</a><br>${esc(String(a.lead || "").slice(0, 220))}</p>`).join("")
  for (const rec of wanting(app, "articles")) send(app, rec, "articles", arts.length > 1 ? "Новые статьи в журнале DashaBotanika" : `«${arts[0].title}» — новая статья`, arts.length > 1 ? "Новые статьи" : "Новая статья", html, "Читать", `${site(app)}/zhurnal/${esc(arts[0].slug || arts[0].id)}`)
}

// ---------- письмо недели: что нового на сайте и как прошла неделя у самого человека ----------
function jsonOf(record, field) { try { return JSON.parse(toString(record.get(field))) } catch (e) { return null } }
function weekLetter(app, userId, since) {
  const day = since.slice(0, 10), blocks = []
  let arts = [], members = 0, things = 0
  try { arts = ((jsonOf(app.findFirstRecordByFilter("content", "key = 'site'"), "data") || {}).articles || []).filter((a) => (a.date || "") >= day).slice(0, 3) } catch (e) {}
  try { members = app.countRecords("users", $dbx.exp("created >= {:s}", { s: since })) } catch (e) {}
  try { things = app.countRecords("listings", $dbx.exp("created >= {:s} AND moderation = 'approved'", { s: since })) } catch (e) {}
  if (arts.length) blocks.push(`<h2 style="margin:18px 0 10px;font-family:Georgia,serif;font-size:20px">📖 Новое в журнале</h2>` +
    arts.map((a) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.5"><a href="${site(app)}/zhurnal/${esc(a.slug || a.id)}" style="color:#3A6234;font-weight:bold">${esc(a.title)}</a><br>${esc(String(a.lead || "").slice(0, 180))}</p>`).join(""))
  const world = []
  if (members) world.push(`🐾 новых жителей: <b>${members}</b>`)
  if (things) world.push(`📦 новых вещей на барахолке: <b>${things}</b>`)
  if (world.length) blocks.push(`<h2 style="margin:18px 0 10px;font-family:Georgia,serif;font-size:20px">🌍 Жизнь «Счастливого мира»</h2>` + p(world.join("<br>")))
  let xp = 0
  try { xp = app.findRecordsByFilter("xp_log", "user = {:u} && created >= {:s} && initial = false", "", 0, 0, { u: userId, s: since }).reduce((s, r) => s + r.getInt("points"), 0) } catch (e) {}
  const mine = []
  if (xp > 0) mine.push(`🌱 ваш персонаж вырос на <b>+${xp}</b> очков`)
  try {
    const u = app.findRecordById("users", userId), lv = app.findFirstRecordByFilter("levels", "rank = {:r}", { r: u.getInt("level") })
    mine.push(`🏅 уровень: <b>${esc(lv.getString("name"))}</b>, всего очков: ${u.getInt("xp")}`)
  } catch (e) {}
  blocks.push(`<h2 style="margin:18px 0 10px;font-family:Georgia,serif;font-size:20px">✨ Ваша неделя</h2>` + p(mine.join("<br>") || "Загляните на сайт — новая неделя хороший повод для эко-челленджа."))
  return { html: blocks.join(""), news: arts.length + members + things + xp }
}
function weekly(app, force) {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().replace("T", " ")
  const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10)
  let sent = 0
  for (const rec of wanting(app, "weekly")) {
    if (!force && rec.getString("last_weekly") === today) continue
    const w = weekLetter(app, rec.getString("user"), since)
    if (!w.news && !force) continue // совсем нечего рассказать — не пишем
    if (send(app, rec, "weekly", "Письмо недели от DashaBotanika 🌿", `${nameOf(app, rec.getString("user"))}, вот ваша неделя`, w.html, "Открыть сайт", `${site(app)}/kabinet`)) {
      rec.set("last_weekly", today); app.save(rec); sent++
    }
  }
  return sent
}

function unsubscribe(app, id, token, topic) {
  let rec
  try { rec = app.findRecordById("notify", id) } catch (e) { return null }
  if (!token || rec.getString("token") !== token) return null
  const left = topic === "all" ? [] : rec.getStringSlice("email_topics").filter((t) => t !== topic)
  rec.set("email_topics", left); app.save(rec)
  return topic === "all" ? "все письма" : (TOPIC_NAME[topic] || "эти письма")
}

const unsubPage = (title, text) => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — DashaBotanika</title></head>
<body style="margin:0;background:#EDE6D6;font-family:Arial,Helvetica,sans-serif;color:#232A1E"><div style="max-width:520px;margin:12vh auto;background:#F7F3EA;border:1px solid #D8CEB9;border-radius:16px;padding:28px">
<h1 style="font-family:Georgia,serif;color:#3A6234;font-size:26px;margin:0 0 12px">${title}</h1><p style="font-size:16px;line-height:1.5">${text}</p>
<p><a href="/kabinet?tab=profile#notify" style="color:#3A6234;font-weight:bold">Настроить уведомления</a> · <a href="/" style="color:#3A6234">На сайт</a></p></div></body></html>`
function unsubRoute(e) {
  const q = e.request.url.query()
  const what = unsubscribe(e.app, q.get("n"), q.get("t"), q.get("k") || "all")
  return what ? e.html(200, unsubPage("Вы отписались", `Больше не пришлём: ${what}. Остальные настройки — в личном кабинете.`))
    : e.html(400, unsubPage("Ссылка устарела", "Не получилось найти подписку. Настроить письма можно в личном кабинете."))
}

module.exports = { onChatMessage, onNewArticles, flushArticles, weekly, unsubscribe, unsubRoute, site }
