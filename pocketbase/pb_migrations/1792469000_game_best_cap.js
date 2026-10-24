/// <reference path="../pb_data/types.d.ts" />
// Рекорд в игре теперь виден всем в рейтинге: больше 1000 очков за 60 секунд не набрать,
// поэтому такие числа сервер не принимает. Старые слишком большие значения подрезаем,
// иначе участник с ними не смог бы сохранить профиль.
migrate((app) => {
  app.db().newQuery("UPDATE users SET game_best = 1000 WHERE game_best > 1000").execute()
  app.db().newQuery("UPDATE users SET game_best = 0 WHERE game_best < 0").execute()
  const users = app.findCollectionByNameOrId("users")
  const f = users.fields.getByName("game_best")
  f.min = 0
  f.max = 1000
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  const f = users.fields.getByName("game_best")
  f.min = null
  f.max = null
  app.save(users)
})
