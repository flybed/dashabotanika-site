#!/bin/sh
# «Вещи даром» и поиск на большом каталоге: 300, 1000, 5000 и 12000 объявлений.
# Записи кладутся прямо в базу (так быстрее, чем через API), признак «в поиске» пересчитывается /api/seo/reindex.
# Проверяем по заранее известному ответу: карта сайта (одна или оглавление с частями), страницы городов,
# дубли, и замеряем время страниц — оно не должно расти вместе с каталогом.
#   PB=/path/to/pocketbase sh tests/seo_scale_test.sh
set -eu
PB=${PB:-pocketbase}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'kill $(cat "$T/pid" 2>/dev/null) 2>/dev/null || true; rm -rf "$T"' EXIT
"$PB" superuser upsert su@test.local Passw0rd123 --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" > /dev/null 2>&1
"$PB" serve --dir="$T/pb_data" --migrationsDir="$ROOT/pocketbase/pb_migrations" --hooksDir="$ROOT/pocketbase/pb_hooks" --http=127.0.0.1:8095 > "$T/log.txt" 2>&1 & echo $! > "$T/pid"
sleep 5
python3 - "$T/pb_data/data.db" <<'PY' || { echo FAILED; exit 1; }
import json, re, sys, time, sqlite3, statistics, urllib.request as u, urllib.error
B = 'http://127.0.0.1:8095/api'; ORIGIN = 'https://dashabotanika.ru'
db = sqlite3.connect(sys.argv[1], timeout=30)
fails = []
def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok: fails.append(name)
def req(m, p, b=None, t=None):
    r = u.Request(B+p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Content-Type':'application/json', **({'Authorization':t} if t else {})})
    try:
        res = u.urlopen(r, timeout=120); body = res.read().decode()
        try: return res.status, json.loads(body)
        except ValueError: return res.status, body
    except urllib.error.HTTPError as e: return e.code, e.read().decode()
su = req('POST','/collections/_superusers/auth-with-password',{'identity':'su@test.local','password':'Passw0rd123'})[1]['token']
ch = req('GET','/collections/characters/records')[1]['items']
def user(email):
    st, r = req('POST','/collections/users/records',{'email':email,'password':'secret12','passwordConfirm':'secret12','name':'Тест','character':ch[1]['id']})
    return r['id']
SELLER, OTHER = user('a@t.local'), user('b@t.local')   # real accounts: a save through the API checks the seller
def timed(path, n=7):
    ts = []
    for _ in range(n):
        t0 = time.perf_counter(); st, body = req('GET', path); ts.append((time.perf_counter() - t0) * 1000)
    return statistics.median(ts), st, body
page = lambda path: req('GET', '/seo/page?p=' + u.quote(path))
robots = lambda h: (re.search(r'<meta name="robots" content="([^"]*)"', h) or [None, ''])[1]
CITIES = ['Москва', 'Казань', 'Пермь', 'Омск', 'Самара', 'Уфа', 'Тула', 'Сочи', 'Томск', 'Курск']
CATS = ['Детское', 'Одежда и обувь', 'Мебель и дом', 'Книги', 'Кухня и посуда']
want = set()          # ids that must be indexed
reposts = []          # (old, new) — the same thing posted twice by one giver
twins = []            # one giver, same title, different things — both must stay in search
copies = []           # same title and description from another account
n_rows = 0
def ts_(sec): return time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(1759276800 + sec)) + '.000Z'
def rid(i): return ('s%014d' % i)
def add_block(b):
    """20 rows: 14 good, 1 thin, 1 copy from another account, a repost pair, a pair of different things with one title"""
    global n_rows
    city, cat = CITIES[b % len(CITIES)], CATS[b % len(CATS)]
    seller, other = SELLER, OTHER
    rows = []
    base = b * 100000
    def row(j, title, sec, sel=seller, cond='Хорошее', note='', **kw):
        i = b * 20 + j
        rows.append(dict(id=rid(i), seller=sel, kind='Отдам даром', status='active', moderation='approved', title=title, category=cat, city=city,
                         condition=cond, note=note, created=ts_(base + sec), **kw))
        return rid(i)
    for j in range(14):
        note = f'Вещь из блока {b}, номер {j}: целая, чистая, забирать у метро.' if j == 0 else ''
        want.add(row(j, f'{cat} — вещь {b}-{j}', j, note=note))
    row(14, f'Без описания и состояния {b}', 14, cond='')
    copies.append(row(15, f'{cat} — вещь {b}-0', 15 + 86400, sel=other, note=f'Вещь из блока {b}, номер 0: целая, чистая, забирать у метро.'))
    old = row(16, f'Повторное объявление {b}', 16); new = row(17, f'Повторное объявление {b}', 17 + 86400)
    reposts.append((old, new)); want.add(new)
    a = row(18, f'Детские ботинки {b}', 18, cond='Хорошее', note='Размер 28'); c = row(19, f'Детские ботинки {b}', 19, cond='Есть потёртости', note='Размер 31')
    twins.append((a, c)); want.update([a, c])
    db.executemany('INSERT INTO listings (id, seller, kind, status, moderation, title, category, city, condition, note, created) VALUES (:id,:seller,:kind,:status,:moderation,:title,:category,:city,:condition,:note,:created)', rows)
    n_rows += 20
