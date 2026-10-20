# Помощник по статьям

Каждое утро задача по расписанию в Claude Code пишет 1–2 черновика по плану `docs/content-plan.md`
и отправляет их на сайт. Черновики появляются у Даши в кабинете → «Черновики»: прочитать, поправить,
нажать «Опубликовать» — статья сразу выходит в журнале со своей страницей и попадает в карту сайта.
Помощник сам ничего не публикует.

## Как устроено
- Помощник — отдельный участник сайта с ролью `writer` (меняется в админке `/_/` → users → role).
  Он может только добавлять черновики и видеть свои; в «Счастливом мире» его нет.
- Почта и пароль помощника хранятся в настройках облачной среды Claude Code как переменные
  `ARTICLE_BOT_EMAIL` и `ARTICLE_BOT_PASSWORD` (в репозиторий и в чат их не пишем).
- В настройках сети среды должен быть разрешён домен `dashabotanika.ru`.

## API (для задачи по расписанию)
```
# вход
POST https://dashabotanika.ru/api/collections/users/auth-with-password
{"identity": "$ARTICLE_BOT_EMAIL", "password": "$ARTICLE_BOT_PASSWORD"}  → token, record.id

# уже написанные черновики (чтобы не повторяться)
GET https://dashabotanika.ru/api/collections/drafts/records?perPage=200&fields=title,keywords   (Authorization: token)

# опубликованные статьи
GET https://dashabotanika.ru/api/collections/content/records?filter=(key='site')   → items[0].data.articles

# новый черновик
POST https://dashabotanika.ru/api/collections/drafts/records   (Authorization: token)
{"author": record.id, "cat": "Статья" | "Новость", "title": "...", "lead": "...", "body": "...",
 "keywords": "основной поисковый запрос", "sources": "ссылки для проверки фактов", "note": "что проверить Даше"}
```
Текст статьи — обычный текст: абзацы через пустую строку, списки строками «1. …» или «— …».
