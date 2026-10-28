#!/bin/sh
# Карта сайта и canonical: в sitemap только живые индексируемые адреса с правильным lastmod,
# canonical у старых адресов и адресов с параметрами — на основной. Проверку адресов делает tests/sitemap_check.py.
#   PB=/path/to/pocketbase sh tests/seo_sitemap_test.sh
set -eu
PB=${PB:-pocketbase}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'kill $(cat "$T/pid" 2>/dev/null) 2>/dev/null || true; rm -rf "$T"' EXIT
"$PB" superuser upsert su@test.local Passw0rd123 --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" > /dev/null 2>&1
"$PB" serve --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" --hooksDir="$ROOT/pocketbase/pb_hooks" --http=127.0.0.1:8097 > "$T/log.txt" 2>&1 & echo $! > "$T/pid"
sleep 5
python3 - <<'PY' || { echo FAILED; exit 1; }
import json, re, time, urllib.request as u, urllib.error
B = 'http://127.0.0.1:8097/api'
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
canon = lambda path: (re.search(r'<link rel="canonical" href="([^"]*)"', req('GET','/seo/page?p='+u.quote(path))[1]) or [None,''])[1]
su = req('POST','/collections/_superusers/auth-with-password',{'identity':'su@test.local','password':'Passw0rd123'})[1]['token']
rec = req('GET',"/collections/content/records?filter=(key='site')",t=su)[1]['items'][0]
data = rec['data']
data['articles'] = [
  {'id':'m1','cat':'Статья','date':'2026-10-20','updated':'2026-10-27','title':'Компост в квартире','slug':'kompost-v-kvartire','old_slugs':['kompost'],'lead':'Подводка','body':'Текст'},
  {'id':'m2','cat':'Статья','date':'2026-10-21','title':'Чем заменить пищевую плёнку','lead':'Подводка','body':'Текст'}]
req('PATCH','/collections/content/records/'+rec['id'],{'data':data},su)
ch = req('GET','/collections/characters/records')[1]['items']
req('POST','/collections/users/records',{'email':'a@t.local','password':'secret12','passwordConfirm':'secret12','name':'Аня','character':ch[1]['id']})
a = req('POST','/collections/users/auth-with-password',{'identity':'a@t.local','password':'secret12'})[1]; t, uid = a['token'], a['record']['id']
def listing(**kw):
    st, r = req('POST','/collections/listings/records', dict({'seller':uid,'kind':'Отдам даром','status':'active','condition':'Хорошее'}, **kw), t)
    req('PATCH','/collections/listings/records/'+r['id'], {'moderation':'approved'}, su); return r['id']
ids = [listing(title='Детская вещь номер %d' % i, category='Детское', city='Пермь') for i in range(5)]
other = listing(title='Книги о садоводстве', category='Книги', city='Тверь')
weak = listing(title='Лампа', category='Другое', city='Пермь')
sm = req('GET','/seo/sitemap')[1]
check('article lastmod is the date of the last change (updated), not of publishing', '<loc>https://dashabotanika.ru/zhurnal/kompost-v-kvartire</loc><lastmod>2026-10-27</lastmod>' in sm)
check('article without updated: lastmod is the publishing date', re.search(r'/zhurnal/chem-zamenit-pischevuyu-plenku</loc><lastmod>2026-10-21</lastmod>', sm) is not None)
today = time.strftime('%Y-%m-%d', time.gmtime())
check('thing lastmod: its publishing day', ('<loc>https://dashabotanika.ru/darom/v/%s</loc><lastmod>%s</lastmod>' % (ids[0], today)) in sm)
check('indexed city with lastmod; a city below 5 things is not in it', ('<loc>https://dashabotanika.ru/darom/perm</loc><lastmod>%s</lastmod>' % today) in sm and '/darom/tver<' not in sm)
check('a noindex thing is not in the sitemap', '/darom/v/'+weak not in sm and '/kabinet' not in sm)
check('canonical: trailing slash → the address without it', canon('/zhurnal/') == 'https://dashabotanika.ru/zhurnal')
import http.client
c = http.client.HTTPConnection('127.0.0.1', 8097); c.request('GET', '/api/seo/page?p=/zhurnal/kompost'); r = c.getresponse()
check('an old article address: permanent redirect (301) to the current one, not a second page', r.status == 301 and r.getheader('Location') == '/zhurnal/kompost-v-kvartire')
check('canonical: filters in the address are not part of it', canon('/darom') == 'https://dashabotanika.ru/darom')

import sys; sys.exit(1 if fails else 0)
PY
# каждый адрес из карты: 200, свой canonical, без noindex, один H1, title, не закрыт robots.txt
python3 "$ROOT/tests/sitemap_check.py" --pb http://127.0.0.1:8097 || { echo FAILED; exit 1; }
# то же, когда карта — оглавление с частями (часть по 3 вещи, чтобы не создавать тысячи)
kill "$(cat "$T/pid")"; sleep 1
SEO_SITEMAP_CHUNK=3 "$PB" serve --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" --hooksDir="$ROOT/pocketbase/pb_hooks" --http=127.0.0.1:8097 > "$T/log.txt" 2>&1 & echo $! > "$T/pid"
sleep 5
python3 - <<'PY' || { echo FAILED; exit 1; }
import re, time, urllib.request as u
B = 'http://127.0.0.1:8097/api/seo/sitemap'
get = lambda q='': u.urlopen(B + q).read().decode()
idx = get()
parts = re.findall(r'<loc>https://dashabotanika.ru/(sitemap-[a-z0-9-]+\.xml)</loc>', idx)
ok = '<sitemapindex' in idx and parts == ['sitemap-pages.xml', 'sitemap-darom-1.xml', 'sitemap-darom-2.xml']
print(('PASS ' if ok else 'FAIL ') + '6 things in search, parts of 3: an index of pages + 2 parts of things')
things = get('?f=sitemap-darom-1.xml') + get('?f=sitemap-darom-2.xml')
today = time.strftime('%Y-%m-%d', time.gmtime())
ok2 = len(re.findall(r'/darom/v/[a-z0-9]{15}</loc><lastmod>' + today + '</lastmod>', things)) == 6
print(('PASS ' if ok2 else 'FAIL ') + 'every thing in the parts keeps its lastmod')
ok3 = re.search(r'/darom/perm</loc><lastmod>' + today, get('?f=sitemap-pages.xml')) is not None
print(('PASS ' if ok3 else 'FAIL ') + 'the city with its lastmod is in the pages part')
raise SystemExit(0 if ok and ok2 and ok3 else 1)
PY
python3 "$ROOT/tests/sitemap_check.py" --pb http://127.0.0.1:8097 || { echo FAILED; exit 1; }
