#!/bin/sh
# Проверка ИИ-помощника без настоящего Яндекса: подставной API (YC_API) отвечает как chat/completions.
# Без ключа помощник выключен; с ключом — запрос с картинкой и моделью, ответ, дневной лимит, только для участников.
#   PB=/path/to/pocketbase sh tests/ai_test.sh
set -eu
PB=${PB:-pocketbase}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'kill $(cat "$T/pid" "$T/mock" 2>/dev/null) 2>/dev/null || true; rm -rf "$T"' EXIT
python3 - <<'PY' &
import json, http.server
calls, seen = [], set()
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        self.send_response(200); self.end_headers(); self.wfile.write(json.dumps(calls).encode())
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get('content-length') or 0)) or b'{}')
        if '/bot' in self.path:   # the same mock stands in for Telegram (TG_API)
            calls.append({'tg': self.path.rsplit('/', 1)[-1], 'chat': body.get('chat_id'), 'text': body.get('text', '')})
            self.send_response(200); self.send_header('content-type','application/json'); self.end_headers(); self.wfile.write(b'{"ok":true,"result":{"username":"testbot"}}'); return
        imgs = [p['image_url']['url'] for m in body.get('messages',[]) if isinstance(m.get('content'), list) for p in m['content'] if p.get('type')=='image_url']
        calls.append({'auth': self.headers.get('authorization'), 'model': body.get('model'), 'image': bool(imgs)})
        img = imgs[0] if imgs else ''
        # «Yandex is busy» once for a picture ending in FLAKY, «payment required» always for DOWN
        if img.endswith('FLAKY') and img not in seen:
            seen.add(img); self.send_response(503); self.end_headers(); self.wfile.write(b'{"error":"busy"}'); return
        if img.endswith('DOWN'):
            self.send_response(402); self.end_headers(); self.wfile.write(b'{"error":{"message":"billing account is not active"}}'); return
        res = {'choices':[{'message':{'content':'Что на фото: гречка с овощами.\nКак сделать полезнее:\n— добавьте зелень'}}], 'usage':{'total_tokens':1800}}
        self.send_response(200); self.send_header('content-type','application/json'); self.end_headers(); self.wfile.write(json.dumps(res).encode())
http.server.HTTPServer(('127.0.0.1', 8091), H).serve_forever()
PY
echo $! > "$T/mock"
start() { env "$@" "$PB" serve --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" --hooksDir="$ROOT/pocketbase/pb_hooks" --http=127.0.0.1:8089 > "$T/log.txt" 2>&1 & echo $! > "$T/pid"; sleep 5; }
start X=1
python3 - <<'PY'
import json, urllib.request as u, urllib.error
B = 'http://127.0.0.1:8089/api'
def req(m, p, b=None, t=None):
    r = u.Request(B+p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {})})
    try: return 200, json.load(u.urlopen(r))
    except urllib.error.HTTPError as e: return e.code, {}
ch = req('GET','/collections/characters/records')[1]['items']
req('POST','/collections/users/records',{'email':'a@t.local','password':'secret12','passwordConfirm':'secret12','name':'Аня','character':ch[0]['id']})
t = req('POST','/collections/users/auth-with-password',{'identity':'a@t.local','password':'secret12'})[1]['token']
st, r = req('POST','/ai/photo',{'kind':'food','image':'data:image/jpeg;base64,AAAA'},t)
ok = st == 200 and r.get('ok') is False and 'скоро заработает' in r.get('message','')
print(('PASS' if ok else 'FAIL') + ' without a key the helper says it is coming soon')
raise SystemExit(0 if ok else 1)
PY
kill "$(cat "$T/pid")"; sleep 1
start YC_API_KEY=test-key YC_FOLDER=b1folder YC_API=http://127.0.0.1:8091/v1/chat/completions AI_DAILY=2
python3 - <<'PY'
import json, urllib.request as u, urllib.error
B = 'http://127.0.0.1:8089/api'
fails = []
def req(m, p, b=None, t=None):
    r = u.Request(B+p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {})})
    try: return 200, json.load(u.urlopen(r))
    except urllib.error.HTTPError as e: return e.code, {}
