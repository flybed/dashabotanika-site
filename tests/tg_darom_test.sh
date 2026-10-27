#!/bin/sh
# «Вещи даром» через Telegram-бота: фото с подписью → объявление, альбом → дополнительные фото,
# «Отдам …» без фото, бот не подключён → подсказка. Подставной api.telegram.org (TG_API).
#   PB=/path/to/pocketbase sh tests/tg_darom_test.sh
set -eu
PB=${PB:-pocketbase}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'kill $(cat "$T/pid" "$T/mock" 2>/dev/null) 2>/dev/null || true; rm -rf "$T"' EXIT
python3 - "$T" "$ROOT/site/img/owl.webp" <<'PY' &
import json, sys, http.server
calls = []
IMG = open(sys.argv[2], 'rb').read()
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if '/file/bot' in self.path:   # скачивание фото, присланного боту
            self.send_response(200); self.send_header('content-type', 'image/webp'); self.end_headers(); self.wfile.write(IMG); return
        self.send_response(200); self.end_headers(); self.wfile.write(json.dumps(calls).encode())
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get('content-length') or 0)) or b'{}')
        method = self.path.rsplit('/', 1)[-1]
        calls.append([method, body])
        result = True
        if method == 'getMe': result = {'username': 'testbot'}
        if method == 'getUpdates': result = []
        if method == 'getFile': result = {'file_path': 'photos/' + body.get('file_id', 'x') + '.jpg'}
        self.send_response(200); self.send_header('content-type', 'application/json'); self.end_headers(); self.wfile.write(json.dumps({'ok': True, 'result': result}).encode())
http.server.HTTPServer(('127.0.0.1', 8095), H).serve_forever()
PY
echo $! > "$T/mock"
TG_TOKEN=test-token TG_API=http://127.0.0.1:8095 "$PB" serve --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" --hooksDir="$ROOT/pocketbase/pb_hooks" --http=127.0.0.1:8094 > "$T/log.txt" 2>&1 &
echo $! > "$T/pid"; sleep 5
"$PB" superuser upsert su@test.local Passw0rd123 --dir="$T/pb_data" >/dev/null
python3 - <<'PY'
import json, hashlib, urllib.request as u, urllib.error, time
B = 'http://127.0.0.1:8094/api'
fails = []
def req(m, p, b=None, t=None, h=None):
    r = u.Request(B+p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {}), **(h or {})})
    try: return 200, json.load(u.urlopen(r))
    except urllib.error.HTTPError as e: return e.code, {}
def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok: fails.append(name)
calls = lambda: json.load(u.urlopen('http://127.0.0.1:8095/'))
secret = hashlib.sha256(b'dashabotanika-hook:test-token').hexdigest()[:48]
hook = lambda msg: req('POST','/tg/hook',{'message':msg},h={'X-Telegram-Bot-Api-Secret-Token':secret})
su = req('POST','/collections/_superusers/auth-with-password',{'identity':'su@test.local','password':'Passw0rd123'})[1]['token']
ch = req('GET','/collections/characters/records')[1]['items']
uid = req('POST','/collections/users/records',{'email':'anya@t.local','password':'secret12','passwordConfirm':'secret12','name':'Аня','character':ch[0]['id']})[1]['id']
tok = req('POST','/collections/users/auth-with-password',{'identity':'anya@t.local','password':'secret12'})[1]['token']
req('POST','/collections/profiles/records',{'owner':uid,'country':'Россия','city':'Новосибирск','district':'Центральный','lat':55.03,'lon':82.92},tok)
code = req('POST','/tg/link',{},tok)[1]['url'].rsplit('=',1)[-1]
hook({'chat':{'id':555},'text':'/start '+code})
listings = lambda: req('GET','/collections/listings/records?sort=created',t=su)[1]['items']
# not connected → a hint, nothing created
hook({'chat':{'id':777},'photo':[{'file_id':'a'}],'caption':'Стул'})
check('a chat that is not connected gets a hint and no listing', not listings() and 'Подключить Telegram' in json.dumps(calls()[-1], ensure_ascii=False))
# a photo with a caption → a listing with the photo, category guessed, place from the profile
hook({'chat':{'id':555},'photo':[{'file_id':'small'},{'file_id':'big'}],'caption':'Отдам даром детский велосипед\nКолёса 16 дюймов, синий','media_group_id':'g1'})
L = listings()
check('photo + caption → a listing waiting for moderation', len(L) == 1 and L[0]['title'] == 'Детский велосипед' and L[0]['note'].startswith('Колёса') and not L[0]['moderation'])
check('category is guessed and the place comes from the profile', L and L[0]['category'] == 'Детское' and L[0]['city'] == 'Новосибирск' and L[0]['district'] == 'Центральный' and L[0]['lat'] == 55.03)
check('the biggest photo is downloaded and attached', L and L[0]['photo'] and ['getFile', {'file_id':'big'}] in calls())
# the second photo of the same album → extra photo of the same listing
hook({'chat':{'id':555},'photo':[{'file_id':'p2'}],'media_group_id':'g1'})
L = listings()
check('an album adds extra photos to the same listing', len(L) == 1 and len(L[0].get('more_photos') or []) == 1)
# text only
hook({'chat':{'id':555},'text':'Отдам книги о садоводстве, 5 штук'})
L = listings()
check('«Отдам …» without a photo also works, category Книги', len(L) == 2 and L[1]['category'] == 'Книги' and not L[1]['photo'])
last = json.dumps(calls()[-1], ensure_ascii=False)
check('the bot answers: sent for moderation, with a link', 'Отправлено на проверку' in last and 'kabinet?tab=things' in last)
hook({'chat':{'id':555},'text':'/otdam'})
check('/otdam alone explains how to give a thing', 'пришлите её фото' in json.dumps(calls()[-1], ensure_ascii=False))
if fails: raise SystemExit('FAILED: ' + ', '.join(fails))
print('ALL OK')
PY
