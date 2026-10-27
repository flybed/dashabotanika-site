#!/bin/sh
# Место вещи на карте: если браузер не определил точку, сервер находит её по городу и району
# (подставной Nominatim — GEO_API); смена района переносит точку на вещи автора.
#   PB=/path/to/pocketbase sh tests/geo_test.sh
set -eu
PB=${PB:-pocketbase}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'kill $(cat "$T/pid" "$T/mock" 2>/dev/null) 2>/dev/null || true; rm -rf "$T"' EXIT
python3 - <<'PY' &
import json, http.server, urllib.parse as up
PLACES = {'Академический, Москва, Россия': ('55.687', '37.574'), 'Москва, Россия': ('55.751', '37.618'), 'Москва': ('55.751', '37.618'), 'Хамовники, Москва, Россия': ('55.731', '37.571'), 'Центральный, Тула': ('54.193', '37.617')}
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        q = up.parse_qs(up.urlparse(self.path).query).get('q', [''])[0]
        p = PLACES.get(q)
        self.send_response(200); self.send_header('content-type', 'application/json'); self.end_headers()
        out = [{'lat': p[0], 'lon': p[1], 'addresstype': 'suburb'}] if p else []
        # первым — одноимённая улица далеко: брать надо район
        if out and q.startswith('Академический'): out.insert(0, {'lat': '55.631', 'lon': '37.612', 'addresstype': 'road'})
        self.wfile.write(json.dumps(out).encode())
http.server.HTTPServer(('127.0.0.1', 8097), H).serve_forever()
PY
echo $! > "$T/mock"
GEO_API=http://127.0.0.1:8097 "$PB" serve --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" --hooksDir="$ROOT/pocketbase/pb_hooks" --http=127.0.0.1:8096 > "$T/log.txt" 2>&1 &
echo $! > "$T/pid"; sleep 5
"$PB" superuser upsert su@test.local Passw0rd123 --dir="$T/pb_data" >/dev/null
python3 - <<'PY'
import json, urllib.request as u, urllib.error
B = 'http://127.0.0.1:8096/api'
fails = []
def req(m, p, b=None, t=None):
    r = u.Request(B+p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {})})
    try: return 200, json.load(u.urlopen(r))
    except urllib.error.HTTPError as e: return e.code, {}
def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok: fails.append(name)
su = req('POST','/collections/_superusers/auth-with-password',{'identity':'su@test.local','password':'Passw0rd123'})[1]['token']
ch = req('GET','/collections/characters/records')[1]['items']
def user(email, name):
    uid = req('POST','/collections/users/records',{'email':email,'password':'secret12','passwordConfirm':'secret12','name':name,'character':ch[0]['id']})[1]['id']
    return uid, req('POST','/collections/users/auth-with-password',{'identity':email,'password':'secret12'})[1]['token']
uid, tok = user('k@t.local', 'Кирилл')
code, p = req('POST','/collections/profiles/records',{'owner':uid,'country':'Россия','city':'Москва','district':'Академический'},tok)
prof = lambda: req('GET','/collections/profiles/records/'+p['id'],t=su)[1]
check('a profile without a point gets one from the city and district (the district, not a street of the same name)', prof()['lat'] == 55.69 and prof()['lon'] == 37.57)
item = lambda i: req('GET','/collections/listings/records/'+i,t=su)[1]
base = {'seller':uid,'title':'Стул','kind':'Отдам даром','condition':'Хорошее','status':'active'}
l1 = req('POST','/collections/listings/records',base,tok)[1]
check('a new thing gets the place of its giver', item(l1['id'])['lat'] == 55.69 and item(l1['id'])['district'] == 'Академический')
req('PATCH','/collections/profiles/records/'+p['id'],{'district':'Хамовники'},tok)
check('a new district without a point → a new point', prof()['lat'] == 55.73)
check('… and the things not given yet move along', item(l1['id'])['lat'] == 55.73 and item(l1['id'])['district'] == 'Хамовники')
req('PATCH','/collections/profiles/records/'+p['id'],{'lat':55.7012,'lon':37.5099},tok)
check('a point from the browser is kept (rounded)', prof()['lat'] == 55.7 and item(l1['id'])['lon'] == 37.51)
# no profile at all: the thing is placed by its own city and district
uid2, tok2 = user('t@t.local', 'Тоня')
l2 = req('POST','/collections/listings/records',dict(base, seller=uid2, city='Тула', district='Центральный'),tok2)[1]
check('without a profile the thing is placed by its own city', item(l2['id'])['lat'] == 54.19)
# a city the service does not know → no point, no error
l3 = req('POST','/collections/listings/records',dict(base, seller=uid2, city='Нигдебург'),tok2)
check('an unknown city still saves the thing, just without a point', l3[0] == 200 and item(l3[1]['id'])['lat'] == 0)
# a thing left without a point gets one later: «run now» for admins and moderators only
c0 = req('POST','/geo/backfill',{},tok2)[0]
check('only admins and moderators can run the fill-in', c0 == 403)
r = u.Request(B+'/collections/users/records/'+uid2, method='PATCH', data=json.dumps({'role':'moderator'}).encode(), headers={'Content-Type':'application/json','Authorization':su}); u.urlopen(r)
import time; time.sleep(3)
tok2 = req('POST','/collections/users/auth-with-password',{'identity':'t@t.local','password':'secret12'})[1]['token']
req('PATCH','/collections/listings/records/'+l3[1]['id'],{'city':'Москва'},su)
code, res = req('POST','/geo/backfill',{},tok2)
check('the fill-in places things that had no point', code == 200 and res['done'] == 1 and res['left'] == 0 and item(l3[1]['id'])['lat'] == 55.75)
# a point in the wrong place → redo it from the giver's city and district
req('PATCH','/collections/profiles/records/'+p['id'],{'district':'Академический','lat':55.1,'lon':37.1},tok)
code, res = req('POST','/geo/backfill',{'redo':l1['id']},tok2)
check('redo puts the thing back by its district', code == 200 and prof()['lat'] == 55.69 and item(l1['id'])['lat'] == 55.69)
if fails: raise SystemExit('FAILED: ' + ', '.join(fails))
print('ALL OK')
PY
