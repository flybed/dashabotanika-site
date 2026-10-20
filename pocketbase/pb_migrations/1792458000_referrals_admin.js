/// <reference path="../pb_data/types.d.ts" />
// Даша может сама указать, кто кого пригласил (вкладка «Участники»): если друг открыл ссылку
// в одном браузере (например, внутри Telegram), а зарегистрировался в другом, приглашение не записывается.
migrate((app) => {
  const c = app.findCollectionByNameOrId("referrals");
  c.createRule = '(@request.body.invited = @request.auth.id && @request.body.inviter != @request.auth.id && @request.auth.created >= @yesterday) || (@request.auth.role = "admin" && @request.body.inviter != @request.body.invited)';
  app.save(c);
}, (app) => {
  const c = app.findCollectionByNameOrId("referrals");
  c.createRule = "@request.body.invited = @request.auth.id && @request.body.inviter != @request.auth.id && @request.auth.created >= @yesterday";
  app.save(c);
});
