#!/bin/sh
# «Вещи даром»: кнопка «Отключить уведомления» в Telegram и письмо дарителю после проверки объявления.
# Подставные api.telegram.org (TG_API) и почтовый сервер; ничего не уходит реальным людям.
#   PB=/path/to/pocketbase sh tests/darom_notify_test.sh
set -eu
PB=${PB:-pocketbase}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'kill $(cat "$T/pid" "$T/mock" "$T/smtp" 2>/dev/null) 2>/dev/null || true; rm -rf "$T"' EXIT
mkdir "$T/mail"
python3 - <<'PY' &
import json, http.server
calls = []
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        self.send_response(200); self.end_headers(); self.wfile.write(json.dumps(calls).encode())
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get('content-length') or 0)) or b'{}')
        method = self.path.rsplit('/', 1)[-1]; calls.append([method, body])
        result = {'username': 'testbot'} if method == 'getMe' else ([] if method == 'getUpdates' else True)
        self.send_response(200); self.send_header('content-type', 'application/json'); self.end_headers(); self.wfile.write(json.dumps({'ok': True, 'result': result}).encode())
http.server.HTTPServer(('127.0.0.1', 8091), H).serve_forever()
PY
echo $! > "$T/mock"
python3 - "$T/mail" <<'PY' &
import asyncio, sys, os, time
OUT = sys.argv[1]
async def handle(r, w):
    w.write(b'220 sink\r\n'); await w.drain(); data = False; buf = []
    while True:
        line = await r.readline()
        if not line: break
        if data:
            if line in (b'.\r\n', b'.\n'):
                open(os.path.join(OUT, '%f.eml' % time.time()), 'wb').write(b''.join(buf)); buf = []; data = False; w.write(b'250 ok\r\n')
            else: buf.append(line[1:] if line.startswith(b'..') else line)
        else:
            cmd = line[:4].upper()
            if cmd == b'EHLO': w.write(b'250-sink\r\n250 AUTH PLAIN LOGIN\r\n')
            elif cmd == b'DATA': w.write(b'354 go\r\n'); data = True
            elif cmd == b'QUIT': w.write(b'221 bye\r\n'); await w.drain(); break
            elif cmd == b'AUTH': w.write(b'235 ok\r\n')
            else: w.write(b'250 ok\r\n')
        await w.drain()
    w.close()
async def main():
    srv = await asyncio.start_server(handle, '127.0.0.1', 2530)
    async with srv: await srv.serve_forever()
asyncio.run(main())
PY
echo $! > "$T/smtp"
TG_TOKEN=test-token TG_API=http://127.0.0.1:8091 "$PB" serve --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" --hooksDir="$ROOT/pocketbase/pb_hooks" --http=127.0.0.1:8092 > "$T/log.txt" 2>&1 &
echo $! > "$T/pid"; sleep 5
"$PB" superuser upsert su@test.local Passw0rd123 --dir="$T/pb_data" >/dev/null
T="$T" python3 - <<'PY'
import json, hashlib, os, glob, time, email, email.policy, re, urllib.request as u, urllib.error
T = os.environ['T']; B = 'http://127.0.0.1:8092/api'
fails = []
def req(m, p, b=None, t=None, h=None, raw=False):
    r = u.Request(p if p.startswith('http') else B+p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {}), **(h or {})})
    try: x = u.urlopen(r).read(); return 200, (x.decode() if raw else (json.loads(x) if x else {}))
    except urllib.error.HTTPError as e: return e.code, (e.read().decode() if raw else {})
def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok: fails.append(name)
def mails():
    out = []
    for f in sorted(glob.glob(T + '/mail/*.eml')):
        m = email.message_from_bytes(open(f,'rb').read(), policy=email.policy.default); body = m.get_body(('html','plain'))
        out.append({'to': str(m['To']), 'subject': str(m['Subject']), 'html': body.get_content() if body else ''})
    return out
calls = lambda: json.load(u.urlopen('http://127.0.0.1:8091/'))
sends = lambda chat: [c for c in calls() if c[0]=='sendMessage' and str(c[1].get('chat_id'))==str(chat)]
secret = hashlib.sha256(b'dashabotanika-hook:test-token').hexdigest()[:48]
hook = lambda msg: req('POST','/tg/hook',{'message':msg},h={'X-Telegram-Bot-Api-Secret-Token':secret})
su = req('POST','/collections/_superusers/auth-with-password',{'identity':'su@test.local','password':'Passw0rd123'})[1]['token']
smtp = lambda port: req('PATCH','/settings',{'meta':{'appURL':'http://127.0.0.1:8092','senderName':'DashaBotanika','senderAddress':'hello@dashabotanika.ru'},'smtp':{'enabled':True,'host':'127.0.0.1','port':port,'tls':False}},su)
smtp(2530)
ch = req('GET','/collections/characters/records')[1]['items']
def user(email_, name, role=None):
    uid = req('POST','/collections/users/records',{'email':email_,'password':'secret12','passwordConfirm':'secret12','name':name,'character':ch[0]['id']})[1]['id']
    if role: req('PATCH','/collections/users/records/'+uid,{'role':role},su)
    for k in range(10):
        time.sleep(1.2); c, a = req('POST','/collections/users/auth-with-password',{'identity':email_,'password':'secret12'})
        if c == 200: return uid, a['token']
    raise SystemExit('cannot sign in '+email_)
