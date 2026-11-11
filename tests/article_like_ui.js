// Лайк в конце статьи: крупный, сразу после текста — раньше карточки автора, приглашений и «Читайте также»;
// один на странице; гостю показывает приглашение зарегистрироваться прямо под лайком; участник ставит и снимает лайк, счётчик меняется.
//   BASE=http://localhost:8088 USER=w1@test.local PASS=Passw0rd123 SHOT=dir node tests/article_like_ui.js
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8088';
const fails = [];
const check = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails.push(n); };
(async () => {
  const data = (await (await fetch(B + "/api/collections/content/records?filter=(key='site')")).json()).items[0].data;
  const a = data.articles[0], url = B + '/zhurnal/' + (a.slug || a.id);
  const b = await chromium.launch();
  try {
    for (const [w, hgt] of [[390, 844], [1280, 900]]) {
      const c = await b.newContext({ viewport: { width: w, height: hgt } });
      await c.addInitScript(() => { try { sessionStorage.setItem('db-splash', '1'); localStorage.setItem('db-tour-done', '1'); } catch (e) {} });
      const p = await c.newPage(); p.on('pageerror', (e) => check('no page error: ' + e.message, false));
      await p.route(/mc\.yandex|fonts\.g/, (r) => r.abort());
      await p.goto(url); await p.waitForSelector('.art-like .like-big');
      const r = await p.evaluate(() => {
        const like = document.querySelector('.art-like'), end = document.querySelector('.art-end'), rect = like.querySelector('.like-big').getBoundingClientRect();
        const after = (sel) => { const el = document.querySelector(sel); return !el || (like.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) > 0; };
        return { likes: document.querySelectorAll('#article .like').length, right: (end.compareDocumentPosition(like) & Node.DOCUMENT_POSITION_FOLLOWING) > 0 && end.nextElementSibling === like,
          before: ['.art-author', '.art-more', '#article .cm-toggle'].every(after), h: rect.height, w: rect.width, text: like.innerText, over: document.documentElement.scrollWidth > innerWidth };
      });
      check(`[${w}] one like, right after the text, before the author, comments and «read also»`, r.likes === 1 && r.right && r.before);
      check(`[${w}] the like is big and says what it is (${Math.round(r.w)}×${Math.round(r.h)})`, r.h >= 52 && r.w >= 150 && r.text.includes('Понравилась статья?') && r.text.includes('Нравится'));
      check(`[${w}] no horizontal scroll`, !r.over);
      // a guest, after reading (the page has loaded the full article and drawn itself again): an invitation under the like
      await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500);
      await p.click('.like-big'); await p.waitForTimeout(500);
      check(`[${w}] guest: an invitation to join under the like, the reader stays on the article`, new URL(p.url()).pathname.startsWith('/zhurnal/') && await p.isVisible('.art-like-join') && await p.isVisible('.art-like-join button:has-text("Зарегистрироваться")'));
      if (process.env.SHOT) { await p.locator('.art-like').scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -260)); await p.screenshot({ path: `${process.env.SHOT}/like_${w}.png` }); }
      await c.close();
    }
    // a member: like and unlike
    if (process.env.USER && process.env.PASS) {
      const c = await b.newContext({ viewport: { width: 390, height: 844 } });
      await c.addInitScript(() => { try { sessionStorage.setItem('db-splash', '1'); localStorage.setItem('db-tour-done', '1'); } catch (e) {} });
      const p = await c.newPage(); await p.route(/mc\.yandex|fonts\.g/, (r) => r.abort());
      const auth = await (await fetch(B + '/api/collections/users/auth-with-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: process.env.USER, password: process.env.PASS }) })).json();
      await p.goto(B + '/'); await p.evaluate((x) => localStorage.setItem('pocketbase_auth', JSON.stringify({ token: x.token, record: x.record })), auth);
      await p.goto(url); await p.waitForSelector('.like-big'); await p.waitForTimeout(1500);
      const was = await p.getAttribute('.like-big', 'aria-pressed');
      await p.click('.like-big'); await p.waitForTimeout(1200);
      const now = await p.getAttribute('.like-big', 'aria-pressed'), t1 = await p.innerText('.like-big');
      check('member: the like switches (' + was + ' → ' + now + ')', was !== now && (now === 'true' ? t1.includes('Вам понравилось') : t1.includes('Нравится')));
      if (process.env.SHOT && now === 'true') { await p.locator('.art-like').scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -260)); await p.screenshot({ path: `${process.env.SHOT}/like_on_390.png` }); }
      await p.click('.like-big'); await p.waitForTimeout(1200);
      check('member: tapping again returns it', (await p.getAttribute('.like-big', 'aria-pressed')) === was);
      await c.close();
    }
  } finally { await b.close(); }
  console.log(fails.length ? 'FAILED\n' + fails.join('\n') : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
