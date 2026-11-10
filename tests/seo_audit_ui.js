// Аудит слабых страниц (10.11.2026): тексты «как это устроено» у воздуха, игры и мира; вторая половина справочника
// «Куда сдать»; статья о маркировке перенесена в /markirovka (301); новость об открытии скрыта от поиска; город в
// «Куда сдать» без своих пунктов скрыт от поиска; «Читайте также» — соседние статьи. Страница сервера и сайт — одно и то же.
//   BASE=http://localhost:8088 node tests/seo_audit_ui.js
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8088';
const fails = [];
const check = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails.push(n); };
const ssr = async (path) => (await fetch(B + '/api/seo/page?p=' + encodeURIComponent(path))).text();
(async () => {
  const data = (await (await fetch(B + "/api/collections/content/records?filter=(key='site')")).json()).items[0].data;
  const arts = data.articles || [];
  const slug = (a) => a.slug || String(a.id);
  const sm = await (await fetch(B + '/sitemap.xml')).text();
  const b = await chromium.launch();
  try {
    const c = await b.newContext({ viewport: { width: 412, height: 823 } });
    await c.addInitScript(() => { try { sessionStorage.setItem('db-splash', '1'); localStorage.setItem('db-tour-done', '1'); } catch (e) {} });
    const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route(/mc\.yandex|fonts\.g|open-meteo/, (r) => r.abort());
    const text = async () => (await p.textContent('#app')) || '';
    // sections drawn by the script: the text about how they work, on the page and on the server page
    for (const [u, h2] of [['/vozduh', 'Откуда эти данные'], ['/igra', 'Как играть'], ['/mir', 'Как устроен мир']]) {
      await p.goto(B + u); await p.waitForSelector('#how');
      check(`${u}: «${h2}» on the page and on the server page`, (await text()).includes(h2) && (await ssr(u)).includes(h2));
    }
    // a guide: what happens next and common mistakes
    await p.goto(B + '/sortirovka/steklo'); await p.waitForSelector('#guide');
    const g = await text(), gs = await ssr('/sortirovka/steklo');
    check('glass guide: what happens next and mistakes (page and server)', ['Что происходит дальше', 'Частые ошибки'].every((x) => g.includes(x) && gs.includes(x)));
    if (arts.some((a) => a.id === 'a6zk1okb')) check('glass guide: the journal article on the topic', !!(await p.$('#guide a[href^="/zhurnal/"]')) && gs.includes('Подробно в журнале'));
    // the services page: the guide tiles
    await p.goto(B + '/servisy'); await p.waitForSelector('#services');
    check('/servisy: the guide by kinds of waste (page and server)', !!(await p.$('a.g-tile[href="/sortirovka/steklo"]')) && (await ssr('/servisy')).includes('/sortirovka/steklo'));
    // the marking article lives on /markirovka now
    await p.goto(B + '/markirovka'); await p.waitForSelector('.mark-t');
    const hub = await text(), hs = await ssr('/markirovka');
    check('/markirovka: what is really accepted, no number, FAQ (page and server)', ['Какой пластик действительно сдаётся', 'Что делать, если цифры нет', 'Частые вопросы'].every((x) => hub.includes(x) && hs.includes(x)) && hs.includes('FAQPage'));
    const mark = arts.find((a) => a.id === 'ah338y2n');
    if (mark) {
      for (const u of ['/zhurnal/' + slug(mark), '/zhurnal/ah338y2n']) {
        const r = await fetch(B + u, { redirect: 'manual' });
        check(`${u} → 301 /markirovka`, r.status === 301 && /\/markirovka$/.test(r.headers.get('location') || ''));
      }
      check('the merged article is not in the sitemap', !sm.includes('/zhurnal/' + slug(mark) + '<'));
      await p.goto(B + '/zhurnal'); await p.waitForSelector('.art-link');
      check('journal: the merged article is not listed', !(await p.$(`a[href="/zhurnal/${slug(mark)}"]`)));
    }
    // the opening news: on the site, but not for search engines
    const news = arts.find((a) => a.id === 'a3');
    if (news) {
      const h = await ssr('/zhurnal/' + slug(news));
      check('opening news: noindex and not in the sitemap', h.includes('<meta name="robots" content="noindex, follow">') && !sm.includes('/zhurnal/' + slug(news) + '<'));
    }
    // «read also»: the neighbours in the journal
    const live = arts.filter((a) => a.id !== 'ah338y2n');
    if (live.length >= 5) {
      const it = live[2];
      await p.goto(B + '/zhurnal/' + slug(it)); await p.waitForSelector('.art-more');
      const more = await p.$$eval('.art-more a', (a) => a.map((x) => x.getAttribute('href')));
      const h = await ssr('/zhurnal/' + slug(it));
      check('«read also»: 4 links, the article before and after it (page and server)', more.length === 4 && [live[1], live[3]].every((a) => more.includes('/zhurnal/' + slug(a)) && h.includes('href="/zhurnal/' + slug(a) + '"')));
    }
    // a city in «where to hand in» with few own places: noindex and not in the sitemap
    const svc = (await (await fetch(B + "/api/collections/services/records?perPage=500&filter=(status='approved')")).json()).items || [];
    const per = {}; svc.forEach((x) => { if (x.city && x.city !== 'Вся Россия') per[x.city] = (per[x.city] || 0) + 1; });
    const thin = Object.keys(per).find((x) => per[x] < 3);
    if (thin) {
      const u = (await ssr('/servisy')).match(new RegExp('href="(/kuda-sdat/[a-z0-9-]+)">' + thin + '<'));
      if (u) check(`${u[1]} (${per[thin]} own place): noindex, not in the sitemap`, (await ssr(u[1])).includes('noindex, follow') && !sm.includes(u[1] + '<'));
    }
    check('no script errors ' + errs.join('; '), errs.length === 0);
  } finally { await b.close(); }
  console.log(fails.length ? 'FAILED\n' + fails.join('\n') : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