S, st = user('seller@t.local','Соня')
R, rt = user('reader@t.local','Рома')
A, at = user('admin@t.local','Админ','admin')
def listing(title):
    return req('POST','/collections/listings/records',{'seller':S,'title':title,'kind':'Отдам даром','category':'Книги','status':'active'},st)[1]
item = lambda lid: req('GET','/collections/listings/records/'+lid,t=su)[1]
run = lambda: req('POST','/darom/mod-mail',{},at)[1]
moderate = lambda lid, d: req('PATCH','/collections/listings/records/'+lid,d,at)

# ---------- Telegram: «Отключить уведомления» ----------
code = req('POST','/tg/link',{},rt)[1]['url'].rsplit('=',1)[-1]
hook({'chat':{'id':777},'text':'/start '+code})
sub = req('POST','/collections/darom_subs/records',{'user':R,'cats':[],'city':'','email':True,'tg':True,'tg_unsub':'mine'},rt)[1]
check('the browser cannot set the unsubscribe key', req('GET','/collections/darom_subs/records/'+sub['id'],t=su)[1].get('tg_unsub') != 'mine')
l1 = listing('Книга 1'); moderate(l1['id'],{'moderation':'approved'})
before = len(sends(777)); req('POST','/darom/flush',{},at)
msg = sends(777)[before:]
check('a Telegram message about new things comes', len(msg) == 1)
kb = msg[0][1].get('reply_markup',{}).get('inline_keyboard',[]) if msg else []
off = [b[0]['url'] for b in kb if 'Отключить' in b[0]['text']]
check('it has «Посмотреть» and «🔕 Отключить уведомления»', len(kb) == 2 and len(off) == 1)
tok = off[0].split('t=')[1] if off else ''
check('the link has only a random key — no user or subscription id, no email', off and R not in off[0] and sub['id'] not in off[0] and 'reader' not in off[0] and re.fullmatch(r'[A-Za-z0-9]{40}', tok))
check('the key is not visible to the subscriber through the API', 'tg_unsub' not in req('GET','/collections/darom_subs/records/'+sub['id'],t=rt)[1])
st1, page = req('GET','/darom/tg-off?t='+tok, raw=True)
s1 = req('GET','/collections/darom_subs/records/'+sub['id'],t=su)[1]
check('pressing it turns off Telegram for this subscription only (mail stays)', st1 == 200 and 'Уведомления отключены' in page and s1['tg'] is False and s1['email'] is True)
st2, page2 = req('GET','/darom/tg-off?t='+tok, raw=True)
check('pressing again is safe: «уже отключено»', st2 == 200 and 'Уже отключено' in page2)
check('a wrong key does not touch anything', req('GET','/darom/tg-off?t=abc', raw=True)[0] == 404 and req('GET','/darom/tg-off?t='+'x'*40, raw=True)[0] == 404)
before = len(sends(777)); nm = len(mails())
l2 = listing('Книга 2'); moderate(l2['id'],{'moderation':'approved'}); req('POST','/darom/flush',{},at)
check('after that no Telegram messages, the e-mail of the subscription still comes', len(sends(777)) == before and any('Новые вещи даром' in m['subject'] for m in mails()[nm:]))
# a thing already queued is not sent after turning off; friends get it at once — also not after turning off
req('PATCH','/collections/darom_subs/records/'+sub['id'],{'tg':True},rt)
l3 = listing('Книга 3'); moderate(l3['id'],{'moderation':'approved'})
req('GET','/darom/tg-off?t='+tok, raw=True); before = len(sends(777)); req('POST','/darom/flush',{},at)
check('a queued thing is not sent to Telegram after turning off', len(sends(777)) == before)
req('PATCH','/collections/users/records/'+R,{'friend_until':'2099-01-01 00:00:00.000Z'},su)
req('PATCH','/collections/darom_subs/records/'+sub['id'],{'tg':True},rt)
before = len(sends(777)); l4 = listing('Книга 4'); moderate(l4['id'],{'moderation':'approved'})
check('instant messages for friends still work and carry the button', len(sends(777)) == before + 1 and 'Отключить' in json.dumps(sends(777)[-1], ensure_ascii=False))
req('GET','/darom/tg-off?t='+tok, raw=True); before = len(sends(777)); l5 = listing('Книга 5'); moderate(l5['id'],{'moderation':'approved'})
check('… and stop after turning off', len(sends(777)) == before)
check('the subscription in the browser shows Telegram off', req('GET','/collections/darom_subs/records/'+sub['id'],t=rt)[1]['tg'] is False)

