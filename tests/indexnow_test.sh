#!/bin/sh
# Проверка IndexNow: новая статья и вся карта сайта уходят в подставной Яндекс с ключом; файл ключа лежит в корне сайта.
#   PB=/path/to/pocketbase sh tests/indexnow_test.sh
set -eu
PB=${PB:-pocketbase}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'kill $(cat "$T/pid" "$T/mock" 2>/dev/null) 2>/dev/null || true; rm -rf "$T"' EXIT
python3 - <<'PY' &
import json, http.server
calls = []
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        self.send_response(200); self.end_headers(); self.wfile.write(json.dumps(calls).encode())
    def do_POST(self):
        calls.append(json.loads(self.rfile.read(int(self.headers.get('content-length') or 0)) or b'{}'))
        self.send_response(200); self.end_headers()
http.server.HTTPServer(('127.0.0.1', 8085), H).serve_forever()
PY
echo $! > "$T/mock"
INDEXNOW_API=http://127.0.0.1:8085/indexnow "$PB" serve --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" --hooksDir="$ROOT/pocketbase/pb_hooks" --http=127.0.0.1:8084 > "$T/log.txt" 2>&1 &
echo $! > "$T/pid"; sleep 5
"$PB" superuser upsert su@test.local Passw0rd123 --dir="$T/pb_data" >/dev/null
ROOT="$ROOT" T="$T" python3 - <<'PY'
import json, os, glob, urllib.request as u
B = 'http://127.0.0.1:8084/api'; fails = []
def req(m, p, b=None, t=None):
    r = u.Request(B + p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {})})
    x = u.urlopen(r).read(); return json.loads(x) if x else {}
def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok: fails.append(name)
calls = lambda: json.load(u.urlopen('http://127.0.0.1:8085/'))
su = req('POST','/collections/_superusers/auth-with-password',{'identity':'su@test.local','password':'Passw0rd123'})['token']
keys = glob.glob(os.environ['ROOT'] + '/site/[0-9a-f]*.txt'); key = open(keys[0]).read().strip() if keys else ''
site = req('GET','/collections/content/records?filter=' + u.quote("key='site'"),None,su)['items'][0]
data = site['data']; data['articles'] = [{'id':'n1','cat':'Статья','date':'2026-10-21','title':'Куда сдать шины','lead':'Коротко.','body':'Текст','slug':'kuda-sdat-shiny'}] + data.get('articles',[])
req('PATCH','/collections/content/records/'+site['id'],{'data':data},su)
r = req('POST','/indexnow/flush',None,su)
c = calls()
check('a new article goes to Yandex with the key and its location', r.get('sent',0) >= 1 and len(c) == 1 and 'https://dashabotanika.ru/zhurnal/kuda-sdat-shiny' in c[0]['urlList'] and c[0]['key'] == key and c[0]['keyLocation'].endswith('/' + key + '.txt') and c[0]['host'] == 'dashabotanika.ru')
r = req('POST','/indexnow/all',None,su)
c = calls()
check('the whole sitemap can be sent at once', len(c) == 2 and 'https://dashabotanika.ru/markirovka' in c[1]['urlList'] and 'https://dashabotanika.ru/sortirovka/batareyki' in c[1]['urlList'] and len(c[1]['urlList']) >= 30)
r = req('POST','/indexnow/flush',None,su)
check('an empty queue sends nothing', r.get('sent') == 0 and len(calls()) == 2)
open(os.environ['T'] + '/fails','w').write('\n'.join(fails))
PY
[ -s "$T/fails" ] && { echo FAILED; cat "$T/fails"; exit 1; }
echo "ALL OK"
