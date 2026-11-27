// «Вещи даром»: объявление живёт месяц (решение владельца 27.11.2026, было 14 дней).
// Форма «Отдать вещь» по умолчанию — «месяц»; «Продлить на месяц» и «Вернуть в ленту» ставят срок на 30 дней вперёд.
// Нужен стенд с сайтом и PocketBase, суперпользователь и участник (как для tests/e2e.js):
//   BASE=http://localhost:8088 SU_EMAIL=... SU_PASS=... USER=w1@test.local PASS=Passw0rd123 node tests/darom_term_ui.js
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8088';
const SU = [process.env.SU_EMAIL || 'su@test.local', process.env.SU_PASS || 'Passw0rd123'];
const U = [process.env.USER || 'w1@test.local', process.env.PASS || 'Passw0rd123'];
const fails = [];
const check = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails.push(n); };
const call = async (m, p, b, t) => (await fetch(B + '/api' + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: t } : {}) }, body: b ? JSON.stringify(b) : undefined })).json().catch(() => ({}));
const daysLeft = (u) => (Date.parse(String(u).replace(' ', 'T')) - Date.now()) / 86400000;
const soon = new Date(Date.now() + 2 * 86400000).toISOString().replace('T', ' ');
(async () => {
  const su = (await call('POST', '/collections/_superusers/auth-with-password', { identity: SU[0], password: SU[1] })).token;
  const me = await call('POST', '/collections/users/auth-with-password', { identity: U[0], password: U[1] });
  const mk = async (title, status) => call('POST', '/collections/listings/records', { seller: me.record.id, title, kind: 'Отдам даром', city: 'Москва', category: 'Одежда и обувь', status, moderation: 'approved', until: soon }, su);
  const a = await mk('Проверка срока: продлить', 'active'), z = await mk('Проверка срока: из архива', 'archived');
  const b = await chromium.launch();
  try {
    const c = await b.newContext({ viewport: { width: 390, height: 844 } });
    await c.addInitScript(() => { try { sessionStorage.setItem('db-splash', '1'); localStorage.setItem('db-tour-done', '1'); } catch (e) {} });
    const p = await c.newPage(); p.on('pageerror', (e) => check('no page error: ' + e.message, false));
    await p.route(/mc\.yandex|fonts\.g/, (r) => r.abort());
    await p.goto(B + '/'); await p.evaluate((x) => localStorage.setItem('pocketbase_auth', JSON.stringify({ token: x.token, record: x.record })), me);
    // the form: «месяц» is chosen by default
    await p.goto(B + '/kabinet?tab=things&do=give#cabinet-tabs'); await p.waitForSelector('#mk-days', { state: 'attached', timeout: 20000 });
    const sel = await p.$eval('#mk-days', (s) => ({ v: s.value, t: s.options[s.selectedIndex].text }));
    check('form «Отдать вещь»: the term is a month by default (' + sel.t + ')', sel.v === '30' && sel.t === 'месяц');
    // «Продлить на месяц»
    await p.goto(B + '/kabinet?tab=things#cabinet-tabs');
    const card = p.locator('.li', { hasText: 'Проверка срока: продлить' }).first();
    await card.locator('button', { hasText: 'Продлить на месяц' }).click(); await p.waitForTimeout(1500);
    const ua = (await call('GET', '/collections/listings/records/' + a.id, null, su)).until;
    check('«Продлить на месяц»: 30 days ahead (' + daysLeft(ua).toFixed(1) + ')', daysLeft(ua) > 29.5 && daysLeft(ua) < 30.5);
    // «Вернуть в ленту» from the archive
    const zc = p.locator('.li', { hasText: 'Проверка срока: из архива' }).first();
    await zc.locator('button', { hasText: 'Вернуть в ленту' }).click(); await p.waitForTimeout(1500);
    const rz = await call('GET', '/collections/listings/records/' + z.id, null, su);
    check('«Вернуть в ленту»: active again, 30 days ahead (' + daysLeft(rz.until).toFixed(1) + ')', rz.status === 'active' && daysLeft(rz.until) > 29.5 && daysLeft(rz.until) < 30.5);
    check('no button says «2 недели»', !(await p.locator('text=2 недели').count()) || (await p.locator('#mk-days').count()) > 0);
    await c.close();
  } finally {
    for (const x of [a, z]) if (x && x.id) await call('DELETE', '/collections/listings/records/' + x.id, null, su);
    await b.close();
  }
  console.log(fails.length ? 'FAILED\n' + fails.join('\n') : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
