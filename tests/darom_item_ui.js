// Страница вещи в браузере: заголовок = серверный (/api/seo/page), кнопка действия — по настоящему статусу.
// Нужен сайт + PocketBase с суперпользователем (как для tests/e2e.js):
//   BASE=http://localhost:8088 SU_EMAIL=... SU_PASS=... node tests/darom_item_ui.js
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8088';
const SU = [process.env.SU_EMAIL || 'admin@test.local', process.env.SU_PASS || 'Passw0rd123'];
const fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
const api = async (m, p, b, t) => (await fetch(B+'/api'+p, {method:m, headers:{'Content-Type':'application/json', ...(t ? {Authorization:t} : {})}, body:b ? JSON.stringify(b) : undefined})).json();
const ssrTitle = async path => ((await (await fetch(B+'/api/seo/page?p='+encodeURIComponent(path))).text()).match(/<title>([\s\S]*?)<\/title>/)||[])[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&');
(async()=>{
  const su = (await api('POST','/collections/_superusers/auth-with-password',{identity:SU[0], password:SU[1]})).token;
  const ch = (await api('GET','/collections/characters/records')).items, sfx = Date.now()%100000;
  const mk = async (email, name) => { await api('POST','/collections/users/records',{email,password:'secret12',passwordConfirm:'secret12',name,character:ch[1].id}); await new Promise(r=>setTimeout(r,600)); return api('POST','/collections/users/auth-with-password',{identity:email,password:'secret12'}); };
  // the taker only signs in through the page (PocketBase limits how often one can sign in)
  await api('POST','/collections/users/records',{email:'taker'+sfx+'@t.local',password:'secret12',passwordConfirm:'secret12',name:'Получатель',character:ch[1].id});
  const giver = await mk('giver'+sfx+'@t.local','Даритель');
  const listing = async (kw) => { const r = await api('POST','/collections/listings/records',Object.assign({seller:giver.record.id,kind:'Отдам даром',status:'active',category:'Детское',city:'Москва'},kw),giver.token); await api('PATCH','/collections/listings/records/'+r.id,{moderation:'approved'},su); return r.id; };
  const free = await listing({title:'Самокат '+sfx}), res = await listing({title:'Санки '+sfx}), lent = await listing({title:'Дрель '+sfx, kind:'Одолжу', lend_days:7});
  await api('PATCH','/collections/listings/records/'+res,{status:'reserved'},giver.token);
  await api('PATCH','/collections/listings/records/'+lent,{status:'lent'},su);
  const b = await chromium.launch();
  try{
    const c = await b.newContext({viewport:{width:390,height:812}}); await c.addInitScript(()=>{ try{ sessionStorage.setItem('db-splash','1'); localStorage.setItem('db-tour-done','1'); }catch(e){} });
    const p = await c.newPage(); p.on('pageerror',e=>check('no page error: '+e.message, false)); await p.route(/mc\.yandex|fonts\.g|nominatim|photon/, r=>r.abort());
    await new Promise(r=>setTimeout(r,3000));
    await p.goto(B+'/kabinet'); await p.fill('#li-email','taker'+sfx+'@t.local'); await p.fill('#li-pass','secret12'); await p.press('#li-pass','Enter'); await p.waitForSelector('.cab-logout');
    for (const [id, want, btn] of [[free,'Свободна','Хочу забрать'],[res,'Забронирована','Встать в очередь'],[lent,'На руках','Встать в очередь']]){
      await p.goto(B+'/darom/v/'+id); await p.waitForSelector('.lcard.full'); await p.waitForTimeout(400);
      const txt = await p.innerText('.lcard.full');
      check(want+': status shown honestly', txt.includes(want) && (want==='Свободна' || !txt.includes('Свободна')));
      check(want+': the button is «'+btn+'»', (await p.locator('.lcard.full .lc-actions button').first().innerText()).trim() === btn);
      check(want+': page title = server title', (await p.title()) === await ssrTitle('/darom/v/'+id));
    }
  } finally { await b.close(); }
  console.log(fails.length ? 'FAILED\n'+fails.join('\n') : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