def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok: fails.append(name)
img = 'data:image/jpeg;base64,' + 'A'*400
st, _ = req('POST','/ai/photo',{'kind':'food','image':img})
check('guests cannot use the helper', st in (401, 403))
t = req('POST','/collections/users/auth-with-password',{'identity':'a@t.local','password':'secret12'})[1]['token']
check('limit is shown', req('GET','/ai/left',None,t)[1] == {'enabled':True,'limit':2,'left':2})
st, r = req('POST','/ai/photo',{'kind':'food','image':img},t)
calls = json.load(u.urlopen('http://127.0.0.1:8091/'))
check('photo goes to the model with the key, folder and picture; the answer comes back', r.get('ok') and 'гречка' in r.get('text','') and r.get('left')==1 and calls[-1]['auth']=='Api-Key test-key' and calls[-1]['model']=='gpt://b1folder/qwen3.6-35b-a3b/latest' and calls[-1]['image'])
st, r = req('POST','/ai/photo',{'kind':'pack','image':'not an image'},t)
check('a non-image is refused without spending the limit', r.get('ok') is False and req('GET','/ai/left',None,t)[1]['left']==1)
req('POST','/ai/photo',{'kind':'pack','image':img},t)
n = len(json.load(u.urlopen('http://127.0.0.1:8091/')))
st, r = req('POST','/ai/photo',{'kind':'food','image':img},t)
check('daily limit stops the third photo before calling the model', r.get('ok') is False and 'закончились' in r.get('message','') and len(json.load(u.urlopen('http://127.0.0.1:8091/')))==n)
st, r = req('GET','/collections/ai_uses/records',None,t)
check('usage records are not visible through the API', st in (403, 404) or r.get('totalItems',0)==0)
raise SystemExit(1 if fails else 0)
PY
# ключ, вписанный в админке (/_/ → settings), без переменных окружения на сервере
kill "$(cat "$T/pid")"; sleep 1
"$PB" superuser upsert su@test.local Passw0rd123 --dir="$T/pb_data" >/dev/null
start YC_API=http://127.0.0.1:8091/v1/chat/completions
python3 - <<'PY'
import json, urllib.request as u, urllib.error, urllib.parse as up
B = 'http://127.0.0.1:8089/api'
fails = []
def req(m, p, b=None, t=None):
    r = u.Request(B+p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {})})
    try: return 200, json.load(u.urlopen(r))
    except urllib.error.HTTPError as e: return e.code, {}
