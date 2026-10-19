#!/bin/sh
# Подтягивает свежую версию сайта из GitHub (запускается таймером раз в 5 минут).
# Если изменились миграции или хуки PocketBase — перезапускает PocketBase.
# Если изменились файлы deploy/ — переустанавливает себя, systemd-юниты и Caddyfile.
set -eu
cd /srv/dashabotanika
before=$(git rev-parse HEAD)
git fetch --quiet origin main
git reset --quiet --hard origin/main
after=$(git rev-parse HEAD)
[ "$before" = "$after" ] && exit 0
logger -t site-update "updated $before -> $after"
changed=$(git diff --name-only "$before" "$after")
if echo "$changed" | grep -q '^deploy/'; then
	D=/srv/dashabotanika/deploy
	install -m 0755 $D/site-update.sh /usr/local/bin/site-update
	cp $D/pocketbase.service $D/site-update.service $D/site-update.timer $D/pb-backup.service $D/pb-backup.timer /etc/systemd/system/
	systemctl daemon-reload
	if caddy validate --config $D/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
		cp $D/Caddyfile /etc/caddy/Caddyfile
		systemctl reload caddy
	else
		logger -t site-update "Caddyfile is invalid, kept the old one"
	fi
fi
if echo "$changed" | grep -q -e '^pocketbase/' -e '^deploy/pocketbase.service'; then
	systemctl restart pocketbase
fi
