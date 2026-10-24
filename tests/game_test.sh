#!/bin/sh
# Рейтинг игры «Эко-уборка»: рекорд (game_best) виден всем, поэтому сервер принимает только 0…1000,
# старые слишком большие рекорды при обновлении подрезаются, а почта участников в списке не видна.
#   PB=/path/to/pocketbase sh tests/game_test.sh [base-ref]
set -eu
PB=${PB:-pocketbase}
BASE=${1:-origin/main}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'kill $(cat "$T/pid" 2>/dev/null) 2>/dev/null || true; rm -rf "$T"' EXIT
git -C "$ROOT" archive "$BASE" pocketbase | tar -x -C "$T"
start() { "$PB" serve --dir="$T/pb_data" --migrationsDir="$1/pb_migrations" --hooksDir="$1/pb_hooks" --http=127.0.0.1:8094 > "$T/log.txt" 2>&1 & echo $! > "$T/pid"; sleep 5; }
# прошлая версия: рекорд ещё без ограничения
start "$T/pocketbase"
"$PB" superuser upsert su@test.local Passw0rd123 --dir="$T/pb_data" >/dev/null
python3 - <<'PY'
import json, urllib.request as u
B = 'http://127.0.0.1:8094/api'
def req(m, p, b=None, t=None):
    r = u.Request(B+p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {})})
    return json.load(u.urlopen(r))
su = req('POST','/collections/_superusers/auth-with-password',{'identity':'su@test.local','password':'Passw0rd123'})['token']
ch = req('GET','/collections/characters/records')['items']
for i, (mail, name) in enumerate([('a@t.local','Аня'),('b@t.local','Боря')]):
    rec = req('POST','/collections/users/records',{'email':mail,'password':'secret12','passwordConfirm':'secret12','name':name,'character':ch[i]['id'],'emailVisibility':False})
    req('PATCH','/collections/users/records/'+rec['id'],{'game_best':[5000,120][i]},su)
PY
kill "$(cat "$T/pid")"; sleep 1
# текущая версия на той же базе
start "$ROOT/pocketbase"
python3 - <<'PY'
import json, urllib.request as u, urllib.error, urllib.parse as up
B = 'http://127.0.0.1:8094/api'
fails = []
def req(m, p, b=None, t=None):
    r = u.Request(B+p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {})})
    try: return 200, json.load(u.urlopen(r))
    except urllib.error.HTTPError as e: return e.code, {}
def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok: fails.append(name)
login = lambda mail: req('POST','/collections/users/auth-with-password',{'identity':mail,'password':'secret12'})[1]
a, b = login('a@t.local'), login('b@t.local')
check('an old record above 1000 is cut down to 1000', a['record']['game_best'] == 1000)
check('a normal old record stays as it was', b['record']['game_best'] == 120)
st, _ = req('PATCH','/collections/users/records/'+a['record']['id'],{'name':'Аня К'},a['token'])
check('the member with the cut record can still save the profile', st == 200)
uid, t = b['record']['id'], b['token']
check('a new record is saved', req('PATCH','/collections/users/records/'+uid,{'game_best':430},t)[0] == 200)
check('an impossible record is refused', req('PATCH','/collections/users/records/'+uid,{'game_best':1500},t)[0] == 400)
check('a negative record is refused', req('PATCH','/collections/users/records/'+uid,{'game_best':-5},t)[0] == 400)
st, r = req('GET','/collections/users/records?sort=-game_best&fields='+up.quote('id,name,game_best,email'))
items = r.get('items', [])
check('guests see the rating in order', st == 200 and [x['game_best'] for x in items][:2] == [1000, 430])
check('no e-mail in the rating', items and all(not x.get('email') for x in items))
st, r = req('GET','/collections/users/records?fields=id,email',None,t)
check('another member does not see e-mails either', all(not x.get('email') or x['id'] == uid for x in r.get('items', [])))
print('ALL OK' if not fails else 'FAILED: ' + ', '.join(fails))
raise SystemExit(1 if fails else 0)
PY
