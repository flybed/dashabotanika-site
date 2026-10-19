/// <reference path="../pb_data/types.d.ts" />
// Письма участникам на русском, в стиле сайта. Ссылки ведут на страницы самого сайта
// (#verify/…, #reset/…), а не в админку PocketBase.

function letter(title, text, button, url, note) {
  return `<div style="background:#EDE6D6;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#232A1E">
<div style="max-width:520px;margin:0 auto;background:#F7F3EA;border:1px solid #D8CEB9;border-radius:16px;padding:28px">
<p style="margin:0 0 6px;font-size:13px;font-weight:bold;letter-spacing:.1em;text-transform:uppercase;color:#AD5E39">DashaBotanika</p>
<h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:26px;color:#3A6234">${title}</h1>
<p style="margin:0 0 10px;font-size:16px;line-height:1.5">Здравствуйте, {RECORD:name}!</p>
<p style="margin:0 0 22px;font-size:16px;line-height:1.5">${text}</p>
<p style="margin:0 0 22px"><a href="${url}" style="display:inline-block;background:#3A6234;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">${button}</a></p>
<p style="margin:0 0 6px;font-size:13px;color:#61655A;line-height:1.5">${note}</p>
<p style="margin:18px 0 0;font-size:13px;color:#61655A">Разумный человек — счастливая планета 🌿<br>Даша, DashaBotanika</p>
</div></div>`
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.verificationTemplate.subject = "Подтвердите почту на DashaBotanika"
  users.verificationTemplate.body = letter("Подтвердите почту",
    "Спасибо, что присоединились к DashaBotanika! Остался один шаг — подтвердите, что это ваша почта.",
    "Подтвердить почту", "{APP_URL}/#verify/{TOKEN}",
    "Если вы не регистрировались на dashabotanika.ru, просто удалите это письмо.")
  users.resetPasswordTemplate.subject = "Новый пароль для DashaBotanika"
  users.resetPasswordTemplate.body = letter("Восстановление пароля",
    "Вы запросили новый пароль. Нажмите кнопку и придумайте его — ссылка действует 30 минут.",
    "Придумать новый пароль", "{APP_URL}/#reset/{TOKEN}",
    "Если вы не запрашивали смену пароля, ничего не делайте: старый пароль продолжит работать.")
  users.confirmEmailChangeTemplate.subject = "Подтвердите новую почту на DashaBotanika"
  users.confirmEmailChangeTemplate.body = letter("Новая почта",
    "Вы указали эту почту для аккаунта на DashaBotanika. Подтвердите её, чтобы изменения вступили в силу.",
    "Подтвердить новую почту", "{APP_URL}/#email/{TOKEN}",
    "Если вы ничего не меняли, просто удалите это письмо.")
  // Письмо о входе с нового устройства — не нужно на этом сайте.
  users.authAlert.enabled = false
  app.save(users)
}, (app) => {})
