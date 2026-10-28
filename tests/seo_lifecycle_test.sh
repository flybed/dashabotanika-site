#!/bin/sh
# «Вещи даром» и поиск: какие вещи индексируются, дубли, жизненный цикл (отдана → 30 дней noindex → 410),
# пороги страниц городов, карта сайта, gone_at, IndexNow по событиям вещи и сохранность данных при миграции.
#   PB=/path/to/pocketbase sh tests/seo_lifecycle_test.sh [base-ref]
set -eu
PB=${PB:-pocketbase}
BASE=${1:-origin/main}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'kill $(cat "$T/pid" 2>/dev/null) 2>/dev/null || true; kill $(cat "$T/mock" 2>/dev/null) 2>/dev/null || true; rm -rf "$T"' EXIT
# заглушка IndexNow: запоминает, что пришло
cat > "$T/mock.py" <<'PY'
import http.server, json, sys
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get('content-length') or 0); body = self.rfile.read(n)
        with open(sys.argv[1], 'ab') as f: f.write(body + b'\n')
        self.send_response(200); self.end_headers()
    def log_message(self, *a): pass
http.server.HTTPServer(('127.0.0.1', 8098), H).serve_forever()
PY
python3 "$T/mock.py" "$T/indexnow.log" & echo $! > "$T/mock"
# 1) старая версия: объявления, в том числе уже отданное, — переживут миграцию
git -C "$ROOT" archive "$BASE" pocketbase | tar -x -C "$T"
"$PB" superuser upsert su@test.local Passw0rd123 --dir="$T/pb_data" --migrationsDir="$T/pocketbase/pb_migrations" > /dev/null 2>&1
start() { INDEXNOW_API=http://127.0.0.1:8098/indexnow "$PB" serve --dir="$T/pb_data" --migrationsDir="$1/pb_migrations" --hooksDir="$1/pb_hooks" --http=127.0.0.1:8096 > "$T/log.txt" 2>&1 & echo $! > "$T/pid"; sleep 5; }
start "$T/pocketbase"
python3 - <<'PY'
import json, urllib.request as u
B = 'http://127.0.0.1:8096/api'
def req(m, p, b=None, t=None):
    r = u.Request(B+p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {})})
    return json.loads(u.urlopen(r).read().decode())
su = req('POST','/collections/_superusers/auth-with-password',{'identity':'su@test.local','password':'Passw0rd123'})['token']
ch = req('GET','/collections/characters/records')['items']
req('POST','/collections/users/records',{'email':'old@t.local','password':'secret12','passwordConfirm':'secret12','name':'Олег','character':ch[1]['id']})
t = req('POST','/collections/users/auth-with-password',{'identity':'old@t.local','password':'secret12'})['token']
uid = req('POST','/collections/users/auth-refresh',None,t)['record']['id']
for title, st in [('Старый шкаф, отдан раньше','gone'),('Старый стол, ещё свободен','active')]:
    r = req('POST','/collections/listings/records',{'seller':uid,'kind':'Отдам даром','status':'active','title':title,'category':'Мебель и дом','city':'Пермь','condition':'Хорошее'},t)
    req('PATCH','/collections/listings/records/'+r['id'],{'moderation':'approved'},su)
    if st == 'gone': req('PATCH','/collections/listings/records/'+r['id'],{'status':'gone'},t)
PY
kill "$(cat "$T/pid")"; sleep 1
# 2) новая версия
start "$ROOT/pocketbase"
python3 - "$T/indexnow.log" <<'PY' || { echo FAILED; exit 1; }
import json, re, sys, time, html as H, urllib.request as u, urllib.error
B = 'http://127.0.0.1:8096/api'; LOG = sys.argv[1]
fails = []
def req(m, p, b=None, t=None):
    r = u.Request(B+p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {})})
    try:
        res = u.urlopen(r); body = res.read().decode()
        try: return res.status, json.loads(body)
        except ValueError: return res.status, body
    except urllib.error.HTTPError as e: return e.code, e.read().decode()
def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok: fails.append(name)
def page(path):
    st, h = req('GET', '/seo/page?p=' + u.quote(path))
    g = lambda rx: H.unescape((re.search(rx, h, re.S) or [None, ''])[1])
    return dict(status=st, html=h, title=g(r'<title>(.*?)</title>'), robots=g(r'<meta name="robots" content="([^"]*)"'), main=(re.search(r'<main>(.*)</main>', h, re.S) or [None,''])[1])
