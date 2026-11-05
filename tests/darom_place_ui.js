// «Отдать вещь»: город и район подставляются сами. Из профиля — если там есть; иначе по местоположению телефона:
// сразу при открытии формы, если сайт уже получил разрешение, или по кнопке «📍 Определить автоматически».
// Сервис карт (OpenStreetMap) здесь подменён ответом-образцом, геопозиция — эмуляцией браузера.
// Нужен сайт + PocketBase с суперпользователем; тест создаёт участника без города в профиле и удаляет его:
//   BASE=http://localhost:8088 SU_EMAIL=... SU_PASS=... node tests/darom_place_ui.js
const { chromium, devices } = require('playwright');
const B = process.env.BASE || 'http://localhost:8088';
const fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
const api = async (m, path, body, t) => { const r = await fetch(B + '/api' + path, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: t } : {}) }, body: body ? JSON.stringify(body) : undefined }); const x = await r.text(); return x ? JSON.parse(x) : {}; };
const OSM = { address: { country: 'Россия', city: 'Москва', city_district: 'Хамовники', suburb: 'Хамовники' } };
(async () => {
  const su = (await api('POST', '/collections/_superusers/auth-with-password', { identity: process.env.SU_EMAIL, password: process.env.SU_PASS })).token;
  const chars = (await api('GET', '/collections/characters/records?perPage=1', null, su)).items;
  const u = await api('POST', '/collections/users/records', { email: 'place-test@test.local', password: 'Passw0rd123', passwordConfirm: 'Passw0rd123', name: 'Место', verified: true, character: (chars[0] || {}).id }, su);
  const b = await chromium.launch();
  const open = async (perm) => {
    const c = await b.newContext({ ...devices['iPhone 13'], geolocation: { latitude: 55.7331, longitude: 37.5847 }, permissions: perm ? ['geolocation'] : [] });
    const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    let asked = 0;
    await p.route('https://nominatim.openstreetmap.org/reverse*', (r) => { asked++; r.fulfill({ contentType: 'application/json', body: JSON.stringify(OSM) }); });
    await p.addInitScript(() => { try { sessionStorage.setItem('db-splash', '1'); localStorage.setItem('db-tour-done', '1'); } catch (e) {} });
    await p.goto(B + '/kabinet', { waitUntil: 'networkidle' });
    await p.fill('input[type=email]', 'place-test@test.local'); await p.fill('input[type=password]', 'Passw0rd123'); await p.keyboard.press('Enter'); await p.waitForTimeout(2500);
    await p.goto(B + '/kabinet?tab=things&do=give#cabinet-tabs', { waitUntil: 'networkidle' }); await p.waitForSelector('#mk-city'); await p.waitForTimeout(1200);
    return { c, p, errs, asked: () => asked };
  };
  try {
    // the site already has the permission: the place fills itself, nothing to press
    { const { c, p, errs, asked } = await open(true);
      const v = await p.evaluate(() => [document.getElementById('mk-city').value, document.getElementById('mk-district').value, document.querySelector('.mk-geo-msg').textContent]);
      check(`permission given before: city and district fill themselves (${v.slice(0, 2).join(', ')}) — «${v[2]}»`, v[0] === 'Москва' && v[1] === 'Хамовники' && v[2].includes('Москва') && asked() === 1 && !errs.length);
      const r = await p.evaluate(() => { const x = document.querySelector('.mk-geo-btn').getBoundingClientRect(); return [x.height, document.documentElement.scrollWidth > innerWidth]; });
      check('the «📍 Определить автоматически» button is ≥ 44 px; no sideways scroll', r[0] >= 44 && !r[1]);
      await p.locator('.mk-place').screenshot({ path: `${process.env.OUT || '/tmp'}/place_auto.png` }).catch(() => {});
      await c.close(); }
    // the button: fields cleared by hand, one tap finds the place again
    { const { c, p, asked } = await open(true);
      await p.fill('#mk-city', ''); await p.fill('#mk-district', '');
      await p.click('.mk-geo-btn'); await p.waitForTimeout(800);
      const v = await p.evaluate(() => [document.getElementById('mk-city').value, document.getElementById('mk-district').value]);
      check(`the button fills city and district (${v.join(', ')})`, v[0] === 'Москва' && v[1] === 'Хамовники' && asked() === 2);
      await c.close(); }
    // the location is not allowed: the form says what to do and stays usable
    { const { c, p, asked } = await open(false);
      const before = await p.evaluate(() => document.getElementById('mk-city').value);
      check('without permission nothing is asked by itself and the fields stay empty', before === '' && asked() === 0);
      await p.click('.mk-geo-btn'); await p.waitForTimeout(800);
      const msg = await p.textContent('.mk-geo-msg');
      check(`denied: a clear hint — «${msg}»`, /Разрешите|вручную/.test(msg) && !(await p.evaluate(() => document.querySelector('.mk-geo-btn').disabled)));
      await p.fill('#mk-city', 'Подольск');
      check('by hand still works', (await p.inputValue('#mk-city')) === 'Подольск');
      await c.close(); }
  } finally {
    await b.close();
    if (u.id) await api('DELETE', '/collections/users/records/' + u.id, null, su);
  }
  console.log(fails.length ? 'FAILED' : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
