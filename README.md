# dashabotanika-site

Эко-сайт DashaBotanika: **dashabotanika.ru**. Статический фронтенд + PocketBase + Caddy на своём сервере
(Timeweb Cloud, Ubuntu 24.04). Всё, что попадает в ветку `main`, сервер подтягивает сам в течение 5 минут.

## Структура

| Путь | Что это |
|---|---|
| `site/` | То, что отдаёт Caddy: `index.html`, `css/app.css`, `js/app.js`, `js/pocketbase.umd.js` (SDK 0.28.1), фото в `img/`, `robots.txt`, `sitemap.xml` |
| `pocketbase/pb_migrations/` | Схема базы: коллекции, правила доступа, стартовый контент, персонажи и уровни. Применяется автоматически при перезапуске PocketBase |
| `pocketbase/pb_hooks/` | Серверная логика: автоматическое повышение уровня (`levels.js`, `levels.pb.js`) |
| `deploy/` | Caddyfile, systemd-юниты, `cloud-init.yaml` / `bootstrap.sh`, автообновление из GitHub, бэкап |
| `tests/` | `api_test.py` — правила доступа и уровни; `e2e.js` — сквозная проверка в браузере |
| `legacy/artifact-version.html` | Исходная версия сайта (артефакт claude.ai) — эталон, не редактируется |
| `docs/ROADMAP.md` | Новые функции, SEO, решения |

## Обновление сайта

- Всё из `main` сервер забирает сам каждые 5 минут (`deploy/site-update.sh`): изменения в `pocketbase/` перезапускают
  PocketBase, изменения в `deploy/` переустанавливают systemd-юниты и Caddyfile.
- **При изменении `site/js/app.js` или `site/css/app.css` увеличивайте `?v=` в `site/index.html`** — так браузеры
  гарантированно возьмут новую версию.

## Как устроен сайт

- **Контент** (тексты, товары, кафе, статьи, фото) хранится в PocketBase, коллекция `content`, запись `site`.
  Даша редактирует его прямо на сайте: кнопка «Редактировать сайт» внизу страницы (видна администраторам и модераторам).
- **Участники** регистрируются по почте и паролю и выбирают персонажа для «Счастливого мира».
- **Уровни** (Эко малыш → Эко Эксперт) повышаются автоматически. Условия — в коллекции `levels`.
  Сертификат каждого уровня — страница `https://dashabotanika.ru/#cert/<id участника>/<уровень>`.
- **Роли**: `admin` (Даша — всё, включая назначение модераторов), `moderator` (проверка объявлений, предложения, редактирование сайта), обычные участники.

## Первичная настройка (один раз, после первого деплоя)

1. **Суперпользователь PocketBase** (доступ к админке `https://dashabotanika.ru/_/`). На сервере:
   ```
   sudo -u pocketbase /opt/pocketbase/pocketbase superuser upsert ПОЧТА 'ПАРОЛЬ' --dir=/opt/pocketbase/pb_data
   ```
2. **Даша регистрируется на сайте** как обычный участник (персонаж — Слон).
3. В админке: **Collections → users →** запись Даши **→ role = admin**.
4. **Почта** (письма подтверждения и сброса пароля). Timeweb по умолчанию закрывает исходящие порты 25/465/587/2525 —
   их открывают по обращению в поддержку. Затем админка → **Settings → Mail settings**: SMTP `smtp.yandex.ru`, порт 465,
   TLS, логин — ящик целиком, пароль — пароль приложения Яндекса; **Send test email** для проверки.
   Шаблоны писем (на русском) задаются миграцией `1792446000_mail_templates.js`; ссылки ведут на сайт:
   `#verify/<token>`, `#reset/<token>`, `#email/<token>`.

## Что Даша может менять в админке без программиста

- `levels` — названия уровней, описания, условия (листочки, экзамен, игра, отзывы), текст сертификата.
  После сохранения уровни всех участников пересчитываются.
- `characters` — список животных и растений для регистрации (имя, эмодзи, порядок).
- `listings`, `reviews`, `comments`, `suggestions` — модерация, удаление.

## Проверки (локально)

```
pocketbase serve --dir=/tmp/pb --migrationsDir=pocketbase/pb_migrations --hooksDir=pocketbase/pb_hooks --http=127.0.0.1:8099
pocketbase superuser upsert admin@test.local Passw0rd123 --dir=/tmp/pb
python3 tests/api_test.py                       # правила доступа и уровни
caddy run --config <Caddyfile с :8088 → site/ и /api → 8099>
BASE=http://localhost:8088 node tests/e2e.js ./shots   # браузер (нужен playwright)
```
Обе проверки рассчитаны на чистую базу.
