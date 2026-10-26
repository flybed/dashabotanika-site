// «Участники» в кабинете администратора: что каждый успел сделать на сайте.
// Только для владельца сайта (role = admin): здесь почта, подписки и вся активность.

const DATE = (r, f) => { const v = r.getString(f); return v ? v.replace(" ", "T") : "" }
const list = (app, coll, filter, params, sort, limit) => { try { return app.findRecordsByFilter(coll, filter, sort || "", limit || 0, 0, params || {}) } catch (e) { return [] } }

function forUser(app, u) {
  const L = require(`${__hooks}/levels.js`)
  const id = u.id
  const hb = L.habitsOf(app, id)
  const done = L.actionsOf(app, u, hb)
  const one = (coll, f) => { const r = list(app, coll, f + " = {:id}", { id }, "", 1); return r[0] || null }
  const presence = one("presence", "user")
  const notify = one("notify", "user")
  const tg = one("tg_subs", "user")
  const prof = one("profiles", "owner")
  const log = list(app, "xp_log", "user = {:id}", { id }, "-created", 30)
  const ai = list(app, "ai_uses", "user = {:id}", { id })
  let last = presence ? DATE(presence, "last_seen") : ""
  if (log.length && DATE(log[0], "created") > last) last = DATE(log[0], "created")
  return {
    id, name: u.getString("name"), email: u.getString("email"), role: u.getString("role"),
    verified: u.getBool("verified"), hidden: u.getBool("hidden"),
    created: DATE(u, "created"), last_seen: last,
    xp: u.getInt("xp"), level: u.getInt("level"),
    game_best: u.getInt("game_best"), exam_best: u.getInt("exam_best"),
    leaves: hb.leaves, done,
    ai: { food: ai.filter((r) => r.getString("kind") === "food").length, pack: ai.filter((r) => r.getString("kind") === "pack").length },
    email_topics: notify ? notify.getStringSlice("email_topics") : [],
    tg: tg ? { on: tg.getBool("enabled"), topics: tg.getStringSlice("topics") } : null,
    profile: prof ? { age: prof.getInt("age"), gender: prof.getString("gender"), city: prof.getString("city"), country: prof.getString("country"), goals: prof.getStringSlice("goals") } : null,
    log: log.map((r) => ({ at: DATE(r, "created"), key: r.getString("key"), title: r.getString("title"), count: r.getInt("count"), points: r.getInt("points"), initial: r.getBool("initial") })),
  }
}

function all(app) {
  return list(app, "users", "id != ''", {}, "-created").map((u) => forUser(app, u))
}

module.exports = { all, forUser }
