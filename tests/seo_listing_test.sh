#!/bin/sh
# Серверная страница вещи /darom/v/<id>: только заполненные поля, честный статус, никаких личных данных.
#   PB=/path/to/pocketbase sh tests/seo_listing_test.sh
set -eu
PB=${PB:-pocketbase}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'kill $(cat "$T/pid" 2>/dev/null) 2>/dev/null || true; rm -rf "$T"' EXIT
"$PB" superuser upsert su@test.local Passw0rd123 --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" > /dev/null 2>&1
"$PB" serve --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" --hooksDir="$ROOT/pocketbase/pb_hooks" --http=127.0.0.1:8095 > "$T/log.txt" 2>&1 & echo $! > "$T/pid"
sleep 5
python3 - <<'PY' || { echo FAILED; exit 1; }
import json, re, html as H, urllib.request as u, urllib.error
B = 'http://127.0.0.1:8095/api'
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
    main = (re.search(r'<main>(.*)</main>', h, re.S) or [None, ''])[1]
    return dict(status=st, html=h, main=main, title=g(r'<title>(.*?)</title>'), desc=g(r'<meta name="description" content="([^"]*)"'),
                h1=g(r'<h1>(.*?)</h1>'), canon=g(r'<link rel="canonical" href="([^"]*)"'), robots=g(r'<meta name="robots" content="([^"]*)"'),
                ld=g(r'<script type="application/ld\+json">(\{"@context":"https://schema.org","@graph":\[\{"@type":"BreadcrumbList".*?)</script>'))
su = req('POST','/collections/_superusers/auth-with-password',{'identity':'su@test.local','password':'Passw0rd123'})[1]['token']
ch = req('GET','/collections/characters/records')[1]['items']
req('POST','/collections/users/records',{'email':'anya.private@t.local','password':'secret12','passwordConfirm':'secret12','name':'Аня Секретова','character':ch[0]['id']})
a = req('POST','/collections/users/auth-with-password',{'identity':'anya.private@t.local','password':'secret12'})[1]
t, uid = a['token'], a['record']['id']
def listing(**kw):
    st, r = req('POST','/collections/listings/records', dict({'seller':uid,'kind':'Отдам даром','status':'active'}, **kw), t)
    assert st == 200, (st, r)
    req('PATCH','/collections/listings/records/'+r['id'], {'moderation':'approved'}, su)
    return r['id']
full = listing(title='Детский велосипед', category='Детское', condition='Хорошее, есть царапины', city='Москва', district='Хамовники',
               pickup='м. Парк культуры, вечером', note='Колёса 16 дюймов, на рост 105–120 см. Отдам вместе с насосом.')
bare = listing(title='Книги о садоводстве', category='Книги')
tula = listing(title='Кастрюля', category='Кухня и посуда', city='Кострома')
res  = listing(title='Санки детские складные', category='Детское', city='Москва', condition='Хорошее')
req('PATCH','/collections/listings/records/'+res, {'status':'reserved'}, t)
lent = listing(title='Дрель', category='Техника', city='Москва', kind='Одолжу', lend_days=7)
req('PATCH','/collections/listings/records/'+lent, {'status':'lent','return_by':'2026-11-20 12:00:00.000Z'}, su)
st, pend = req('POST','/collections/listings/records', {'seller':uid,'kind':'Отдам даром','status':'active','title':'На проверке','category':'Книги'}, t)
st, rej = req('POST','/collections/listings/records', {'seller':uid,'kind':'Отдам даром','status':'active','title':'Отклонённая','category':'Книги'}, t)
req('PATCH','/collections/listings/records/'+rej['id'], {'moderation':'rejected','reason':'Не по правилам'}, su)

p = page('/darom/v/'+full)
check('full: 200, canonical is the item address', p['status'] == 200 and p['canon'] == 'https://dashabotanika.ru/darom/v/'+full)
check('full: title «… бесплатно в Москве — Вещи даром | DashaBotanika»', p['title'] == 'Детский велосипед бесплатно в Москве — Вещи даром | DashaBotanika')
check('full: H1 «Детский велосипед — даром, Москва»', p['h1'] == 'Детский велосипед — даром, Москва')
check('full: description from the fields only', p['desc'].startswith('Детский велосипед, состояние: хорошее, есть царапины. Бесплатно — Москва, Хамовники. Колёса 16 дюймов') and p['desc'].endswith('Связь с дарителем на DashaBotanika.'))
check('full: category, condition, place, pickup, status and date on the page', all(x in p['main'] for x in ['Детское','Хорошее, есть царапины','Москва, Хамовники','м. Парк культуры, вечером','Свободна','Опубликовано']))
check('full: «Хочу забрать» explained, similar things linked', 'Хочу забрать' in p['main'] and '/darom/v/'+res in p['main'])
# город попадает в крошки, только когда его страница индексируется (от 5 вещей) — здесь их меньше
check('full: breadcrumbs Главная › Вещи даром › вещь (the city page is not indexed yet)', '"name":"Вещи даром"' in p['ld'] and '"name":"Детский велосипед"' in p['ld'] and '"name":"Москва"' not in p['ld'])
check('privacy: no e-mail, no giver name, no moderation reason', 'anya.private' not in p['html'] and 'Секретова' not in p['html'] and 'Не по правилам' not in p['html'])
check('privacy: the pickup place is not in title/description', 'Парк культуры' not in p['title'] + p['desc'])
p = page('/darom/v/'+bare)
check('bare: no city, no condition — nothing made up', p['title'] == 'Книги о садоводстве бесплатно — Вещи даром | DashaBotanika' and p['h1'] == 'Книги о садоводстве — даром' and 'Состояние' not in p['main'] and '<dt>Где</dt>' not in p['main'])
check('bare: no «undefined», «null», empty «Передача»', not re.search(r'undefined|null|<dd></dd>', p['main']))
check('bare: no photo → description does not promise one', 'Фото' not in p['desc'] and p['desc'] == 'Книги о садоводстве. Бесплатно. Связь с дарителем на DashaBotanika.')
p = page('/darom/v/'+tula)
check('a city outside the list: «, Кострома» (no wrong case)', p['title'] == 'Кастрюля бесплатно, Кострома — Вещи даром | DashaBotanika')
p = page('/darom/v/'+res)
check('reserved: shown as reserved, not free', 'Забронирована' in p['main'] and 'Свободна' not in p['main'] and 'встать в очередь' in p['main'] and 'Сейчас забронирована' in p['desc'])
p = page('/darom/v/'+lent)
check('lent: «На руках», return date, queue — not free', 'На руках' in p['main'] and 'вернуть должны до' in p['main'] and 'Свободна' not in p['main'] and p['title'].startswith('Дрель на время в Москве'))
check('pending listing: 404 + noindex', page('/darom/v/'+pend['id'])['status'] == 404 and page('/darom/v/'+pend['id'])['robots'] == 'noindex')
check('rejected listing: 404 + noindex', page('/darom/v/'+rej['id'])['status'] == 404)
import sys; sys.exit(1 if fails else 0)
PY
echo "ALL OK"
