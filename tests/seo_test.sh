#!/bin/sh
# SEO на сервере: готовые страницы (/api/seo/page) и карта сайта — заголовки, canonical, robots.
#   PB=/path/to/pocketbase sh tests/seo_test.sh
set -eu
PB=${PB:-pocketbase}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'kill $(cat "$T/pid" 2>/dev/null) 2>/dev/null || true; rm -rf "$T"' EXIT
"$PB" superuser upsert su@test.local Passw0rd123 --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" > /dev/null 2>&1
"$PB" serve --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" --hooksDir="$ROOT/pocketbase/pb_hooks" --http=127.0.0.1:8094 > "$T/log.txt" 2>&1 & echo $! > "$T/pid"
sleep 5
python3 - <<'PY' || { echo FAILED; exit 1; }
import json, re, urllib.request as u, urllib.error
B = 'http://127.0.0.1:8094/api'
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
    st, html = req('GET', '/seo/page?p=' + u.quote(path))
    title = re.search(r'<title>(.*?)</title>', html, re.S)
    return st, html, title.group(1) if title else ''
su = req('POST','/collections/_superusers/auth-with-password',{'identity':'su@test.local','password':'Passw0rd123'})[1]['token']
rec = req('GET',"/collections/content/records?filter=(key='site')",t=su)[1]['items'][0]
data = rec['data']
data['articles'] = [
  {'id':'s1','cat':'Статья','date':'2026-10-20','title':'Куда сдать батарейки: как найти пункт приёма в своём городе','seo_title':'Куда сдать батарейки: пункты приёма рядом','seo_desc':'Где принимают батарейки, как их хранить до сдачи и почему их нельзя выбрасывать.','lead':'Подводка','body':'Текст'},
  {'id':'s2','cat':'Статья','date':'2026-10-20','title':'Компост в квартире','lead':'Подводка про компост','body':'Текст'}]
req('PATCH','/collections/content/records/'+rec['id'],{'data':data},su)
# 1. the short search title
st, html, title = page('/zhurnal/kuda-sdat-batareyki-kak-nayti-punkt-priema-v-svoem-gorode')
check('article with seo_title: <title> is the short search title', st == 200 and title == 'Куда сдать батарейки: пункты приёма рядом')
check('… and the description is seo_desc', 'content="Где принимают батарейки, как их хранить до сдачи и почему их нельзя выбрасывать."' in html)
check('… H1 stays the full article title', '<h1>Куда сдать батарейки: как найти пункт приёма в своём городе</h1>' in html)
st, html, title = page('/zhurnal/kompost-v-kvartire')
check('article without seo_title: «title — DashaBotanika»', st == 200 and title == 'Компост в квартире — DashaBotanika')
# 2. /sortirovka: the sorting scheme the site draws is in the server HTML too
st, html, title = page('/sortirovka')
main = html.split('<main>')[1].split('</main>')[0]
check('/sortirovka: «Сортировка за 3 шага» and 8 material cards in server HTML', st == 200 and '<h3>Сортировка за 3 шага</h3>' in main and main.count('<p>Куда сдавать: ') == 8)
# 3. /darom: teaching examples from the content are not listed as things (they have no page — the link was a 404)
st, html, title = page('/darom')
main = html.split('<main>')[1].split('</main>')[0]
check('/darom: no example listing and no link to /darom/v/<example id>', st == 200 and 'Пример объявления' not in main and '/darom/v/m' not in main)
# 4. the page's first data: article texts only on the article's own page (the site script loads the full content itself)
def site_data(html): return json.loads(re.search(r'id="site-data">(.*?)</script>', html, re.S).group(1))
st, html, title = page('/')
d = site_data(html)
check('home: site data is marked _lite and has no article texts', d.get('_lite') is True and d['articles'] and not any(a.get('body') for a in d['articles']))
check('home: articles keep title, lead and slug for the lists', all(a.get('title') and 'lead' in a for a in d['articles']))
st, html, title = page('/zhurnal/kuda-sdat-batareyki-kak-nayti-punkt-priema-v-svoem-gorode')
d = site_data(html)
check('article page: only this article carries its text', [a['id'] for a in d['articles'] if a.get('body')] == ['s1'])
import sys; sys.exit(1 if fails else 0)
PY
echo "ALL OK"
