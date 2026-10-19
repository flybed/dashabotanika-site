# DashaBotanika — исходники для переезда

- `artifact-version.html` — текущая версия сайта (артефакт claude.ai, версия 5). Работает на runtime claude.ai: `window.claude.use('db'|'user'|'artifact'|'assets')`.
- `img/` — фото Даши (webp). В артефакте они лежат как ассеты: hero = e54d3531…, about = 846dfdb4…, cafes = ede57497…, fashion = c4d30eee…, gallery = f1ff4c15….
  hero.webp, globe.webp (about), coffee.webp (cafes), fashion.webp, owl.webp (gallery).

## Задача переезда
1. Статический фронтенд (тот же дизайн) + PocketBase (регистрация по почте, коллекции: members, reviews, comments, suggestions, mk (объявления), mk_ok (модерация), chats + messages, profiles/habits).
2. Заменить вызовы window.claude.* на PocketBase JS SDK; редактирование контента Дашей — через админку PocketBase или коллекцию content.
3. Сервер: Timeweb Cloud, Ubuntu 24.04, Москва; Caddy (https для dashabotanika.ru), PocketBase как systemd-сервис; сайт подтягивается из GitHub-репозитория flybed/dashabotanika-site (read-only токен сервера вставляет владелец в cloud-init сам).
4. Домен dashabotanika.ru у Webnames; после запуска сервера — A-записи @ и www на IP сервера.