# ---------- письмо дарителю после проверки ----------
to_seller = lambda: [m for m in mails() if 'seller@t.local' in m['to']]
n0 = len(to_seller()); time.sleep(1); run()
ok_mails = to_seller()[n0:]
check('approved → one letter per listing with a link to it', len(ok_mails) == 5 and all('Опубликовано' in m['subject'] for m in ok_mails) and ('/darom/v/'+l1['id']) in ''.join(m['html'] for m in ok_mails))
check('the letter is about the listing, without a topic «unsubscribe»', ok_mails and 'Это письмо о вашем объявлении' in ok_mails[0]['html'] and 'Отписаться' not in ok_mails[0]['html'])
run(); check('running again sends nothing', len(to_seller()) == n0 + 5)
moderate(l1['id'],{'moderation':'approved'}); run()
check('saving the same status again sends nothing', len(to_seller()) == n0 + 5)
req('PATCH','/collections/listings/records/'+l1['id'],{'mod_mail':'','mod_due':True},st); run()
check('the seller cannot force a repeat letter (mail fields are server-only)', len(to_seller()) == n0 + 5 and item(l1['id'])['mod_mail'] == 'approved')
moderate(l1['id'],{'mod_mail':'', 'mod_due':True}); run()
check('a moderator cannot force a repeat either (fields are server-only)', len(to_seller()) == n0 + 5)
l6 = listing('Кресло'); moderate(l6['id'],{'moderation':'rejected','reason':'Нет фото и описания'}); run()
rej = to_seller()[-1]
check('rejected → the reason and a link to fix it', 'не прошло проверку' in rej['subject'] and 'Нет фото и описания' in rej['html'] and 'kabinet?tab=things' in rej['html'])
moderate(l6['id'],{'moderation':'rejected','reason':'Нет фото и описания'}); run()
check('the same rejection saved again — no second letter', len(to_seller()) == n0 + 6)
moderate(l6['id'],{'moderation':'rejected','reason':'Пришлите фото целиком'}); run()
check('a new reason — a new letter', len(to_seller()) == n0 + 7 and 'Пришлите фото целиком' in to_seller()[-1]['html'])
# the mail server fails: not counted as sent, tried again later, sent once when it works
smtp(2599)
l7 = listing('Лампа'); moderate(l7['id'],{'moderation':'approved'}); r1 = run()
i7 = item(l7['id'])
check('mail server down → not sent, waiting for a retry (not marked as sent)', r1.get('failed') == 1 and i7['mod_due'] is True and i7['mod_tries'] == 1 and i7['mod_mail'] == '' and i7['mod_next'])
smtp(2530); run()
check('the retry waits for its pause (no hammering)', len(to_seller()) == n0 + 7)
req('PATCH','/collections/listings/records/'+l7['id'],{'mod_next':'2000-01-01 00:00:00.000Z'},su); run()
check('after the pause it is sent exactly once', len(to_seller()) == n0 + 8 and 'Лампа' in to_seller()[-1]['subject'])
run(); check('… and not again', len(to_seller()) == n0 + 8)
# published at once (a trusted giver: 5 things given, no rejections): no letter
G, gt = user('giver@t.local','Гоша')
to_giver = lambda: [m for m in mails() if 'giver@t.local' in m['to']]
for i in range(5):
    x = req('POST','/collections/listings/records',{'seller':G,'title':'Отдано %d' % i,'kind':'Отдам даром','category':'Книги','status':'active'},gt)[1]
    moderate(x['id'],{'moderation':'approved'}); req('PATCH','/collections/listings/records/'+x['id'],{'status':'gone'},su)
run(); n1 = len(to_giver())
lt = req('POST','/collections/listings/records',{'seller':G,'title':'Сразу','kind':'Отдам даром','category':'Книги','status':'active'},gt)[1]
check('a trusted giver is published at once', item(lt['id'])['moderation'] == 'approved')
run(); check('… and gets no letter about it', len(to_giver()) == n1)
if fails: raise SystemExit('FAILED: ' + ', '.join(fails))
print('ALL OK')
PY
