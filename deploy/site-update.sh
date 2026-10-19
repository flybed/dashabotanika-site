#!/bin/sh
# Подтягивает свежую версию сайта из GitHub (запускается таймером раз в 5 минут).
# Если изменились миграции или хуки PocketBase — перезапускает сервис.
set -eu
cd /srv/dashabotanika
before=$(git rev-parse HEAD)
git fetch --quiet origin main
git reset --quiet --hard origin/main
after=$(git rev-parse HEAD)
[ "$before" = "$after" ] && exit 0
logger -t site-update "updated $before -> $after"
if git diff --name-only "$before" "$after" | grep -q '^pocketbase/'; then
	systemctl restart pocketbase
fi
