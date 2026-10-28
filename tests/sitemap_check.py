#!/usr/bin/env python3
"""Проверка карты сайта: в ней только живые индексируемые адреса.

Каждый адрес из sitemap отвечает 200, его canonical — он сам, нет <meta name="robots" content="noindex">,
есть ровно один H1 и непустой title; адреса не повторяются, lastmod — дата ГГГГ-ММ-ДД; robots.txt не закрывает
ни одного адреса из карты и ссылается на неё.

  python3 tests/sitemap_check.py https://dashabotanika.ru      # живой сайт
  python3 tests/sitemap_check.py --pb http://127.0.0.1:8094     # локальный PocketBase (страницы через /api/seo/page)
"""
import re, sys, os, time, subprocess, urllib.parse as up

ORIGIN = 'https://dashabotanika.ru'
UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

def fetch(url):
    # curl: повторы при обрывах сети и код ответа без исключений
    for _ in range(4):
        r = subprocess.run(['curl', '-s', '--retry', '3', '-A', UA, '-w', '\n%{http_code}', url], capture_output=True)
        if r.returncode == 0: break
        time.sleep(2)
    body, _, code = r.stdout.decode('utf-8', 'replace').rpartition('\n')
    return int(code or 0), body

def main(argv):
    local = argv[:1] == ['--pb']
    base = (argv[1] if local else (argv[0] if argv else ORIGIN)).rstrip('/')
    sm_url = base + ('/api/seo/sitemap' if local else '/sitemap.xml')
    page_url = (lambda path: base + '/api/seo/page?p=' + up.quote(path)) if local else (lambda path: base + path)
    fails = []
    def check(name, ok):
        if not ok: fails.append(name); print('FAIL ' + name)
    st, xml = fetch(sm_url)
    check('sitemap answers 200', st == 200)
    locs = re.findall(r'<loc>([^<]+)</loc>', xml)
    mods = re.findall(r'<lastmod>([^<]+)</lastmod>', xml)
    check('sitemap is not empty', len(locs) > 0)
    check('no repeated addresses', len(locs) == len(set(locs)))
    check('every address is on ' + ORIGIN, all(l.startswith(ORIGIN + '/') or l == ORIGIN + '/' for l in locs))
    check('lastmod is a date YYYY-MM-DD', all(re.fullmatch(r'\d{4}-\d\d-\d\d', m) for m in mods))
    if local:
        robots = open(os.path.join(os.path.dirname(__file__), '..', 'site', 'robots.txt'), encoding='utf-8').read()
    else:
        robots = fetch(base + '/robots.txt')[1]
    check('robots.txt points to the sitemap', 'Sitemap: ' + ORIGIN + '/sitemap.xml' in robots)
    dis = [l.split(':', 1)[1].strip() for l in robots.splitlines() if l.lower().startswith('disallow:') and l.split(':', 1)[1].strip()]
    for loc in locs:
        path = loc[len(ORIGIN):] or '/'
        blocked = [d for d in dis if path.startswith(d)]
        st, html = fetch(page_url(path))
        canon = (re.search(r'<link rel="canonical" href="([^"]*)"', html) or [None, ''])[1]
        noindex = re.search(r'<meta name="robots" content="[^"]*noindex', html)
        h1 = len(re.findall(r'<h1[\s>]', html)); title = (re.search(r'<title>(.*?)</title>', html, re.S) or [None, ''])[1].strip()
        problems = [x for x, bad in [('status %d' % st, st != 200), ('canonical ' + canon, canon != loc), ('noindex', bool(noindex)),
                                     ('%d h1' % h1, h1 != 1), ('empty title', not title), ('robots.txt: ' + ','.join(blocked), bool(blocked))] if bad]
        check(path + ': ' + '; '.join(problems), not problems)
        if not local: time.sleep(0.2)
    print('%d addresses checked' % len(locs))
    print('FAILED' if fails else 'ALL OK')
    return 1 if fails else 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
