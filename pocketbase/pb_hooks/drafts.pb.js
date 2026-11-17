/// <reference path="../pb_data/types.d.ts" />
// Черновики: разметку, которую сайт не покажет, сервер не принимает (см. drafts.js).
onRecordCreateRequest((e) => { require(`${__hooks}/drafts.js`).check(e, true); e.next() }, "drafts")
onRecordUpdateRequest((e) => { require(`${__hooks}/drafts.js`).check(e, false); e.next() }, "drafts")
