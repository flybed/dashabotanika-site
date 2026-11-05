// Редактор статей: Даша видит статью как на сайте, без значков ** ## >, а сохраняется та же разметка.
// 1) Каждая статья сайта после «открыть в редакторе → сохранить» выглядит так же, как до (сравниваем готовую вёрстку).
// 2) Кнопки работают: заголовок, жирный, список, совет, разделитель, ссылка, и в тексте нет значков разметки.
// Нужен сайт + PocketBase со статьями и суперпользователем; тест создаёт админа editor-test@test.local и черновик и удаляет их в конце:
//   BASE=http://localhost:8088 SU_EMAIL=... SU_PASS=... node tests/editor_ui.js
const { chromium } = require('playwright');
const fs = require('fs');
const B = process.env.BASE || 'http://localhost:8088';
const fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
const src = fs.readFileSync(__dirname + '/../site/js/app.js', 'utf8');
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
// the converters and the article renderer are plain functions inside app.js: take them as they are
const code = 'const MD_LINK = /^(https?:\\/\\/|\\/)[^\\s()]+$/;\n' + cut('const VE_BULLET', 'function mdTools(') + '\nwindow.VE = {veFromMd, veToMd};';
(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  await p.goto(B + '/o-proekte', { waitUntil: 'networkidle' });
  const site = await (await fetch(B + "/api/collections/content/records?filter=(key='site')")).json();
  const arts = ((site.items[0] || {}).data || {}).articles || [];
  await p.addScriptTag({ content: code });
  const bad = await p.evaluate((arts) => {
    const out = [];
    // what an article looks like: block kinds and their text, with the marks rendered by the same rules
    const norm = (md) => { const ed = document.createElement('div'); ed.innerHTML = VE.veFromMd(md);
      return [...ed.children].map((n) => n.tagName + (n.dataset.md || n.dataset.src || '') + '|' + n.innerHTML.replace(/<button[^>]*>.*?<\/button>/g, '').replace(/\s+/g, ' ').trim()).join('\n'); };
    for (const a of arts) {
      const body = a.body || ''; if (!body.trim()) continue;
      const ed = document.createElement('div'); ed.innerHTML = VE.veFromMd(body);
      const back = VE.veToMd(ed);
      if (norm(back) !== norm(body)) { const x = norm(body).split('\n'), y = norm(back).split('\n'); const i = x.findIndex((l, k) => l !== y[k]); out.push([a.title, x[i], y[i]]); }
      // a second round changes nothing at all
      const ed2 = document.createElement('div'); ed2.innerHTML = VE.veFromMd(back);
      if (VE.veToMd(ed2) !== back) out.push([a.title, 'second round differs', '']);
    }
    return out;
  }, arts);
  bad.slice(0, 5).forEach((x) => console.log('  ', x[0], '\n     before:', x[1], '\n     after: ', x[2]));
  check(`all ${arts.length} articles: open in the editor and save — the article looks the same`, arts.length > 0 && bad.length === 0);

  // the buttons, as Dasha uses them: a draft from the helper, opened in the cabinet
  const api = async (m, path, body, t) => { const r = await fetch(B + '/api' + path, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: t } : {}) }, body: body ? JSON.stringify(body) : undefined }); const x = await r.text(); return x ? JSON.parse(x) : {}; };
  const su = (await api('POST', '/collections/_superusers/auth-with-password', { identity: process.env.SU_EMAIL, password: process.env.SU_PASS })).token;
  const chars = (await api('GET', '/collections/characters/records?perPage=1', null, su)).items;
  const admin = await api('POST', '/collections/users/records', { email: 'editor-test@test.local', password: 'Passw0rd123', passwordConfirm: 'Passw0rd123', name: 'Редактор', role: 'admin', verified: true, character: (chars[0] || {}).id }, su);
  const draft = await api('POST', '/collections/drafts/records', { author: admin.id, cat: 'Статья', title: 'Автотест редактора', lead: 'Тест',
    body: 'Кофе с собой — это **одноразовый стакан**.\n\n## Как попросить\n\n- Кружка чистая\n- С крышкой\n\n> 💡 Совет:\n> Носите кружку в сумке.\n\n---\n\nПодробнее в [справочнике](/sortirovka).' }, su);
  try {
    const c = await b.newContext({ viewport: { width: 1280, height: 900 } }), q = await c.newPage();
    const errs = []; q.on('pageerror', (e) => errs.push(e.message));
    await q.addInitScript(() => { try { sessionStorage.setItem('db-splash', '1'); localStorage.setItem('db-tour-done', '1'); } catch (e) {} });
    await q.goto(B + '/kabinet', { waitUntil: 'networkidle' });
    await q.fill('input[type=email]', 'editor-test@test.local'); await q.fill('input[type=password]', 'Passw0rd123'); await q.keyboard.press('Enter'); await q.waitForTimeout(2500);
    await q.goto(B + '/kabinet?tab=articles', { waitUntil: 'networkidle' }); await q.waitForTimeout(1000);
    await q.locator('.draft', { hasText: 'Автотест редактора' }).getByText('Читать и править').click();
    const ed = q.locator('.ve-ed'); await ed.waitFor();
    const v = await ed.evaluate((e) => ({ h2: e.querySelectorAll('h2').length, li: e.querySelectorAll('li').length, tip: e.querySelectorAll('.art-tip').length, b: e.querySelectorAll('strong').length, a: e.querySelectorAll('a').length, marks: /\*\*|##|^>|\]\(/m.test(e.innerText) }));
    // a tap in the text is left to the browser: the editor is not inside a <label> and the tap is not cancelled
    // (cancelling it made Safari on iPhone put the cursor at the end and scroll down); a link in the text does not leave the page
    const tap = await ed.evaluate((e) => { const p = e.querySelector('p'); const ev = new MouseEvent('click', { bubbles: true, cancelable: true }); p.dispatchEvent(ev);
      const a = e.querySelector('a'); const ev2 = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }); const url = location.href; a.dispatchEvent(ev2);
      return { label: !!e.closest('label'), prevented: ev.defaultPrevented, stayed: location.href === url, field: (e.closest('.md-field') || {}).textContent || '' }; });
    check('a tap in the text is not cancelled, the editor is not in a <label>, a link in the text keeps you on the page', !tap.label && !tap.prevented && tap.stayed && tap.field.startsWith('Текст статьи'));
    check('draft opens as the article looks: heading, list, tip, bold, link — no ** ## > marks', v.h2 === 1 && v.li === 2 && v.tip === 1 && v.b === 1 && v.a === 1 && !v.marks);
    await ed.locator('p').last().click(); await q.keyboard.press('End'); await q.keyboard.press('Enter'); await q.keyboard.type('Новый раздел');
    await q.getByRole('button', { name: /^Заголовок раздела/ }).click();
    await q.keyboard.press('End'); await q.keyboard.press('Enter'); await q.keyboard.type('Важное слово здесь');
    await q.keyboard.down('Shift'); for (let i = 0; i < 5; i++) await q.keyboard.press('ArrowLeft'); await q.keyboard.up('Shift');
    await q.getByRole('button', { name: /^Жирный/ }).click();
    await q.keyboard.press('End'); await q.keyboard.press('Enter'); await q.keyboard.type('Не забывайте кружку');
    await q.getByRole('button', { name: /^Цветная плашка/ }).click();
    await q.getByRole('button', { name: /^Завиток/ }).click();
    const md = await q.evaluate(() => document.querySelector('.draft-ed .md-tools + textarea').value);
    check('buttons write the same marks the site reads: ## heading, **bold**, > tip, --- divider',
      /\n## Новый раздел\n\nВажное слово \*\*здесь\*\*\n\n> 💡 Совет:\n> Не забывайте кружку\n\n---$/.test(md) && md.startsWith('Кофе с собой — это **одноразовый стакан**.'));
    // the site changes meanwhile (here: another draft arrives) — the open editor stays as it is, with the cursor in it
    await q.evaluate(() => { document.querySelector('.ve-ed').dataset.mark = '1'; });
    await q.keyboard.type(' и сумку');
    const other = await api('POST', '/collections/drafts/records', { author: admin.id, cat: 'Статья', title: 'Ещё один черновик', lead: 'x', body: 'x' }, su);
    await q.waitForTimeout(1500);
    const kept = await q.evaluate(() => { const e = document.querySelector('.ve-ed'); return { same: e.dataset.mark === '1', focus: document.activeElement === e, text: e.innerText.includes('и сумку') }; });
    check('a change elsewhere on the site does not reset the editor: same text, cursor still there', kept.same && kept.focus && kept.text && (await q.locator('.draft', { hasText: 'Ещё один черновик' }).count()) === 1);
    await api('DELETE', '/collections/drafts/records/' + other.id, null, su);
    // edits save themselves a couple of seconds later, without pressing anything
    await q.waitForTimeout(4000);
    const md2 = await q.evaluate(() => document.querySelector('.draft-ed .md-tools + textarea').value);
    const auto = (await api('GET', '/collections/drafts/records/' + draft.id, null, su)).body;
    check('edits are saved by themselves: the server has the text, «✓ Сохранено» is shown', auto === md2 && md2.includes('и сумку') && (await q.textContent('.draft-saved')).includes('Сохранено'));
    await q.getByRole('button', { name: 'Сохранить черновик' }).click(); await q.waitForTimeout(800);
    const saved = (await api('GET', '/collections/drafts/records/' + draft.id, null, su)).body;
    check('«Сохранить черновик» saves the text from the editor', saved === md2);
    await q.getByRole('button', { name: /^Показать текст со значками/ }).click();
    check('«Разметка» shows the marks for those who know them', await q.locator('.draft-ed .md-tools + textarea').isVisible());
    check('no script errors', errs.length === 0);
    await c.close();
  } finally {
    await api('DELETE', '/collections/drafts/records/' + draft.id, null, su);
    await api('DELETE', '/collections/users/records/' + admin.id, null, su);
  }
  await b.close();
  console.log(fails.length ? 'FAILED' : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