sitemap = lambda: req('GET','/seo/sitemap')[1]
su = req('POST','/collections/_superusers/auth-with-password',{'identity':'su@test.local','password':'Passw0rd123'})[1]['token']
old = req('GET','/collections/listings/records?perPage=50&sort=created',None,su)[1]['items']
check('migration kept the listings and their data', len(old) == 2 and {x['title'] for x in old} == {'Старый шкаф, отдан раньше','Старый стол, ещё свободен'} and all(x['moderation']=='approved' for x in old))
gone_old = [x for x in old if x['status']=='gone'][0]
check('migration: an already given-away thing got gone_at (the day of the migration: 30 more days with status, then 410)', gone_old['gone_at'][:10] == time.strftime('%Y-%m-%d', time.gmtime()))
check('migration: a free thing has no gone_at', [x for x in old if x['status']=='active'][0]['gone_at'] == '')
ch = req('GET','/collections/characters/records')[1]['items']
def user(email, name):
    req('POST','/collections/users/records',{'email':email,'password':'secret12','passwordConfirm':'secret12','name':name,'character':ch[1]['id']})
    a = req('POST','/collections/users/auth-with-password',{'identity':email,'password':'secret12'})[1]; return a['token'], a['record']['id']
ta, ua = user('a@t.local','Аня'); tb, ub = user('b@t.local','Борис')
def listing(tok, uid_, **kw):
    st, r = req('POST','/collections/listings/records', dict({'seller':uid_,'kind':'Отдам даром','status':'active'}, **kw), tok)
    assert st == 200, (st, r)
    req('PATCH','/collections/listings/records/'+r['id'], {'moderation':'approved'}, su)
    return r['id']
good = listing(ta, ua, title='Детский велосипед', category='Детское', city='Москва', condition='Хорошее')
withnote = listing(ta, ua, title='Книги о садоводстве', category='Книги', city='Москва', note='Двенадцать книг: огород, теплица, компост, цветы. Отдам все вместе.')
nocity = listing(ta, ua, title='Кастрюля эмалированная', category='Кухня и посуда', condition='Как новая')
empty = listing(ta, ua, title='Отдам', category='Другое', city='Москва', condition='Хорошее')
short = listing(ta, ua, title='Стул', category='Мебель и дом', city='Москва', condition='Хорошее')
thin = listing(ta, ua, title='Настольная лампа', category='Мебель и дом', city='Москва')
dup_old = listing(ta, ua, title='Зимняя куртка детская', category='Одежда и обувь', city='Москва', condition='Хорошее')
time.sleep(1.1)
dup_new = listing(ta, ua, title='Зимняя куртка  детская!', category='Одежда и обувь', city='Москва', condition='Хорошее')
note = 'Пакет детской одежды на 3–4 года: футболки, штаны, свитер, всё чистое.'
copy_first = listing(ta, ua, title='Детская одежда пакетом', category='Одежда и обувь', city='Казань', note=note)
time.sleep(1.1)
copy_other = listing(tb, ub, title='Детская одежда пакетом', category='Одежда и обувь', city='Казань', note=note)
def idx(i): return page('/darom/v/'+i)['robots'] == ''
check('indexed: title, category, city and condition', idx(good))
check('indexed: no photo, no condition, but a description of 40+ characters', idx(withnote))
check('noindex: no city', page('/darom/v/'+nocity)['robots'] == 'noindex, follow')
check('noindex: an empty title («Отдам»)', not idx(empty))
check('noindex: a title shorter than 8 characters', not idx(short))
check('noindex: no photo, no condition, no description', not idx(thin))
check('duplicate of the same giver: only the newest is indexed', not idx(dup_old) and idx(dup_new))
check('same title and description from another account: only the first is indexed', idx(copy_first) and not idx(copy_other))
check('noindex pages are still open to people (200) and in the catalogue', page('/darom/v/'+thin)['status'] == 200 and 'Настольная лампа' in page('/darom')['html'])
check('dupes for moderators: members get 403', req('GET','/darom/dupes',None,ta)[0] == 403)
req('PATCH','/collections/users/records/'+ub,{'role':'moderator'},su)
tb = req('POST','/collections/users/auth-with-password',{'identity':'b@t.local','password':'secret12'})[1]['token']
st, d = req('GET','/darom/dupes',None,tb)
check('dupes for moderators: the copy from another account is listed', st == 200 and [x['id'] for x in d['items']] == [copy_other])
sm = sitemap()
check('sitemap: indexable things are in it', '/darom/v/'+good in sm and '/darom/v/'+withnote in sm and '/darom/v/'+dup_new in sm)
check('sitemap: noindex things are not', not any('/darom/v/'+x in sm for x in [nocity, empty, short, thin, dup_old, copy_other]))
# cities: Москва has 4 indexable things — page works, noindex, not in the sitemap
p = page('/darom/moskva')
check('city with fewer than 5 indexable things: 200, noindex, not in the sitemap', p['status'] == 200 and p['robots'] == 'noindex, follow' and '/darom/moskva<' not in sm)
for t_ in ['Самокат детский складной','Ботинки зимние 32 размер']:
    listing(ta, ua, title=t_, category='Детское', city='Москва', condition='Хорошее')
