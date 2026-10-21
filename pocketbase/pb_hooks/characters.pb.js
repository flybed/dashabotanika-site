/// <reference path="../pb_data/types.d.ts" />
// Персонаж с хозяйкой (Слон — только у Даши): проверка в characters.js. Обработчики не видят функций этого файла — подключаем модуль внутри.
onRecordCreateRequest((e) => { require(`${__hooks}/characters.js`).checkReserved(e); e.next() }, "users")
onRecordUpdateRequest((e) => {
  if (e.record.getString("character") !== e.record.original().getString("character")) require(`${__hooks}/characters.js`).checkReserved(e)
  e.next()
}, "users")
