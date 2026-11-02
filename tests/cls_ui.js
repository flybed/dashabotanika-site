// Сдвиг страницы (CLS), когда скрипт сайта приходит с опозданием, как на живом сайте (~1–1,5 с):
// серверный текст прячется, пока скрипт не нарисует страницу, — блок не «прыгает».
// Без JavaScript серверный текст виден сразу; если скрипт не пришёл — через 1,5 с.
// Нужен сайт + PocketBase (как для tests/e2e.js):
//   BASE=http://localhost:8088 node tests/cls_ui.js
const { chromium, devices } = require('playwright');
const B = process.env.BASE || 'http://localhost:8088';
const fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
const PAGES = ['/', '/sortirovka', '/markirovka/5-pp', '/zhurnal'];
(async()=>{
  const b = await chromium.launch();
  for (const [dev, opts] of [['phone', devices['iPhone 13']], ['desktop', {viewport:{width:1366, height:800}}]]) {
    for (const path of PAGES) {
      const c = await b.newContext(opts), p = await c.newPage();
      await p.route('**/js/app.js*', r => setTimeout(()=>r.continue(), 1200));
      await p.addInitScript(()=>{ try{ sessionStorage.setItem('db-splash','1'); localStorage.setItem('db-tour-done','1'); }catch(e){}
        window.__cls = 0; new PerformanceObserver(l=>{ for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({type:'layout-shift', buffered:true}); });
      await p.goto(B+path, {waitUntil:'load'}); await p.waitForTimeout(3000);
      const cls = await p.evaluate(()=>window.__cls);
      check(`${dev} ${path}: script 1.2 s late — CLS ${cls.toFixed(3)} (≤ 0.1)`, cls <= 0.1);
      await c.close();
    }
  }
  // «Вещи даром»: the list arrives late (here 1.5 s) — a placeholder meanwhile, never «no things yet», and no shift
  for (const [dev, opts] of [['phone', devices['iPhone 13']], ['desktop', {viewport:{width:1366, height:800}}]]) {
    const c = await b.newContext(opts), p = await c.newPage();
    await p.route('**/api/collections/listings/records*', r => setTimeout(()=>r.continue(), 1500));
    await p.addInitScript(()=>{ try{ sessionStorage.setItem('db-splash','1'); localStorage.setItem('db-tour-done','1'); }catch(e){}
      window.__cls = 0; window.__empty = false; new PerformanceObserver(l=>{ for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({type:'layout-shift', buffered:true});
      document.addEventListener('DOMContentLoaded', ()=>new MutationObserver(()=>{ if (document.querySelector('.darom-empty-t')) window.__empty = true; }).observe(document.body, {childList:true, subtree:true})); });
    await p.goto(B+'/darom', {waitUntil:'load'});
    const waiting = await p.evaluate(()=>{ const w = document.querySelector('.darom-wait'); return !!w && !w.hidden; });
    await p.waitForTimeout(4000);
    const m = await p.evaluate(()=>({cls:window.__cls, empty:window.__empty}));
    check(`${dev} /darom: «Загружаем вещи…» while the list loads, never «Вещей пока нет»`, waiting && !m.empty);
    check(`${dev} /darom: list 1.5 s late — CLS ${m.cls.toFixed(3)} (≤ 0.1)`, m.cls <= 0.1);
    await c.close();
  }
  const nojs = await b.newContext({javaScriptEnabled:false}), n = await nojs.newPage();
  await n.goto(B+'/markirovka/5-pp');
  check('without JavaScript the server text is visible', await n.evaluate(()=>getComputedStyle(document.getElementById('app')).visibility === 'visible'));
  await nojs.close();
  const c = await b.newContext(), p = await c.newPage();
  await p.route('**/js/app.js*', r => r.abort());
  await p.goto(B+'/markirovka/5-pp');
  const early = await p.evaluate(()=>getComputedStyle(document.getElementById('app')).visibility);
  await p.waitForTimeout(1800);
  const late = await p.evaluate(()=>getComputedStyle(document.getElementById('app')).visibility);
  check('the script did not arrive: the server text is hidden at first and shown after 1.5 s', early === 'hidden' && late === 'visible');
  await b.close();
  console.log(fails.length ? 'FAILED' : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
