// Черновики статей: «✨ Подобрать другое фото» — варианты свободных фото по теме, нажатие ставит фото на обложку,
// сайт сам скачивает его к себе и переписывает строку «Фото на обложке: автор, лицензия». Только для команды сайта.
// Openverse подменён маленьким сервером здесь же (порт 8097): PocketBase нужно запустить с PHOTOPICK_OPENVERSE=http://127.0.0.1:8097.
//   BASE=http://localhost:8088 SU_EMAIL=... SU_PASS=... node tests/photopick_ui.js
const { chromium, devices } = require('playwright');
const http = require('http'), zlib = require('zlib');
const B = process.env.BASE || 'http://localhost:8088';
const fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
const api = async (m, path, body, t) => { const r = await fetch(B + '/api' + path, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: t } : {}) }, body: body ? JSON.stringify(body) : undefined }); const x = await r.text(); return x ? JSON.parse(x) : {}; };
function png(w, h, rgb) {
  const crc = (buf) => { let c, k, r = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (r ^ buf[n]) & 0xff; for (k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; r = (r >>> 8) ^ c; } return (r ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  // noisy rows so the file is not tiny
  const rows = []; for (let y = 0; y < h; y++) { const r = [0]; for (let x = 0; x < w; x++) r.push((rgb[0] + x * 7 + y) & 255, (rgb[1] + y * 3) & 255, (rgb[2] + x) & 255); rows.push(Buffer.from(r)); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const IDS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const OV = 'http://127.0.0.1:8097';
const item = (id, i) => ({ id, title: 'Reusable cup ' + i, creator: 'Автор ' + i, creator_url: 'https://www.flickr.com/people/a' + i, foreign_landing_url: 'https://www.flickr.com/photos/a' + i + '/1(2)',
  license: i === 1 ? 'by' : 'by-sa', license_version: '2.0', license_url: 'https://creativecommons.org/licenses/by/2.0/', width: 1600, height: 1000, provider: 'flickr', url: 'http://example.invalid/x.jpg', thumbnail: OV + '/v1/images/' + id + '/thumb/' });
let searched = [];
const mock = http.createServer((req, res) => {
  const u = new URL(req.url, OV);
  if (u.pathname === '/v1/images/') { searched.push(u.searchParams.get('q')); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ results: IDS.map((id, i) => item(id, i + 1)) })); }
  const m = u.pathname.match(/^\/v1\/images\/([0-9a-f-]{36})\/(thumb\/)?$/);
  if (m && m[2]) { res.setHeader('content-type', 'image/png'); return res.end(png(m[1] === IDS[1] ? 320 : 160, m[1] === IDS[1] ? 200 : 100, [IDS.indexOf(m[1]) * 80, 120, 60])); }
  if (m) { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(item(m[1], IDS.indexOf(m[1]) + 1))); }
  res.statusCode = 404; res.end();
});
(async () => {
  await new Promise((r) => mock.listen(8097, '127.0.0.1', r));
  const su = (await api('POST', '/collections/_superusers/auth-with-password', { identity: process.env.SU_EMAIL, password: process.env.SU_PASS })).token;
  const chars = (await api('GET', '/collections/characters/records?perPage=1', null, su)).items;
  const mk = (email, role) => api('POST', '/collections/users/records', { email, password: 'Passw0rd123', passwordConfirm: 'Passw0rd123', name: role, role, verified: true, character: (chars[0] || {}).id }, su);
  const admin = await mk('pp-admin@test.local', 'admin'), member = await mk('pp-member@test.local', 'member');
  const body = 'Кофе в свою кружку — это просто.\n\n## Как попросить\n\nСкажите бариста.\n\nФото на обложке: [Старый автор](https://commons.wikimedia.org/wiki/File:Old.jpg), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Фото в тексте: [Другой](https://x.org), [CC0](https://y.org).';
  const draft = await api('POST', '/collections/drafts/records', { author: admin.id, cat: 'Статья', title: 'Кофе с собой в свою кружку', lead: 'Тест', body, image: '/api/files/photos/old/old.jpg', image_alt: 'Старое фото' }, su);
  const b = await chromium.launch();
  try {
    // only the site team may search and take photos
    const mt = (await api('POST', '/collections/users/auth-with-password', { identity: 'pp-member@test.local', password: 'Passw0rd123' })).token;
    const deny = await (await fetch(B + '/api/photopick/search?draft=' + draft.id, { headers: { authorization: mt } })).json();
    const deny2 = await (await fetch(B + '/api/photopick/take', { method: 'POST', headers: { authorization: mt, 'content-type': 'application/json' }, body: JSON.stringify({ source: 'ov', id: IDS[0] }) })).json();
    check('a member cannot search or take photos', deny.ok === false && deny2.ok === false);
    const c = await b.newContext(devices['iPhone 13']), p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.addInitScript(() => { try { sessionStorage.setItem('db-splash', '1'); localStorage.setItem('db-tour-done', '1'); } catch (e) {} });
    await p.goto(B + '/kabinet', { waitUntil: 'networkidle' });
    await p.fill('input[type=email]', 'pp-admin@test.local'); await p.fill('input[type=password]', 'Passw0rd123'); await p.keyboard.press('Enter'); await p.waitForTimeout(2500);
    await p.goto(B + '/kabinet?tab=articles', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    await p.locator('.draft', { hasText: 'Кофе с собой в свою кружку' }).getByText('Читать и править').click();
    await p.click('button:has-text("Подобрать другое фото")');
    await p.waitForSelector('.pp-item'); await p.waitForTimeout(500);
    const g = await p.evaluate(() => ({ n: document.querySelectorAll('.pp-item').length, caps: [...document.querySelectorAll('.pp-cap')].map((x) => x.textContent), imgs: [...document.querySelectorAll('.pp-item img')].every((i) => i.complete && i.naturalWidth > 0), hs: document.documentElement.scrollWidth > innerWidth, fit: (() => { const pp = document.querySelector('.pp').getBoundingClientRect(), card = document.querySelector('.draft-ed').getBoundingClientRect(), x = document.querySelector('.pp-head button:last-child').getBoundingClientRect(); return pp.right <= card.right + 1 && x.right <= card.right + 1; })() }));
    check(`the picker shows the found photos with author and licence (${g.caps.join(' | ')}), searched by the draft's title; the picker fits the card on a phone`, g.n === 3 && g.caps[0] === 'Автор 1 · CC BY 2.0' && g.imgs && searched[0] === 'Кофе с собой в свою кружку' && !g.hs && g.fit);
    await p.screenshot({ path: `${process.env.OUT || '/tmp'}/photopick.png` });
    await p.click('.pp-item >> nth=1'); await p.waitForTimeout(2500);
    const after = await p.evaluate(() => ({ img: (document.querySelector('.draft-cover img') || {}).getAttribute ? document.querySelector('.draft-cover img').getAttribute('src') : '', body: document.querySelector('.draft-ed .md-tools + textarea').value,
      ed: document.querySelector('.ve-ed').innerText, closed: document.querySelector('.pp').hidden, alt: document.activeElement.placeholder }));
    check('a tap puts the photo on the cover — downloaded to the site', /^\/api\/files\/photos\/[a-z0-9]{15}\//.test(after.img) && after.closed);
    check('the credit line: new cover author and licence; the in-text part kept', after.body.includes('Фото на обложке: [Автор 2](https://www.flickr.com/people/a2), [CC BY-SA 2.0](https://creativecommons.org/licenses/by/2.0/). Фото в тексте: [Другой](https://x.org), [CC0](https://y.org).') && !after.body.includes('Старый автор'));
    check('the editor shows the new line at once; the cursor goes to «Что на картинке»', after.ed.includes('Автор 2') && after.alt === 'Что на картинке');
    await p.waitForTimeout(3500);
    const saved = await api('GET', '/collections/drafts/records/' + draft.id, null, su);
    const file = await fetch(B + after.img);
    check('saved by itself: the draft has the new cover and line; the file opens', saved.image === after.img.replace(/\?.*$/, '') && saved.body.includes('Автор 2') && file.status === 200);
    // «Ещё варианты» and a query of one's own
    await p.click('button:has-text("Подобрать другое фото")'); await p.waitForSelector('.pp-item');
    await p.fill('.pp-head input', 'coffee cup'); await p.click('.pp-head button[type=submit]'); await p.waitForTimeout(800);
    check('one\'s own words are searched («coffee cup»)', searched[searched.length - 1] === 'coffee cup');
    check('no script errors', !errs.length);
    await c.close();
  } finally {
    await b.close(); mock.close();
    await api('DELETE', '/collections/drafts/records/' + draft.id, null, su);
    for (const u of [admin, member]) if (u.id) await api('DELETE', '/collections/users/records/' + u.id, null, su);
  }
  console.log(fails.length ? 'FAILED' : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
