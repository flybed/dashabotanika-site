#!/bin/sh
# Проверка обновления живой базы: поднимаем PocketBase с миграциями и хуками из прошлой версии (по умолчанию origin/main),
# заводим участников, потом запускаем текущую версию на той же базе — она должна стартовать и сохранить персонажей и уровни.
# Так ловятся миграции, которые работают на пустой базе, но падают на настоящей.
#   PB=/path/to/pocketbase sh tests/upgrade_test.sh [base-ref]
set -eu
PB=${PB:-pocketbase}
BASE=${1:-origin/main}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'kill $(cat "$T/pid" 2>/dev/null) 2>/dev/null || true; rm -rf "$T"' EXIT
git -C "$ROOT" archive "$BASE" pocketbase | tar -x -C "$T"
start() { "$PB" serve --dir="$T/pb_data" --migrationsDir="$1/pb_migrations" --hooksDir="$1/pb_hooks" --http=127.0.0.1:8096 > "$T/log.txt" 2>&1 & echo $! > "$T/pid"; sleep 5; }
start "$T/pocketbase"
"$PB" superuser upsert su@test.local Passw0rd123 --dir="$T/pb_data" >/dev/null
python3 - <<'PY'
import json, urllib.request as u
B = 'http://127.0.0.1:8096/api'
def req(m, p, b=None, t=None):
    r = u.Request(B+p, method=m, data=json.dumps(b).encode() if b else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {})})
    return json.load(u.urlopen(r))
t = req('POST','/collections/_superusers/auth-with-password',{'identity':'su@test.local','password':'Passw0rd123'})['token']
ch = req('GET','/collections/characters/records')['items']
for i, n in enumerate(['Кирилл','Даша','Лиза']):
    x = req('POST','/collections/users/records',{'email':'u%d@test.local'%i,'password':'secret1234','passwordConfirm':'secret1234','name':n,'character':ch[i]['id']})
    req('PATCH','/collections/users/records/'+x['id'],{'role':'admin' if i < 2 else 'member','verified':True,'exam_best':8},t)
PY
kill "$(cat "$T/pid")"; sleep 1
start "$ROOT/pocketbase"
if ! curl -sf http://127.0.0.1:8096/api/health >/dev/null; then echo "FAIL upgrade: server did not start"; grep -i "error\|fail" "$T/log.txt" | head -5; exit 1; fi
python3 - <<'PY'
import json, urllib.request as u
us = json.load(u.urlopen('http://127.0.0.1:8096/api/collections/users/records?fields=name,character,level,xp'))['items']
ok = len(us) == 3 and all(x['character'] and x['xp'] >= 40 for x in us)
print(('PASS' if ok else 'FAIL') + ' upgrade from the previous version keeps members, characters and growth')
# points history: everything earned before the upgrade shows up right after the start
r = u.Request('http://127.0.0.1:8096/api/collections/_superusers/auth-with-password', method='POST', data=json.dumps({'identity':'su@test.local','password':'Passw0rd123'}).encode(), headers={'Content-Type':'application/json'})
t = json.load(u.urlopen(r))['token']
ids = {x['id']: x['xp'] for x in json.load(u.urlopen(u.Request('http://127.0.0.1:8096/api/collections/users/records?fields=id,xp', headers={'Authorization':t})))['items']}
import time
for _ in range(16):  # the history is filled in by a job that runs every minute
    log = json.load(u.urlopen(u.Request('http://127.0.0.1:8096/api/collections/xp_log/records?perPage=500', headers={'Authorization':t})))['items']
    hist = all(sum(e['points'] for e in log if e['user'] == i) == xp for i, xp in ids.items())
    if hist: break
    time.sleep(5)
print(('PASS' if hist else 'FAIL') + ' points history has the earlier points of every member')
raise SystemExit(0 if ok and hist else 1)
PY
