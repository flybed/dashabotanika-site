#!/bin/sh
# Ежедневно (таймер pb-backup.timer, 04:10): кладёт копию базы в /var/backups/pocketbase и хранит 14 дней.
# Основная копия — ночной архив самого PocketBase (pb_data/backups, делается целиком и согласованно, 04:00 МСК).
# Если его нет (автокопии выключены) — по-старому архивируем папку данных, без вложенных копий.
set -eu
SRC=${PB_DATA:-/opt/pocketbase/pb_data}
DST=${BACKUP_DIR:-/var/backups/pocketbase}
mkdir -p "$DST"
fresh=$(find "$SRC/backups" -maxdepth 1 -name '*.zip' -mmin -1440 2>/dev/null | sort | tail -n 1)
if [ -n "$fresh" ]; then
	cp "$fresh" "$DST/pb-$(date +%F).zip"
	logger -t pb-backup "copied $(basename "$fresh")"
else
	tar -czf "$DST/pb_data-$(date +%F).tar.gz" --exclude="$(basename "$SRC")/backups" -C "$(dirname "$SRC")" "$(basename "$SRC")"
	logger -t pb-backup "no fresh PocketBase backup, archived pb_data"
fi
find "$DST" \( -name '*.zip' -o -name '*.tar.gz' \) -mtime +14 -delete
