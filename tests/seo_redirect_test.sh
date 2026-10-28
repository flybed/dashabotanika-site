#!/bin/sh
# Старые адреса статей (old_slugs) и адрес по id навсегда (301) ведут на основной; основной адрес и чужой
# действующий адрес не перенаправляются; несуществующий — 404.
#   PB=/path/to/pocketbase sh tests/seo_redirect_test.sh
set -eu
PB=${PB:-pocketbase}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'kill $(cat "$T/pid" 2>/dev/null) 2>/dev/null || true; rm -rf "$T"' EXIT
"$PB" superuser upsert su@test.local Passw0rd123 --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" > /dev/null 2>&1
"$PB" serve --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" --hooksDir="$ROOT/pocketbase/pb_hooks" --http=127.0.0.1:8094 > "$T/log.txt" 2>&1 & echo $! > "$T/pid"
sleep 5
python3 - <<'PY' || { echo FAILED; exit 1; }
import json, urllib.request as u, urllib.error
B = 'http://127.0.0.1:8094/api'
fails = []
class NoRedirect(u.HTTPRedirectHandler):
    def redirect_request(self, *a): return None
op = u.build_opener(NoRedirect)
def req(m, p, b=None, t=None, headers=None):
    r = u.Request(B+p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {}), **(headers or {})})
    try:
        res = op.open(r); body = res.read().decode()
        try: return res.status, json.loads(body), res.headers
        except ValueError: return res.status, body, res.headers
    except urllib.error.HTTPError as e: return e.code, '', e.headers
def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok: fails.append(name)
page = lambda path: req('GET', '/seo/page', headers={'X-Seo-Path': path})
su = req('POST','/collections/_superusers/auth-with-password',{'identity':'su@test.local','password':'Passw0rd123'})[1]['token']
rec = req('GET',"/collections/content/records?filter=(key='site')",t=su)[1]['items'][0]
data = rec['data']
data['articles'] = [
  {'id':'r1','cat':'Статья','date':'2026-10-26','title':'Как начать сортировать мусор дома','slug':'kak-nachat-sortirovat','old_slugs':['sortirovka-doma-za-odin-vecher'],'lead':'Подводка','body':'Текст'},
  {'id':'r2','cat':'Статья','date':'2026-10-21','title':'Тетрапак','slug':'tetrapak','lead':'Подводка','body':'Текст'}]
req('PATCH','/collections/content/records/'+rec['id'],{'data':data},su)
st, _, h = page('/zhurnal/sortirovka-doma-za-odin-vecher')
check('old address → 301 to the main one', st == 301 and h.get('Location') == '/zhurnal/kak-nachat-sortirovat')
st, _, h = page('/zhurnal/r1')
check('address by id → 301 to the main one', st == 301 and h.get('Location') == '/zhurnal/kak-nachat-sortirovat')
check('the main address is not redirected (200)', page('/zhurnal/kak-nachat-sortirovat')[0] == 200)
check('another article keeps its own address (200)', page('/zhurnal/tetrapak')[0] == 200)
check('an unknown address is 404, not a redirect', page('/zhurnal/net-takoy')[0] == 404)
check('the old /baraholka still → 301 /darom', page('/baraholka')[0] == 301)
import sys; sys.exit(1 if fails else 0)
PY
echo "ALL OK"
