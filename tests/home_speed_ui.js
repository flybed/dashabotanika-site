// Скорость главной на телефоне: анимации «Счастливого мира» не работают, пока его не видно (на слабом телефоне они
// съедали треть процессора), свечение кнопки «Улучшим сайт вместе» — три раза и тишина, картинки берутся
// по их настоящему размеру (кружок с Дашей — лёгкая копия), заставка уходит, как только страница нарисована,
// а затемняющая экран экскурсия сама не открывается.
//   BASE=http://localhost:8088 node tests/speed_ui.js
const { chromium, devices } = require('playwright');
const B = process.env.BASE || 'http://localhost:8088';
const fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
(async () => {
  const b = await chromium.launch();
  // first visit: the splash goes once the page is drawn
  { const c = await b.newContext(devices['Pixel 5']), p = await c.newPage();
    const t0 = Date.now(); await p.goto(B + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#splash', { state: 'detached', timeout: 6000 }).catch(() => {});
    const t = Date.now() - t0;
    check(`first visit: the splash is gone in ${t} ms (it used to stay 2.25 s whatever happened)`, t < 1800);
    await p.waitForTimeout(1800);
    check('no tour starts by itself: nothing dims the screen', !(await p.$('.tour')));
    await c.close(); }
  // the home page, open and idle: what keeps the processor busy
  { const c = await b.newContext(devices['Pixel 5']), p = await c.newPage(); const got = [];
    p.on('response', (r) => { if (/\/img\/|\/api\/files/.test(r.url())) got.push(r.url().replace(B, '')); });
    await p.addInitScript(() => { try { sessionStorage.setItem('db-splash', '1'); } catch (e) {} });
    await p.goto(B + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
    const off = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && (a.effect && a.effect.target && a.effect.target.closest('.world'))).length);
    check(`the world below the screen: none of its animations run (${off})`, off === 0);
    await p.evaluate(() => document.querySelector('.wt-mini').scrollIntoView({ block: 'center' })); await p.waitForTimeout(600);
    const on = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.target && a.effect.target.closest('.world')).length);
    check(`the world on the screen: clouds, waterfall and windmill move (${on})`, on >= 5);
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(600);
    const back = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.target && a.effect.target.closest('.world')).length);
    check(`scrolled away again: the world stops (${back})`, back === 0);
    const wand = await p.evaluate(() => { const a = document.getAnimations().find((x) => x.animationName === 'wand-glow'); return a ? a.effect.getTiming().iterations : null; });
    check(`the wand glows a few times, not forever (${wand})`, wand !== null && wand !== Infinity && wand <= 3);
    const hero = await p.evaluate(() => { const i = document.querySelector('.hero-face img'); return i ? i.currentSrc.replace(location.origin, '') : ''; });
    check(`the small round photo of Dasha takes the light copy (${hero})`, /-480\.webp$/.test(hero) && !got.includes('/img/hero-dasha.webp'));
    const big = got.filter((u) => /\/api\/files\/photos\/[^?]+$/.test(u));
    check(`article covers on the home page are never the full original (${big.length} full files)`, big.length === 0);
    await c.close(); }
  await b.close();
  console.log(fails.length ? 'FAILED' : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
