/// <reference path="../pb_data/types.d.ts" />
// Активность участников для владельца сайта (логика — people.js).
routerAdd("GET", "/api/admin/people", (e) => {
  if (!e.auth || e.auth.getString("role") !== "admin") return e.json(403, { message: "Только для администратора" })
  return e.json(200, { items: require(`${__hooks}/people.js`).all(e.app) })
}, $apis.requireAuth("users"))
