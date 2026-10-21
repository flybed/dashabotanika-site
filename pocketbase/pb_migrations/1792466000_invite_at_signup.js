/// <reference path="../pb_data/types.d.ts" />
// Очки за приглашённого друга теперь приходят сразу при его регистрации, а не после подтверждения почты.
migrate((app) => {
  try {
    const r = app.findFirstRecordByFilter("growth_rules", "key = 'invite_friend'")
    if (r.getString("per") === "за друга, когда он подтвердит почту") { r.set("per", "за каждого друга, который зарегистрировался"); app.save(r) }
  } catch (e) {}
}, (app) => {
  try {
    const r = app.findFirstRecordByFilter("growth_rules", "key = 'invite_friend'")
    if (r.getString("per") === "за каждого друга, который зарегистрировался") { r.set("per", "за друга, когда он подтвердит почту"); app.save(r) }
  } catch (e) {}
});
