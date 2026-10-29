// Маркировка пластика: заголовок в браузере = серверный, соседние коды, ссылка на статью и раздел, без переполнения.
//   BASE=http://localhost:8088 node tests/markirovka_ui.js
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8088';
const fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
const ssr = async (path) => { const h = await (await fetch(B + '/api/seo/page?p=' + encodeURIComponent(path))).text();
  const un = (s) => (s || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
  return { title: un((h.match(/<title>([\s\S]*?)<\/title>/) || [])[1]), h1: un((h.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1]) }; };
(async () => {
  const b = await chromium.launch();
  try {
    for (const w of [390, 1280]) {
      const c = await b.newContext({ viewport: { width: w, height: 900 } });
      await c.addInitScript(() => { try { sessionStorage.setItem('db-splash', '1'); localStorage.setItem('db-tour-done', '1'); } catch (e) {} });
      const p = await c.newPage(); p.on('pageerror', (e) => check('no page error: ' + e.message, false));
      await p.route(/mc\.yandex|fonts\.g/, (r) => r.abort());
      for (const [path, prev, next] of [['/markirovka/1-pet', null, '2 HDPE'], ['/markirovka/6-ps', '5 PP', '7 OTHER'], ['/markirovka/7-other', '6 PS', null]]) {
        await p.goto(B + path); await p.waitForSelector('.mark-nav'); await p.waitForTimeout(300);
        const s = await ssr(path);
        const r = await p.evaluate(() => ({ title: document.title, h1: document.querySelector('h1').innerText.trim(), nav: document.querySelector('.mark-nav').innerText,
          art: [...document.querySelectorAll('.mark-nav a')].some((a) => a.getAttribute('href').startsWith('/zhurnal/')), over: document.documentElement.scrollWidth > innerWidth,
          small: [...document.querySelectorAll('.mark-nav-row a')].filter((a) => a.offsetHeight < 44).length }));
        const t = `[${w}] ${path}`;
        check(`${t}: title = server title`, r.title === s.title && !/DashaBotanika$/.test(r.title));
        check(`${t}: H1 unchanged and = server H1`, r.h1 === s.h1);
        check(`${t}: neighbours, all codes, the article`, (!prev || r.nav.includes('← ' + prev)) && (!next || r.nav.includes(next + ' →')) && r.nav.includes('Все коды 1–7') && r.art);
        check(`${t}: no overflow, links ≥ 44 px`, !r.over && r.small === 0);
      }
      await p.goto(B + '/markirovka'); await p.waitForSelector('.mark-t'); await p.waitForTimeout(300);
      const s = await ssr('/markirovka');
      check(`[${w}] /markirovka: title = server title`, (await p.title()) === s.title);
      check(`[${w}] /markirovka: links to the article`, await p.evaluate(() => [...document.querySelectorAll('main a')].some((a) => a.getAttribute('href').startsWith('/zhurnal/markirovka'))));
      if (w === 390) await p.goto(B + '/markirovka/6-ps').then(() => p.waitForSelector('.mark-nav')).then(() => p.locator('.mark-nav').screenshot({ path: (process.env.SHOT || '.') + '/mark_nav_390.png' }));
      await c.close();
    }
  } finally { await b.close(); }
  console.log(fails.length ? 'FAILED\n' + fails.join('\n') : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
