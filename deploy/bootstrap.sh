#!/bin/sh
# Первичная настройка сервера dashabotanika.ru (Ubuntu 24.04/26.04), если у хостера нет поля cloud-init.
# Запуск от root:  curl -fsSL https://raw.githubusercontent.com/flybed/dashabotanika-site/main/deploy/bootstrap.sh | sh
# Делает то же, что deploy/cloud-init.yaml. Повторный запуск безопасен.
set -eu
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get -y upgrade
apt-get install -y git curl unzip debian-keyring debian-archive-keyring apt-transport-https gnupg ufw

# Firewall: только SSH и веб
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443
ufw --force enable

# Caddy из официального репозитория
if ! command -v caddy >/dev/null; then
	curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
	apt-get update
	apt-get install -y caddy
fi

# Репозиторий сайта
if [ ! -d /srv/dashabotanika/.git ]; then
	git clone https://github.com/flybed/dashabotanika-site.git /srv/dashabotanika
fi
git config --global --add safe.directory /srv/dashabotanika

# PocketBase (последний релиз)
id pocketbase >/dev/null 2>&1 || useradd --system --home /opt/pocketbase --shell /usr/sbin/nologin pocketbase
mkdir -p /opt/pocketbase/pb_data
if [ ! -x /opt/pocketbase/pocketbase ]; then
	V=$(curl -s https://api.github.com/repos/pocketbase/pocketbase/releases/latest | grep -m1 '"tag_name"' | sed 's/.*"v\([^"]*\)".*/\1/')
	curl -sL -o /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${V}/pocketbase_${V}_linux_amd64.zip"
	unzip -o /tmp/pb.zip pocketbase -d /opt/pocketbase
	rm /tmp/pb.zip
fi
chown -R pocketbase:pocketbase /opt/pocketbase

# systemd: PocketBase, автообновление сайта, ежедневный бэкап
D=/srv/dashabotanika/deploy
cp $D/pocketbase.service $D/site-update.service $D/site-update.timer $D/pb-backup.service $D/pb-backup.timer /etc/systemd/system/
install -m 0755 $D/site-update.sh /usr/local/bin/site-update
systemctl daemon-reload
systemctl enable --now pocketbase site-update.timer pb-backup.timer

# Caddy
cp $D/Caddyfile /etc/caddy/Caddyfile
mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy
systemctl reload caddy || systemctl restart caddy

echo
echo "Готово. Проверка:"
systemctl is-active pocketbase caddy site-update.timer pb-backup.timer
