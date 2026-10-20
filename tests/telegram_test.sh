#!/bin/sh
# Проверка Telegram-бота без настоящего Telegram: подставной api.telegram.org (TG_API) записывает вызовы.
# Привязка из кабинета, вебхук с секретом, выбор уведомлений, напоминание о челлендже, личные сообщения, /stop.
#   PB=/path/to/pocketbase sh tests/telegram_test.sh
set -eu
PB=${PB:-pocketbase}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'kill $(cat "$T/pid" "$T/mock" 2>/dev/null) 2>/dev/null || true; rm -rf "$T"' EXIT
python3 - "$T" <<'PY' &
import json, sys, http.server
calls = []
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        self.send_response(200); self.end_headers(); self.wfile.write(json.dumps(calls).encode())
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get('content-length') or 0)) or b'{}')
        method = self.path.rsplit('/', 1)[-1]; calls.append([method, body])
        res = {'ok': True, 'result': {'username': 'testbot'} if method == 'getMe' else True}
        self.send_response(200); self.send_header('content-type', 'application/json'); self.end_headers(); self.wfile.write(json.dumps(res).encode())
http.server.HTTPServer(('127.0.0.1', 8093), H).serve_forever()
PY
echo $! > "$T/mock"
TG_TOKEN=test-token TG_API=http://127.0.0.1:8093 "$PB" serve --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" --hooksDir="$ROOT/pocketbase/pb_hooks" --http=127.0.0.1:8092 > "$T/log.txt" 2>&1 &
echo $! > "$T/pid"; sleep 5
"$PB" superuser upsert su@test.local Passw0rd123 --dir="$T/pb_data" >/dev/null
python3 - <<'PY'
import json, hashlib, datetime, urllib.request as u, urllib.error
B = 'http://127.0.0.1:8092/api'
fails = []
def req(m, p, b=None, t=None, h=None):
    r = u.Request(B+p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {}), **(h or {})})
    try: return 200, json.load(u.urlopen(r))
    except urllib.error.HTTPError as e: return e.code, {}
def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok: fails.append(name)
calls = lambda: json.load(u.urlopen('http://127.0.0.1:8093/'))
su = req('POST','/collections/_superusers/auth-with-password',{'identity':'su@test.local','password':'Passw0rd123'})[1]['token']
ch = req('GET','/collections/characters/records')[1]['items']
ids, tok = {}, {}
for n in ['Аня','Боря']:
    x = req('POST','/collections/users/records',{'email':n+'@t.local'.replace('@','x@'),'password':'secret12','passwordConfirm':'secret12','name':n,'character':ch[0]['id']})[1]
    ids[n] = x['id']; tok[n] = req('POST','/collections/users/auth-with-password',{'identity':n+'x@t.local','password':'secret12'})[1]['token']
st, r = req('POST','/tg/link',{},tok['Аня'])
check('cabinet gets a t.me link with a one-time code', st == 200 and r.get('url','').startswith('https://t.me/testbot?start='))
code = r.get('url','').rsplit('=',1)[-1]
check('webhook is set with a secret', any(c[0]=='setWebhook' and c[1].get('secret_token') for c in calls()))
secret = hashlib.sha256(b'dashabotanika-hook:test-token').hexdigest()[:48]
st, _ = req('POST','/tg/hook',{'message':{'chat':{'id':555},'text':'/start '+code}},h={'X-Telegram-Bot-Api-Secret-Token':'wrong'})
check('webhook without the secret is refused', st == 403)
req('POST','/tg/hook',{'message':{'chat':{'id':555},'text':'/start '+code}},h={'X-Telegram-Bot-Api-Secret-Token':secret})
subs = req('GET','/collections/tg_subs/records',None,tok['Аня'])[1]['items']
check('/start links the chat, default topics chosen', len(subs)==1 and subs[0]['chat_id']=='555' and set(subs[0]['topics'])=={'challenge','messages','weekly'})
check('another member does not see the subscription', req('GET','/collections/tg_subs/records',None,tok['Боря'])[1]['totalItems']==0)
st, _ = req('PATCH','/collections/tg_subs/records/'+subs[0]['id'],{'chat_id':'999'},tok['Аня'])
check('chat id cannot be changed from the site', st >= 400)
today = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=180)).strftime('%Y-%m-%d')
req('POST','/collections/habits/records',{'owner':ids['Аня'],'data':{'habits':[],'log':{},'challenges':[{'id':'c1','start':today,'days':7,'habits':[{'id':'h1','name':'Своя кружка'}],'log':{}}]}},tok['Аня'])
n0 = len(calls()); req('POST','/tg/run',{},su)
sent = [c for c in calls()[n0:] if c[0]=='sendMessage']
check('challenge reminder lists what is not checked today', len(sent)==1 and 'Своя кружка' in sent[0][1]['text'] and sent[0][1]['chat_id']=='555')
req('PATCH','/collections/tg_subs/records/'+subs[0]['id'],{'topics':['messages']},tok['Аня'])
n0 = len(calls()); req('POST','/tg/run',{},su)
check('without the challenge topic no reminder comes', not [c for c in calls()[n0:] if c[0]=='sendMessage'])
key = 'D_'+'_'.join(sorted([ids['Аня'], ids['Боря']]))
st, chat = req('POST','/collections/chats/records',{'key':key,'buyer':ids['Боря'],'seller':ids['Аня'],'title':'Личные сообщения'},tok['Боря'])
n0 = len(calls()); req('POST','/collections/messages/records',{'chat':chat.get('id'),'from':ids['Боря'],'text':'Привет из мира!'},tok['Боря'])
msg = [c for c in calls()[n0:] if c[0]=='sendMessage']
check('new private message comes to Telegram', len(msg)==1 and 'Привет из мира!' in msg[0][1]['text'] and 'Боря' in msg[0][1]['text'])
req('POST','/tg/hook',{'message':{'chat':{'id':555},'text':'/stop'}},h={'X-Telegram-Bot-Api-Secret-Token':secret})
check('/stop turns everything off', req('GET','/collections/tg_subs/records',None,tok['Аня'])[1]['totalItems']==0)
raise SystemExit(1 if fails else 0)
PY
