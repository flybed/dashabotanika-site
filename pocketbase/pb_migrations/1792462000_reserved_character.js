/// <reference path="../pb_data/types.d.ts" />
// Персонаж может принадлежать одному участнику: Слон — только у Даши.
// characters.reserved_for — кому принадлежит; выбрать такого персонажа другим нельзя (pb_hooks/characters.pb.js).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const characters = app.findCollectionByNameOrId("characters");
  if (!characters.fields.getByName("reserved_for")) characters.fields.add(new RelationField({ name: "reserved_for", collectionId: users.id, maxSelect: 1 }));
  app.save(characters);
  // Даша — администратор, у которой уже выбран Слон (самая ранняя такая)
  try {
    const elephant = app.findFirstRecordByFilter("characters", "name = 'Слон'");
    const dasha = app.findRecordsByFilter("users", "role = 'admin' && character = {:c}", "created", 1, 0, { c: elephant.id })[0];
    if (dasha && !elephant.getString("reserved_for")) { elephant.set("reserved_for", dasha.id); app.save(elephant); }
  } catch (e) {}
}, (app) => {});
