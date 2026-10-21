# Резервные копии

- **Каждую ночь в 04:00 по Москве** PocketBase сам делает копию базы и файлов (`pb_data/backups`, хранятся 7 последних).
  Расписание: https://dashabotanika.ru/_/#/settings/backups (включено миграцией `1792467000_auto_backups.js`).
- **В 04:10** скрипт `deploy/pb-backup.sh` (таймер `pb-backup.timer`) кладёт свежую копию в `/var/backups/pocketbase` и хранит 14 дней.
  Если копии PocketBase нет, по-старому архивирует папку данных.
- **1-го числа** бот напоминает администраторам скачать свежую копию на компьютер (страница «Все копии» → значок скачивания).
- **В 10:00 по Москве** сервер проверяет, есть ли копия младше 30 часов. Если нет — бот пишет администраторам, подключившим Telegram.
- Состояние видно на сайте: кабинет → «🛠 Управление сайтом» → «👥 Участники».

## Как восстановить
Проще всего — в админке: https://dashabotanika.ru/_/#/settings/backups → у нужной копии «Restore». Сайт перезапустится с этой копией.

Из папки `/var/backups/pocketbase` (если админка недоступна):
```sh
sudo systemctl stop pocketbase
sudo mv /opt/pocketbase/pb_data /opt/pocketbase/pb_data.broken
sudo mkdir /opt/pocketbase/pb_data && sudo unzip /var/backups/pocketbase/pb-ГГГГ-ММ-ДД.zip -d /opt/pocketbase/pb_data
sudo chown -R pocketbase:pocketbase /opt/pocketbase/pb_data
sudo systemctl start pocketbase
```

## Проверка
`PB=pocketbase sh tests/backup_test.sh` — включение копий, оповещение, восстановление на чистом сервере, скрипт копирования.

## Чего пока нет
Копии лежат на том же сервере — поэтому раз в месяц копия скачивается на компьютер (напоминание 1-го числа). Ещё надёжнее — хранить копию вне сервера автоматически
(например, S3-хранилище: настройка «Use S3 storage» на той же странице, несколько рублей в месяц) — это решение за Кириллом.
