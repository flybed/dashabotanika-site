// SEO в браузере: заголовок, который ставит скрипт сайта, совпадает с серверной страницей (/api/seo/page).
// Нужен сайт + PocketBase с суперпользователем (как для tests/e2e.js):
//   BASE=http://localhost:8088 SU_EMAIL=... SU_PASS=... node tests/seo_ui.js
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8088';
const SU = [process.env.SU_EMAIL || 'admin@test.local', process.env.SU_PASS || 'Passw0rd123'];
const fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
const api = async (m, p, b, t) => (await fetch(B+'/api'+p, {method:m, headers:{'Content-Type':'application/json', ...(t ? {Authorization:t} : {})}, body:b ? JSON.stringify(b) : undefined})).json();
const ssrTitle = async path => ((await (await fetch(B+'/api/seo/page?p='+encodeURIComponent(path))).text()).match(/<title>([\s\S]*?)<\/title>/)||[])[1];
(async()=>{
  const t = (await api('POST','/collections/_superusers/auth-with-password',{identity:SU[0], password:SU[1]})).token;
  const rec = (await api('GET',"/collections/content/records?filter=(key='site')",null,t)).items[0];
  const before = JSON.parse(JSON.stringify(rec.data));
  const data = rec.data;
  data.articles = [{id:'u1',cat:'Статья',date:'2026-10-20',title:'Куда сдать батарейки: как найти пункт приёма в своём городе',seo_title:'Куда сдать батарейки: пункты приёма рядом',lead:'Подводка',body:'Текст'},
    {id:'u2',cat:'Статья',date:'2026-10-20',title:'Компост в квартире',lead:'Подводка',body:'Текст'}].concat(data.articles||[]);
  await api('PATCH','/collections/content/records/'+rec.id,{data},t);
  const b = await chromium.launch();
  try{
    const c = await b.newContext(); await c.addInitScript(()=>{ try{ sessionStorage.setItem('db-splash','1'); localStorage.setItem('db-tour-done','1'); }catch(e){} });
    const p = await c.newPage(); await p.route(/mc\.yandex|fonts\.g/, r=>r.abort());
    for (const [path, want] of [['/zhurnal/kuda-sdat-batareyki-kak-nayti-punkt-priema-v-svoem-gorode','Куда сдать батарейки: пункты приёма рядом'],['/zhurnal/kompost-v-kvartire','Компост в квартире — DashaBotanika']]){
      await p.goto(B+path); await p.waitForSelector('#article'); await p.waitForTimeout(500);
      const shown = await p.title(), server = await ssrTitle(path);
      check(path+': page title «'+shown+'» = server title', shown === want && server === want);
    }
    // inside the site (no reload) the title follows too
    await p.goto(B+'/zhurnal'); await p.waitForTimeout(800); await p.click('a.art-link:has-text("Куда сдать батарейки")'); await p.waitForSelector('#article');
    check('navigating inside the site: the short title too', (await p.title()) === 'Куда сдать батарейки: пункты приёма рядом');
  } finally {
    await api('PATCH','/collections/content/records/'+rec.id,{data:before},t);
    await b.close();
  }
  console.log(fails.length ? 'FAILED\n'+fails.join('\n') : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
