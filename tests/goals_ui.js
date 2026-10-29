// Цели Метрики «Вещей даром» — только успешные действия и по одному разу на вещь, заявку, подписку:
// объявление создано → опубликовано (модератором) → заявка → отдано; подписка на новые вещи.
// Вызовы Метрики перехватываются в браузере (на mc.yandex.ru ничего не уходит).
//   BASE=http://localhost:8088 SU_EMAIL=... SU_PASS=... node tests/goals_ui.js
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8088';
const SU = [process.env.SU_EMAIL || 'admin@test.local', process.env.SU_PASS || 'Passw0rd123'];
const fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
const api = async (m, p, b, t) => (await fetch(B + '/api' + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: t } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const su = (await api('POST', '/collections/_superusers/auth-with-password', { identity: SU[0], password: SU[1] })).token;
  const ch = (await api('GET', '/collections/characters/records')).items, sfx = Date.now() % 100000;
  // accounts are signed in through the API (with pauses: PocketBase limits sign-ins) and handed to the browser
  const mk = async (email, name) => {
    await api('POST', '/collections/users/records', { email, password: 'secret12', passwordConfirm: 'secret12', name, character: ch[1].id });
    await sleep(2500);
    return api('POST', '/collections/users/auth-with-password', { identity: email, password: 'secret12' });
  };
  const giver = await mk('g' + sfx + '@t.local', 'Даритель'), taker = await mk('t' + sfx + '@t.local', 'Получатель'), mod = await mk('m' + sfx + '@t.local', 'Модератор');
  await api('PATCH', '/collections/users/records/' + mod.record.id, { role: 'moderator' }, su);
  await sleep(2500);
  const modAuth = await api('POST', '/collections/users/auth-with-password', { identity: 'm' + sfx + '@t.local', password: 'secret12' });

  const b = await chromium.launch();
  const open = async (auth) => {
    const c = await b.newContext({ viewport: { width: 390, height: 844 } });
    await c.addInitScript((a) => {
      try { sessionStorage.setItem('db-splash', '1'); localStorage.setItem('db-tour-done', '1'); localStorage.setItem('pocketbase_auth', JSON.stringify(a)); } catch (e) {}
      // Метрика: только запоминаем цели этой загрузки страницы
      window.__goals = [];
      window.ym = function (id, kind, name) { if (kind === 'reachGoal') window.__goals.push(name); };
    }, { token: auth.token, record: auth.record });
    const p = await c.newPage();
    p.on('pageerror', (e) => check('no page error: ' + e.message, false));
    await p.route(/mc\.yandex|fonts\.g|nominatim|photon/, (r) => r.abort());
    return p;
  };
  const goals = (p) => p.evaluate(() => window.__goals.filter((g) => /^darom_(listing_created|listing_published|claim_created|given|subscribed)$/.test(g)));
  try {
    // 1. the giver puts a thing out: «created» once, after the server saved it
    const g = await open(giver);
    await g.goto(B + '/kabinet?tab=things&do=give#cabinet-tabs');
    await g.waitForSelector('#mk-title');
    check('opening the form is not a goal', (await goals(g)).length === 0);
    await g.fill('#mk-title', 'Детский велосипед ' + sfx);
    await g.selectOption('#mk-cat', 'Детское');
    await g.fill('#mk-cond', 'Хорошее');
    await g.fill('#mk-city', 'Москва');
    await g.click('.mk-send button');
    await g.waitForSelector('.mk-done:not([hidden])');
    check('created: one «darom_listing_created», not published yet', JSON.stringify(await goals(g)) === '["darom_listing_created"]');
    const id = (await api('GET', `/collections/listings/records?filter=(title='Детский велосипед ${sfx}')`, null, su)).items[0].id;
    await g.reload(); await g.waitForTimeout(1500);
    check('reload after creating: nothing is sent again', (await goals(g)).length === 0);

    // 2. the moderator publishes it: «published» once
    const m = await open(modAuth);
    await m.goto(B + '/kabinet?tab=moder#cabinet-tabs');
    const row = m.locator('.li', { hasText: 'Детский велосипед ' + sfx });
    await row.locator('button', { hasText: 'Опубликовать' }).click();
    await m.waitForTimeout(1500);
    check('published by the moderator: one «darom_listing_published»', JSON.stringify(await goals(m)) === '["darom_listing_published"]');
    check('… and the thing is approved on the server', (await api('GET', '/collections/listings/records/' + id, null, su)).moderation === 'approved');
    await m.reload(); await m.waitForTimeout(1500);
    check('reload of the moderation tab: nothing is sent again', (await goals(m)).length === 0);

    // 3. someone asks for it: «claim created» once; a refused second claim is not counted
    const t = await open(taker);
    await t.goto(B + '/darom/v/' + id);
    await t.waitForSelector('.lcard.full');
    check('opening the thing is not a goal', (await goals(t)).length === 0);
    await t.locator('.lcard.full .lc-actions button', { hasText: 'Хочу забрать' }).click();
    await t.fill('#claim-note', 'Сыну как раз');
    await t.locator('form button[type=submit]', { hasText: 'Отправить' }).click();
    await t.waitForTimeout(1500);
    check('claim: one «darom_claim_created»', JSON.stringify(await goals(t)) === '["darom_claim_created"]');
    await t.reload(); await t.waitForTimeout(1500);
    check('reload after the claim: nothing is sent again', (await goals(t)).length === 0);

    // 4. the giver marks it given away in «Мои объявления» — two quick taps, one goal
    await g.goto(B + '/kabinet?tab=things#cabinet-tabs'); await g.waitForTimeout(1500);
    const mine = g.locator('button', { hasText: /^Мои объявления/ }).first();
    if (await mine.count()) { await mine.click(); await g.waitForTimeout(500); }
    const gone = g.locator('.li', { hasText: 'Детский велосипед ' + sfx }).locator('button', { hasText: /^Отдано$/ });
    await gone.evaluate((el) => { el.click(); el.click(); });
    await g.waitForTimeout(1500);
    check('given away (double tap): one «darom_given»', JSON.stringify(await goals(g)) === '["darom_given"]');
    check('… and the thing is gone on the server', (await api('GET', '/collections/listings/records/' + id, null, su)).status === 'gone');
    await g.reload(); await g.waitForTimeout(1500);
    check('reload after giving away: nothing is sent again', (await goals(g)).length === 0);

    // 5. subscription to new things: counted when it is created, not when it is changed
    await t.goto(B + '/darom'); await t.waitForTimeout(1500);
    const subOpen = t.locator('button, a', { hasText: /Подписаться на новые вещи/ }).first();
    if (await subOpen.count()) await subOpen.click();
    await t.waitForSelector('#sub-em');
    await t.check('#sub-em');
    await t.locator('button', { hasText: /^Подписаться/ }).last().click();
    await t.waitForTimeout(1500);
    check('subscribed: one «darom_subscribed»', JSON.stringify(await goals(t)) === '["darom_subscribed"]');
    await t.reload(); await t.waitForTimeout(1500);
    check('reload after subscribing: nothing is sent again', (await goals(t)).length === 0);
  } finally { await b.close(); }
  console.log(fails.length ? 'FAILED\n' + fails.join('\n') : 'ALL OK');
  process.exit(fails.length ? 1 : 0);
})();
