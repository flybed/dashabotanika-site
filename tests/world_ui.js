// «Счастливый мир» на 100 жителей: у каждого своё место и подпись, ничьи значки и имена не наезжают друг на друга;
// луг растёт вниз, а первые 32 жителя стоят на верхнем лугу и не сдвигаются; превью на главной — тот же луг без лишних.
// Нужен сайт + PocketBase с суперпользователем; создаёт 100 тестовых участников world{i}@test.local и удаляет их в конце:
//   BASE=http://localhost:8088 SU_EMAIL=... SU_PASS=... node tests/world_ui.js
const { chromium, devices } = require('playwright');
const B = process.env.BASE || 'http://localhost:8088', N = 100;
const fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
const api = async (m, p, body, t) => { const r = await fetch(B + '/api' + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: t } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const x = await r.text(); return x ? JSON.parse(x) : {}; };
(async () => {
  const su = (await api('POST', '/collections/_superusers/auth-with-password', { identity: process.env.SU_EMAIL, password: process.env.SU_PASS })).token;
  const chars = (await api('GET', '/collections/characters/records?perPage=200', null, su)).items;
  const made = [];
  for (let i = 0; i < N; i++) {
    const r = await api('POST', '/collections/users/records', { email: `world${i}@test.local`, password: 'Passw0rd123', passwordConfirm: 'Passw0rd123', verified: true,
      name: ['Чотчаева Лейла', 'Kirill Belov', 'AlexFlower', 'Маша'][i % 4] + ' ' + i, character: chars[(i * 7) % chars.length].id, xp: [0, 40, 120, 400, 900][i % 5] }, su);
    if (r.id) made.push(r.id);
  }
  const b = await chromium.launch();
  try {
    for (const [dev, opts] of [['desktop', { viewport: { width: 1366, height: 900 } }], ['phone', devices['iPhone 13']]]) {
      const c = await b.newContext(opts), p = await c.newPage();
      await p.addInitScript(() => { try { sessionStorage.setItem('db-splash', '1'); localStorage.setItem('db-tour-done', '1'); } catch (e) {} });
      await p.goto(B + '/mir', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
      const m = await p.evaluate(() => {
        const ds = [...document.querySelectorAll('.world .dweller')], hit = (q, pad) => { const r = ds.map((d) => d.querySelector(q)).filter(Boolean).map((e) => e.getBoundingClientRect()); let n = 0;
          for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (Math.min(r[i].right, r[j].right) - Math.max(r[i].left, r[j].left) > pad && Math.min(r[i].bottom, r[j].bottom) - Math.max(r[i].top, r[j].top) > pad) n++; return n; };
        const w = document.querySelector('.world').getBoundingClientRect();
        return { n: ds.length, names: ds.filter((d) => d.querySelector('.nm')).length, em: hit('.em', 4), nm: hit('.nm', 2), tall: w.height / w.width > 0.5 };
      });
      check(`${dev} /mir: ${m.n} residents, each with a name, no emoji or name overlaps (${m.em}/${m.nm}), the meadow grew down`, m.n >= N && m.names === m.n && !m.em && !m.nm && m.tall);
      await p.goto(B + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
      const t = await p.evaluate(() => { const w = document.querySelector('.wt-mini').getBoundingClientRect(); return { n: document.querySelectorAll('.wt-mini .wt-dw').length, ratio: w.width / w.height }; });
      check(`${dev} home: the world preview keeps the scene proportions and shows the first meadow only (${t.n})`, t.n <= 32 && t.n > 0 && Math.abs(t.ratio - 1000 / 420) < 0.05);
      await c.close();
    }
  } finally {
    await b.close();
    for (const id of made) await api('DELETE', '/collections/users/records/' + id, null, su);
  }
  console.log(fails.length ? 'FAILED' : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
