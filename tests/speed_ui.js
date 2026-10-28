// Скорость: обложка статьи грузится сразу (не «лениво») и одним файлом — серверная страница и скрипт сайта
// берут одни и те же адреса; подсказка тура при первом визите не сдвигает страницу (CLS).
// Нужен сайт + PocketBase с суперпользователем (как для tests/e2e.js):
//   BASE=http://localhost:8088 SU_EMAIL=... SU_PASS=... node tests/speed_ui.js
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8088';
const SU = [process.env.SU_EMAIL || 'admin@test.local', process.env.SU_PASS || 'Passw0rd123'];
const fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
const api = async (m, p, b, t, raw, ct) => (await fetch(B+'/api'+p, {method:m, headers:{...(ct ? {'Content-Type':ct} : raw ? {} : {'Content-Type':'application/json'}), ...(t ? {Authorization:t} : {})}, body:raw || (b ? JSON.stringify(b) : undefined)})).json();
(async()=>{
  const t = (await api('POST','/collections/_superusers/auth-with-password',{identity:SU[0], password:SU[1]})).token;
  // a real JPEG cover in the photos collection (as uploaded from the site)
  const b = await chromium.launch();
  const jpg = Buffer.from(await (await b.newPage()).evaluate(()=>{ const c = document.createElement('canvas'); c.width = 1280; c.height = 960; const g = c.getContext('2d');
    for (let y=0;y<960;y+=40){ g.fillStyle = 'hsl('+(y/3)+',60%,55%)'; g.fillRect(0,y,1280,40); } return c.toDataURL('image/jpeg',.9).split(',')[1]; }), 'base64');
  const fd = new FormData(); fd.append('file', new Blob([jpg],{type:'image/jpeg'}), 'cover.jpg');
  const ph = await api('POST','/collections/photos/records',null,t,fd);
  const cover = '/api/files/photos/'+ph.id+'/'+ph.file;
  const rec = (await api('GET',"/collections/content/records?filter=(key='site')",null,t)).items[0];
  const before = JSON.parse(JSON.stringify(rec.data)), data = rec.data;
  data.articles = [{id:'sp1',cat:'Статья',date:'2026-10-20',title:'Обложка для проверки скорости',lead:'Подводка',body:'Текст',image:cover,image_alt:'Полосатая картинка'}].concat(data.articles||[]);
  await api('PATCH','/collections/content/records/'+rec.id,{data},t);
  try{
    const path = '/zhurnal/oblozhka-dlya-proverki-skorosti';
    const ssr = await (await fetch(B+'/api/seo/page?p='+encodeURIComponent(path))).text();
    const img = (ssr.match(/<img [^>]*Полосатая картинка[^>]*>/)||[''])[0];
    check('server page: the cover is the 960 px copy with the same srcset and sizes as the site script', img.includes('src="'+cover+'?thumb=960x0"') && img.includes(cover+'?thumb=480x0 480w') && img.includes('sizes="(max-width: 760px) 100vw, 760px"'));
    check('server page: the cover is loaded first (fetchpriority=high), not the original', img.includes('fetchpriority="high"') && !img.includes('src="'+cover+'"'));
    const c = await b.newContext({viewport:{width:412,height:823}}); await c.addInitScript(()=>{ try{ sessionStorage.setItem('db-splash','1'); localStorage.setItem('db-tour-done','1'); }catch(e){} });
    const p = await c.newPage(); await p.route(/mc\.yandex|fonts\.g/, r=>r.abort());
    await p.goto(B+path); await p.waitForSelector('.art-cover img');
    const attrs = await p.$eval('.art-cover img', x=>({loading:x.loading, prio:x.getAttribute('fetchpriority'), srcset:x.getAttribute('srcset'), sizes:x.getAttribute('sizes')}));
    check('site script: the cover loads at once (eager, high priority)', attrs.loading === 'eager' && attrs.prio === 'high');
    check('site script: the same srcset and sizes as the server page', img.includes('srcset="'+attrs.srcset+'"') && img.includes('sizes="'+attrs.sizes+'"'));
    // first visit: the tour starts; its tip must not shift the page
    const f = await b.newContext({viewport:{width:412,height:823}}); await f.addInitScript(()=>{ try{ sessionStorage.setItem('db-splash','1'); }catch(e){}
      window.__cls = 0; new PerformanceObserver(l=>{ for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({type:'layout-shift', buffered:true}); });
    const q = await f.newPage(); await q.route(/mc\.yandex|fonts\.g/, r=>r.abort());
    await q.goto(B+'/'); await q.waitForSelector('.tour-tip.placed', {timeout:15000}); await q.waitForTimeout(1500);
    const cls = await q.evaluate(()=>window.__cls);
    check('first visit with the tour: CLS '+cls.toFixed(3)+' (≤ 0.1)', cls <= 0.1);
    check('tour tip stands where it should (moved by transform)', /translate\(/.test(await q.$eval('.tour-tip', x=>x.style.transform)));
  } finally {
    await api('PATCH','/collections/content/records/'+rec.id,{data:before},t);
    await b.close();
  }
  console.log(fails.length ? 'FAILED\n'+fails.join('\n') : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
