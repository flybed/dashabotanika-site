#!/usr/bin/env python3
"""Карта сайта на живом сайте через Caddy (после выкладки):
/sitemap.xml, /sitemap-pages.xml, /sitemap-darom-1.xml — HTTP 200, XML, правильный корневой элемент, все адреса на домене,
ни одного повтора; если /sitemap.xml — оглавление, проверяются все его части. Части вместе дают ровно то же, что и
одна карта. Несуществующая часть — 404 от PocketBase, а не страница сайта.
    python3 tests/sitemap_public_check.py [https://dashabotanika.ru]
"""
import sys, time, urllib.request as u, urllib.error, xml.etree.ElementTree as ET
BASE = (sys.argv[1] if len(sys.argv) > 1 else 'https://dashabotanika.ru').rstrip('/')
NS = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
fails = []
def check(name, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ') + name + (f' — {extra}' if extra and not ok else ''))
    if not ok: fails.append(name)
def get(path):
    for i in range(3):
        try:
            r = u.urlopen(u.Request(BASE + path, headers={'User-Agent': 'sitemap-check'}), timeout=30)
            return r.status, r.headers.get('Content-Type', ''), r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers.get('Content-Type', ''), e.read()
        except Exception as e:
            if i == 2: return 0, '', str(e).encode()
            time.sleep(2)
def sitemap(path):
    st, ct, body = get(path)
    check(f'{path}: HTTP 200', st == 200, f'got {st}')
    check(f'{path}: XML content type', 'xml' in ct, ct)
    try: root = ET.fromstring(body)
    except ET.ParseError as e:
        check(f'{path}: well-formed XML', False, str(e)); return None, []
    check(f'{path}: well-formed XML', True)
    kind = root.tag.replace(NS, '')
    check(f'{path}: root is <urlset> or <sitemapindex>', kind in ('urlset', 'sitemapindex'), root.tag)
    locs = [(el.text or '').strip() for el in root.iter(NS + 'loc')]
    check(f'{path}: every address is on {BASE}', all(l.startswith(BASE + '/') for l in locs))
    dup = sorted({l for l in locs if locs.count(l) > 1})
    check(f'{path}: no duplicate addresses ({len(locs)})', not dup, ', '.join(dup[:5]))
    return kind, locs
kind, locs = sitemap('/sitemap.xml')
if kind == 'sitemapindex':
    parts = [l[len(BASE):] for l in locs]
    check('index: has the pages part and the first part of things', '/sitemap-pages.xml' in parts and '/sitemap-darom-1.xml' in parts)
    all_urls = []
    for p in parts:
        k, l = sitemap(p); all_urls += l
        check(f'{p}: at most 50 000 addresses', len(l) <= 50000)
    dup = sorted({x for x in all_urls if all_urls.count(x) > 1})
    check(f'all parts together: no duplicates ({len(all_urls)} addresses)', not dup, ', '.join(dup[:5]))
    nxt = '/sitemap-darom-%d.xml' % (len(parts))
else:
    all_urls = locs
    _, pages = sitemap('/sitemap-pages.xml')
    _, things = sitemap('/sitemap-darom-1.xml')
    check('pages part has no thing pages, the things part only thing pages', not any('/darom/v/' in x for x in pages) and all('/darom/v/' in x for x in things))
    both = pages + things
    check('the two parts together are exactly /sitemap.xml, without overlap', sorted(both) == sorted(locs) and len(set(both)) == len(both),
          f'only in sitemap.xml: {sorted(set(locs) - set(both))[:3]}, only in parts: {sorted(set(both) - set(locs))[:3]}')
    nxt = '/sitemap-darom-2.xml'
st, ct, body = get(nxt)
check(f'{nxt} (does not exist): 404 from the server, not the site page', st == 404 and b'id="app"' not in body, f'{st} {ct}')
st, ct, body = get('/robots.txt')
check('robots.txt points to /sitemap.xml', st == 200 and (BASE + '/sitemap.xml').encode() in body)
print(f'\naddresses in the sitemap: {len(all_urls)}, of them things: {sum("/darom/v/" in x for x in all_urls)}')
sys.exit(1 if fails else 0)
