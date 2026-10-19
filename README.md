# dashabotanika-site

Эко-сайт DashaBotanika: **dashabotanika.ru**. Переезд с артефакта claude.ai на свой сервер
(Timeweb Cloud, Ubuntu 24.04): статический сайт + PocketBase + Caddy.

## Структура

| Путь | Что это |
|---|---|
| `legacy/artifact-version.html` | Исходная версия сайта (артефакт claude.ai, v5) — эталон, не редактируется |
| `site/` | То, что отдаёт Caddy. Сейчас `index.html` = артефакт в режиме «только чтение» (фото из `site/img/`) |
| `site/img/` | Фото Даши: hero, globe (about), coffee (cafes), fashion, owl (gallery) |
| `pocketbase/pb_migrations`, `pb_hooks` | Схема коллекций и серверные правила PocketBase (этап 2) |
| `deploy/` | Caddyfile, systemd-юниты, cloud-init для Timeweb, скрипт автообновления из GitHub |
| `docs/source-notes.md` | Исходные заметки из архива |

## План переезда

**Этап 1 — сервер и домен (готово в репозитории, ждёт запуска)**
1. Сервер в Timeweb Cloud (Москва, Ubuntu 24.04) создаётся с `deploy/cloud-init.yaml`:
   ставит Caddy, PocketBase (systemd, только на 127.0.0.1:8090), firewall, клонирует репозиторий,
   таймер `site-update` подтягивает `main` каждые 5 минут, ежедневный бэкап `pb_data` (14 дней).
2. В Webnames: A-записи `@` и `www` → IP сервера. Caddy сам выпускает HTTPS.
3. Результат: сайт открывается в нынешнем дизайне, но без входа/отзывов/барахолки.

**Этап 2 — PocketBase вместо `window.claude.*`**
- Коллекции: `users` (вход по почте с подтверждением), `members` (ник), `reviews`, `comments`,
  `suggestions`, `mk` (объявления) + `mk_ok` (модерация), `chats` + `messages`, `profiles`, `habits`,
  `content` (тексты/фото сайта, одна запись), `photos` (файлы).
- Права (API rules): читать отзывы/комментарии/одобренные объявления — все; писать — вошедшие;
  править/удалять — автор или модератор; чаты видят только участники.
- Фронтенд: `use('db'|'user'|'assets'|'artifact')` → PocketBase JS SDK; `onSnapshot` → realtime-подписки.
  Режим «Редактировать сайт» сохраняет в коллекцию `content`, а не публикует HTML.

**Этап 3 — данные и запуск**
- Перенос текущих отзывов/комментариев/объявлений из базы артефакта (если нужно).
  Аккаунты claude.ai не переносятся — участникам нужно будет зарегистрироваться заново.
- Проверка, бэкапы, ссылка с артефакта на новый адрес.
