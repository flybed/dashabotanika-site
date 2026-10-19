// Расчёт уровня участника по условиям из коллекции levels (их задаёт Даша в админке).
// Уровень только растёт: однажды полученный сертификат не пропадает.

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

function recompute(app, userId) {
  let user
  try { user = app.findRecordById("users", userId) } catch (e) { return }
  const posts = app.countRecords("reviews", $dbx.hashExp({ author: userId })) + app.countRecords("comments", $dbx.hashExp({ author: userId })) +
    app.countRecords("feedback", $dbx.hashExp({ author: userId }))
  const stats = {
    leaves: leavesOf(app, userId),
    exam: user.getInt("exam_best"),
    game: user.getInt("game_best"),
    posts: posts,
  }
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
  if (level === current && user.getInt("leaves") === stats.leaves) return
  const history = jsonOf(user, "level_history") || []
  const now = new Date().toISOString()
  for (let r = current + 1; r <= level; r++) {
    if (!history.some(h => h.rank === r)) history.push({ rank: r, at: now })
  }
  user.set("level", level)
  user.set("level_history", history)
  user.set("leaves", stats.leaves)
  app.saveNoValidate(user)
}

function recomputeAll(app) {
  const users = app.findRecordsByFilter("users", "id != ''", "", 0, 0)
  for (const u of users) recompute(app, u.id)
}

module.exports = { recompute, recomputeAll }
