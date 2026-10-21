// Расчёт роста персонажа и уровня — это одна линия прогресса.
// Очки роста — за действия по правилам growth_rules; уровень — по порогам min_xp из levels
// (плюс необязательные доп. условия). Уровень только растёт: сертификаты не пропадают.

function jsonOf(record, field) {
  const raw = record.get(field)
  if (raw === null || raw === undefined) return null
  try { return JSON.parse(toString(raw)) } catch (e) { return null }
}

// Отметки: старый трекер недели (data.log) + все челленджи (data.challenges[].log).
// Челлендж пройден, если наступил его последний день и отмечено ≥ CH_PASS всех клеточек.
const CH_PASS = 0.7

function addDays(isoDate, n) {
  const d = new Date(isoDate + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function challengeStats(ch, today) {
  const ids = (ch.habits || []).map((h) => h.id)
  const days = Math.max(1, Math.min(60, ch.days | 0))
  const end = addDays(ch.start, days - 1)
  let checks = 0
  for (const day in (ch.log || {})) {
    if (day < ch.start || day > end) continue
    const arr = ch.log[day]
    if (Array.isArray(arr)) checks += arr.filter((id) => ids.indexOf(id) >= 0).length
  }
  const total = days * Math.max(1, ids.length)
  const passed = !!ch.start && today >= end && checks / total >= CH_PASS
  return { checks, total, passed }
}

function habitsOf(app, userId) {
  let rec
  try { rec = app.findFirstRecordByFilter("habits", "owner = {:id}", { id: userId }) } catch (e) { return { leaves: 0, challenges: 0 } }
  const data = jsonOf(rec, "data") || {}
  const today = new Date().toISOString().slice(0, 10)
  let leaves = 0, challenges = 0
  const log = data.log || {}
  for (const day in log) leaves += Array.isArray(log[day]) ? log[day].length : 0
  for (const ch of (Array.isArray(data.challenges) ? data.challenges : [])) {
    if (!ch || !ch.start) continue
    const st = challengeStats(ch, today)
    leaves += st.checks
    if (st.passed) challenges++
  }
  return { leaves, challenges }
}

// 0, если коллекции ещё нет (например, пока применяется миграция, которая её создаёт)
const count = (app, coll, where) => { try { return app.countRecords(coll, $dbx.hashExp(where)) } catch (e) { return 0 } }

// Профиль заполнен полностью: возраст, пол, страна, город и хотя бы одна эко-цель.
function profileComplete(app, userId) {
  try {
    const p = app.findFirstRecordByFilter("profiles", "owner = {:id}", { id: userId })
    return p.getInt("age") > 0 && !!p.getString("gender") && !!p.getString("country").trim() && !!p.getString("city").trim() && p.getStringSlice("goals").length > 0 ? 1 : 0
  } catch (e) { return 0 }
}
// Друзья по приглашению засчитываются сразу после регистрации: письма с подтверждением почты доходят
// не всегда, а ждать их было обидно. Фейковые аккаунты Даша видит в «Участниках» и может удалить —
// вместе с ними исчезнут и очки.
function friendsInvited(app, userId) {
  try { return app.findRecordsByFilter("referrals", "inviter = {:id}", "", 0, 0, { id: userId }).length } catch (e) { return 0 }
}

// Сколько раз участник выполнил каждое действие из growth_rules.
function actionsOf(app, user, hb) {
  const id = user.id
  return {
    signup: 1,
    leaf: hb.leaves,
    challenge_done: hb.challenges,
    exam_passed: user.getInt("exam_best") >= 8 ? 1 : 0,
    game: Math.floor(user.getInt("game_best") / 10),
    article_read: count(app, "reads", { user: id }),
    like: count(app, "likes", { user: id }),
    comment: count(app, "comments", { author: id }),
    feedback: count(app, "feedback", { author: id }),
    listing_approved: count(app, "listings", { seller: id, moderation: "approved" }),
    deal_done: count(app, "listings", { seller: id, status: "gone" }),
    profile_complete: profileComplete(app, id),
    invited: count(app, "referrals", { invited: id }),
    invite_friend: friendsInvited(app, id),
  }
}

// История очков: сравниваем, сколько раз сделано каждое действие сейчас и в прошлый раз,
// и записываем разницу. Самый первый раз — всё, что накоплено до появления истории (initial).
// Если очки изменились без новых действий (Даша поменяла правила) — запись «пересчёт».
function logChanges(app, userId, done, rules, xpOld, xpNew) {
  try {
    let state, prev = {}, first = false
    try { state = app.findFirstRecordByFilter("xp_state", "user = {:id}", { id: userId }); prev = jsonOf(state, "parts") || {} }
    catch (e) { state = new Record(app.findCollectionByNameOrId("xp_state")); state.set("user", userId); first = true }
    const log = app.findCollectionByNameOrId("xp_log")
    let explained = 0, changed = first
    for (const r of rules) {
      const key = r.getString("key"), diff = (done[key] || 0) - (prev[key] || 0)
      if (!diff) continue
      changed = true
      const points = diff * r.getInt("points")
      explained += points
      if (!points) continue
      const e = new Record(log)
      e.set("user", userId); e.set("key", key); e.set("title", r.getString("title")); e.set("count", diff); e.set("points", points); e.set("initial", first)
      app.save(e)
    }
    const rest = xpNew - (first ? 0 : xpOld) - explained
    if (!first && rest) {
      const e = new Record(log)
      e.set("user", userId); e.set("key", "rules"); e.set("title", "Пересчёт: изменились правила роста"); e.set("count", 0); e.set("points", rest)
      app.save(e)
    }
    if (changed) { state.set("parts", done); app.save(state) }
  } catch (e) {} // история не должна мешать начислению очков
}

function recompute(app, userId) {
  let user
  try { user = app.findRecordById("users", userId) } catch (e) { return }
  const hb = habitsOf(app, userId)
  const leaves = hb.leaves

  // очки роста за действия
  const done = actionsOf(app, user, hb)
  const rules = app.findRecordsByFilter("growth_rules", "id != ''", "", 100, 0)
  let xp = 0
  for (const r of rules) xp += (done[r.getString("key")] || 0) * r.getInt("points")
  logChanges(app, userId, done, rules, user.getInt("xp"), xp)

  // уровень = стадия персонажа: очки роста + необязательные доп. условия
  const posts = count(app, "reviews", { author: userId }) + count(app, "comments", { author: userId }) + count(app, "feedback", { author: userId })
  let reached = 0
  for (const l of app.findRecordsByFilter("levels", "rank > 0", "rank", 100, 0)) {
    const ok = xp >= l.getInt("min_xp") && leaves >= l.getInt("min_leaves") && user.getInt("exam_best") >= l.getInt("min_exam") &&
      user.getInt("game_best") >= l.getInt("min_game") && posts >= l.getInt("min_reviews")
    if (!ok) break
    reached = l.getInt("rank")
  }
  const current = user.getInt("level")
  const level = Math.max(current, reached, 1)

  if (level === current && user.getInt("leaves") === leaves && user.getInt("xp") === xp && user.getInt("stage") === level) return
  const history = jsonOf(user, "level_history") || []
  const now = new Date().toISOString()
  for (let r = 1; r <= level; r++) {
    if (!history.some(h => h.rank === r)) history.push({ rank: r, at: now })
  }
  user.set("level", level)
  user.set("stage", level)
  user.set("level_history", history)
  user.set("leaves", leaves)
  user.set("xp", xp)
  app.saveNoValidate(user)
}

function recomputeAll(app) {
  const users = app.findRecordsByFilter("users", "id != ''", "", 0, 0)
  for (const u of users) recompute(app, u.id)
}

// Пересчитать того, кто пригласил участника (например, когда участника удалили).
function recomputeInviter(app, userId) {
  try { recompute(app, app.findFirstRecordByFilter("referrals", "invited = {:id}", { id: userId }).getString("inviter")) } catch (e) {}
}

// Участники без истории очков (зарегистрировались до её появления) — пересчитать, чтобы прежние очки
// записались одной записью «до появления истории».
function backfillHistory(app) {
  try {
    const have = {}
    for (const s of app.findRecordsByFilter("xp_state", "id != ''", "", 0, 0)) have[s.getString("user")] = true
    for (const u of app.findRecordsByFilter("users", "id != ''", "", 0, 0)) if (!have[u.id]) recompute(app, u.id)
  } catch (e) {}
}

module.exports = { recompute, recomputeAll, recomputeInviter, backfillHistory }
