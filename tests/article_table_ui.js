// Таблицы в статьях («| a | b |», вторая строка «|---|---|»): на сайте и на странице сервера — настоящая таблица,
// без палочек; на телефоне страница не уезжает вбок; редактор показывает таблицу с ячейками и сохраняет её обратно
// той же разметкой. Нужен стенд с сайтом и PocketBase и суперпользователь (как для tests/e2e.js):
//   BASE=http://localhost:8088 SU_EMAIL=... SU_PASS=... SHOT=dir node tests/article_table_ui.js
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8088';
const SU = [process.env.SU_EMAIL || 'su@test.local', process.env.SU_PASS || 'Passw0rd123'];
const fails = [];
const check = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails.push(n); };
const api = async (m, p, b, t) => (await fetch(B + '/api' + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: t } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();
const TABLE = '| Вариант | Углеродный след |\n|---|---|\n| Искусственная ёлка высотой 2 м | около **40 кг** CO₂ |\n| Живая ёлка, которая уехала на свалку | около 16 кг CO₂ |\n| Живая ёлка, которую сожгли или измельчили | около 3,5 кг CO₂ |';
const BODY = 'Подводка к таблице.\n\n' + TABLE + '\n\nТекст после таблицы.\n\n- пункт списка | с палочкой внутри';
(async () => {
  const t = (await api('POST', '/collections/_superusers/auth-with-password', { identity: SU[0], password: SU[1] })).token;
  const rec = (await api('GET', "/collections/content/records?filter=(key='site')", null, t)).items[0];
  const before = JSON.parse(JSON.stringify(rec.data)), data = rec.data;
  data.articles = [{ id: 'tbl1', cat: 'Статья', date: '2026-11-17', title: 'Проверка таблицы в статье', slug: 'proverka-tablitsy', lead: 'Подводка', body: BODY }].concat(data.articles || []);
  await api('PATCH', '/collections/content/records/' + rec.id, { data }, t);
  const b = await chromium.launch();
  try {
    // the server page
    // without the page's data for the script (the article's own marks are there on purpose)
    const ssr = (await (await fetch(B + '/zhurnal/proverka-tablitsy')).text()).replace(/<script[\s\S]*?<\/script>/g, '');
    check('server page: a real table, 2 columns, 3 rows, bold kept, no «|---|»', /<table><thead><tr><th>Вариант<\/th><th>Углеродный след<\/th><\/tr><\/thead>/.test(ssr) && (ssr.match(/<tr><td>/g) || []).length === 3 && ssr.includes('<strong>40 кг</strong>') && !ssr.includes('|---|'));
    for (const [w, hgt] of [[390, 844], [1280, 900]]) {
      const c = await b.newContext({ viewport: { width: w, height: hgt } });
      await c.addInitScript(() => { try { sessionStorage.setItem('db-splash', '1'); localStorage.setItem('db-tour-done', '1'); } catch (e) {} });
      const p = await c.newPage(); p.on('pageerror', (e) => check('no page error: ' + e.message, false));
      await p.route(/mc\.yandex|fonts\.g/, (r) => r.abort());
      await p.goto(B + '/zhurnal/proverka-tablitsy'); await p.waitForSelector('.art-table table');
      const r = await p.evaluate(() => ({ th: [...document.querySelectorAll('.art-table th')].map((x) => x.textContent), td: document.querySelectorAll('.art-table tbody tr').length,
        bold: !!document.querySelector('.art-table td b, .art-table td strong'), pipes: document.querySelector('.art-body').innerText.includes('|---|'),
        list: [...document.querySelectorAll('.art-body li')].some((x) => x.textContent.includes('с палочкой внутри')), over: document.documentElement.scrollWidth > innerWidth }));
      check(`[${w}] page: a table with the header and 3 rows, bold kept, no marks`, r.th.join('/') === 'Вариант/Углеродный след' && r.td === 3 && r.bold && !r.pipes);
      check(`[${w}] a list line with «|» inside stays a list`, r.list);
      check(`[${w}] no horizontal scroll of the page`, !r.over);
      if (process.env.SHOT) { await p.locator('.art-table').scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -120)); await p.screenshot({ path: `${process.env.SHOT}/table_${w}.png` }); }
      // the editor's conversion: marks → editable page → marks
      if (w === 390) {
        const src = fs.readFileSync(path.join(__dirname, '../site/js/app.js'), 'utf8');
        const pick = (re) => { const m = src.match(re); if (!m) throw new Error('not found: ' + re); return m[0]; };
        const code = [pick(/const VE_BULLET = [^\n]*\n/), pick(/const MD_TROW = [^\n]*\n/), pick(/const mdCells = [^\n]*\n/), pick(/function mdTable\(lines, i\)\{[\s\S]*?\n\}\n/),
          pick(/function veInlineHtml\(text\)\{[\s\S]*?\n\}\n/), pick(/function veFixed\(kind, extra\)\{[\s\S]*?\n\}\n/), pick(/function veFromMd\(src\)\{[\s\S]*?\n\}\n/),
          pick(/function veInlineMd\(node\)\{[\s\S]*?\n\}\n/), pick(/function veToMd\(root\)\{[\s\S]*?\n\}\n/)].join('');
        const out = await p.evaluate(({ code, body }) => { const f = new Function(code + '; return {veFromMd, veToMd};')();
          const ed = document.createElement('div'); ed.innerHTML = f.veFromMd(body);
          const cells = ed.querySelectorAll('td').length, th = ed.querySelectorAll('th').length;
          const back = f.veToMd(ed);
          ed.querySelectorAll('td')[1].innerHTML = 'около <strong>41 кг</strong> CO₂'; // Dasha changes a cell
          return { cells, th, back, edited: f.veToMd(ed) }; }, { code, body: BODY });
        check('editor: the table is shown with cells (2 headers, 6 cells)', out.th === 2 && out.cells === 6);
        check('editor: saving gives back the same table marks', out.back.includes(TABLE) && out.back.includes('Текст после таблицы.'));
        check('editor: a changed cell is saved', out.edited.includes('| Искусственная ёлка высотой 2 м | около **41 кг** CO₂ |'));
      }
      await c.close();
    }
  } finally {
    await api('PATCH', '/collections/content/records/' + rec.id, { data: before }, t);
    await b.close();
  }
  console.log(fails.length ? 'FAILED\n' + fails.join('\n') : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
