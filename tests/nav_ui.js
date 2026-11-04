// Меню сайта: шесть направлений с пояснением → подразделы с «‹ Назад», внизу кабинет (или вход) и «О проекте».
// Телефоны 320 / 390 / 430 px и компьютер; гость, участник и админ; доступность (клавиатура, области нажатия 44 px,
// фокус, подписи) и SEO (все ссылки меню есть в серверном HTML обычными <a href>).
// Нужен сайт + PocketBase с суперпользователем; тест создаёт участника и админа nav-*@test.local и удаляет их в конце:
//   BASE=http://localhost:8088 SU_EMAIL=... SU_PASS=... node tests/nav_ui.js
const { chromium, devices } = require('playwright');
const fs = require('fs');
const B = process.env.BASE || 'http://localhost:8088';
const fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
const src = fs.readFileSync(__dirname + '/../site/js/app.js', 'utf8');
const pick = (n) => new Function('return ' + src.match(new RegExp(`const ${n} = (\\[[\\s\\S]*?\\n?\\]);`))[1])();
const GROUPS = pick('NAV_GROUPS'), FOOT = pick('NAV_FOOT');
const ALL = GROUPS.flatMap((g) => g[1]).concat(FOOT).map((x) => x[0]);
const api = async (m, path, body, t) => { const r = await fetch(B + '/api' + path, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: t } : {}) }, body: body ? JSON.stringify(body) : undefined }); const x = await r.text(); return x ? JSON.parse(x) : {}; };
const noIntro = () => { try { sessionStorage.setItem('db-splash', '1'); localStorage.setItem('db-tour-done', '1'); } catch (e) {} };
async function login(p, email) {
  await p.goto(B + '/kabinet', { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', 'Passw0rd123'); await p.keyboard.press('Enter'); await p.waitForTimeout(2500);
}
// what is inside the open panel: sizes, overflow, text that does not fit
const measure = (p) => p.evaluate(() => {
  const m = document.getElementById('site-menu'), b = m.querySelector('.sm-b');
  const targets = [...m.querySelectorAll('a,button')].filter((e) => e.offsetParent);
  const small = targets.filter((e) => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).map((e) => e.textContent.trim().slice(0, 24));
  const cut = [...m.querySelectorAll('b,small')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent);
  const lines = [...m.querySelectorAll('.sm-list:first-of-type small')].map((e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)));
  const pr = m.getBoundingClientRect();
  return { small, cut, lines, hscroll: document.documentElement.scrollWidth > innerWidth || b.scrollWidth > b.clientWidth, inside: pr.left >= 0 && pr.right <= innerWidth + 0.5,
    scrollable: getComputedStyle(b).overflowY === 'auto', over: b.scrollHeight - b.clientHeight };
});
(async () => {
  // SEO: the server HTML (no script) has every menu link, both levels, as an ordinary <a href>
  for (const path of ['/', '/darom', '/zhurnal']) {
    const html = await (await fetch(B + path, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' } })).text();
    const nav = (html.match(/<header class="top">[\s\S]*?<\/header>/) || [''])[0];
    const miss = ALL.filter((href) => !nav.includes(`<a href="${href.replace(/&/g, '&amp;')}">`));
    check(`server HTML ${path}: all ${ALL.length} menu links are plain <a href> (missing: ${miss.join(', ') || 'none'})`, ALL.length >= 20 && !miss.length);
  }
  const su = (await api('POST', '/collections/_superusers/auth-with-password', { identity: process.env.SU_EMAIL, password: process.env.SU_PASS })).token;
  const chars = (await api('GET', '/collections/characters/records?perPage=1', null, su)).items;
  const mk = (email, role) => api('POST', '/collections/users/records', { email, password: 'Passw0rd123', passwordConfirm: 'Passw0rd123', name: role === 'admin' ? 'Админ' : 'Участник', role, verified: true, character: (chars[0] || {}).id }, su);
  const member = await mk('nav-member@test.local', 'member'), admin = await mk('nav-admin@test.local', 'admin');
  const b = await chromium.launch();
  try {
    // phones, a guest
    for (const w of [320, 390, 430]) {
      const c = await b.newContext({ ...devices['iPhone 13'], viewport: { width: w, height: w === 320 ? 568 : 844 } }), p = await c.newPage();
      const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await p.addInitScript(noIntro);
      await p.goto(B + '/sortirovka', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
      await p.evaluate(() => window.scrollTo(0, 700)); await p.waitForTimeout(200);
      check(`${w}px: the menu is closed, the burger says what it controls`, await p.isHidden('#site-menu') && (await p.getAttribute('.burger', 'aria-controls')) === 'site-menu' && (await p.getAttribute('.burger', 'aria-expanded')) === 'false');
      await p.tap('.burger'); await p.waitForTimeout(300);
      // where the page was when the menu opened (a tap may first scroll the burger into view)
      const yOpen = await p.evaluate(() => -parseInt(document.body.style.top || '0', 10));
      const m1 = await measure(p);
      const l1 = await p.evaluate(() => ({ dirs: [...document.querySelectorAll('#site-menu .sm-list:first-of-type > li')].map((li) => li.textContent.replace(/›/g, '').trim()),
        foot: document.querySelector('#site-menu .sm-acc').textContent, focus: document.activeElement.classList.contains('sm-x'), expanded: document.querySelector('.burger').getAttribute('aria-expanded'),
        locked: getComputedStyle(document.body).position === 'fixed' }));
      check(`${w}px level 1: six directions with a short line each, «Войти или зарегистрироваться», «О проекте»`, l1.dirs.length === 6 && l1.dirs.every((t) => t.length > 12) && l1.foot.includes('Войти') && (await p.locator('#site-menu a[href="/o-proekte"]').count()) === 1);
      check(`${w}px level 1: focus on «✕», the page behind is locked`, l1.focus && l1.expanded === 'true' && l1.locked);
      check(`${w}px level 1: every tap target ≥ 44 px, no text cut, no sideways scroll, the panel is on screen (${JSON.stringify(m1.small)})`, !m1.small.length && !m1.cut.length && !m1.hscroll && m1.inside);
      check(`${w}px level 1: lines under directions ${JSON.stringify(m1.lines)} — one line${w === 320 ? ' (two allowed at 320 px)' : ''}; the panel scrolls inside if needed (${m1.over}px)`, m1.lines.every((n) => n <= (w === 320 ? 2 : 1)) && m1.scrollable);
      if (w === 390) await p.screenshot({ path: `${process.env.OUT || '/tmp'}/nav_l1_${w}.png` });
      await p.tap('#site-menu button:has-text("Экология")'); await p.waitForTimeout(200);
      const m2 = await measure(p);
      const l2 = await p.evaluate(() => ({ title: document.querySelector('#site-menu h2').textContent, links: [...document.querySelectorAll('#site-menu .sm-s')].map((a) => [a.getAttribute('href'), a.querySelector('small') ? a.querySelector('small').textContent : '']), back: !!document.querySelector('#site-menu .sm-back') }));
      check(`${w}px level 2 «Экология»: «‹ Назад», title, 5 sections each with a short line, «Маркировка пластика» among them`, l2.back && l2.title.includes('Экология') && l2.links.length === 5 && l2.links.every((x) => x[1]) && l2.links.some((x) => x[0] === '/markirovka'));
      check(`${w}px level 2: a guest goes to sign-up for the challenges and comes back to them`, l2.links.some((x) => x[0] === '/kabinet?tab=register&next=challenges' && x[1].includes('после входа')));
      check(`${w}px level 2: tap targets ≥ 44 px, no text cut, no sideways scroll`, !m2.small.length && !m2.cut.length && !m2.hscroll);
      await p.tap('#site-menu .sm-back'); await p.waitForTimeout(150);
      check(`${w}px «‹ Назад» returns to the directions, focus on «Экология»`, (await p.evaluate(() => document.activeElement.textContent)).includes('Экология') && (await p.locator('#site-menu .sm-list:first-of-type > li').count()) === 6);
      await p.tap('.sm-shade', { position: { x: 5, y: 300 } }); await p.waitForTimeout(200);
      const y1 = await p.evaluate(() => window.scrollY);
      check(`${w}px a tap outside closes the menu; the page is back where it was (${yOpen} → ${y1})`, await p.isHidden('#site-menu') && yOpen > 100 && y1 === yOpen && (await p.evaluate(() => getComputedStyle(document.body).position)) !== 'fixed');
      await p.tap('.burger'); await p.tap('#site-menu button:has-text("Вещи даром")'); await p.waitForTimeout(150);
      check(`${w}px «Вещи даром»: find, give (a guest signs up first), how it works, all things`,
        (await p.locator('#site-menu a[href="/darom#darom-catalog"]').count()) === 1 && (await p.locator('#site-menu a[href="/kabinet?tab=register&next=things"]').count()) === 1 &&
        (await p.locator('#site-menu a[href="/darom#darom-how"]').count()) === 1 && (await p.locator('#site-menu a[href="/darom"]').count()) === 1);
      await p.tap('#site-menu a[href="/darom#darom-how"]'); await p.waitForURL('**/darom#darom-how'); await p.waitForTimeout(800);
      const how = await p.evaluate(() => { const e = document.getElementById('darom-how'); return e ? e.getBoundingClientRect().top : null; });
      check(`${w}px a link closes the menu and opens the place: «Как это работает» on /darom is on screen`, await p.isHidden('#site-menu') && how !== null && how > -50 && how < 400);
      await p.tap('.burger'); await p.keyboard.press('Escape'); await p.waitForTimeout(150);
      check(`${w}px Esc closes the menu, focus back on the burger`, await p.isHidden('#site-menu') && await p.evaluate(() => document.activeElement.classList.contains('burger')));
      await p.tap('.burger'); await p.tap('#site-menu .sm-x'); await p.waitForTimeout(150);
      check(`${w}px «✕» closes the menu; no script errors`, await p.isHidden('#site-menu') && !errs.length);
      await c.close();
    }
    // a guest goes to the challenges from the menu, signs in — and lands on the challenges
    {
      const c = await b.newContext(devices['iPhone 13']), p = await c.newPage(); await p.addInitScript(noIntro);
      await p.goto(B + '/', { waitUntil: 'networkidle' });
      await p.tap('.burger'); await p.tap('#site-menu button:has-text("Экология")'); await p.tap('#site-menu a:has-text("Эко-челленджи")');
      await p.waitForURL('**/kabinet?tab=register&next=challenges'); await p.waitForTimeout(800);
      await p.click('[role=tab]:has-text("Вход")'); await p.fill('input[type=email]', 'nav-member@test.local'); await p.fill('input[type=password]', 'Passw0rd123'); await p.keyboard.press('Enter');
      await p.waitForURL('**/kabinet?tab=challenges*', { timeout: 10000 }).catch(() => {});
      check('guest → «Эко-челленджи» → sign-in → back on the challenges', /tab=challenges/.test(p.url()) && !/register/.test(p.url()));
      await c.close();
    }
    // a member on a phone: «Личный кабинет» instead of «Войти», direct links to the cabinet, no admin tools or sign-out in the menu
    {
      const c = await b.newContext(devices['iPhone 13']), p = await c.newPage(); await p.addInitScript(noIntro);
      await login(p, 'nav-member@test.local'); await p.goto(B + '/', { waitUntil: 'networkidle' });
      await p.tap('.burger'); await p.waitForTimeout(200);
      const t = await p.textContent('#site-menu');
      check('member: «Личный кабинет» instead of «Войти», no «Выйти» or «Редактировать сайт» in the menu', t.includes('Личный кабинет') && !t.includes('Войти') && !t.includes('Выйти') && !t.includes('Редактировать'));
      await p.tap('#site-menu button:has-text("Вещи даром")');
      check('member: «Отдать вещь» opens the form in the cabinet right away', (await p.locator('#site-menu a[href="/kabinet?tab=things&do=give#cabinet-tabs"]').count()) === 1);
      await p.goto(B + '/kabinet', { waitUntil: 'networkidle' });
      check('member: sign-out is in the cabinet', await p.isVisible('.cab-logout'));
      await c.close();
    }
    // desktop, an admin: the same panel by mouse and keyboard; «Редактировать сайт» in the cabinet opens the page you came from
    {
      const c = await b.newContext({ viewport: { width: 1366, height: 860 } }), p = await c.newPage(); await p.addInitScript(noIntro);
      const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await login(p, 'nav-admin@test.local');
      await p.goto(B + '/moda', { waitUntil: 'networkidle' });
      await p.click('.burger'); await p.waitForTimeout(500);
      const d = await p.evaluate(() => { const r = document.getElementById('site-menu').getBoundingClientRect(); return { w: r.width, right: innerWidth - r.right }; });
      check(`desktop: the panel on the right, ${d.w} px wide, ${d.right} px from the edge`, d.w > 300 && d.w <= 380 && Math.abs(d.right) < 1);
      check('desktop: the current direction is marked («Дом и стиль» on /moda)', await p.evaluate(() => [...document.querySelectorAll('#site-menu .sm-r.cur')].map((e) => e.textContent).join().includes('Дом и стиль')));
      // keyboard only: Tab moves inside the panel and never leaves it, Enter opens a direction, Esc closes
      let out = false; for (let i = 0; i < 14; i++) { await p.keyboard.press('Tab'); if (!(await p.evaluate(() => !!document.activeElement.closest('#site-menu')))) out = true; }
      check('keyboard: Tab stays inside the open menu', !out);
      await p.focus('#site-menu button:has-text("Еда и рецепты")'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
      check('keyboard: Enter opens «Еда и рецепты» with «Эко-кафе» and «Помощник по фото»', (await p.locator('#site-menu a[href="/eda#cafes"]').count()) === 1 && (await p.locator('#site-menu a[href="/eda#helper"]').count()) === 1);
      await p.keyboard.press('Escape');
      const t = (await p.click('.burger'), await p.textContent('#site-menu'));
      check('admin: no «Редактировать сайт» and no «Выйти» in the menu', !t.includes('Редактировать') && !t.includes('Выйти'));
      await p.keyboard.press('Escape');
      await p.goto(B + '/kabinet', { waitUntil: 'networkidle' });
      await p.click('button:has-text("Редактировать сайт")'); await p.waitForTimeout(800);
      check('admin: «✏️ Редактировать сайт» in the cabinet opens editing on the page they came from (/moda)', new URL(p.url()).pathname === '/moda' && await p.evaluate(() => document.body.classList.contains('editing')));
      check('desktop: no script errors', !errs.length);
      await c.close();
    }
  } finally {
    await b.close();
    for (const u of [member, admin]) if (u.id) await api('DELETE', '/collections/users/records/' + u.id, null, su);
  }
  console.log(fails.length ? 'FAILED' : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
