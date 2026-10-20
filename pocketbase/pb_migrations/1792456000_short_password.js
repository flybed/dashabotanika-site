/// <reference path="../pb_data/types.d.ts" />
// Пароль от 6 символов вместо 8: сайт не банк, длинный пароль только мешает зарегистрироваться.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.getByName("password").min = 6;
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.getByName("password").min = 8;
  app.save(users);
});
