// «Вещи даром» на главной: три настоящие доступные вещи (свежие, по возможности из разных категорий), карточка целиком —
// ссылка на страницу вещи, плашка «Бесплатно», город/район только если указан, «Смотреть все вещи →», счётчик от 20 вещей,
// «Отдать вещь» — главная кнопка, гость идёт на регистрацию и возвращается к форме. Телефоны 320/375/390/430 и компьютер.
// Серверный HTML: ссылки на эти же вещи.
// Нужен сайт + PocketBase с ЧИСТОЙ базой (без объявлений) и суперпользователем; тест создаёт вещи и участников и удаляет их:
//   BASE=http://localhost:8088 SU_EMAIL=... SU_PASS=... node tests/darom_home_ui.js
const { chromium, devices } = require('playwright');
const zlib = require('zlib');
const B = process.env.BASE || 'http://localhost:8088';
const fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
const api = async (m, path, body, t) => { const r = await fetch(B + '/api' + path, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: t } : {}) }, body: body ? JSON.stringify(body) : undefined }); const x = await r.text(); return x ? JSON.parse(x) : {}; };
const noIntro = () => { try { sessionStorage.setItem('db-splash', '1'); localStorage.setItem('db-tour-done', '1'); } catch (e) {} };
// a small real JPEG-like picture: a PNG of one colour, made here (the site accepts PNG)
function png(w, h, rgb) {
  const crc = (buf) => { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.concat(Array(w).fill(Buffer.from(rgb)))]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
async function listing(su, f, photo) {
  const fd = new FormData();
  for (const k in f) fd.append(k, f[k]);
  if (photo) fd.append('photo', new Blob([photo], { type: 'image/png' }), 'p.png');
  const r = await fetch(B + '/api/collections/listings/records', { method: 'POST', headers: { authorization: su }, body: fd });
  const x = await r.json(); if (!x.id) console.log('listing not created', JSON.stringify(x).slice(0, 300)); return x;
}
(async () => {
  const su = (await api('POST', '/collections/_superusers/auth-with-password', { identity: process.env.SU_EMAIL, password: process.env.SU_PASS })).token;
  const before = (await api('GET', '/collections/listings/records?perPage=1', null, su)).totalItems;
  if (before) { console.log('This test needs a database without listings (found ' + before + ').'); process.exit(2); }
  const chars = (await api('GET', '/collections/characters/records?perPage=1', null, su)).items;
  const mk = (email, extra) => api('POST', '/collections/users/records', { email, password: 'Passw0rd123', passwordConfirm: 'Passw0rd123', name: 'Даритель', verified: true, character: (chars[0] || {}).id, ...extra }, su);
  const seller = await mk('dh-seller@test.local'), hidden = await mk('dh-hidden@test.local', { hidden: true });
  const made = [];
  const add = async (title, extra, color) => { const x = await listing(su, { seller: seller.id, title, kind: 'Отдам даром', moderation: 'approved', status: 'active', ...extra }, color ? png(400, 300, color) : null); made.push(x.id); return x; };
  // oldest first: the last one created is the freshest
  const A = await add('Детская коляска', { category: 'Детское', city: 'Москва', district: 'Хамовники' }, [200, 120, 90]);
  const Bk = await add('Книги по ботанике', { category: 'Книги', city: 'Москва' }, [90, 140, 200]);
  const C = await add('Ещё книги', { category: 'Книги' }, [120, 200, 120]);
  const D = await add('Шерстяной свитер ручной вязки с оленями и снежинками, почти новый, размер M–L, очень тёплый', { category: 'Одежда и обувь', city: 'Подольск', district: 'Очень длинный район с очень длинным названием' }, [220, 200, 80]);
  await add('Забронированная вещь', { category: 'Мебель и дом', status: 'reserved' }, [100, 100, 100]);
  await add('Выданная на время вещь', { category: 'Техника', status: 'lent' }, [100, 100, 100]);
  await add('Уже отданная вещь', { category: 'Растения', status: 'gone' }, [100, 100, 100]);
  await add('Ждёт проверки', { category: 'Хобби и спорт', moderation: '' }, [100, 100, 100]);
  made.push((await listing(su, { seller: hidden.id, title: 'Вещь скрытого участника', kind: 'Отдам даром', moderation: 'approved', status: 'active', category: 'Для животных' }, png(400, 300, [10, 10, 10]))).id);
  const J = await add('Зимняя куртка', { category: 'Одежда и обувь', city: 'Москва' }, [60, 90, 60]);
  const want = [J.id, C.id, A.id]; // the freshest of each category, freshest first: J (одежда), C (книги), A (детское)
  const b = await chromium.launch();
  try {
    // server HTML for search engines: links to the same three things and to the catalogue
    const html = await (await fetch(B + '/', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' } })).text();
    const ids = [...html.matchAll(/href="\/darom\/v\/([a-z0-9]{15})"/g)].map((m) => m[1]);
    check(`server HTML: links to the three picked things in order (${ids.join(',')}) and «Смотреть все вещи →»`, JSON.stringify(ids) === JSON.stringify(want) && html.includes('<a href="/darom">Смотреть все вещи →</a>'));
    check('server HTML: no counter while fewer than 20 things', !html.includes('новых хозяев'));
    for (const [dev, opts] of [['320', { ...devices['iPhone SE'], viewport: { width: 320, height: 568 } }], ['375', { ...devices['iPhone SE'], viewport: { width: 375, height: 667 } }],
      ['390', devices['iPhone 13']], ['430', { ...devices['iPhone 13'], viewport: { width: 430, height: 932 } }], ['desktop', { viewport: { width: 1366, height: 900 } }]]) {
      const c = await b.newContext(opts), p = await c.newPage(); await p.addInitScript(noIntro);
      const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(B + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
      const box = dev === 'desktop' ? '#darom-spot' : '#darom-strip';
      const m = await p.evaluate((box) => {
        const root = document.querySelector(box), cards = [...root.querySelectorAll('a.hc')];
        const r = (e) => e.getBoundingClientRect();
        return {
          visible: !!root.offsetParent, ids: cards.map((a) => a.getAttribute('href').split('/').pop()),
          free: cards.every((a) => a.querySelector('.hc-free') && a.querySelector('.hc-free').textContent === 'Бесплатно'),
          // the badge is a thin strip in the top corner: at most 15% of the photo, inside it
          badge: cards.every((a) => { const ph = r(a.querySelector('.hc-ph')), bd = r(a.querySelector('.hc-free')); return bd.width * bd.height <= ph.width * ph.height * 0.15 && bd.left >= ph.left && bd.top >= ph.top && bd.right <= ph.right; }),
          sameSize: cards.every((a) => { const x = r(a.querySelector('.hc-ph')), y = r(cards[0].querySelector('.hc-ph')); return Math.abs(x.width - y.width) <= 1 && Math.abs(x.height - y.height) <= 1; }),
          cover: cards.every((a) => { const i = a.querySelector('img'); return i && getComputedStyle(i).objectFit === 'cover'; }),
          // long titles and places are cut neatly (two lines / an ellipsis) and never stick out of the card
          inside: cards.every((a) => [...a.querySelectorAll('.hc-t,.hc-w')].every((t) => r(t).right <= r(a).right + 1 && r(t).left >= r(a).left - 1) && getComputedStyle(a.querySelector('.hc-t')).webkitLineClamp === '2'),
          oneRow: new Set(cards.map((a) => Math.round(r(a).top))).size === 1,
          where: cards.map((a) => (a.querySelector('.hc-w') || {}).textContent || ''),
          all: (() => { const a = root.querySelector('a.hc-all'); return a && a.offsetParent ? a.getAttribute('href') : null; })(),
          count: (() => { const c = root.querySelector('.hc-count'); return c && !c.hidden ? c.textContent : ''; })(),
          give: (() => { const g = [...root.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Отдать вещь'); return g ? { href: g.getAttribute('href'), main: g.classList.contains('btn') && !g.classList.contains('ghost'), h: r(g).height } : null; })(),
          find: (() => { const f = [...root.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Найти вещь'); return f ? { href: f.getAttribute('href'), h: r(f).height } : null; })(),
          hscroll: document.documentElement.scrollWidth > innerWidth,
        };
      }, box);
      check(`${dev}: the block is there; three cards in one row: the freshest of different categories (${m.ids.join(',')})`, m.visible && JSON.stringify(m.ids) === JSON.stringify(want) && m.oneRow);
      check(`${dev}: «Бесплатно» on every photo, in a corner, not covering the photo`, m.free && m.badge);
      check(`${dev}: photos one size, cropped with object-fit: cover`, m.sameSize && m.cover);
      check(`${dev}: titles and places stay inside the cards (long ones are cut neatly); place only when given (${JSON.stringify(m.where)})`, m.inside && m.where[0].includes('Москва') && m.where[1] === '' && m.where[2].includes('Хамовники'));
      check(`${dev}: «Смотреть все вещи →» leads to the catalogue; no counter under 20 things`, m.all === '/darom' && !m.count);
      check(`${dev}: «Отдать вещь» is the main button (guest → sign-up, back to the form), «Найти вещь» second; both ≥ 44 px`,
        !!m.give && m.give.main && m.give.href === '/kabinet?tab=register&next=things' && !!m.find && m.find.href === '/darom' && m.give.h >= 44 && m.find.h >= 44);
      check(`${dev}: no sideways scroll; no script errors`, !m.hscroll && !errs.length);
      if (dev === '390') {
        await p.locator('#darom-strip').screenshot({ path: `${process.env.OUT || '/tmp'}/darom_home_390.png` });
        // a new thing is published while the page is open: the block shows it by itself
        const N = await add('Свежий горшок для цветов', { category: 'Растения', city: 'Москва' }, [150, 90, 60]);
        await p.waitForTimeout(2500);
        const first = await p.evaluate(() => document.querySelector('#darom-strip a.hc').getAttribute('href'));
        check('a new thing appears on the open home page by itself, first', first === '/darom/v/' + N.id);
        await p.click('#darom-strip a.hc'); await p.waitForURL('**/darom/v/' + N.id);
        check('the whole card leads to the thing\'s page', true);
        await api('DELETE', '/collections/listings/records/' + N.id, null, su); made.splice(made.indexOf(N.id), 1);
      }
      if (dev === 'desktop') await p.locator('#darom-spot').screenshot({ path: `${process.env.OUT || '/tmp'}/darom_home_desktop.png` });
      await c.close();
    }
    // a guest gives a thing: sign-in on the way, then the form
    { const c = await b.newContext(devices['iPhone 13']), p = await c.newPage(); await p.addInitScript(noIntro);
      await p.goto(B + '/', { waitUntil: 'networkidle' }); await p.click('#darom-strip a.btn:has-text("Отдать вещь")'); await p.waitForURL('**/kabinet?tab=register&next=things');
      await p.click('[role=tab]:has-text("Вход")'); await p.fill('input[type=email]', 'dh-seller@test.local'); await p.fill('input[type=password]', 'Passw0rd123'); await p.keyboard.press('Enter');
      await p.waitForURL('**/kabinet?tab=things*', { timeout: 10000 }).catch(() => {});
      check('guest → «Отдать вещь» → sign-in → the form to give a thing', /tab=things/.test(p.url()) && /do=give/.test(p.url()));
      await c.close(); }
    // 20 and more things: «Уже N вещей ищут новых хозяев» with the real number
    for (let i = 0; i < 16; i++) await add('Вещь номер ' + (i + 1), { category: 'Другое', city: 'Москва' });
    const total = 5 + 16; // A, B, C, D, J + 16 (reserved, lent, gone, waiting and the hidden member's thing do not count)
    { const c = await b.newContext(devices['iPhone 13']), p = await c.newPage(); await p.addInitScript(noIntro);
      await p.goto(B + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
      const t = await p.evaluate(() => { const c = document.querySelector('#darom-strip .hc-count'); return c && !c.hidden ? c.textContent : ''; });
      check(`20+ things: «${t}»`, t === `Уже ${total} вещь ищет новых хозяев` || t === `Уже ${total} вещи ищут новых хозяев` || t === `Уже ${total} вещей ищут новых хозяев`);
      const html2 = await (await fetch(B + '/')).text();
      check('20+ things: the same line in the server HTML', html2.includes(`Уже ${total} `) && html2.includes('новых хозяев'));
      await c.close(); }
  } finally {
    await b.close();
    for (const id of made) if (id) await api('DELETE', '/collections/listings/records/' + id, null, su);
    for (const u of [seller, hidden]) if (u.id) await api('DELETE', '/collections/users/records/' + u.id, null, su);
  }
  console.log(fails.length ? 'FAILED' : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
