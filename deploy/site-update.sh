#!/bin/sh
# Подтягивает свежую версию сайта из GitHub (запускается таймером раз в 5 минут).
# Если изменились миграции или хуки PocketBase — перезапускает PocketBase.
# Если изменились файлы deploy/ — переустанавливает себя, systemd-юниты и Caddyfile.
# Новый Caddyfile ставится, только если он проходит caddy validate, а после перезагрузки Caddy
# проверяются главная и карта сайта с её частями; не отвечают как надо — возвращается прежний Caddyfile.
set -eu
# пути можно переопределить только для теста (tests/site_update_test.sh)
SITE=${SITE_DIR:-/srv/dashabotanika}
CADDY=${CADDY_DIR:-/etc/caddy}
BIN=${BIN_DIR:-/usr/local/bin}
UNITS=${UNITS_DIR:-/etc/systemd/system}
cd "$SITE"
before=$(git rev-parse HEAD)
git fetch --quiet origin main
git reset --quiet --hard origin/main
after=$(git rev-parse HEAD)
[ "$before" = "$after" ] && exit 0
logger -t site-update "updated $before -> $after"
changed=$(git diff --name-only "$before" "$after")

# сайт через Caddy на этом же сервере: главная — страница сайта, карта сайта и её части — XML от PocketBase
smoke() {
	for u in / /sitemap.xml /sitemap-pages.xml /sitemap-darom-1.xml; do
		body=$(curl -fsS --max-time 20 --resolve dashabotanika.ru:443:127.0.0.1 "https://dashabotanika.ru$u" 2>/dev/null) || { echo "$u: no answer"; return 1; }
		if [ "$u" = / ]; then
			echo "$body" | grep -q 'id="app"' || { echo "$u: not the site page"; return 1; }
		else
			echo "$body" | head -c 300 | grep -q '<?xml' || { echo "$u: not XML"; return 1; }
		fi
	done
}
# PocketBase поднялся (до 30 секунд)
pb_ready() {
	for i in $(seq 1 30); do curl -fsS --max-time 2 http://127.0.0.1:8090/api/health >/dev/null 2>&1 && return 0; sleep 1; done
	return 1
}

if echo "$changed" | grep -q '^deploy/'; then
	D=$SITE/deploy
	install -m 0755 $D/site-update.sh $BIN/site-update
	cp $D/pocketbase.service $D/site-update.service $D/site-update.timer $D/pb-backup.service $D/pb-backup.timer $UNITS/
	systemctl daemon-reload
fi
if echo "$changed" | grep -q -e '^pocketbase/' -e '^deploy/pocketbase.service'; then
	systemctl restart pocketbase
	pb_ready || logger -t site-update "PocketBase did not answer 30 s after restart"
fi
if echo "$changed" | grep -q '^deploy/Caddyfile'; then
	D=$SITE/deploy
	if ! caddy validate --config $D/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
		logger -t site-update "Caddyfile is invalid, kept the old one"
	elif cmp -s $D/Caddyfile $CADDY/Caddyfile; then
		:
	else
		cp $CADDY/Caddyfile $CADDY/Caddyfile.prev
		cp $D/Caddyfile $CADDY/Caddyfile
		systemctl reload caddy
		sleep 2
		if why=$(smoke); then
			logger -t site-update "new Caddyfile is live, site and sitemaps answer"
		else
			# откат: прежний Caddyfile уже работал
			logger -t site-update "new Caddyfile failed the check ($why), restored the previous one"
			cp $CADDY/Caddyfile.prev $CADDY/Caddyfile
			systemctl reload caddy
		fi
	fi
fi
