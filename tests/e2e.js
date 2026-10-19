// Сквозная проверка сайта в браузере: страницы, регистрация, кабинет с трекером, редактирование,
// обратная связь с фото, барахолка с модерацией, переписка, присутствие, уровни и сертификат.
// Нужен сайт + PocketBase с ЧИСТОЙ базой и суперпользователем (см. README, раздел «Проверки»).
//   BASE=http://localhost:8088 SU_EMAIL=... SU_PASS=... node tests/e2e.js ./shots
const path = require('path');
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8088';
const S = process.argv[2] || '.';
const SU = [process.env.SU_EMAIL || 'admin@test.local', process.env.SU_PASS || 'Passw0rd123'];
const PHOTO = path.join(__dirname, '..', 'site', 'img', 'owl.webp');
async function su(){ const r = await fetch(B+'/api/collections/_superusers/auth-with-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identity:SU[0],password:SU[1]})}); return (await r.json()).token; }
async function api(method, p, body, token){ const r = await fetch(B+'/api'+p,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{})},body:body?JSON.stringify(body):undefined}); return r.json(); }
const errs = [];
function watchPage(p, tag){ p.on('pageerror', e=>errs.push(tag+' pageerror: '+e.message)); p.on('console', m=>{ if (m.type()==='error' && !/fonts\.g/.test(m.text())) errs.push(tag+' console: '+m.text()); }); }
function check(name, cond){ console.log((cond ? 'PASS ' : 'FAIL ')+name); if (!cond) errs.push('check failed: '+name); }
async function register(p, email, nick, charName){
  await p.click('.acc-btn');
  await p.waitForURL('**/kabinet');
  await p.click('.tabs button:has-text("Регистрация")');
  await p.fill('#rg-email', email); await p.fill('#rg-pass', 'secret1234'); await p.fill('#rg-nick', nick);
  await p.click('.char:has-text("'+charName+'")');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Зарегистрироваться")')]);
  await p.waitForSelector('.acc-btn:has-text("Кабинет")', {timeout:8000});
}
const T = '#cabinet-tabs ';
(async()=>{
  const b = await chromium.launch(process.env.CHROMIUM ? {executablePath:process.env.CHROMIUM} : {});
  // splash screen: shown on the first visit, counts to 100% and goes away
  const z = await (await b.newContext({viewport:{width:390,height:844}})).newPage(); watchPage(z,'splash');
  await z.goto(B+'/'); await z.waitForTimeout(700);
  check('splash shows planet, greeting and progress', !!(await z.$('#splash .globe')) && (await z.textContent('#splash')).includes('Добро пожаловать в ЭкоМир'));
  await z.screenshot({path:S+'/00-splash.png'});
  await z.waitForSelector('#splash', {state:'detached', timeout:5000});
  await z.reload(); check('splash only once per visit', !(await z.$('#splash')));
  const skipSplash = ctx => ctx.addInitScript(()=>{ try{ sessionStorage.setItem('db-splash','1'); }catch(e){} });
  const c1 = await b.newContext({viewport:{width:1280,height:900}}); await skipSplash(c1);
  const p = await c1.newPage(); watchPage(p,'dasha');
  await p.goto(B+'/', {waitUntil:'networkidle'});
  const order = await p.$$eval('main > section', s=>s.map(x=>x.id));
  check('home order: calc, exam, world, goods, game', order.slice(1,6).join()==='calc,exam,world,goods,game' && !order.includes('habits'));
  check('home shows 4 products and "Смотреть больше"', (await p.$$('#goods .product')).length===4 && !!(await p.$('#goods a[href="/tovary"]')));
  await p.screenshot({path:S+'/01-home.png'});
  check('top bar has no long menu, burger is closed', !(await p.$('header .nav')) && await p.isHidden('#site-menu'));
  await p.click('.burger'); check('burger opens the list of sections', await p.isVisible('#site-menu a:has-text("Барахолка")'));
  await p.click('#site-menu a:has-text("Барахолка")'); await p.waitForURL('**/baraholka');
  check('menu closes after choosing a page', await p.isHidden('#site-menu'));
  await p.goto(B+'/', {waitUntil:'networkidle'});
  await p.click('#goods a:has-text("Смотреть больше")'); await p.waitForURL('**/tovary');
  check('/tovary page with h1 and all products', !!(await p.$('h1:has-text("Товары")')) && (await p.$$('.product')).length > 4);
  check('page title changes', /Товары/.test(await p.title()));
  await p.goBack(); await p.waitForSelector('#world');
  await p.click('#exam a:has-text("Пройти тест")'); await p.waitForURL('**/eko-test');
  check('/eko-test page has the exam', !!(await p.$('h1')) && !!(await p.$('#exam button:has-text("Начать")')));
  await p.goto(B+'/');
  await register(p, 'dasha@test.local', 'Даша', 'Слон');
  const t = await su();
  const dasha = (await api('GET','/collections/users/records?filter='+encodeURIComponent('name="Даша"'),null,t)).items[0];
  await api('PATCH','/collections/users/records/'+dasha.id,{role:'admin'},t);
  await p.goto(B+'/kabinet', {waitUntil:'networkidle'});
  check('cabinet page: name, level, habits tracker', !!(await p.$('h1.cab-name:has-text("Даша")')) && !!(await p.$('.grow-steps')) && !!(await p.$('#habits .cell')));
  check('growth block with rules', !!(await p.$('.grow .grow-em')) && (await p.$$('.grow-how li')).length >= 8);
  for (let i=0;i<4;i++) await p.locator('#habits .cell').nth(i*8).click();
  await p.waitForTimeout(1500);
  check('habits saved to account', (await api('GET','/collections/habits/records',null,t)).totalItems===1);
  await p.screenshot({path:S+'/02-cabinet.png', fullPage:true});
  await p.goto(B+'/#journal'); await p.waitForTimeout(400);
  await p.locator('#journal button:has-text("Читать полностью")').first().click();
  await p.locator('#journal .like').first().click(); await p.waitForTimeout(1200);
  check('like counted on article', (await p.locator('#journal .like').first().textContent()).includes('1'));
  check('read + like grew the character', (await api('GET','/collections/users/records/'+dasha.id)).xp === 10 + 4*2 + 5 + 1);
  await p.goto(B+'/');
  await p.click('#edit-slot button'); await p.click('#save-btn'); await p.waitForSelector('.toast:has-text("Сохранено")',{timeout:5000});
  // second user, mobile
  const c2 = await b.newContext({viewport:{width:390,height:844}}); await skipSplash(c2);
  const q = await c2.newPage(); watchPage(q,'liza');
  await q.goto(B+'/', {waitUntil:'networkidle'});
  await register(q, 'liza@test.local', 'Лиза', 'Лиса');
  await q.goto(B+'/#feedback'); await q.fill('#fb-text','Добавьте, пожалуйста, тёмную тему');
  await q.setInputFiles('#fb-photos', PHOTO);
  await q.click('button:has-text("Отправить Даше")'); await q.waitForSelector('#feedback .li:has-text("тёмную тему")');
  await q.goto(B+'/kabinet?tab=things');
  await q.fill('#mk-title','Многоразовый шопер'); await q.selectOption('#mk-kind','Отдам даром'); await q.fill('#mk-note','Почти новый');
  await q.click('button:has-text("Отправить на проверку")'); await q.waitForSelector('.toast:has-text("Отправлено")');
  await q.goto(B+'/baraholka');
  await q.click('#market button:has-text("Хочу купить")'); await q.waitForURL('**/kabinet?tab=chats**');
  await q.waitForSelector('#chat-input'); await q.fill('#chat-input','Здравствуйте! Платье ещё в продаже?'); await q.click(T+'button:has-text("Отправить")'); await q.waitForTimeout(800);
  await q.screenshot({path:S+'/05-liza-chat.png'});
  await q.goto(B+'/#world'); await q.waitForTimeout(800); await q.screenshot({path:S+'/06-liza-world-mobile.png'});
  // Dasha: moderation, chat, feedback, people
  await p.goto(B+'/kabinet?tab=moder', {waitUntil:'networkidle'});
  await p.click(T+'button:has-text("Опубликовать")'); await p.waitForSelector('.toast:has-text("Опубликовано")');
  await p.click('.tabs button:has-text("Сообщения")'); await p.waitForTimeout(500); await p.click(T+'.list .li'); await p.waitForSelector('#chat-input');
  await p.fill('#chat-input','Да, в продаже!'); await p.click(T+'button:has-text("Отправить")'); await p.waitForTimeout(600);
  await p.screenshot({path:S+'/08-dasha-chat.png'});
  await p.click('.tabs button:has-text("Обратная связь")'); await p.waitForSelector(T+'.fb-photos img');
  await p.fill(T+'.li textarea','Спасибо! Уже делаю'); await p.click(T+'button:has-text("Сохранить ответ")'); await p.waitForTimeout(500);
  await p.click(T+'button:has-text("В работе")'); await p.waitForTimeout(600);
  await q.goto(B+'/#feedback'); await q.waitForSelector('#feedback .fb-reply:has-text("Уже делаю")');
  check('feedback reply visible to author', !!(await q.$('#feedback .status:has-text("В работе")')));
  await p.click('.tabs button:has-text("Участники")'); await p.waitForTimeout(600);
  const sum = await p.textContent(T+'.people-sum');
  check('people summary: 2 total, online counted', /2\s*участника/.test(sum) && /онлайн/.test(sum) && (await p.$$(T+'.online-dot.on')).length >= 1);
  await p.screenshot({path:S+'/09-people.png'});
  check('approved listing is public', (await api('GET','/collections/listings/records')).totalItems===1);
  // level up -> certificate
  await api('PATCH','/collections/users/records/'+dasha.id,{exam_best:8},t);
  const hr = (await api('GET','/collections/habits/records',null,t)).items[0];
  const log = {}; for (let d=1; d<=6; d++) log['2026-10-0'+d] = ['a','b'];
  await api('PATCH','/collections/habits/records/'+hr.id,{data:{habits:hr.data.habits, log}},t);
  await p.waitForTimeout(1200);
  check('auto level 2', (await api('GET','/collections/users/records/'+dasha.id)).level===2);
  await p.goto(B+'/kabinet?tab=levels', {waitUntil:'networkidle'});
  await p.locator(T+'input[aria-label="Название уровня 2"]').fill('Эко Чайничек');
  await p.locator(T+'.li').nth(1).locator('button:has-text("Сохранить уровень")').click(); await p.waitForTimeout(1000);
  check('admin renamed level 2 on the site', (await api('GET','/collections/levels/records?filter=rank%3D2')).items[0].name==='Эко Чайничек');
  await p.screenshot({path:S+'/15-levels-admin.png'});
  await p.goto(B+'/kabinet', {waitUntil:'networkidle'});
  check('progress line shows renamed level', (await p.textContent('.grow-steps')).includes('Эко Чайничек'));
  await p.locator('.grow').screenshot({path:S+'/16-grow.png'});
  await p.goto(B+'/#cert/'+dasha.id+'/2'); await p.waitForSelector('.cert.big'); await p.screenshot({path:S+'/10-cert.png'});
  await p.goto(B+'/#helper'); await p.waitForTimeout(800);
  check('cert modal closed after navigation', !(await p.$('.cert-sheet')));
  await q.goto(B+'/baraholka', {waitUntil:'networkidle'}); await q.screenshot({path:S+'/11-market-mobile.png'});
  q.once('dialog', d=>d.accept());
  await q.goto(B+'/', {waitUntil:'networkidle'}); await q.click('.burger');
  await Promise.all([q.waitForNavigation(), q.click('#site-menu button:has-text("Выйти из аккаунта")')]);
  await q.waitForSelector('.acc-btn:has-text("Войти")');
  check('logout from the burger menu', !!(await q.waitForSelector('.toast:has-text("Вы вышли")',{timeout:3000}).catch(()=>null)));
  console.log('ERRORS:', JSON.stringify(errs, null, 1));
  await b.close();
  if (errs.length) process.exit(1);
})().catch(e=>{ console.error('FAILED', e); console.log('ERRORS:', JSON.stringify(errs, null, 1)); process.exit(1); });
