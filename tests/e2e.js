// Сквозная проверка сайта в браузере: страницы, регистрация, кабинет с трекером, редактирование,
// обратная связь с фото, «Вещи даром» с модерацией, переписка, присутствие, уровни и сертификат.
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
let EXPECT_400 = false; // a test that makes the server refuse on purpose
function watchPage(p, tag){ if (process.env.DEBUG_HTTP){ p.on('response', r=>{ if (r.status()>=400) console.log('HTTP', tag, r.status(), r.request().method(), r.url()); }); p.on('requestfailed', r=>console.log('FAILED-REQ', tag, r.url())); } p.route('https://mc.yandex.ru/**', r=>r.fulfill({body:'', contentType:'text/javascript'})); p.on('pageerror', e=>errs.push(tag+' pageerror: '+e.message)); p.on('console', m=>{ if (m.type()==='error' && !/fonts\.g/.test(m.text()) && !(EXPECT_400 && /status of 400/.test(m.text()))) errs.push(tag+' console: '+m.text()); }); }
function check(name, cond){ console.log((cond ? 'PASS ' : 'FAIL ')+name); if (!cond) errs.push('check failed: '+name); }
async function register(p, email, nick, charName){
  await p.click('.acc-btn');
  await p.waitForURL('**/kabinet');
  await p.click('.tabs button:has-text("Регистрация")');
  await p.fill('#rg-email', email); await p.fill('#rg-pass', 'secret1234'); await p.fill('#rg-nick', nick);
  await p.click('.char:has-text("'+charName+'")'); await p.check('#rg-consent');
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
  // after the splash, a first-time visitor gets a short tour: the screen dims and a light shows where to tap
  await z.waitForSelector('.tour-tip h3', {timeout:8000});
  check('tour starts after the splash and lights up the menu first', (await z.textContent('.tour-tip')).includes('1 из 4') && (await z.textContent('.tour-tip')).includes('меню'));
  await z.screenshot({path:S+'/00b-tour-1.png'});
  await z.click('.tour-tip button:has-text("Далее")'); await z.waitForTimeout(500);
  const spot = await z.$eval('.tour-spot', e=>{ const r = e.getBoundingClientRect(); return [r.top, r.bottom]; });
  check('step 2 lights up «what you get» on screen', (await z.textContent('.tour-tip')).includes('2 из 4') && spot[0] >= 0 && spot[1] <= 844 && spot[1] - spot[0] > 200);
  await z.screenshot({path:S+'/00c-tour-2.png'});
  check('from step 2 there is a way back', !!(await z.$('.tour-tip .tour-back')));
  await z.click('.tour-tip .tour-back'); await z.waitForTimeout(400);
  check('«Назад» returns to the previous step', (await z.textContent('.tour-tip')).includes('1 из 4') && !(await z.$('.tour-tip .tour-back')));
  await z.click('.tour-tip button:has-text("Далее")'); await z.waitForTimeout(300);
  await z.click('.tour-tip button:has-text("Далее")'); await z.waitForTimeout(400);
  check('step 3 invites to join', (await z.textContent('.tour-tip')).includes('Присоединяйтесь'));
  await z.click('.tour-tip button:has-text("Далее")'); await z.waitForTimeout(400);
  await z.click('.tour-tip button:has-text("Понятно")');
  check('the tour closes at once, nothing dark stays, it is remembered', !(await z.$('.tour')) && await z.evaluate(()=>localStorage.getItem('db-tour-done')==='1'));
  await z.reload(); await z.waitForTimeout(1200); check('splash only once per visit, the tour only once', !(await z.$('#splash')) && !(await z.$('.tour')));
  // a reload in the middle of the tour does not start it again
  await z.evaluate(()=>localStorage.removeItem('db-tour-done')); await z.click('footer button:has-text("Показать подсказки")'); await z.waitForSelector('.tour-tip h3');
  await z.reload(); await z.waitForTimeout(1500); check('a reload in the middle of the tour does not show it again', !(await z.$('.tour')));
  await z.click('footer button:has-text("Показать подсказки")'); await z.waitForSelector('.tour-tip h3');
  await z.keyboard.press('Escape'); check('the tour can be shown again from the footer and closed with Esc', !(await z.$('.tour')));
  // the home page is a crossroads: six interest tiles, the page fits a phone screen without sideways scroll
  await z.goto(B+'/', {waitUntil:'networkidle'}); await z.waitForTimeout(400);
  check('phone: home shows six interest tiles and does not scroll sideways', (await z.$$('#interests .int')).length===6 && await z.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
  await z.screenshot({path:S+'/22-home-phone.png', fullPage:true});
  await z.goto(B+'/mir', {waitUntil:'networkidle'}); await z.waitForTimeout(400);
  const wv = await z.$eval('#world .world-view', v=>[v.scrollWidth, v.clientWidth, v.scrollLeft]);
  check('phone: the world map is wider than the screen, opens in the middle and has arrows', wv[0] > wv[1] + 300 && wv[2] > 100 && await z.isVisible('#world .sn-more:not(.sn-back)') && await z.isVisible('#world .world-hint'));
  await z.locator('#world').screenshot({path:S+'/23-world-phone.png'});
  await z.goto(B+'/#food', {waitUntil:'networkidle'});
  check('an old link to a home section opens its own page', new URL(z.url()).pathname==='/eda' && !!(await z.$('h1:has-text("Вкусная польза")')));
  // an article from search: a card on its topic, an invitation at the end, a thin bar after half of the text — for guests
  await z.goto(B+'/zhurnal/sortirovka-doma-za-odin-vecher', {waitUntil:'networkidle'}); await z.waitForTimeout(400);
  check('article: a card on its topic leads to the recycling guide, its button is readable', !!(await z.$('#article .art-body .art-cta a[href="/sortirovka#kuda-sdat"]')) && await z.$eval('.art-cta a.btn', b=>getComputedStyle(b).color !== getComputedStyle(b).backgroundColor));
  check('article end invites a guest to join, with sharing', !!(await z.$('.art-join a[href="/kabinet?tab=register"]:has-text("Присоединиться")')) && !!(await z.$('.art-join .art-share a[href^="https://t.me"]')));
  check('no bar before reading', !(await z.$('.reader-bar')));
  await z.evaluate(()=>window.scrollTo(0, document.body.scrollHeight)); await z.waitForTimeout(500);
  check('after half of the article a thin bar invites to join', await z.isVisible('.reader-bar a:has-text("Присоединиться")'));
  await z.locator('.reader-bar').screenshot({path:S+'/30-reader-bar.png'});
  await z.click('.reader-bar .rb-x'); check('the bar closes and does not come back on this visit', !(await z.$('.reader-bar')));
  await z.reload({waitUntil:'networkidle'}); await z.evaluate(()=>window.scrollTo(0, document.body.scrollHeight)); await z.waitForTimeout(400);
  check('…even after a reload', !(await z.$('.reader-bar')));
  await z.goto(B+'/kabinet?tab=register', {waitUntil:'networkidle'}); await z.waitForTimeout(500);
  const groups = await z.$$eval('.chars-g', g=>g.map(x=>x.textContent));
  check('registration opened by a link shows all 51 characters in groups', (await z.$$('.char')).length===51 && ['Звери','Редкие и исчезающие','Птицы','Морские','Необычные'].every(g=>groups.some(x=>x.startsWith(g))));
  await z.fill('.chars-search','лев');
  check('character search finds the lion', (await z.$$('.char:visible')).length===1 && (await z.textContent('.char:visible')).includes('Лев'));
  await z.fill('.chars-search','птиц');
  check('search by group title shows the whole group', (await z.$$('.char:visible')).length===7);
  await z.fill('.chars-search','');
  await z.goto(B+'/politika', {waitUntil:'networkidle'});
  check('privacy policy page with 152-FZ and the footer link', (await z.textContent('main')).includes('152-ФЗ') && !!(await z.$('footer a[href="/politika"]')) && (await (await fetch(B+'/politika')).text()).includes('<h1>Политика конфиденциальности</h1>'));
  const skipSplash = ctx => ctx.addInitScript(()=>{ try{ sessionStorage.setItem('db-splash','1'); localStorage.setItem('db-tour-done','1'); }catch(e){} });
  const c1 = await b.newContext({viewport:{width:1280,height:900}}); await skipSplash(c1);
  const p = await c1.newPage(); watchPage(p,'dasha');
  await p.goto(B+'/', {waitUntil:'networkidle'});
  const order = await p.$$eval('main > section', s=>s.map(x=>x.id));
  check('home: topics, things for free, for a beginner with first steps, Dasha, articles, the world, myths, feedback', order.join()==='top,interests,myths-teaser,darom-spot,start,steps,about,journal,world-teaser,say' && !(await p.$('#about .gallery')));
  { const hi = await p.$eval('.pebble img', i=>[i.getAttribute('loading'), i.getAttribute('srcset')||'', i.currentSrc]);
    const small = await fetch(B+'/img/hero-dasha-480.webp');
    check('photos: hero loads first with a small copy for phones, others lazy', hi[0]==='eager' && hi[1].includes('-480.webp 480w') && small.ok && (await p.$$eval('#about img', a=>a.every(i=>i.loading==='lazy'))));
  }
  { const cr = await b.newContext({viewport:{width:390,height:844}, deviceScaleFactor:3}); await skipSplash(cr);
    const r = await cr.newPage(); await r.goto(B+'/', {waitUntil:'networkidle'});
    const one = await p.$eval('.pebble img', i=>i.currentSrc), three = await r.$eval('.pebble img', i=>i.currentSrc);
    check('Retina: a 3x phone gets the full photo, an ordinary screen the light copy', !three.includes('-480') && one.includes('-480'));
    await cr.close();
  }
  check('interest tiles lead to pages and first steps for a guest', (await p.$$('#interests .int')).length===6 && !!(await p.$('#interests a.int-main[href="/eda"]')) && !!(await p.$('#interests a[href="/eda#menu"]')) && (await p.textContent('#steps')).includes('0 из 7') && !!(await p.$('.hero-cta a[href="/#start"]')) && !!(await p.$('#start a[href="/kabinet?tab=register"]')));
  await p.screenshot({path:S+'/01-home.png', fullPage:true});
  await p.click('#interests a.int-main[href="/sortirovka"]'); await p.waitForURL('**/sortirovka');
  check('/sortirovka: own title and h1, sorting guide and calculator together', /сортировать/.test(await p.title()) && !!(await p.$('h1:has-text("Начать путь")')) && !!(await p.$('#calc')) && !!(await p.$('#helper button:has-text("Загрузить фото упаковки")')));
  await p.click('#sort .sg-item:has-text("Батарейки")');
  check('sorting guide shows the chosen material', (await p.textContent('#sort .sg-card')).includes('Батарейки') && (await p.textContent('#sort .sg-card')).includes('Куда сдавать'));
  await p.click('#calc button:has-text("Пока не сдаю")');
  check('calculator: "not recycling yet" sets zeros and encourages', (await p.textContent('#calc .result')).includes('Пока ноль') && (await p.inputValue('#calc-pet'))==='0');
  await p.click('#calc .presets button:has-text("Типичная семья")'); await p.click('#calc .calc-share'); await p.waitForSelector('.share-img img', {timeout:8000});
  { const dims = await p.$eval('.share-img img', i=>i.decode().then(()=>[i.naturalWidth, i.naturalHeight]));
    check('calculator result can be shared: a 1080×1080 picture, download, Telegram, WhatsApp, VK', dims[0]===1080 && dims[1]===1080 && !!(await p.$('.share-btns a[download]')) && !!(await p.$('.share-btns a[href^="https://t.me/share/url?url="]')) && !!(await p.$('.share-btns a[href^="https://vk.com/share.php"]')) && (await p.getAttribute('.share-btns a[href^="https://wa.me"]','href')).includes(encodeURIComponent(B+'/sortirovka')));
    await p.locator('.share-img img').screenshot({path:S+'/29-share-card.png'}); }
  await p.keyboard.press('Escape');
  // «куда сдать» guide: a page for every kind of recyclables and every plastic code, also for search engines
  check('/sortirovka lists the guide: 11 kinds of recyclables and a link to plastic codes', (await p.$$('#kuda-sdat .g-tile')).length===11 && !!(await p.$('#kuda-sdat a[href="/markirovka"]')));
  await p.click('#sort .sg-item:has-text("Батарейки")'); await p.click('#sort .sg-more'); await p.waitForURL('**/sortirovka/batareyki');
  check('guide page: h1, accepted / not accepted, how to prepare, where, FAQ, related', !!(await p.$('h1:has-text("Куда сдать батарейки")')) && (await p.$$('.g-yes li')).length >= 3 && (await p.$$('.g-no li')).length >= 1 && (await p.$$('.g-steps li')).length >= 2 && (await p.$$('.g-faq details')).length >= 3 && !!(await p.$('.g-rel a[href="/sortirovka/tekhnika"]')) && /батарейки/i.test(await p.title()));
  await p.locator('#guide').screenshot({path:S+'/28-guide.png'});
  await p.goto(B+'/markirovka', {waitUntil:'networkidle'});
  check('/markirovka: a table of codes 1–7 with links', (await p.$$('.mark-t tbody tr')).length===7 && !!(await p.$('.mark-t a[href="/markirovka/5-pp"]')));
  await p.click('.mark-t a[href="/markirovka/3-pvc"]'); await p.waitForURL('**/markirovka/3-pvc');
  check('code page shows where it is found and how often it is accepted', !!(await p.$('h1:has-text("3 PVC")')) && (await p.textContent('.g-accept')).includes('редко') && (await p.$$('.g-meter i.on')).length===1);
  { const r1 = await (await fetch(B+'/sortirovka/batareyki')).text(), r2 = await (await fetch(B+'/markirovka/5-pp')).text(), r3 = await (await fetch(B+'/markirovka')).text(), sm = await (await fetch(B+'/sitemap.xml')).text();
    check('guide pages are ready for search engines: title, h1, FAQ markup, breadcrumbs, sitemap', /<title>Куда сдать батарейки[^<]*<\/title>/.test(r1) && r1.includes('<h1>Куда сдать батарейки') && r1.includes('"@type":"FAQPage"') && r1.includes('"@type":"BreadcrumbList"')
      && r2.includes('<h1>Маркировка 5 PP') && r3.includes('<table>') && sm.includes('/sortirovka/batareyki</loc>') && sm.includes('/markirovka/7-other</loc>') && (await fetch(B+'/sortirovka/net-takogo')).status===404); }
  await p.goto(B+'/vozduh', {waitUntil:'networkidle'});
  await p.route('https://geocoding-api.open-meteo.com/**', r=>r.fulfill({json:{results:[{name:'Новосибирск',admin1:'Новосибирская область',country:'Россия',latitude:55.03,longitude:82.92}]}}));
  await p.route('https://air-quality-api.open-meteo.com/**', r=>{ const hrs = Array.from({length:48},(_,i)=>'2026-10-20T'+String(i%24).padStart(2,'0')+':00');
    r.fulfill({json:{current:{time:'2026-10-20T00:00',european_aqi:33,pm2_5:8.4,pm10:14.2,nitrogen_dioxide:21,ozone:40},hourly:{time:hrs,european_aqi:hrs.map((_,i)=>20+i)}}}); });
  await p.fill('#air-city','Новосибирск'); await p.click('#air button:has-text("Узнать")');
  await p.waitForSelector('#air .air-card', {timeout:5000});
  check('air quality: city found, index, level and forecast', (await p.textContent('#air .air-card')).includes('Новосибирск') && (await p.textContent('#air .air-num b'))==='33' && (await p.textContent('#air .air-label')).includes('Хороший') && (await p.$$('#air .air-bars i')).length===24);
  await p.locator('#air').screenshot({path:S+'/01b-air.png'});
  await p.click('#air .air-x'); check('air result can be closed', !(await p.$('#air .air-card')) && !!(await p.$('#air .air-art svg')));
  // menu builder on the food page: vegan, without gluten, 3 days — only fitting dishes, a dish can be swapped, shopping list
  await p.goto(B+'/eda', {waitUntil:'networkidle'});
  check('/eda: food, menu builder, cafes and the photo helper on one page', (await Promise.all(['food','menu','cafes','helper'].map(x=>p.$('#'+x)))).every(Boolean) && !!(await p.$('h1:has-text("Вкусная польза")')) && /меню на неделю/.test(await p.title()));
  await p.click('#menu .chip:has-text("Веганское")'); await p.click('#menu .chip:has-text("без глютена")'); await p.click('#menu .chip:has-text("3 дня")');
  await p.click('#menu button:has-text("Собрать меню")');
  const menuText = await p.textContent('#menu .menu-days');
  check('menu builder: 3 days, only vegan dishes without gluten', (await p.$$('#menu .menu-day')).length===3 && !/Сырники|Курин|курицей|Тост|Омлет|Паста|Булгур|Овсянка|Минтай|Уха|Фриттата|фетой/.test(menuText));
  const first = await p.textContent('#menu .menu-day .menu-dish span');
  await p.locator('#menu .menu-swap').first().click();
  check('a dish can be swapped', (await p.textContent('#menu .menu-day .menu-dish span')) !== first);
  await p.locator('#menu .shop input').first().check();
  check('shopping list with ticks', (await p.$$('#menu .shop li')).length > 5 && (await p.$$('#menu .shop label.on')).length===1);
  await p.locator('#menu').screenshot({path:S+'/21-menu.png'});
  // articles for you: a guest picks a topic in the journal, the matching article comes first; the home page follows
  await p.goto(B+'/zhurnal', {waitUntil:'networkidle'});
  check('journal asks «Что вам интересно?» with topic chips', (await p.$$('.fy-chips .chip')).length===8 && !(await p.$('.for-you .fy-t')));
  await p.click('.fy-chips .chip:has-text("сортировать")'); await p.waitForSelector('.for-you .fy-t');
  check('a chosen topic shows «Для вас» with the matching article and why', (await p.textContent('.for-you')).includes('Сортировка дома за один вечер') && (await p.textContent('.for-you .picked-why')).includes('сортировать'));
  await p.goto(B+'/', {waitUntil:'networkidle'});
  check('the home page shows «Для вас в журнале» for the remembered interest', (await p.textContent('#journal')).includes('Для вас в журнале') && (await p.textContent('#journal .card')).includes('Сортировка дома'));
  await p.evaluate(()=>localStorage.removeItem('db-art-interests'));
  await p.goto(B+'/moda', {waitUntil:'networkidle'});
  check('/moda: fashion with h1, market teaser and 4 products with "Смотреть больше"', !!(await p.$('h1:has-text("Одежда")')) && !!(await p.$('#market')) && (await p.$$('#goods .product')).length===4 && !!(await p.$('#goods a[href="/tovary"]')));
  check('goods preview says the goods will be on sale soon', (await p.textContent('#goods')).includes('Скоро эти товары можно будет купить'));
  check('Instagram and Telegram links in the top bar', !!(await p.$('header a.soc[href="https://instagram.com/dashabotanika"]')) && !!(await p.$('header a.soc[href="https://t.me/dashabotanikarecipes"]')));
  check('top bar has no long menu, burger is closed', !(await p.$('header .nav')) && await p.isHidden('#site-menu'));
  await p.click('.burger'); check('burger opens the list of sections in groups', await p.isVisible('#site-menu a:has-text("Вещи даром")') && (await p.$$('#site-menu .menu-gt')).length===3);
  check('menu leads to pages, not to pieces of the home page', !(await p.$('#site-menu a[href^="/#"]')) && !!(await p.$('#site-menu a[href="/igra"]')) && !!(await p.$('#site-menu a[href="/eda"]')));
  await p.click('#site-menu a:has-text("Вещи даром")'); await p.waitForURL('**/darom');
  check('menu closes after choosing a page', await p.isHidden('#site-menu'));
  await p.goto(B+'/moda', {waitUntil:'networkidle'});
  await p.click('#goods a:has-text("Смотреть больше")'); await p.waitForURL('**/tovary');
  check('/tovary page with h1 and all products', !!(await p.$('h1:has-text("Товары")')) && (await p.$$('.product')).length > 4);
  check('page title changes', /Товары/.test(await p.title()));
  check('inner page has a back button', !!(await p.$('main .back-btn')) && !(await p.$('main .back-btn:has-text("x")')));
  await p.click('main .back-btn'); await p.waitForSelector('#fashion'); check('back button returns to the previous page', new URL(p.url()).pathname==='/moda');
  await p.goto(B+'/igra', {waitUntil:'networkidle'});
  check('/igra: the game with h1 and the exam teaser', !!(await p.$('h1:has-text("Эко-уборка")')) && !!(await p.$('#game canvas')));
  await p.click('#exam a:has-text("Пройти тест")'); await p.waitForURL('**/eko-test');
  check('/eko-test page has the exam', !!(await p.$('h1')) && !!(await p.$('#exam button:has-text("Начать")')));
  await p.goto(B+'/mir');
  check('world says Dasha will settle soon', (await p.textContent('#world')).includes('Скоро здесь поселится Даша'));
  await p.goto(B+'/');
  await register(p, 'dasha@test.local', 'Даша', 'Слон');
  const t = await su();
  const dasha = (await api('GET','/collections/users/records?filter='+encodeURIComponent('name="Даша"'),null,t)).items[0];
  await api('PATCH','/collections/users/records/'+dasha.id,{role:'admin'},t);
  await p.goto(B+'/#world', {waitUntil:'networkidle'}); await p.waitForTimeout(500);
  await p.goto(B+'/', {waitUntil:'networkidle'}); await p.waitForTimeout(400);
  check('home: the world block shows a miniature of the world that opens /mir', (await p.$$('#world-teaser .wt-mini .wt-dw')).length >= 1 && !!(await p.$('#world-teaser a.wt-link[href="/mir"] svg')) && !!(await p.$('#world-teaser .wt-dw.first')));
  await p.locator('#world-teaser').screenshot({path:S+'/24-world-teaser.png'});
  await p.goto(B+'/mir', {waitUntil:'networkidle'}); await p.waitForTimeout(500);
  check('world says Dasha settled first once she is admin with the elephant', (await p.textContent('#world')).includes('Первой поселилась Даша'));
  await p.goto(B+'/kabinet', {waitUntil:'networkidle'});
  check('cabinet page: name, level and «now» cards first (challenges, messages, market, a friend)', !!(await p.$('h1.cab-name:has-text("Даша")')) && !!(await p.$('.grow-steps')) && (await p.$$('.cab-now .now-card')).length===4 && !!(await p.$('.cab-now a[href="/kabinet?tab=things#cabinet-tabs"]:has-text("Вещи даром")')));
  await p.click('.cab-now a:has-text("Челленджи")'); await p.waitForSelector('#challenges button:has-text("Создать челлендж")');
  check('challenges live in their own tab, opened from the «now» card', (await p.getAttribute('.tabs button[aria-selected="true"]','data-l')).includes('Челленджи'));
  await p.goto(B+'/kabinet#challenges', {waitUntil:'networkidle'});
  check('old links /kabinet#challenges open the challenges tab', !!(await p.$('#challenges button:has-text("Создать челлендж")')));
  await p.click('.tabs button:has-text("Профиль и настройки")');
  check('settings show email and its status', (await p.textContent('.mail-row')).includes('dasha@test.local') && (await p.textContent('.mail-row')).includes('не подтверждена'));
  check('until the email is confirmed, the cabinet says to look in «Спам»', (await p.textContent('#cabinet')).includes('«Спам»') && (await p.textContent('.acc-card')).includes('«Спам»'));
  await api('PATCH','/collections/users/records/'+dasha.id,{verified:true},t);
  await p.reload({waitUntil:'networkidle'}); await p.click('.tabs button:has-text("Профиль и настройки")');
  check('verified email shown as confirmed', (await p.textContent('.mail-row')).includes('✓ подтверждена') && !!(await p.$('.mail-ok')));
  await p.click('.grow-cta'); await p.waitForSelector('#grow-ways');
  check('"Растить персонажа" lists ways to grow with links', !!(await p.$('.grow .grow-em')) && (await p.$$('#grow-ways .way')).length >= 8 && !!(await p.$('#grow-ways a[href="/eko-test"]')));
  // challenge wizard: goal -> term -> habits
  await p.click('.tabs button:has-text("Челленджи")');
  await p.click('#challenges button:has-text("Создать челлендж")');
  await p.click('.ch-goal:has-text("Экология")');
  await p.click('.ch-days button:has-text("7 дней")'); await p.click('.ch-nav button:has-text("Дальше")');
  check('wizard suggests habits for the goal', (await p.$$('.ch-chosen .ch-tag')).length===4);
  await p.click('.ch-chosen .ch-tag:has-text("Без доставки еды") .x').catch(()=>{});
  await p.locator('.ch-chosen .ch-tag .x').first().click();
  await p.locator('.ch-sugg .chip').first().click();
  await p.fill('.ch-wizard input','Пью воду из многоразовой бутылки'); await p.click('.ch-wizard button:has-text("Добавить свою")');
  await p.click('.ch-nav button:has-text("Назад")'); await p.click('.ch-nav button:has-text("Назад")');
  await p.click('.ch-goal:has-text("Экология")'); await p.click('.ch-nav button:has-text("Дальше")');
  check('going back to the goal keeps the habits you chose', (await p.$$('.ch-chosen .ch-tag')).length===5 && (await p.textContent('.ch-chosen')).includes('многоразовой бутылки'));
  await p.click('.ch-wizard button:has-text("Начать челлендж")');
  await p.waitForSelector('.ch-card');
  check('challenge card with dates and year', /2\d{3}/.test(await p.textContent('.ch-card .hint')) && (await p.$$('.ch-card tbody tr')).length===5);
  check('future days cannot be checked', (await p.$$('.ch-card .cell[disabled]')).length > 0);
  const todayCells = p.locator('.ch-card td:has(.cell:not([disabled]))');
  for (let i=0;i<4;i++){ await p.locator('.ch-card tbody tr').nth(i).locator('.cell:not([disabled])').last().click(); }
  await p.waitForTimeout(1500);
  await p.screenshot({path:S+'/03-challenge.png', fullPage:false});
  check('habits saved to account', (await api('GET','/collections/habits/records',null,t)).totalItems===1);
  // habits calendar: today is coloured, a click shows the day and lets you toggle a habit
  await p.waitForSelector('#calendar .cal-d.today');
  check('calendar colours today by checked habits', /\b(part|full)\b/.test(await p.getAttribute('#calendar .cal-d.today','class')));
  await p.click('#calendar .cal-d.today'); await p.waitForSelector('#calendar .cal-detail');
  const onBefore = (await p.$$('#calendar .cal-habits .chip.on')).length;
  await p.locator('#calendar .cal-habits .chip.on').first().click(); await p.waitForTimeout(300);
  check('a habit can be unchecked from the calendar', (await p.$$('#calendar .cal-habits .chip.on')).length === onBefore-1);
  await p.locator('#calendar .cal-habits .chip:not(.on)').first().click(); await p.waitForTimeout(300);
  await p.locator('#calendar').screenshot({path:S+'/20-calendar.png'});
  await p.screenshot({path:S+'/02-cabinet.png', fullPage:true});
  await p.goto(B+'/#journal'); await p.waitForTimeout(400);
  await p.locator('#journal a:has-text("Читать полностью")').first().click(); await p.waitForURL('**/zhurnal/*');
  check('article has its own page with h1 and text', /^\/zhurnal\/[a-z0-9-]+$/.test(new URL(p.url()).pathname) && !!(await p.$('#article h1')) && (await p.textContent('#article .art-body')).length > 100 && /DashaBotanika/.test(await p.title()));
  // a like shows at once, even when the server is slow; when the server refuses, it goes back with a message
  await p.route('**/api/collections/likes/records', async r=>r.request().method()==='POST' ? (await new Promise(x=>setTimeout(x,500)), r.fulfill({status:400, contentType:'application/json', body:'{"status":400,"message":"no","data":{}}'})) : r.continue());
  EXPECT_400 = true;
  await p.locator('#article .like').click();
  const optimistic = await p.$eval('#article .like', el=>el.getAttribute('aria-pressed'));
  await p.waitForSelector('.toast:has-text("Проверьте")'); await p.waitForTimeout(300);
  const after = await p.$eval('#article .like', el=>el.getAttribute('aria-pressed'));
  check('like: shown at once ('+optimistic+'), rolled back ('+after+') with a message when the server refuses', optimistic==='true' && after==='false');
  EXPECT_400 = false;
  await p.unroute('**/api/collections/likes/records');
  await p.route('**/api/collections/likes/records', async r=>{ await new Promise(x=>setTimeout(x,800)); r.continue(); });
  const t0 = Date.now(); await p.locator('#article .like').click();
  const fast = await p.$eval('#article .like', el=>el.getAttribute('aria-pressed')==='true' && el.textContent.includes('1')); const ms = Date.now() - t0;
  check('like: the heart and the count change at once on a slow server ('+ms+' ms)', fast && ms < 300);
  await p.waitForTimeout(1500); await p.unroute('**/api/collections/likes/records');
  check('like counted on article', (await p.locator('#article .like').textContent()).includes('1') && (await api('GET','/collections/likes/records?filter='+encodeURIComponent("target~'articles:'"),null,t)).totalItems===1);
  // search engines get ready text: title, description, h1 and the article itself without running scripts
  const artPath = new URL(p.url()).pathname, raw = await (await fetch(B+artPath)).text();
  check('server page for an article has title, canonical, h1, text and Article markup', raw.includes('<link rel="canonical" href="https://dashabotanika.ru'+artPath+'">') && /<div id="app">[\s\S]*<h1>[^<]+<\/h1>[\s\S]*<p>/.test(raw) && raw.includes('"@type":"Article"') && raw.includes('/js/app.js'));
  const r404 = await fetch(B+'/no-such-page'), rKab = await (await fetch(B+'/kabinet')).text(), smap = await (await fetch(B+'/sitemap.xml')).text();
  check('unknown address answers 404, cabinet is noindex, sitemap lists articles', r404.status===404 && rKab.includes('name="robots" content="noindex"') && smap.includes('https://dashabotanika.ru'+artPath));
  const rHome = await (await fetch(B+'/')).text(), rGoods = await (await fetch(B+'/tovary')).text();
  const rEda = await (await fetch(B+'/eda')).text(), rSort = await (await fetch(B+'/sortirovka')).text();
  check('home and section pages carry their text for search engines', /<div id="app">[\s\S]*href="\/eda"[\s\S]*href="\/zhurnal"/.test(rHome) && /<title>Товары[^<]*<\/title>/.test(rGoods) && /<h1>Товары/.test(rGoods)
    && /<title>Эко-еда[^<]*<\/title>/.test(rEda) && /<h1>Вкусная польза!<\/h1>[\s\S]*Рецепты без отходов[\s\S]*Меню на неделю/.test(rEda) && rEda.includes('"name":"Еда"') && /<h1>Начать путь в экологии/.test(rSort) && smap.includes('/sortirovka</loc>'));
  // verification codes and the Metrika counter go into every page served
  const site = (await api('GET','/collections/content/records?filter='+encodeURIComponent("key='site'"),null,t)).items[0];
  const rDef = await (await fetch(B+'/')).text();
  check('our Metrika, Yandex and Google codes are there by default', rDef.includes('ym(113698267,"init"') && rDef.includes('content="ef883b413e657642"') && rDef.includes('content="KxORCH26NU9GhHVw-usOPKJZQInhI4STy9_pEc33Wk0"'));
  await api('PATCH','/collections/content/records/'+site.id,{data:Object.assign({}, site.data, {seo:{metrika:'12345678', yandex:'abc123', google:'g-Code_9'}})},t);
  const rSeo = await (await fetch(B+'/tovary')).text();
  check('verification meta and Metrika counter in served pages', rSeo.includes('<meta name="yandex-verification" content="abc123">') && rSeo.includes('<meta name="google-site-verification" content="g-Code_9">') && rSeo.includes('ym(12345678,"init"') && rSeo.includes('tag.js?id=12345678') && rSeo.includes('webvisor:true'));
  await api('PATCH','/collections/content/records/'+site.id,{data:site.data},t);
  check('goods page says the goods will be on sale soon', rGoods.includes('Скоро эти товары можно будет купить'));

  check('read + like grew the character', (await api('GET','/collections/users/records/'+dasha.id)).xp === 10 + 4*2 + 5 + 1);
  // a finished challenge with all checks gives +50 (server decides)
  const hr0 = (await api('GET','/collections/habits/records',null,t)).items[0];
  const iso = d => d.toISOString().slice(0,10), st0 = new Date(Date.now()-6*86400000);
  const done = {id:'cdone', goal:'eco', title:'Тест', start:iso(st0), days:7, habits:[{id:'x1',name:'А'}], log:{}};
  for (let i=0;i<7;i++) done.log[iso(new Date(st0.getTime()+i*86400000))] = ['x1'];
  await api('PATCH','/collections/habits/records/'+hr0.id,{data:Object.assign({}, hr0.data, {challenges:(hr0.data.challenges||[]).concat([done])})},t);
  await p.waitForTimeout(800);
  check('passed challenge gives +50 and 7 checks', (await api('GET','/collections/users/records/'+dasha.id)).xp === 10 + 4*2 + 5 + 1 + 7*2 + 50);
  await p.goto(B+'/kabinet?tab=challenges', {waitUntil:'networkidle'}); await p.waitForSelector('.ch-share', {timeout:5000}).catch(()=>{});
  await p.click('.ch-share'); await p.waitForSelector('.share-img img', {timeout:8000}).catch(()=>{});
  check('a passed challenge can be shared with a picture and an invitation link', !!(await p.$('.share-img img')) && (await p.getAttribute('.share-btns a[href^="https://t.me"]','href')).includes(encodeURIComponent('ref='+dasha.id)));
  await p.keyboard.press('Escape');
  // article helper (role writer) sends a draft; Dasha fixes it in the cabinet and publishes
  const chars = (await api('GET','/collections/characters/records')).items;
  const wr = await api('POST','/collections/users/records',{email:'writer@test.local',password:'secret1234',passwordConfirm:'secret1234',name:'Помощник',character:chars[0].id});
  await api('PATCH','/collections/users/records/'+wr.id,{role:'writer'},t);
  const wt = (await api('POST','/collections/users/auth-with-password',{identity:'writer@test.local',password:'secret1234'})).token;
  const dr = await api('POST','/collections/drafts/records',{author:wr.id,cat:'Статья',title:'Чем заменить пищевую плёнку',lead:'Пять простых замен.',body:'Восковые салфетки, крышки, контейнеры.\n\nВторой абзац статьи.',keywords:'чем заменить пищевую плёнку',sources:'https://example.org'},wt);
  const wPub = await fetch(B+'/api/collections/drafts/records/'+dr.id,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:wt},body:JSON.stringify({status:'published'})});
  const wList = await api('GET','/collections/drafts/records',null,wt);
  const six = await fetch(B+'/api/collections/users/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'six@test.local',password:'qwe123',passwordConfirm:'qwe123',name:'Шесть',character:chars[1].id})});
  check('a 6-character password is enough', six.status===200);
  await fetch(B+'/api/collections/users/records/'+(await six.json()).id,{method:'DELETE',headers:{Authorization:t}});
  check('writer can add drafts and see own, but cannot publish', !!dr.id && wPub.status>=400 && wList.totalItems===1);
  await p.goto(B+'/kabinet?tab=drafts', {waitUntil:'networkidle'}); await p.waitForTimeout(500);
  check('admin sees site management as a separate row: articles, listings, feedback, people, levels', (await p.$$('.admin-bar .tabs button')).length===5 && (await p.textContent('.admin-bar')).includes('Управление сайтом'));
  check('cabinet shows the new draft with a count in the site-management row', (await p.textContent('.admin-bar')).includes('Статьи (1)') && (await p.textContent('#cabinet-tabs')).includes('Чем заменить пищевую плёнку'));
  check('article helper is not a world dweller', !(await p.textContent('header')).includes('Помощник'));
  await p.click('#cabinet-tabs button:has-text("Читать и править")');
  await p.fill('.draft-ed input', 'Чем заменить пищевую плёнку: 5 идей');
  await p.click('.draft-ed button:has-text("Опубликовать")'); await p.waitForURL('**/zhurnal/*', {timeout:8000});
  check('published draft opens as an article page', new URL(p.url()).pathname==='/zhurnal/chem-zamenit-pischevuyu-plenku-5-idey' && (await p.textContent('#article h1')).includes('5 идей'));
  const smap2 = await (await fetch(B+'/sitemap.xml')).text(), dr2 = await api('GET','/collections/drafts/records/'+dr.id,null,t);
  check('published article is in the sitemap and the draft is marked', smap2.includes('/zhurnal/chem-zamenit-pischevuyu-plenku-5-idey') && dr2.status==='published');
  // SEO fields of an article: own search title and description, new address (old one keeps working), cover picture
  await p.goto(B+'/zhurnal/chem-zamenit-pischevuyu-plenku-5-idey', {waitUntil:'networkidle'});
  await p.click('#edit-slot button'); await p.waitForSelector('#ae-seo_title');
  await p.fill('#ae-seo_title','Чем заменить пищевую плёнку: 5 идей для кухни');
  await p.fill('#ae-seo_desc','Восковые салфетки, крышки и контейнеры вместо плёнки — что выбрать и сколько это экономит.');
  await p.fill('#ae-slug','plenka-zamena'); await p.locator('#ae-slug').blur();
  check('search snippet preview follows the fields', (await p.textContent('.snippet')).includes('5 идей для кухни') && (await p.textContent('.snippet')).includes('plenka-zamena'));
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('.art-editor button:has-text("Загрузить картинку")')]);
  const bigJpg = Buffer.from(await p.evaluate(async ()=>{
    const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; const g = c.getContext('2d');
    for (let i=0;i<3000;i+=5){ g.fillStyle = 'hsl('+(i%360)+','+(30+i%70)+'%,50%)'; g.fillRect(i,0,5,2000); }
    return c.toDataURL('image/jpeg', 0.97).split(',')[1];
  }), 'base64');
  await chooser.setFiles({name:'phone.jpg', mimeType:'image/jpeg', buffer:bigJpg}); await p.waitForSelector('.toast:has-text("Фото добавлено")');
  { const up = await p.$eval('.art-editor img, .art-cover img', i=>[i.getAttribute('src'), i.getAttribute('srcset')||'']).catch(()=>['','']);
    const orig = up[0] ? await (await fetch(B+up[0].replace(/\?.*$/,''))).arrayBuffer() : new ArrayBuffer(0);
    check('a big phone photo is shrunk before upload and shown through small copies', orig.byteLength > 0 && orig.byteLength < bigJpg.length && /\?thumb=960x0$/.test(up[0]) && up[1].includes('?thumb=480x0 480w'));
  }
  await p.click('#save-btn'); await p.waitForSelector('.toast:has-text("Сохранено")',{timeout:5000});
  const rArt = await (await fetch(B+'/zhurnal/plenka-zamena')).text(), rOld = await fetch(B+'/zhurnal/chem-zamenit-pischevuyu-plenku-5-idey');
  check('server page uses the SEO title, description and cover; the old address still opens', rArt.includes('<title>Чем заменить пищевую плёнку: 5 идей для кухни</title>') && rArt.includes('content="Восковые салфетки') && /property="og:image" content="https:\/\/dashabotanika\.ru\/api\/files\/photos\//.test(rArt) && rOld.status===200 && (await rOld.text()).includes('href="https://dashabotanika.ru/zhurnal/plenka-zamena"'));
  await p.goto(B+'/zhurnal/plenka-zamena', {waitUntil:'networkidle'});
  check('article shows its cover picture', !!(await p.$('#article .art-cover img')));
  check('a member gets «Читайте дальше» and a link to subscribe instead of the invitation', (await p.textContent('.art-join')).includes('Читайте дальше') && !(await p.$('.art-join a[href="/kabinet?tab=register"]')) && !!(await p.$('.art-join a[href="/kabinet?tab=profile#notify"]')));
  // the article text with marks: headings, bold, a tip, a divider, lists, a photo — via the editor buttons and typing
  await p.click('#edit-slot button'); await p.waitForSelector('#ae-body');
  await p.fill('#ae-body', 'Плёнка служит минуту, а лежит на свалке веками. Вот чем я её заменила.\n\n## Восковые салфетки\nОни **обнимают миску** и служат около года.\n\n> 💡 Совет:\n> мойте прохладной водой\n\n---\n\n## Крышки и контейнеры\n- стеклянные банки\n- силиконовые крышки\n\n## Что выбрать\n1. Начните с одной салфетки\n2. Добавьте крышки\n\n![Мои салфетки на кухне](/img/coffee.webp)');
  await p.click('.md-b:has-text("Предпросмотр")');
  check('editor: buttons for marks and a live preview', (await p.$$('.md-bar .md-b')).length >= 9 && !!(await p.$('.md-preview h2')));
  await p.click('#save-btn'); await p.waitForSelector('.toast:has-text("Сохранено")',{timeout:5000}); await p.waitForTimeout(400);
  const art = await p.$eval('#article', el=>({h2:el.querySelectorAll('.art-body h2').length, tip:!!el.querySelector('.art-body .art-tip'), div:!!el.querySelector('.art-body .art-divider'),
    strong:!!el.querySelector('.art-body strong'), ul:el.querySelectorAll('.art-body ul li').length, ol:el.querySelectorAll('.art-body ol li').length, fig:!!el.querySelector('.art-body .art-fig img'),
    toc:el.querySelectorAll('.art-toc a').length, mins:/мин чтения/.test(el.textContent), raw:/##|\*\*|^>/m.test(el.querySelector('.art-body').textContent)}));
  check('article: headings, bold, tip, divider, lists, photo, contents and reading time — no raw marks', art.h2===3 && art.tip && art.div && art.strong && art.ul===2 && art.ol===2 && art.fig && art.toc===3 && art.mins && !art.raw);
  await p.locator('#article').screenshot({path:S+'/26-article.png'});
  const rMd = await (await fetch(B+'/zhurnal/plenka-zamena')).text();
  check('server page of the article carries the same structure for search engines', rMd.includes('<h2>Восковые салфетки</h2>') && rMd.includes('<strong>обнимают миску</strong>') && rMd.includes('<aside>') && rMd.includes('<hr>') && rMd.includes('<figcaption>Мои салфетки на кухне</figcaption>'));
  await p.goto(B+'/');
  await p.click('#edit-slot button'); await p.click('#save-btn'); await p.waitForSelector('.toast:has-text("Сохранено")',{timeout:5000});
  // second user, mobile
  const c2 = await b.newContext({viewport:{width:390,height:844}}); await skipSplash(c2);
  const q = await c2.newPage(); watchPage(q,'liza');
  await q.goto(B+'/', {waitUntil:'networkidle'});
  await register(q, 'liza@test.local', 'Лиза', 'Лиса');
  await q.goto(B+'/#feedback'); await q.fill('#fb-text','Добавьте, пожалуйста, тёмную тему');
  check('the file button looks like the site buttons, not the grey browser one', await q.$eval('#fb-photos', el=>getComputedStyle(el,'::file-selector-button').borderTopLeftRadius==='999px'));
  await q.locator('#feedback form').screenshot({path:S+'/25-feedback-form.png'});
  await q.setInputFiles('#fb-photos', PHOTO);
  await q.click('button:has-text("Отправить Даше")'); await q.waitForSelector('#feedback .li:has-text("тёмную тему")');
  await q.goto(B+'/kabinet?tab=things');
  await q.fill('#mk-title','Многоразовый шопер'); await q.fill('#mk-note','Почти новый');
  // a vertical photo opens the frame editor: move it, keep it whole, the finished 4:3 frame is what gets uploaded
  const tall = Buffer.from(await q.evaluate(()=>{ const c = document.createElement('canvas'); c.width = 600; c.height = 1200; const g = c.getContext('2d');
    for (let y=0;y<1200;y+=60){ g.fillStyle = 'hsl('+(y/4)+',70%,55%)'; g.fillRect(0,y,600,60); } return c.toDataURL('image/jpeg',.9).split(',')[1]; }), 'base64');
  await q.setInputFiles('#mk-photo', {name:'tall.jpg', mimeType:'image/jpeg', buffer:tall});
  await q.waitForSelector('.crop-view');
  const vb = await q.locator('.crop-view').boundingBox();
  await q.mouse.move(vb.x+vb.width/2, vb.y+vb.height/2); await q.mouse.down(); await q.mouse.move(vb.x+vb.width/2, vb.y+vb.height/2-60, {steps:5}); await q.mouse.up();
  check('frame editor opens for the chosen photo with zoom, turn and «whole photo»', !!(await q.$('.crop-tools input[type=range]')) && !!(await q.$('.crop-tools button:has-text("Повернуть")')) && !!(await q.$('.crop-tools button:has-text("Целиком")')));
  await q.locator('.crop-sheet').screenshot({path:S+'/27-crop.png'});
  await q.click('.crop-tools button:has-text("Целиком")'); await q.click('.crop-ok');
  await q.waitForSelector('.mk-photo-box .mk-thumb');
  check('the finished frame shows under the form with «Изменить кадр»', !!(await q.$('.mk-photo-box button:has-text("Изменить кадр")')));
  await q.click('button:has-text("Отправить на проверку")'); await q.waitForSelector('.toast:has-text("Отправлено")');
  { const lst = (await api('GET','/collections/listings/records?filter='+encodeURIComponent('title="Многоразовый шопер"'),null,t)).items[0];
    const dims = lst && lst.photo ? await q.evaluate(async u=>{ const b = await (await fetch(u)).blob(); const im = await createImageBitmap(b); return [im.width, im.height]; }, '/api/files/'+lst.collectionId+'/'+lst.id+'/'+lst.photo) : null;
    check('the listing photo is the edited 4:3 frame (1200×900), not the tall original', !!dims && dims[0]===1200 && dims[1]===900); }
  await q.goto(B+'/darom');
  await q.click('#market button:has-text("Хочу забрать")'); await q.waitForURL('**/kabinet?tab=chats**');
  await q.waitForSelector('#chat-input'); await q.fill('#chat-input','Здравствуйте! Банки ещё можно забрать?'); await q.click(T+'button:has-text("Отправить")'); await q.waitForTimeout(800);
  await q.screenshot({path:S+'/05-liza-chat.png'});
  await q.goto(B+'/#world'); await q.waitForTimeout(800); await q.screenshot({path:S+'/06-liza-world-mobile.png'});
  await q.click('.dweller:has-text("Даша")'); await q.click('.dweller:has-text("Даша") .pop button:has-text("Написать")');
  await q.waitForURL('**/kabinet?tab=chats**'); await q.waitForSelector('#chat-input');
  check('private message to a world dweller', (await q.textContent('#cabinet-tabs')).includes('Собеседник: Даша'));
  await q.fill('#chat-input','Привет из эко-мира!'); await q.click(T+'button:has-text("Отправить")'); await q.waitForTimeout(600);
  // Dasha: moderation, chat, feedback, people
  await p.goto(B+'/kabinet?tab=moder', {waitUntil:'networkidle'});
  await p.click(T+'button:has-text("Опубликовать")'); await p.waitForSelector('.toast:has-text("Опубликовано")');
  await p.click('.tabs button:has-text("Сообщения")'); await p.waitForTimeout(500); await p.click(T+'.list .li'); await p.waitForSelector('#chat-input');
  await p.fill('#chat-input','Да, забирайте!'); await p.click(T+'button:has-text("Отправить")'); await p.waitForTimeout(600);
  await p.screenshot({path:S+'/08-dasha-chat.png'});
  await p.click('.tabs button:has-text("Обратная связь")'); await p.waitForSelector(T+'.fb-photos img');
  await p.fill(T+'.li textarea','Спасибо! Уже делаю'); await p.click(T+'button:has-text("Сохранить ответ")'); await p.waitForTimeout(500);
  await p.click(T+'button:has-text("В работе")'); await p.waitForTimeout(600);
  await q.goto(B+'/#feedback'); await q.waitForSelector('#feedback .fb-reply:has-text("Уже делаю")');
  check('feedback reply visible to author', !!(await q.$('#feedback .status:has-text("В работе")')));
  // Liza reports Dasha's comment; Dasha sees it in «Проверка» and decides
  const dt0 = (await api('POST','/collections/users/auth-with-password',{identity:'dasha@test.local',password:'secret1234'})).token;
  const dashaComment = await api('POST','/collections/comments/records',{target:'articles:a1', author:dasha.id, text:'Комментарий для проверки жалоб'},dt0);
  if (dashaComment){
    const lt = (await api('POST','/collections/users/auth-with-password',{identity:'liza@test.local',password:'secret1234'})).token;
    const rep = await api('POST','/collections/reports/records',{comment:dashaComment.id, reporter:(await api('GET','/collections/users/records?filter='+encodeURIComponent('name="Лиза"'),null,t)).items[0].id, reason:'Не по теме'},lt);
    const again = await fetch(B+'/api/collections/reports/records',{method:'POST',headers:{'Content-Type':'application/json',Authorization:lt},body:JSON.stringify({comment:dashaComment.id, reporter:rep.reporter, reason:'Другое'})});
    check('a member can report a comment once', !!rep.id && again.status===400);
    await p.goto(B+'/kabinet?tab=moder', {waitUntil:'networkidle'}); await p.waitForTimeout(600);
    check('admin sees the report in «Проверка» with a count', (await p.textContent('.admin-bar')).includes('Проверка (') && (await p.textContent(T)).includes('Не по теме'));
    await p.locator(T+'.li:has-text("Не по теме") button:has-text("Оставить")').click(); await p.waitForTimeout(600);
    check('«Оставить» closes the report', !(await p.textContent(T)).includes('Не по теме'));
  } else check('there is a comment of Dasha to report', false);
  await p.click('.tabs button:has-text("Участники")'); await p.waitForTimeout(600);
  const sum = await p.textContent(T+'.people-sum');
  check('people summary: 2 total, online counted', /2\s*участника/.test(sum) && /онлайн/.test(sum) && (await p.$$(T+'.online-dot.on')).length >= 1);
  await p.screenshot({path:S+'/09-people.png'});
  // admin records an invitation by hand (the link was opened in another browser)
  const lizaPick = p.locator(T+'.ref-pick:has(select[aria-label="Кто пригласил Лиза"])');
  await lizaPick.locator('select').selectOption({label:'Даша'}); await lizaPick.locator('button').click();
  await p.waitForSelector('.toast:has-text("по приглашению")'); await p.waitForTimeout(600);
  check('admin can record who invited a member', (await p.textContent(T+'.list')).includes('пришёл(ла) по приглашению: Даша') && !(await p.$('select[aria-label="Кто пригласил Лиза"]')));
  await p.waitForSelector('.backup-card h3', {timeout:5000}).catch(()=>{});
  check('«Участники» shows the state of the backups for the site owner', /Резервные копии|резервными копиями/.test(await p.textContent('.backup-card')));
  // useful services: seed list, city and category filters, a member suggests one, admin approves it
  await q.goto(B+'/servisy', {waitUntil:'networkidle'}); await q.waitForSelector('#services .svc');
  check('services page lists the starting services', (await q.$$('#services .svc')).length===6 && (await q.textContent('#services')).includes('RecycleMap'));
  await q.click('#services .chip:has-text("Батарейки и техника")');
  check('category filter', (await q.$$('#services .svc')).length===2);
  await q.click('#services .chip:has-text("Все")');
  await q.fill('#sv-name','ЭкоПункт Казань'); await q.fill('#sv-city','Казань'); await q.selectOption('#sv-cat','Пункты и вывоз вторсырья');
  await q.fill('#sv-acc','пластик, стекло'); await q.fill('#sv-url','ecopunkt.example');
  await q.click('#services button:has-text("Отправить на проверку")'); await q.waitForSelector('.toast:has-text("Даша проверит")');
  await q.waitForTimeout(800);
  check('the suggestion waits for checking and is not public yet', (await q.textContent('#services')).includes('На проверке') && (await api('GET','/collections/services/records?filter='+encodeURIComponent("name='ЭкоПункт Казань'"))).totalItems===0);
  await p.goto(B+'/kabinet?tab=moder', {waitUntil:'networkidle'}); await p.waitForTimeout(500);
  await p.locator(T+'.li:has-text("ЭкоПункт Казань") button:has-text("Добавить в подборку")').click(); await p.waitForSelector('.toast:has-text("Добавлено в подборку")');
  await q.goto(B+'/servisy', {waitUntil:'networkidle'}); await q.waitForSelector('#svc-city'); await q.selectOption('#svc-city','Казань'); await q.waitForTimeout(300);
  const kazan = await q.textContent('#services .grid');
  check('after approval it shows for its city together with all-Russia services', kazan.includes('ЭкоПункт Казань') && kazan.includes('RecycleMap') && !kazan.includes('Собиратор'));
  check('services page for search engines and in the sitemap', (await (await fetch(B+'/servisy')).text()).includes('ЭкоПункт Казань') && (await (await fetch(B+'/sitemap.xml')).text()).includes('/servisy'));
  await q.locator('#services').screenshot({path:S+'/24-services.png'});
  // a page for search engines for every city with its own services
  const rKazan = await fetch(B+'/kuda-sdat/kazan'), kazanHtml = await rKazan.text(), rNoCity = await fetch(B+'/kuda-sdat/nowhere');
  check('city page «в Казани» for search engines, in the sitemap; unknown city is 404', rKazan.status===200 && kazanHtml.includes('<title>Куда сдать вторсырьё, батарейки и технику в Казани') && kazanHtml.includes('ЭкоПункт Казань') && (await (await fetch(B+'/sitemap.xml')).text()).includes('/kuda-sdat/kazan') && rNoCity.status===404);
  await q.click('#services a:has-text("Страница города")'); await q.waitForURL('**/kuda-sdat/kazan'); await q.waitForTimeout(500);
  check('city page on the site: heading with the city and preparation tips', (await q.textContent('h1')).includes('в Казани') && !!(await q.$('.city-tips')) && (await q.textContent('#services .grid')).includes('ЭкоПункт Казань'));
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
  // profile filled in completely -> +20; invitation link -> friend +50 and inviter +40 at once
  const liza = (await api('GET','/collections/users/records?filter='+encodeURIComponent('name="Лиза"'),null,t)).items[0];
  await q.goto(B+'/kabinet', {waitUntil:'networkidle'});
  check('cabinet nudges to fill in the profile', (await q.textContent('#cabinet')).includes('Заполните профиль'));
  await q.goto(B+'/kabinet?tab=settings', {waitUntil:'networkidle'}); await q.waitForSelector('#tg button:has-text("Подключить Telegram")');
  await q.click('#tg button:has-text("Подключить Telegram")');
  check('Telegram card in settings; without a bot token the card says why', !!(await q.waitForSelector('#tg .tg-err:has-text("нет токена")',{timeout:4000}).catch(()=>null)));
  check('notifications: one table of what × where — e-mail for 3 kinds, Telegram for all 5 (off until connected)', (await q.$$('.notify-t tbody tr')).length===5 && (await q.$$('.notify-t input[data-c="mail"]')).length===3 && (await q.$$('.notify-t input[data-c="tg"][disabled]')).length===5);
  await q.check('.notify-t input[data-c="mail"][data-k="weekly"]'); await q.click('.notify-save'); await q.waitForSelector('.toast:has-text("Уведомления сохранены")');
  { const nr = (await api('GET','/collections/notify/records',null,t)).items.find(x=>x.user===liza.id);
    check('the weekly letter by e-mail is saved with the time of consent', !!nr && nr.email_topics.includes('weekly') && !!nr.consent_at); }
  await q.goto(B+'/kabinet?tab=profile', {waitUntil:'networkidle'}); await q.waitForSelector('#pf-age');
  await q.fill('#pf-age','29'); await q.selectOption('#pf-gender','Женский'); await q.fill('#pf-country','Россия'); await q.fill('#pf-city','Новосибирск');
  await q.click('.pf-goals .chip:has-text("Меньше мусора")'); await q.click('.pf-goals .chip:has-text("Питаться")');
  await q.click('button:has-text("Сохранить профиль")'); await q.waitForSelector('.toast:has-text("Профиль заполнен")',{timeout:5000}); await q.waitForTimeout(800);
  const liza1 = await api('GET','/collections/users/records/'+liza.id);
  check('full profile gives +20', liza1.xp === liza.xp + 20);
  check('a filled profile becomes a short summary with «Изменить»; logout at the bottom of every tab', !!(await q.$('.pf-sum')) && (await q.textContent('.pf-sum')).includes('Новосибирск') && !(await q.$('#pf-age')) && !!(await q.$('#cabinet-tabs .cab-foot button:has-text("Выйти из аккаунта")')));
  await q.click('.pf-edit'); check('«Изменить» opens the profile form again', !!(await q.$('#pf-age')) && (await q.inputValue('#pf-city'))==='Новосибирск');
  check('the character list is closed until «Сменить персонажа»', (await q.$$('.acc-char .char')).length===0 && (await q.textContent('.acc-char')).includes('Лиса') && (await q.textContent('.acc-char .acc-em'))==='🦊');
  await q.click('.acc-char button:has-text("Сменить персонажа")');
  check('«Сменить персонажа» opens the list with search, «Отмена» closes it', (await q.$$('.acc-char .char')).length > 40);
  await q.click('.acc-char button:has-text("Отмена")'); check('…and it closes', (await q.$$('.acc-char .char')).length===0);
  await q.goto(B+'/', {waitUntil:'networkidle'}); await q.waitForTimeout(600);
  check('first steps count what is done (registered, profile)', (await q.$$('#steps .step.ok')).length >= 2 && !!(await q.$('#steps .step.next')) && await q.isVisible('#steps .steps-all'));
  await q.click('#steps .steps-hide'); await q.waitForTimeout(200);
  await q.click('.hero-cta a:has-text("Первые шаги")'); await q.waitForTimeout(800);
  check('«Первые шаги» on the first screen brings hidden hints back and scrolls to them', await q.isVisible('#steps .steps') && await q.$eval('#steps', el=>{ const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }));
  await q.goto(B+'/eda', {waitUntil:'networkidle'});
  await q.waitForSelector('#helper .ai-left:has-text("скоро заработает")',{timeout:5000}).catch(()=>{});
  check('AI helper: photo buttons for members, says it is coming while there is no key', !!(await q.$('#helper button:has-text("Загрузить фото еды")')) && (await q.textContent('#helper .ai-left')).includes('скоро заработает'));
  await q.goto(B+'/kabinet?tab=path', {waitUntil:'networkidle'}); await q.waitForSelector('#invite');
  const prof = await api('GET','/collections/profiles/records',null,t);
  check('profile is private: other users and guests do not see it', prof.totalItems===1 && (await api('GET','/collections/profiles/records')).totalItems===0);
  await q.locator('#invite').screenshot({path:S+'/17-invite.png'});
  const link = await q.inputValue('.invite-row input');
  check('invitation link carries the user id', link.endsWith('/?ref='+liza.id));
  const c3 = await b.newContext({viewport:{width:1280,height:900}}); await skipSplash(c3);
  const r3 = await c3.newPage(); watchPage(r3,'friend');
  await r3.goto(link.replace('https://dashabotanika.ru',B), {waitUntil:'networkidle'});
  check('ref is removed from the address', !r3.url().includes('ref='));
  await r3.click('.acc-btn'); await r3.waitForURL('**/kabinet'); await r3.waitForTimeout(400);
  check('registration opens with the invitation banner', (await r3.textContent('.invite-banner')).includes('Лиза приглашает') && !!(await r3.$('#rg-email')));
  await r3.fill('#rg-email','friend@test.local'); await r3.fill('#rg-pass','secret1234'); await r3.fill('#rg-nick','Друг');
  // the elephant belongs to Dasha: hidden from others, and the server refuses it
  const eleph = (await api('GET','/collections/characters/records?filter='+encodeURIComponent("name='Слон'"))).items[0];
  await api('PATCH','/collections/characters/records/'+eleph.id,{reserved_for:dasha.id},t);
  await r3.reload({waitUntil:'networkidle'}); await r3.waitForTimeout(500);
  await r3.fill('#rg-email','friend@test.local'); await r3.fill('#rg-pass','secret1234'); await r3.fill('#rg-nick','Друг');
  const takeEleph = await fetch(B+'/api/collections/users/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'el@test.local',password:'secret12',passwordConfirm:'secret12',name:'Слонёнок',character:eleph.id})});
  check('the elephant is only for Dasha: hidden in the picker and refused by the server', !(await r3.$('.char:has-text("Слон")')) && takeEleph.status===400);
  // own character from the dice; without the consent box the form does not go
  await r3.click('.own button:has-text("Сгенерировать")');
  const ownName = await r3.inputValue('.own input');
  await r3.click('button:has-text("Зарегистрироваться")'); await r3.waitForTimeout(400);
  check('registration needs the privacy consent', r3.url().includes('/kabinet') && !(await r3.$('.acc-btn:has-text("Кабинет")')) && await r3.$eval('#rg-consent', el=>!el.checkValidity()));
  await r3.check('#rg-consent');
  await Promise.all([r3.waitForNavigation(), r3.click('button:has-text("Зарегистрироваться")')]);
  await r3.waitForSelector('.acc-btn:has-text("Кабинет")', {timeout:8000}); await r3.waitForTimeout(800);
  const fr = (await api('GET','/collections/users/records?filter='+encodeURIComponent('name="Друг"'),null,t)).items[0];
  check('own character from the dice is saved, consent time recorded', !!fr.custom_emoji && fr.custom_name===ownName && !!fr.consent_at && (await r3.textContent('.acc-btn')).includes(fr.custom_emoji));
  check('friend by invitation gets signup +50, the inviter +40 at once, without confirming email', fr.xp === 10 + 50 && !fr.verified && (await api('GET','/collections/users/records/'+liza.id)).xp === liza1.xp + 40);
  await q.goto(B+'/kabinet?tab=xp', {waitUntil:'networkidle'}); await q.waitForSelector('.xp-hist summary');
  check('points history and timeline are folded until tapped', !(await q.$eval('.xp-hist', d=>d.open)) && !(await q.$eval('.eco-path details.fold', d=>d.open)) && !(await q.isVisible('.xp-hist .xp-list').catch(()=>false)));
  await q.click('.xp-hist summary'); await q.waitForSelector('.xp-list');
  const hist = await q.textContent('.xp-hist');
  check('points history shows the invited friend, the profile and earlier points', hist.includes('Пригласить друга') && hist.includes('+40') && hist.includes('Заполнить профиль') && hist.includes('до появления истории'));
  await q.locator('.xp-hist').screenshot({path:S+'/18-xp-history.png'});
  await q.goto(B+'/kabinet', {waitUntil:'networkidle'}); await q.waitForSelector('.eco-path .badge');
  const pathText = await q.textContent('.eco-path');
  check('a member has 6 own tabs and no site-management row', (await q.$$('#cabinet-tabs > .wrap > div > .tabs button')).length===6 && !(await q.$('.admin-bar')));
  check('«Мой эко путь» opens first: badges earned and a timeline', (await q.$$('.eco-path .badge.ok')).length >= 2 && (await q.textContent('.badges')).includes('Будем знакомы') && pathText.includes('Вы поселились') && pathText.includes('Заполнить профиль'));
  await q.screenshot({path:S+'/19-eco-path.png', fullPage:true});
  const lizaLog = await api('GET','/collections/xp_log/records?perPage=200',null,(await api('POST','/collections/users/auth-with-password',{identity:'friend@test.local',password:'secret1234'})).token);
  check('a member sees only own points history', lizaLog.items.every(x=>x.user===fr.id));
  await q.goto(B+'/kabinet?tab=path', {waitUntil:'networkidle'}); await q.waitForSelector('#invite'); await q.waitForTimeout(600);
  check('invite card says the points were counted for the friend', (await q.textContent('#invite')).includes('Очки начислены за 1 из 1'));
  const late = await fetch(B+'/api/collections/referrals/records',{method:'POST',headers:{'Content-Type':'application/json',Authorization:(await api('POST','/collections/users/auth-with-password',{identity:'friend@test.local',password:'secret1234'})).token},body:JSON.stringify({inviter:dasha.id, invited:fr.id})});
  check('a second invitation for the same person is refused', late.status >= 400);
  // picked for you: without a profile — a hint; with the goal «less waste» — Liza's reusable bag
  await r3.goto(B+'/darom', {waitUntil:'networkidle'}); await r3.waitForTimeout(500);
  check('market asks to fill the profile to pick items', (await r3.textContent('.picked')).includes('Подберём вещи для вас'));
  const ft = (await api('POST','/collections/users/auth-with-password',{identity:'friend@test.local',password:'secret1234'})).token;
  await api('POST','/collections/profiles/records',{owner:fr.id, age:30, gender:'Мужской', country:'Россия', city:'Москва', goals:['Меньше мусора и пластика']},ft);
  await r3.goto(B+'/darom', {waitUntil:'networkidle'});
  // the profile and the listings load separately: wait for the picked card instead of a fixed pause
  await r3.waitForSelector('.picked .picked-card', {timeout:6000}).catch(()=>{});
  const picked = await r3.textContent('.picked');
  if (!picked.includes('Многоразовый шопер')) console.log('PICKED:', picked.slice(0,300));
  check('market picks items for the goals from the profile', picked.includes('Подобрано для вас') && picked.includes('Многоразовый шопер') && picked.includes('меньше мусора'));
  await q.goto(B+'/darom', {waitUntil:'networkidle'}); await q.screenshot({path:S+'/11-market-mobile.png'});
  q.once('dialog', d=>d.accept());
  await q.goto(B+'/', {waitUntil:'networkidle'}); await q.click('.burger');
  await Promise.all([q.waitForNavigation(), q.click('#site-menu button:has-text("Выйти из аккаунта")')]);
  await q.waitForSelector('.acc-btn:has-text("Войти")');
  check('logout from the burger menu', !!(await q.waitForSelector('.toast:has-text("Вы вышли")',{timeout:3000}).catch(()=>null)));
  console.log('ERRORS:', JSON.stringify(errs, null, 1));
  await b.close();
  if (errs.length) process.exit(1);
})().catch(e=>{ console.error('FAILED', e); console.log('ERRORS:', JSON.stringify(errs, null, 1)); process.exit(1); });
