#!/bin/sh
# Проверка писем по выбору участника: настройки и согласие, письмо о сообщении (не чаще раза в 3 часа),
# о новой статье, письмо недели, «Отписаться» в один клик. Почта уходит в подставной SMTP-сервер.
#   PB=/path/to/pocketbase sh tests/notify_test.sh
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
    srv = await asyncio.start_server(handle, '127.0.0.1', 2527)
    async with srv: await srv.serve_forever()
asyncio.run(main())
PY
echo $! > "$T/smtp"
"$PB" serve --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" --hooksDir="$ROOT/pocketbase/pb_hooks" --http=127.0.0.1:8086 > "$T/log.txt" 2>&1 &
echo $! > "$T/pid"; sleep 5
"$PB" superuser upsert su@test.local Passw0rd123 --dir="$T/pb_data" >/dev/null
T="$T" python3 - <<'PY'
import json, os, glob, time, email, email.policy, re, urllib.request as u, urllib.error
T = os.environ['T']; B = 'http://127.0.0.1:8086/api'
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
req('PATCH','/settings',{'meta':{'appURL':'http://127.0.0.1:8086','senderName':'DashaBotanika','senderAddress':'hello@dashabotanika.ru'},'smtp':{'enabled':True,'host':'127.0.0.1','port':2527,'tls':False}},su)
ch = req('GET','/collections/characters/records')[1]['items']
U = {}
for n in ['anna','boris']:
    x = req('POST','/collections/users/records',{'email':n+'@t.local','password':'secret12','passwordConfirm':'secret12','name':n.title(),'character':ch[0]['id']})[1]
    U[n] = (x['id'], req('POST','/collections/users/auth-with-password',{'identity':n+'@t.local','password':'secret12'})[1]['token'])
st, n = req('POST','/collections/notify/records',{'user':U['anna'][0],'email_topics':['messages','articles','weekly'],'token':'mine'},U['anna'][1])
check('choosing e-mails records the consent time and hides the secret', st == 200 and n.get('consent_at') and 'token' not in n)
st, page = req('GET','http://127.0.0.1:8086/api/notify/unsub?n=%s&t=mine&k=all' % n.get('id'), None, None, True)
check('a secret sent by the browser is ignored: the server makes its own', st == 400)
check('nobody else sees someone\'s e-mail choices', req('GET','/collections/notify/records',None,U['boris'][1])[1].get('items') == [])
chat = req('POST','/collections/chats/records',{'key':'t1','title':'Шопер','buyer':U['boris'][0],'seller':U['anna'][0]},U['boris'][1])[1]
time.sleep(1); before = len(mails())
req('POST','/collections/messages/records',{'chat':chat['id'],'from':U['boris'][0],'text':'Здравствуйте! Шопер ещё есть?'},U['boris'][1]); time.sleep(2)
m = mails()[before:]
check('a new message comes by e-mail with the text, a reply link and List-Unsubscribe', len(m) == 1 and 'anna@t.local' in m[0]['to'] and 'Шопер ещё есть' in m[0]['html'] and 'tab=chats' in m[0]['html'] and 'notify/unsub' in m[0]['unsub'])
req('POST','/collections/messages/records',{'chat':chat['id'],'from':U['boris'][0],'text':'И ещё вопрос'},U['boris'][1]); time.sleep(2)
check('the next message within 3 hours does not send another e-mail', len(mails()) == before + 1)
site = req('GET','/collections/content/records?filter=' + u.quote("key='site'"),None,su)[1]['items'][0]
data = site['data']; data['articles'] = [{'id':'n1','cat':'Статья','date':time.strftime('%Y-%m-%d'),'title':'Куда сдать батарейки','lead':'Коротко о пунктах приёма.','body':'Текст','slug':'batareyki'}] + data.get('articles',[])
req('PATCH','/collections/content/records/'+site['id'],{'data':data},su)
# the letter goes out from the queue (cron, once a minute), so publishing does not wait for the mail server
for _ in range(70):
    art = [x for x in mails() if 'батарейки' in x['subject']]
    if art: break
    time.sleep(1)
check('a new article comes by e-mail to those who chose it', len(art) == 1 and '/zhurnal/batareyki' in art[0]['html'])
st, r = req('POST','/notify/weekly',None,su); time.sleep(2)
wk = [x for x in mails() if 'Письмо недели' in x['subject']]
check('the weekly letter: articles of the week, the world and «your week»', r.get('sent') == 1 and len(wk) == 1 and 'Куда сдать батарейки' in wk[0]['html'] and 'Ваша неделя' in wk[0]['html'] and 'новых жителей' in wk[0]['html'])
link = re.search(r'href="([^"]*notify/unsub[^"]*k=weekly[^"]*)"', wk[0]['html']).group(1).replace('&amp;','&').replace('https://dashabotanika.ru','http://127.0.0.1:8086')
st, page = req('GET', link, None, None, True)
n2 = req('GET','/collections/notify/records',None,U['anna'][1])[1]['items'][0]
check('«Отписаться» in the letter works in one click without signing in', st == 200 and 'Вы отписались' in page and n2['email_topics'] == ['messages','articles'])
st, page = req('GET', link.replace('t=','t=x'), None, None, True)
check('a wrong link does not unsubscribe anyone', st == 400)
# challenge reminder by e-mail: boris has a challenge going with nothing ticked today
today = time.strftime('%Y-%m-%d', time.gmtime(time.time() + 3*3600))
req('POST','/collections/habits/records',{'owner':U['boris'][0],'data':{'challenges':[{'id':'c1','start':today,'days':7,'habits':[{'id':'h1','name':'Своя кружка'},{'id':'h2','name':'Без пакетов'}],'log':{}}]}},U['boris'][1])
st, nb = req('POST','/collections/notify/records',{'user':U['boris'][0],'email_topics':['challenge','nudge'],'hour':20,'tz':180},U['boris'][1])
check('challenge reminders can be chosen for e-mail, with the time', st == 200 and nb.get('email_topics') == ['challenge','nudge'] and nb.get('hour') == 20)
before = len(mails())
st, r = req('POST','/notify/remind',None,su); time.sleep(2)
cm = [x for x in mails()[before:] if 'boris@t.local' in x['to']]
check('the challenge reminder comes by e-mail with what is not ticked yet', r.get('sent') == 1 and len(cm) == 1 and 'Своя кружка' in cm[0]['html'] and 'Без пакетов' in cm[0]['html'] and 'tab=challenges' in cm[0]['html'] and 'notify/unsub' in cm[0]['unsub'])
st, r = req('POST','/notify/remind',None,su)
check('the same day the reminder is not sent twice', r.get('sent') == 0)
# «hidden»: a member cannot hide himself, the admin can (the article helper is hidden like this)
st, _ = req('PATCH','/collections/users/records/'+U['boris'][0],{'hidden':True},U['boris'][1])
check('a member cannot set «hidden» on himself', st != 200 and req('GET','/collections/users/records/'+U['boris'][0])[1].get('hidden') is False)
st, _ = req('PATCH','/collections/users/records/'+U['boris'][0],{'name':'Борис'},U['boris'][1])
check('a member still can change his name', st == 200)
open(T + '/fails','w').write('\n'.join(fails))
PY
[ -s "$T/fails" ] && { echo "FAILED:"; cat "$T/fails"; tail -20 "$T/log.txt"; exit 1; }
echo "ALL OK"
