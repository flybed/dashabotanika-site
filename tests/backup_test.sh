#!/bin/sh
# Проверка резервных копий: автокопии включены, состояние видно администратору, при отсутствии копии
# приходит сообщение в Telegram, копия восстанавливается на чистом сервере, скрипт кладёт её в отдельную папку.
#   PB=/path/to/pocketbase sh tests/backup_test.sh
set -eu
PB=${PB:-pocketbase}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'kill $(cat "$T/pid" "$T/pid2" "$T/mock" 2>/dev/null) 2>/dev/null || true; rm -rf "$T"' EXIT
python3 - <<'PY' &
import json, http.server
calls = []
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        self.send_response(200); self.end_headers(); self.wfile.write(json.dumps(calls).encode())
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get('content-length') or 0)) or b'{}')
        calls.append([self.path.rsplit('/', 1)[-1], body])
        self.send_response(200); self.send_header('content-type', 'application/json'); self.end_headers()
        self.wfile.write(json.dumps({'ok': True, 'result': [] if self.path.endswith('getUpdates') else True}).encode())
http.server.HTTPServer(('127.0.0.1', 8091), H).serve_forever()
PY
echo $! > "$T/mock"
serve() { TG_TOKEN=test-token TG_API=http://127.0.0.1:8091 "$PB" serve --dir="$1" --migrationsDir="$ROOT/pocketbase/pb_migrations" --hooksDir="$ROOT/pocketbase/pb_hooks" --http=127.0.0.1:$2 > "$1.log" 2>&1 & }
serve "$T/pb_data" 8090; echo $! > "$T/pid"; sleep 5
"$PB" superuser upsert su@test.local Passw0rd123 --dir="$T/pb_data" >/dev/null
T="$T" python3 - <<'PY'
import json, os, glob, time, zipfile, subprocess, urllib.request as u, urllib.error
T = os.environ['T']
fails = []
def req(port, m, p, b=None, t=None):
    r = u.Request('http://127.0.0.1:%d/api%s' % (port, p), method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {})})
    try:
        x = u.urlopen(r).read(); return 200, (json.loads(x) if x else {})
    except urllib.error.HTTPError as e: return e.code, {}
def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok: fails.append(name)
su = req(8090,'POST','/collections/_superusers/auth-with-password',{'identity':'su@test.local','password':'Passw0rd123'})[1]['token']
st, s = req(8090,'GET','/settings',None,su)
check('daily backups are switched on: 04:00 Moscow, 7 kept', s.get('backups',{}).get('cron') == '0 1 * * *' and s['backups'].get('cronMaxKeep') == 7)
ch = req(8090,'GET','/collections/characters/records')[1]['items']
users = {}
for n, role in [('Даша','admin'), ('Лиза','')]:
    x = req(8090,'POST','/collections/users/records',{'email':n.encode().hex()+'@t.local','password':'secret12','passwordConfirm':'secret12','name':n,'character':ch[1]['id']})[1]
    if role: req(8090,'PATCH','/collections/users/records/'+x['id'],{'role':role},su)
    users[n] = (x['id'], req(8090,'POST','/collections/users/auth-with-password',{'identity':n.encode().hex()+'@t.local','password':'secret12'})[1]['token'])
req(8090,'POST','/collections/tg_subs/records',{'user':users['Даша'][0],'chat_id':'777','enabled':True,'hour':9,'tz':180,'topics':['messages']},su)
check('a member cannot see the backup status, the site admin can', req(8090,'GET','/backup/status',None,users['Лиза'][1])[0] == 403 and req(8090,'GET','/backup/status',None,users['Даша'][1])[0] == 200)
st, r = req(8090,'POST','/backup/check',None,su)
sent = [c for c in json.load(u.urlopen('http://127.0.0.1:8091/')) if c[0] == 'sendMessage']
check('no backup yet: the check says so and Telegram tells the admin', r.get('ok') is False and r.get('count') == 0 and any(c[1].get('chat_id') == '777' and 'копий нет' in c[1].get('text','') for c in sent))
st, _ = req(8090,'POST','/backups',{},su); time.sleep(2)
st, r = req(8090,'GET','/backup/status',None,users['Даша'][1])
check('after a backup the status is fine: one fresh copy with its size', r.get('ok') is True and r.get('count') == 1 and r['newest']['size'] > 1000 and r['ageH'] < 1)
before = len([c for c in json.load(u.urlopen('http://127.0.0.1:8091/')) if c[0] == 'sendMessage'])
req(8090,'POST','/backup/check',None,su)
check('with a fresh copy the morning check stays quiet', len([c for c in json.load(u.urlopen('http://127.0.0.1:8091/')) if c[0] == 'sendMessage']) == before)
open(T + '/fails', 'w').write('\n'.join(fails))
PY
# восстановление: распаковываем копию в пустую папку и запускаем на ней второй сервер
mkdir "$T/restored"; python3 -c "import zipfile,glob,sys; zipfile.ZipFile(glob.glob(sys.argv[1]+'/pb_data/backups/*.zip')[0]).extractall(sys.argv[1]+'/restored')" "$T"
serve "$T/restored" 8089; echo $! > "$T/pid2"; sleep 5
T="$T" python3 - <<'PY'
import json, os, urllib.request as u, urllib.error
T = os.environ['T']
fails = [x for x in open(T + '/fails').read().split('\n') if x]
def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok: fails.append(name)
try:
    r = json.load(u.urlopen(u.Request('http://127.0.0.1:8089/api/collections/users/auth-with-password', method='POST',
        data=json.dumps({'identity': 'Лиза'.encode().hex() + '@t.local', 'password': 'secret12'}).encode(), headers={'Content-Type': 'application/json'})))
    ok = r['record']['name'] == 'Лиза'
except Exception as e: ok = False
check('the copy restores on a clean server: the member signs in with her password', ok)
open(T + '/fails', 'w').write('\n'.join(fails))
PY
# скрипт сервера: свежая копия PocketBase уходит в отдельную папку, старые старше 14 дней удаляются
mkdir -p "$T/out"; touch -d '20 days ago' "$T/out/pb-old.zip"
PB_DATA="$T/pb_data" BACKUP_DIR="$T/out" sh "$ROOT/deploy/pb-backup.sh"
if ls "$T/out"/pb-*.zip | grep -q "pb-$(date +%F).zip" && [ ! -e "$T/out/pb-old.zip" ]; then echo "PASS the server script copies today's copy aside and drops ones older than 14 days"; else echo "FAIL the server script copies today's copy aside and drops ones older than 14 days"; echo x >> "$T/fails"; fi
rm "$T"/pb_data/backups/*.zip; PB_DATA="$T/pb_data" BACKUP_DIR="$T/out2" sh "$ROOT/deploy/pb-backup.sh"
if tar -tzf "$T/out2"/pb_data-*.tar.gz | grep -q 'pb_data/data.db'; then echo "PASS without a PocketBase copy the script still archives the data"; else echo "FAIL without a PocketBase copy the script still archives the data"; echo x >> "$T/fails"; fi
[ -s "$T/fails" ] && { echo "FAILED:"; cat "$T/fails"; exit 1; }
echo "ALL OK"
