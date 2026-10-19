// Сквозная проверка сайта в браузере: регистрация, трекер, редактирование, отзывы,
// барахолка с модерацией, переписка, уровни и сертификат.
// Нужен сайт + PocketBase с ЧИСТОЙ базой и суперпользователем (см. README, раздел «Проверки»).
//   BASE=http://localhost:8088 SU_EMAIL=... SU_PASS=... node tests/e2e.js ./shots
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8088';
const S = process.argv[2] || '.';
const SU = [process.env.SU_EMAIL || 'admin@test.local', process.env.SU_PASS || 'Passw0rd123'];
async function su(){ const r = await fetch(B+'/api/collections/_superusers/auth-with-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identity:SU[0],password:SU[1]})}); return (await r.json()).token; }
async function api(method, path, body, token){ const r = await fetch(B+'/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{})},body:body?JSON.stringify(body):undefined}); return r.json(); }
const errs = [];
function watchPage(p, tag){ p.on('pageerror', e=>errs.push(tag+' pageerror: '+e.message)); p.on('console', m=>{ if (m.type()==='error' && !/fonts\.g/.test(m.text())) errs.push(tag+' console: '+m.text()); }); }
async function register(p, email, nick, charName){
  await p.click('.acc-btn');
  await p.click('.tabs button:has-text("Регистрация")');
  await p.fill('#rg-email', email); await p.fill('#rg-pass', 'secret1234'); await p.fill('#rg-nick', nick);
  await p.click('.char:has-text("'+charName+'")');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Зарегистрироваться")')]);
  await p.waitForSelector('.acc-btn:has-text("Кабинет")', {timeout:8000});
}
(async()=>{
  const b = await chromium.launch(process.env.CHROMIUM ? {executablePath:process.env.CHROMIUM} : {});
  const ctx1 = await b.newContext({viewport:{width:1280,height:900}});
  const p = await ctx1.newPage(); watchPage(p,'dasha');
  await p.goto(B+'/', {waitUntil:'networkidle'});
  await p.screenshot({path:S+'/01-home.png'});
  await register(p, 'dasha@test.local', 'Даша', 'Слон');
  const t = await su();
  const users = await api('GET','/collections/users/records?filter='+encodeURIComponent('name="Даша"'),null,t);
  const dasha = users.items[0];
  await api('PATCH','/collections/users/records/'+dasha.id,{role:'admin'},t);
  await p.reload({waitUntil:'networkidle'});
  // habits: tick 4 cells
  for (let i=0;i<4;i++) await p.locator('#habits .cell').nth(i*8).click();
  await p.waitForTimeout(1500);
  const hab = await api('GET','/collections/habits/records',null,t);
  console.log('habits records:', hab.totalItems);
  // edit mode save
  await p.click('#edit-slot button'); await p.click('#save-btn'); await p.waitForSelector('.toast:has-text("Сохранено")',{timeout:5000}); console.log('content saved');
  // second user
  const ctx2 = await b.newContext({viewport:{width:390,height:844}});
  const q = await ctx2.newPage(); watchPage(q,'liza');
  await q.goto(B+'/', {waitUntil:'networkidle'});
  await register(q, 'liza@test.local', 'Лиза', 'Лиса');
  await q.goto(B+'/#feedback'); await q.fill('#fb-text','Добавьте, пожалуйста, тёмную тему');
  await q.setInputFiles('#fb-photos', require('path').join(__dirname,'..','site','img','owl.webp'));
  await q.click('button:has-text("Отправить Даше")'); await q.waitForSelector('#feedback .li:has-text("тёмную тему")');
  await q.click('.acc-btn'); await q.click('.tabs button:has-text("Мои вещи")');
  await q.fill('#mk-title','Многоразовый шопер'); await q.selectOption('#mk-kind','Отдам даром'); await q.fill('#mk-note','Почти новый');
  await q.click('button:has-text("Отправить на проверку")'); await q.waitForSelector('.toast:has-text("Отправлено")'); await q.click('.close');
  await q.click('#market button:has-text("Хочу купить")');
  await q.waitForSelector('#chat-input'); await q.fill('#chat-input','Здравствуйте! Платье ещё в продаже?'); await q.click('.sheet button:has-text("Отправить")'); await q.waitForTimeout(800);
  await q.screenshot({path:S+'/05-liza-chat.png'}); await q.click('.close');
  await q.goto(B+'/#world'); await q.waitForTimeout(800); await q.screenshot({path:S+'/06-liza-world-mobile.png'});
  // Dasha moderates and reads chat
  await p.reload({waitUntil:'networkidle'});
  await p.click('.acc-btn'); await p.click('.tabs button:has-text("Модерация")'); await p.screenshot({path:S+'/07-moder.png'});
  await p.click('.sheet button:has-text("Опубликовать")'); await p.waitForSelector('.toast:has-text("Опубликовано")');
  await p.click('.tabs button:has-text("Сообщения")'); await p.waitForTimeout(500); await p.click('.sheet .list .li'); await p.waitForTimeout(800);
  await p.screenshot({path:S+'/08-dasha-chat.png'});
  await p.fill('#chat-input','Да, в продаже!'); await p.click('.sheet button:has-text("Отправить")'); await p.waitForTimeout(800);
  await p.click('.tabs button:has-text("Профиль")'); await p.waitForTimeout(400); await p.screenshot({path:S+'/09-profile.png'});
  await p.click('.tabs button:has-text("Обратная связь")'); await p.waitForSelector('.sheet .fb-photos img');
  await p.fill('.sheet .li textarea','Спасибо! Уже делаю'); await p.click('.sheet button:has-text("Сохранить ответ")'); await p.waitForTimeout(500);
  await p.click('.sheet button:has-text("В работе")'); await p.waitForTimeout(600); await p.screenshot({path:S+'/13-fb-admin.png'});
  await p.click('.close');
  await q.goto(B+'/#feedback'); await q.waitForSelector('#feedback .fb-reply:has-text("Уже делаю")'); await q.waitForSelector('#feedback .status:has-text("В работе")');
  await q.screenshot({path:S+'/14-fb-author.png'}); console.log('feedback reply visible to author');
  const pubL = await api('GET','/collections/listings/records'); console.log('public listings:', pubL.totalItems);
  // level up: exam 6 + habits leaves -> need 10 leaves for level 2; give exam_best 6 via UI-like API and many leaves
  await api('PATCH','/collections/users/records/'+dasha.id,{exam_best:6},t);
  const hr = (await api('GET','/collections/habits/records',null,t)).items[0];
  const log = {}; for (let d=1; d<=6; d++) log['2026-10-0'+d] = ['a','b'];
  await api('PATCH','/collections/habits/records/'+hr.id,{data:{habits:hr.data.habits, log}},t);
  await p.waitForTimeout(1200);
  const u = await api('GET','/collections/users/records/'+dasha.id);
  console.log('dasha level', u.level, 'leaves', u.leaves);
  await p.goto(B+'/#world'); await p.waitForTimeout(800); await p.screenshot({path:S+'/03-world.png'});
  await p.goto(B+'/#cert/'+dasha.id+'/2'); await p.waitForSelector('.cert.big'); await p.waitForTimeout(400); await p.screenshot({path:S+'/10-cert.png'});
  await q.reload({waitUntil:'networkidle'}); await q.goto(B+'/#market'); await q.waitForTimeout(600); await q.screenshot({path:S+'/11-market-mobile.png', fullPage:false});
  await p.goto(B+'/#helper'); await p.waitForTimeout(1200); await p.screenshot({path:S+'/12-helper.png'}); console.log('modal closed:', !(await p.$('.cert-sheet')));
  console.log('ERRORS:', JSON.stringify(errs, null, 1));
  await b.close();
})().catch(e=>{ console.error('FAILED', e); console.log('ERRORS:', JSON.stringify(errs, null, 1)); process.exit(1); });
