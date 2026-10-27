#!/bin/sh
# Письмо «ОН ТЕБЯ ОЧЕНЬ ЖДЕТ...»: кому уходит, что в нём (только то, что человек ещё не пробовал),
# одно письмо на одно отсутствие, «Отписаться». Почта уходит в подставной SMTP-сервер.
#   PB=/path/to/pocketbase sh tests/comeback_test.sh
set -eu
PB=${PB:-pocketbase}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'kill $(cat "$T/pid" "$T/smtp" 2>/dev/null) 2>/dev/null || true; rm -rf "$T"' EXIT
mkdir "$T/mail"
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
    srv = await asyncio.start_server(handle, '127.0.0.1', 2528)
    async with srv: await srv.serve_forever()
asyncio.run(main())
PY
echo $! > "$T/smtp"
"$PB" serve --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" --hooksDir="$ROOT/pocketbase/pb_hooks" --http=127.0.0.1:8093 > "$T/log.txt" 2>&1 &
echo $! > "$T/pid"; sleep 5
"$PB" superuser upsert su@test.local Passw0rd123 --dir="$T/pb_data" >/dev/null
T="$T" python3 - <<'PY'
import json, os, glob, time, email, email.policy, urllib.request as u, urllib.error
T = os.environ['T']; B = 'http://127.0.0.1:8093/api'
fails = []
def req(m, p, b=None, t=None, raw=False):
    r = u.Request(p if p.startswith('http') else B + p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {})})
    try:
        x = u.urlopen(r).read(); return 200, (x.decode() if raw else (json.loads(x) if x else {}))
    except urllib.error.HTTPError as e: return e.code, (e.read().decode() if raw else {})
def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok: fails.append(name)
def mails():
    out = []
    for f in sorted(glob.glob(T + '/mail/*.eml')):
        m = email.message_from_bytes(open(f,'rb').read(), policy=email.policy.default)
        body = m.get_body(('html','plain'))
        out.append({'to': str(m['To']), 'subject': str(m['Subject']), 'unsub': str(m['List-Unsubscribe'] or ''), 'html': body.get_content() if body else ''})
    return out
su = req('POST','/collections/_superusers/auth-with-password',{'identity':'su@test.local','password':'Passw0rd123'})[1]['token']
req('PATCH','/settings',{'meta':{'appURL':'http://127.0.0.1:8093','senderName':'DashaBotanika','senderAddress':'hello@dashabotanika.ru'},'smtp':{'enabled':True,'host':'127.0.0.1','port':2528,'tls':False}},su)
ch = req('GET','/collections/characters/records')[1]['items']
U = {}
for n in ['anna','boris']:
    x = req('POST','/collections/users/records',{'email':n+'@t.local','password':'secret12','passwordConfirm':'secret12','name':n.title(),'character':ch[0]['id']})[1]
    U[n] = (x['id'], req('POST','/collections/users/auth-with-password',{'identity':n+'@t.local','password':'secret12'})[1]['token'])
# Аня при регистрации оставила галочку, Боря — снял
st, n = req('POST','/collections/notify/records',{'user':U['anna'][0],'email_topics':['comeback'],'hour':20,'tz':180},U['anna'][1])
check('the sign-up tick is saved as a choice with the consent time', st == 200 and n.get('consent_at'))
run = lambda force, user='': (time.sleep(0.3), req('POST','/notify/comeback',{'force':force,'user':user},su)[1].get('sent'))[1]
check('someone who was here today gets nothing', run(False) == 0 and not mails())
check('after an absence the letter goes only to who ticked it', run(True) == 1 and len(mails()) == 1 and mails()[0]['to'].endswith('anna@t.local>'))
m = mails()[0]
check('subject «ОН ТЕБЯ ОЧЕНЬ ЖДЕТ...»', m['subject'] == 'ОН ТЕБЯ ОЧЕНЬ ЖДЕТ...')
check('it says the project waits and lists the three things not tried yet', 'DashaBotanika тебя очень ждёт' in m['html'] and 'Проект «Даром»' in m['html'] and 'Запусти свой челлендж' in m['html'] and 'встроенный ИИ' in m['html'] and 'Telegram' in m['html'])
check('a one-click unsubscribe is there', 'k=comeback' in m['unsub'])
check('one letter per absence: no second one while she is away', run(True) == 0 and len(mails()) == 1)
# Аня вернулась, отдала вещь — и снова пропала
time.sleep(1.2)
req('POST','/db/ping',{},U['anna'][1])
req('POST','/collections/listings/records',{'seller':U['anna'][0],'title':'Стул','kind':'Отдам даром','condition':'Хорошее','city':'Тула','status':'active'},U['anna'][1])
check('came back and left again → a new letter', run(True, U['anna'][0]) == 1 and len(mails()) == 2)
m2 = mails()[1]['html']
check('what she has already done is not offered again', 'Проект «Даром»' not in m2 and 'Запусти свой челлендж' in m2)
st, page = req('GET', B + '/notify/unsub?' + mails()[1]['unsub'][1:-1].split('?',1)[1], None, None, True)
check('unsubscribe stops these letters', st == 200 and 'давно не заходили' in page)
time.sleep(1.2); req('POST','/db/ping',{},U['anna'][1])
check('… and no more letters after that', run(True) == 0 and len(mails()) == 2)
if fails: raise SystemExit('FAILED: ' + ', '.join(fails))
print('ALL OK')
PY
