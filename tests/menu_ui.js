// Конструктор меню: блюдо открывает свою карточку (продукты, время, эко-оценка), «Заменить блюдо» меняет его, клавиатура работает.
// Нужен сайт + PocketBase (как для tests/e2e.js):
//   BASE=http://localhost:8088 node tests/menu_ui.js
const { chromium, devices } = require('playwright')
let fails = 0; const check = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++ }
;(async () => { const b = await chromium.launch()
  for (const [dev, opts] of [['phone', devices['iPhone 13']], ['desktop', { viewport: { width: 1366, height: 900 } }]]) {
    const ctx = await b.newContext(opts), pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message))
    await pg.addInitScript(() => { try { sessionStorage.setItem('db-splash', '1'); localStorage.setItem('db-tour-done', '1'); localStorage.removeItem('db-menu-v1') } catch (e) {} })
    await pg.goto((process.env.BASE || 'http://localhost:8088') + '/eda', { waitUntil: 'networkidle' }); await pg.waitForTimeout(800)
    await pg.click('#menu .menu-form .btn'); await pg.waitForTimeout(300)
    const first = pg.locator('#menu .menu-dish-open').first(), name = (await first.innerText()).trim()
    await first.click(); await pg.waitForTimeout(300)
    const sheet = pg.locator('.sheet .dish-sheet')
    check(`${dev}: a dish opens its card`, await sheet.count() === 1 && (await sheet.locator('h2').innerText()).trim() === name)
    check(`${dev}: the card lists products and time`, await sheet.locator('.dish-ing li').count() >= 2 && (await sheet.innerText()).includes('мин'))
    await pg.click('.dish-sheet .dish-actions .btn'); await pg.waitForTimeout(300)
    const after = (await pg.locator('#menu .menu-dish-open').first().innerText()).trim()
    check(`${dev}: «Заменить блюдо» closes the card and swaps the dish`, await pg.locator('.sheet').count() === 0 && after !== name)
    await pg.locator('#menu .menu-dish-open').first().focus(); await pg.keyboard.press('Enter'); await pg.waitForTimeout(200)
    check(`${dev}: keyboard Enter opens it, Escape closes`, await pg.locator('.dish-sheet').count() === 1 && (await pg.keyboard.press('Escape'), await pg.waitForTimeout(200), await pg.locator('.dish-sheet').count() === 0))
    check(`${dev}: no page errors`, errs.length === 0); if (errs.length) console.log(errs)
    await ctx.close() }
  await b.close(); console.log(fails ? 'FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0) })()
