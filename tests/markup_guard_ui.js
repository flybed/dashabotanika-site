// Защита от «косяков» разметки: то, что сайт не покажет (таблица без «|---|», «####», HTML-теги, ~~…~~ …),
// 1) сервер не принимает в новом черновике (ответ 400 со строками), правку Даши не останавливает;
// 2) редактор черновика показывает предупреждение со строками, публикация спрашивает подтверждение;
// 3) курсив *так* сайт показывает курсивом (и на странице сервера), «5 * 3» не трогает;
// 4) ни в одной статье сайта нет такой разметки.
// Нужен стенд с сайтом и PocketBase, суперпользователь и админ сайта (как для tests/e2e.js):
//   BASE=http://localhost:8088 SU_EMAIL=... SU_PASS=... ADMIN=w0@test.local ADMIN_PASS=Passw0rd123 node tests/markup_guard_ui.js
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8088';
const SU = [process.env.SU_EMAIL || 'su@test.local', process.env.SU_PASS || 'Passw0rd123'];
const ADMIN = [process.env.ADMIN || 'w0@test.local', process.env.ADMIN_PASS || 'Passw0rd123'];
const fails = [];
const check = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails.push(n); };
const call = async (m, p, b, t) => { const r = await fetch(B + '/api' + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const BAD = 'Подводка.\n\n| Вариант | След |\n| Ёлка | 40 кг |\n\n#### Мелкий заголовок\n\nТекст <b>жирный</b>.';
(async () => {
  const src = fs.readFileSync(path.join(__dirname, '../site/js/app.js'), 'utf8');
  const leftovers = new Function(src.match(/function mdLeftovers\(src\)\{[\s\S]*?\n\}\n/)[0] + '; return mdLeftovers')();
  const t = (await call('POST', '/collections/_superusers/auth-with-password', { identity: SU[0], password: SU[1] })).body.token;
  const adm = (await call('POST', '/collections/users/auth-with-password', { identity: ADMIN[0], password: ADMIN[1] })).body;
  // 4) the articles on the site
  const rec = (await call('GET', "/collections/content/records?filter=(key='site')", null, t)).body.items[0];
  const withBad = (rec.data.articles || []).map((a) => [a.title, leftovers(a.body)]).filter((x) => x[1].length);
  check('no article on the site has marks the site cannot show' + (withBad.length ? ': ' + JSON.stringify(withBad).slice(0, 300) : ''), !withBad.length);
  // 1) the server and a new draft
  const draft = { author: adm.record.id, cat: 'Статья', title: 'Проверка разметки', lead: 'л', body: BAD };
  const r1 = await call('POST', '/collections/drafts/records', draft, t);
  const msg = JSON.stringify(r1.body);
  check('server: a draft with a table without «|---|», «####» and <b> is refused (400) with the lines', r1.status === 400 && msg.includes('|---|') && msg.includes('####') && msg.includes('HTML'));
  const r2 = await call('POST', '/collections/drafts/records', Object.assign({}, draft, { body: 'Подводка.\n\n| Вариант | След |\n|---|---|\n| Ёлка | 40 кг |\n\nКурсив *Eisenia fetida* и _так_.' }), t);
  check('server: a correct draft (table with «|---|», *italic*) is accepted', r2.status === 200);
  const id = r2.body.id;
  // Dasha's own change (not the author) is saved even with a mistake: the editor warns her instead
  const r3 = await call('PATCH', '/collections/drafts/records/' + id, { body: BAD }, t);
  check('server: Dasha\'s save is not stopped', r3.status === 200);
  const b = await chromium.launch();
  try {
    // 2) the draft editor warns
    const c = await b.newContext({ viewport: { width: 390, height: 844 } });
    await c.addInitScript(() => { try { sessionStorage.setItem('db-splash', '1'); localStorage.setItem('db-tour-done', '1'); } catch (e) {} });
    const p = await c.newPage(); p.on('pageerror', (e) => check('no page error: ' + e.message, false));
    await p.route(/mc\.yandex|fonts\.g/, (r) => r.abort());
    await p.goto(B + '/'); await p.evaluate((x) => localStorage.setItem('pocketbase_auth', JSON.stringify({ token: x.token, record: x.record })), adm);
    await p.goto(B + '/kabinet?tab=articles'); await p.waitForSelector('.li.draft', { timeout: 20000 });
    // open it («Читать и править»); once open, the title is inside a field, so the open card is found by its editor
    await p.locator('.li.draft', { hasText: 'Проверка разметки' }).first().locator('button', { hasText: 'Читать и править' }).click();
    const card = p.locator('.li.draft:has(.draft-ed)').first();
    await card.locator('.md-warn').waitFor({ timeout: 10000 });
    const w = await card.locator('.md-warn').innerText();
    check('draft editor: the warning names the lines (table, ####, HTML)', w.includes('Сайт не покажет') && w.includes('|---|') && w.includes('####') && w.includes('HTML'));
    let asked = '';
    p.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
    await card.locator('button', { hasText: 'Опубликовать' }).click(); await p.waitForTimeout(500);
    check('publishing asks first («Опубликовать всё равно?»), and «no» publishes nothing', asked.includes('Опубликовать всё равно') && /\/kabinet/.test(p.url()));
    await c.close();
    // 3) *italic* on the page and on the server page
    const data = JSON.parse(JSON.stringify(rec.data));
    data.articles = [{ id: 'it1', cat: 'Статья', date: '2026-11-17', title: 'Курсив', slug: 'kursiv-proverka', lead: 'л', body: 'Черви *Eisenia fetida* и _курсив_; 5 * 3 = 15.' }].concat(data.articles);
    await call('PATCH', '/collections/content/records/' + rec.id, { data }, t);
    try {
      const ssr = (await (await fetch(B + '/zhurnal/kursiv-proverka')).text()).replace(/<script[\s\S]*?<\/script>/g, '');
      check('server page: *italic* → <em>, «5 * 3» untouched', ssr.includes('<em>Eisenia fetida</em>') && ssr.includes('5 * 3 = 15'));
      const q = await b.newPage(); await q.route(/mc\.yandex|fonts\.g/, (r) => r.abort());
      await q.goto(B + '/zhurnal/kursiv-proverka'); await q.waitForSelector('.art-body em');
      const r = await q.evaluate(() => ({ em: [...document.querySelectorAll('.art-body em')].map((x) => x.textContent), text: document.querySelector('.art-body').innerText }));
      check('page: *italic* and _italic_ are italic, no stars left, «5 * 3» untouched', r.em.includes('Eisenia fetida') && r.em.includes('курсив') && !r.text.includes('*Eisenia') && r.text.includes('5 * 3 = 15'));
    } finally { await call('PATCH', '/collections/content/records/' + rec.id, { data: rec.data }, t); }
  } finally {
    if (id) await call('DELETE', '/collections/drafts/records/' + id, null, t);
    await b.close();
  }
  console.log(fails.length ? 'FAILED\n' + fails.join('\n') : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