def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok: fails.append(name)
t = req('POST','/collections/users/auth-with-password',{'identity':'a@t.local','password':'secret12'})[1]['token']
check('without a key in the admin panel the helper is off', req('GET','/ai/left',None,t)[1].get('enabled') is False)
st, r = req('GET','/collections/settings/records',None,t)
check('members cannot see the settings with the key', st in (403, 404) or r.get('totalItems',0)==0)
su = req('POST','/collections/_superusers/auth-with-password',{'identity':'su@test.local','password':'Passw0rd123'})[1]['token']
rows = {x['key']: x['id'] for x in req('GET','/collections/settings/records',None,su)[1]['items']}
check('the admin panel has empty YC_FOLDER and YC_API_KEY to fill in', set(rows) >= {'YC_FOLDER','YC_API_KEY'})
req('PATCH','/collections/settings/records/'+rows['YC_FOLDER'],{'value':'b1panel'},su)
req('PATCH','/collections/settings/records/'+rows['YC_API_KEY'],{'value':' panel-key '},su)
check('with the key from the admin panel the helper is on', req('GET','/ai/left',None,t)[1].get('enabled') is True)
st, r = req('POST','/ai/photo',{'kind':'food','image':'data:image/jpeg;base64,' + 'A'*400},t)
calls = json.load(u.urlopen('http://127.0.0.1:8091/'))
check('the model is called with the key and folder from the admin panel', r.get('ok') and calls[-1]['auth']=='Api-Key panel-key' and calls[-1]['model']=='gpt://b1panel/qwen3.6-35b-a3b/latest')
rows = {x['key']: x['id'] for x in req('GET','/collections/settings/records',None,su)[1]['items']}
req('PATCH','/collections/settings/records/'+rows['YC_MODEL'],{'value':'qwen2.5-vl-7b-instruct'},su)
req('POST','/ai/photo',{'kind':'pack','image':'data:image/jpeg;base64,' + 'A'*400},t)
calls = json.load(u.urlopen('http://127.0.0.1:8091/'))
check('the model can be changed in the admin panel', calls[-1]['model']=='gpt://b1panel/qwen2.5-vl-7b-instruct/latest')
raise SystemExit(1 if fails else 0)
PY
# Яндекс временно занят — вторая попытка; Яндекс отказывает — причина админам в Telegram (раз в 30 минут)
kill "$(cat "$T/pid")"; sleep 1
start TG_TOKEN=test-token TG_API=http://127.0.0.1:8091 YC_API_KEY=test-key YC_FOLDER=b1folder YC_API=http://127.0.0.1:8091/v1/chat/completions
python3 - <<'PY'
import json, urllib.request as u, urllib.error
B = 'http://127.0.0.1:8089/api'
fails = []
def req(m, p, b=None, t=None):
    r = u.Request(B+p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {})})
    try: return 200, json.load(u.urlopen(r))
    except urllib.error.HTTPError as e: return e.code, {}
def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok: fails.append(name)
calls = lambda: json.load(u.urlopen('http://127.0.0.1:8091/'))
su = req('POST','/collections/_superusers/auth-with-password',{'identity':'su@test.local','password':'Passw0rd123'})[1]['token']
ch = req('GET','/collections/characters/records')[1]['items']
st, adm = req('POST','/collections/users/records',{'email':'boss@t.local','password':'secret12','passwordConfirm':'secret12','name':'Даша','character':ch[0]['id']})
req('PATCH','/collections/users/records/'+adm['id'],{'role':'admin'},su)
req('POST','/collections/tg_subs/records',{'user':adm['id'],'chat_id':'555','enabled':True,'topics':['signups'],'hour':20,'tz':180},su)
st, u2 = req('POST','/collections/users/records',{'email':'guest2@t.local','password':'secret12','passwordConfirm':'secret12','name':'Гость','character':ch[1]['id']})
t = req('POST','/collections/users/auth-with-password',{'identity':'guest2@t.local','password':'secret12'})[1]['token']
n0 = len([c for c in calls() if c.get('image')])
st, r = req('POST','/ai/photo',{'kind':'pack','image':'data:image/jpeg;base64,' + 'A'*400 + 'FLAKY'},t)
check('Yandex busy (503) once: the second try answers', r.get('ok') is True and len([c for c in calls() if c.get('image')]) - n0 == 2)
k0 = len([c for c in calls() if c.get('tg')=='sendMessage'])
st, r = req('POST','/ai/photo',{'kind':'pack','image':'data:image/jpeg;base64,' + 'A'*400 + 'DOWN'},t)
tg = [c for c in calls() if c.get('tg')=='sendMessage'][k0:]
check('Yandex refuses: the member sees «не отвечает», no detail, the limit is not spent', r.get('ok') is False and 'не отвечает' in r.get('message','') and 'detail' not in r and r.get('left') == 4)
check('… and the admin gets the reason in Telegram (402, billing), without the key', len(tg)==1 and tg[0]['chat']=='555' and '402' in tg[0]['text'] and 'billing' in tg[0]['text'] and 'test-key' not in tg[0]['text'])
req('POST','/ai/photo',{'kind':'pack','image':'data:image/jpeg;base64,' + 'A'*400 + 'DOWN'},t)
check('a second failure within 30 minutes does not alert again', len([c for c in calls() if c.get('tg')=='sendMessage'][k0:])==1)
raise SystemExit(1 if fails else 0)
PY
echo "ALL OK"