# a small city: 3 good things — its page must stay out of search
db.executemany('INSERT INTO listings (id, seller, kind, status, moderation, title, category, city, condition, created) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [('t%014d' % i, 'w00000000000001', 'Отдам даром', 'active', 'approved', f'Настольная игра {i}', 'Детское', 'Тверь', 'Хорошее', ts_(i)) for i in range(3)])
want.update('t%014d' % i for i in range(3)); n_rows += 3
blocks = 0
def sitemap_ids():
    """all /darom/v/ ids from the sitemap, following the index when there is one; also returns the file list"""
    st, x = req('GET', '/seo/sitemap')
    files = re.findall(r'<sitemap><loc>' + ORIGIN + r'/(sitemap-[a-z0-9-]+\.xml)</loc>', x)
    bodies = [x] if not files else [req('GET', '/seo/sitemap?f=' + f)[1] for f in files]
    ids = [i for body in bodies for i in re.findall(r'/darom/v/([a-z0-9]{15})<', body)]
    cities = [c for body in bodies for c in re.findall(r'<loc>' + ORIGIN + r'/darom/([a-z-]+)</loc>', body)]
    return ids, files, bodies, cities
report = []
for target in [300, 1000, 5000, 12000]:
    while n_rows < target:
        add_block(blocks); blocks += 1
    db.commit()
    t0 = time.perf_counter(); st, r = req('POST', '/seo/reindex', {}, su); t_re = (time.perf_counter() - t0) * 1000
    check(f'[{n_rows}] reindex of the whole catalogue works', st == 200 and r['listings'] == n_rows)
    ids, files, bodies, cities = sitemap_ids()
    check(f'[{n_rows}] sitemap: exactly the indexable things ({len(want)}), no duplicates', len(ids) == len(set(ids)) and set(ids) == want)
    if len(want) <= 5000:
        check(f'[{n_rows}] sitemap: one file while there are ≤5000 things', files == [])
    else:
        check(f'[{n_rows}] sitemap: an index with the pages part and ceil({len(want)}/5000) parts of things', files == ['sitemap-pages.xml'] + [f'sitemap-darom-{i}.xml' for i in range(1, -(-len(want) // 5000) + 1)])
        check(f'[{n_rows}] sitemap: every part ≤5000 addresses and ≤50 MB', all(b.count('<url>') <= 5000 and len(b.encode()) < 50e6 for b in bodies))
        check(f'[{n_rows}] sitemap: a part that does not exist is 404', req('GET', '/seo/sitemap?f=sitemap-darom-%d.xml' % (len(files))).__getitem__(0) == 404)
        check(f'[{n_rows}] sitemap: the pages part has the journal and the sections', any('/zhurnal<' in b for b in bodies))
    check(f'[{n_rows}] sitemap: all 10 big cities, not the small one (3 things)', sorted(cities) == sorted(['moskva','kazan','perm','omsk','samara','ufa','tula','sochi','tomsk','kursk']) and 'tver' not in cities)
    old, new = reposts[-1]; a, c = twins[-1]
    check(f'[{n_rows}] repost by the same giver: only the newest in search', robots(page('/darom/v/' + old)[1]) == 'noindex, follow' and robots(page('/darom/v/' + new)[1]) == '')
    check(f'[{n_rows}] same giver, same title, different things: both in search', robots(page('/darom/v/' + a)[1]) == '' and robots(page('/darom/v/' + c)[1]) == '')
    check(f'[{n_rows}] the same text from another account: not in search', robots(page('/darom/v/' + copies[-1])[1]) == 'noindex, follow')
    check(f'[{n_rows}] small city page: 200 and noindex', page('/darom/tver')[0] == 200 and robots(page('/darom/tver')[1]) == 'noindex, follow')
    t_item, st_i, h = timed('/seo/page?p=/darom/v/' + rid(5))
    check(f'[{n_rows}] thing page: 200, indexed, links to its city', st_i == 200 and robots(h) == '' and '/darom/moskva' in h)
    t_city, st_c, hc = timed('/seo/page?p=/darom/moskva')
    t_darom, st_d, hd = timed('/seo/page?p=/darom')
    shown = len(re.findall(r'<h3><a href="/darom/v/[a-z0-9]{15}"', hd))   # besides the site's own examples (m1, m2…)
    check(f'[{n_rows}] /darom shows the newest 100 things, not the whole catalogue (shown: {shown})', st_d == 200 and shown == 100)
    t_sm, _, _ = timed('/seo/sitemap' + ('?f=sitemap-darom-1.xml' if files else ''), 3)
    # a giver edits a thing: the save also recounts its title group; time the whole request
    t0 = time.perf_counter(); st_p, _ = req('PATCH', '/collections/listings/records/' + old, {'title': f'Повторное объявление {blocks} другое'}, su); t_save = (time.perf_counter() - t0) * 1000
    check(f'[{n_rows}] renamed: no longer a repost — both in search', st_p == 200 and robots(page('/darom/v/' + old)[1]) == '' and robots(page('/darom/v/' + new)[1]) == '')
    want.add(old)
    report.append((n_rows, len(want), t_re, t_item, t_city, t_darom, t_sm, t_save))
print('\nrows | indexable | reindex all, ms | thing page | city page | /darom | sitemap (part 1) | save, ms')
for r in report: print('%5d | %9d | %15.0f | %10.0f | %9.0f | %6.0f | %16.0f | %8.0f' % r)
# pages do not grow with the catalogue: 40x more rows, the thing page stays within a few times (and fast)
check('thing page stays fast at 12000 (< 300 ms) and does not grow with the catalogue', report[-1][3] < 300 and report[-1][3] < 4 * max(report[0][3], 10))
check('saving a thing stays fast at 12000 (< 300 ms)', report[-1][7] < 300)
sys.exit(1 if fails else 0)
PY
echo "ALL OK"
