// Расчёт роста персонажа и уровня — это одна линия прогресса.
// Очки роста — за действия по правилам growth_rules; уровень — по порогам min_xp из levels
// (плюс необязательные доп. условия). Уровень только растёт: сертификаты не пропадают.

function jsonOf(record, field) {
  const raw = record.get(field)
  if (raw === null || raw === undefined) return null
  try { return JSON.parse(toString(raw)) } catch (e) { return null }
}

function leavesOf(app, userId) {
  let rec
  try { rec = app.findFirstRecordByFilter("habits", "owner = {:id}", { id: userId }) } catch (e) { return 0 }
  const data = jsonOf(rec, "data") || {}
  const log = data.log || {}
  let n = 0
  for (const day in log) n += Array.isArray(log[day]) ? log[day].length : 0
  return n
}

const count = (app, coll, where) => app.countRecords(coll, $dbx.hashExp(where))

// Сколько раз участник выполнил каждое действие из growth_rules.
function actionsOf(app, user, leaves) {
  const id = user.id
  return {
    signup: 1,
    leaf: leaves,
    exam_passed: user.getInt("exam_best") >= 8 ? 1 : 0,
    game: Math.floor(user.getInt("game_best") / 10),
    article_read: count(app, "reads", { user: id }),
    like: count(app, "likes", { user: id }),
    comment: count(app, "comments", { author: id }),
    feedback: count(app, "feedback", { author: id }),
    listing_approved: count(app, "listings", { seller: id, moderation: "approved" }),
    deal_done: count(app, "listings", { seller: id, status: "gone" }),
  }
}

function recompute(app, userId) {
  let user
  try { user = app.findRecordById("users", userId) } catch (e) { return }
  const leaves = leavesOf(app, userId)

  // очки роста за действия
  const done = actionsOf(app, user, leaves)
  let xp = 0
  for (const r of app.findRecordsByFilter("growth_rules", "id != ''", "", 100, 0)) {
    xp += (done[r.getString("key")] || 0) * r.getInt("points")
  }

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

module.exports = { recompute, recomputeAll }
