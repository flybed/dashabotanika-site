// Расчёт уровня и роста персонажа.
// Уровень (сертификаты) — по условиям из коллекции levels; только растёт.
// Рост персонажа — очки за действия по правилам growth_rules, стадия — по growth_stages.

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
  const posts = count(app, "reviews", { author: userId }) + count(app, "comments", { author: userId }) + count(app, "feedback", { author: userId })
  const stats = { leaves: leaves, exam: user.getInt("exam_best"), game: user.getInt("game_best"), posts: posts }

  // уровень
  const levels = app.findRecordsByFilter("levels", "rank > 0", "rank", 100, 0)
  let reached = 0
  for (const l of levels) {
    const ok = stats.leaves >= l.getInt("min_leaves") && stats.exam >= l.getInt("min_exam") &&
      stats.game >= l.getInt("min_game") && stats.posts >= l.getInt("min_reviews")
    if (!ok) break
    reached = l.getInt("rank")
  }
  const current = user.getInt("level")
  const level = Math.max(current, reached)

  // рост персонажа
  const done = actionsOf(app, user, leaves)
  let xp = 0
  for (const r of app.findRecordsByFilter("growth_rules", "id != ''", "", 100, 0)) {
    xp += (done[r.getString("key")] || 0) * r.getInt("points")
  }
  let stage = 1
  for (const s of app.findRecordsByFilter("growth_stages", "stage > 0", "stage", 100, 0)) {
    if (xp >= s.getInt("min_xp")) stage = Math.max(stage, s.getInt("stage"))
  }

  if (level === current && user.getInt("leaves") === leaves && user.getInt("xp") === xp && user.getInt("stage") === stage) return
  const history = jsonOf(user, "level_history") || []
  const now = new Date().toISOString()
  for (let r = current + 1; r <= level; r++) {
    if (!history.some(h => h.rank === r)) history.push({ rank: r, at: now })
  }
  user.set("level", level)
  user.set("level_history", history)
  user.set("leaves", leaves)
  user.set("xp", xp)
  user.set("stage", stage)
  app.saveNoValidate(user)
}

function recomputeAll(app) {
  const users = app.findRecordsByFilter("users", "id != ''", "", 0, 0)
  for (const u of users) recompute(app, u.id)
}

module.exports = { recompute, recomputeAll }
