#!/bin/sh
# «Вещи даром» (бывшая барахолка): участники только отдают вещи — объявление с продажей, обменом или ценой
# сервер не принимает; старый адрес /baraholka навсегда ведёт на /darom; названия очков роста обновляются
# при переходе со старой версии.
#   PB=/path/to/pocketbase sh tests/darom_test.sh [base-ref]
set -eu
PB=${PB:-pocketbase}
BASE=${1:-origin/main}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'kill $(cat "$T/pid" 2>/dev/null) 2>/dev/null || true; rm -rf "$T"' EXIT
git -C "$ROOT" archive "$BASE" pocketbase | tar -x -C "$T"
start() { "$PB" serve --dir="$T/pb_data" --migrationsDir="$1/pb_migrations" --hooksDir="$1/pb_hooks" --http=127.0.0.1:8093 > "$T/log.txt" 2>&1 & echo $! > "$T/pid"; sleep 5; }
start "$T/pocketbase"
kill "$(cat "$T/pid")"; sleep 1
# хуки читают сайт из site/ рядом с pocketbase/
start "$ROOT/pocketbase"
python3 - <<'PY'
import json, urllib.request as u, urllib.error
B = 'http://127.0.0.1:8093/api'
fails = []
class NoRedirect(u.HTTPRedirectHandler):
    def redirect_request(self, *a): return None
op = u.build_opener(NoRedirect)
def req(m, p, b=None, t=None, headers=None):
    r = u.Request(B+p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {}), **(headers or {})})
    try:
        res = op.open(r); body = res.read().decode()
        try: return res.status, json.loads(body), res.headers
        except ValueError: return res.status, body, res.headers
    except urllib.error.HTTPError as e: return e.code, {}, e.headers
def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok: fails.append(name)
rules = {x['key']: x for x in req('GET','/collections/growth_rules/records?perPage=50')[1]['items']}
check('growth action names speak of giving away, not selling', rules['listing_approved']['title'] == 'Отдать вещь даром' and 'продать' not in rules['deal_done']['title'].lower() and rules['deal_done']['per'] == 'за отданную вещь')
ch = req('GET','/collections/characters/records')[1]['items']
req('POST','/collections/users/records',{'email':'a@t.local','password':'secret12','passwordConfirm':'secret12','name':'Аня','character':ch[0]['id']})
a = req('POST','/collections/users/auth-with-password',{'identity':'a@t.local','password':'secret12'})[1]
t, uid = a['token'], a['record']['id']
base = {'seller':uid, 'title':'Детский велосипед', 'condition':'Хорошее', 'city':'Тула', 'note':'Заберите сами', 'status':'active'}
check('a sale is refused', req('POST','/collections/listings/records', dict(base, kind='Продам', price='1500 ₽'), t)[0] == 400)
check('a swap is refused', req('POST','/collections/listings/records', dict(base, kind='Обмен'), t)[0] == 400)
check('a free thing with a price is refused', req('POST','/collections/listings/records', dict(base, kind='Отдам даром', price='100 ₽'), t)[0] == 400)
st, r, _ = req('POST','/collections/listings/records', dict(base, kind='Отдам даром'), t)
check('a free thing without a price is accepted', st == 200 and r.get('kind') == 'Отдам даром')
st, _, h = req('GET','/seo/page', None, None, {'X-Seo-Path':'/baraholka'})
check('the old address /baraholka moves to /darom for good (301)', st == 301 and h.get('Location') == '/darom')
st, html, _ = req('GET','/seo/page', None, None, {'X-Seo-Path':'/darom'})
body = html.split('<div id="app">')[1].split('</div>\n<script')[0] if '<div id="app">' in html else ''
check('/darom has its own page for search engines', st == 200 and '<h1>Вещи даром</h1>' in body and 'Продам' not in body)
st, xml, _ = req('GET','/seo/sitemap')
check('sitemap lists /darom and not /baraholka', '/darom</loc>' in xml and '/baraholka' not in xml)
print('ALL OK' if not fails else 'FAILED: ' + ', '.join(fails))
raise SystemExit(1 if fails else 0)
PY