sm = sitemap(); p = page('/darom/moskva')
check('city with 5 indexable things (and other cities in the catalogue): indexed and in the sitemap', p['robots'] == '' and '/darom/moskva<' in sm)
check('the thing page links to the city only when the city page is indexed', '/darom/moskva' in page('/darom/v/'+good)['main'])
# lifecycle
req('PATCH','/collections/listings/records/'+good, {'status':'gone'}, ta)
st, r = req('GET','/collections/listings/records/'+good, None, su)
check('given away: the server sets gone_at', r['gone_at'] != '')
st, r2 = req('PATCH','/collections/listings/records/'+withnote, {'gone_at':'2020-01-01 00:00:00.000Z'}, ta)
check('the giver cannot set gone_at', st >= 400 or r2.get('gone_at','') == '')
p = page('/darom/v/'+good)
check('given away < 30 days: 200, noindex, «уже отдана», similar free things', p['status'] == 200 and p['robots'] == 'noindex, follow' and 'уже отдана' in p['title'] and 'Похожие вещи' in p['main'] and 'Хочу забрать' not in p['main'])
check('given away: honest state for the page script (no personal data)', '"status":"gone"' in p['html'] and 'a@t.local' not in p['html'] and 'Аня' not in p['main'])
check('given away: out of the sitemap', '/darom/v/'+good not in sitemap())
req('PATCH','/collections/listings/records/'+good, {'gone_at':'2026-01-01 00:00:00.000Z'}, su)
p = page('/darom/v/'+good)
check('given away > 30 days: HTTP 410, same helpful page, no «Хочу забрать»', p['status'] == 410 and 'уже отдана' in p['title'] and 'Похожие вещи' in p['main'] and 'Хочу забрать' not in p['main'])
req('PATCH','/collections/listings/records/'+good, {'status':'active'}, ta)
st, r = req('GET','/collections/listings/records/'+good, None, su)
p = page('/darom/v/'+good)
check('re-opened: gone_at is cleared, the page is a normal indexable thing again', r['gone_at'] == '' and p['status'] == 200 and p['robots'] == '' and 'уже отдана' not in p['title'])
req('PATCH','/collections/listings/records/'+withnote, {'status':'archived'}, su)
p = page('/darom/v/'+withnote)
check('out of date (archive): 200, noindex, «объявление неактуально»', p['status'] == 200 and p['robots'] == 'noindex, follow' and 'неактуально' in p['title'])
req('DELETE','/collections/listings/records/'+thin, None, ta)
check('deleted: 404 as before', page('/darom/v/'+thin)['status'] == 404)
p = page('/darom/v/'+gone_old['id'])
check('given away before the migration: 200 with «уже отдана» for 30 days', p['status'] == 200 and 'уже отдана' in p['title'] and p['robots'] == 'noindex, follow')
# IndexNow: queued on changes, sent by the flush (every 5 minutes; here by hand), publishing never waits for it
st, _ = req('POST','/indexnow/flush',None,su)
sent = open(LOG).read() if __import__('os').path.exists(LOG) else ''
check('IndexNow: thing pages are sent after approval, giving away and deletion', st == 200 and '/darom/v/'+good in sent and '/darom/v/'+thin in sent and '/darom/moskva' in sent)
import sys; sys.exit(1 if fails else 0)
PY
echo "ALL OK"
