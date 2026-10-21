
(function(){
"use strict";
// Many views pass optional parts as `cond ? el : null`; skip empty values instead of printing "null".
const _replaceChildren = Element.prototype.replaceChildren;
Element.prototype.replaceChildren = function(...kids){ return _replaceChildren.apply(this, kids.flat().filter(k=>k!=null && k!==false)); };
const DATA_EL = document.getElementById('site-data');
let STATE = JSON.parse(DATA_EL.textContent);
let EDIT = { on:false, dirty:false, can:false };
function normalize(){ STATE.photos = Object.assign({hero:null, about:null, gallery:[]}, STATE.photos||{}); if (!Array.isArray(STATE.moderators)) STATE.moderators = []; if (!Array.isArray(STATE.articles)) STATE.articles = []; }
normalize();

/* ---------- tiny DOM helper ---------- */
function h(tag, attrs, ...kids){
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs){
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v; // only for static, trusted markup
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()){
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
const fmt = (n, d=0) => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(n);
const uid = () => Math.random().toString(36).slice(2,9);
const LEAF = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z" fill="currentColor" opacity=".9"/><path d="M5 19 13 11" stroke="var(--paper)" stroke-width="1.6" stroke-linecap="round"/></svg>';

/* ---------- static content ---------- */
// menu in three groups; the server reads this list too (pb_hooks/seo.js) to give search engines the links
const NAV_GROUPS = [
  ['Сообщество', [['/#world','Счастливый мир'],['/#journal','Журнал'],['/baraholka','Барахолка'],['/#feedback','Обратная связь']]],
  ['Учиться и играть', [['/kabinet#challenges','Эко-челленджи'],['/eko-test','Эко-тест'],['/#game','Игра «Эко-уборка»'],['/#calc','Переработка и сортировка']]],
  ['Жить экологично', [['/servisy','Полезные сервисы'],['/tovary','Товары'],['/#food','Еда'],['/#menu','Конструктор меню'],['/#fashion','Мода'],['/#cafes','Кафе'],['/#air','Чистота воздуха']]]
];
// the same sections as round icons under the first screen
const SECTIONS = [['🌍','Мир','/#world'],['🏁','Челленджи','/kabinet#challenges'],['🎓','Эко-тест','/eko-test'],['🎮','Игра','/#game'],['🌤️','Воздух','/#air'],['♻️','Переработка','/#calc'],['🗺️','Сервисы','/servisy'],
  ['🛍️','Товары','/tovary'],['📦','Барахолка','/baraholka'],['🥗','Еда','/#food'],['👗','Мода','/#fashion'],['☕','Кафе','/#cafes'],['📖','Журнал','/#journal']];

const MATERIALS = [
  {k:'paper', name:'Бумага и картон', mark:'PAP 20–22', unit:'кг в неделю', per:52, w:1, step:.5, def:1.5, co2:.9, kwh:4.1, water:26, trees:.017,
   tips:['Сдавайте сухим и чистым: жирная коробка из-под пиццы не перерабатывается.','Коробки разберите и сложите плоско.','Чеки и бумажные стаканчики не подходят: в них пластик или термослой.']},
  {k:'pet', name:'Пластиковые бутылки', mark:'♳ 1 PET', unit:'шт. в неделю', per:52, w:.03, step:1, def:6, co2:1.5, kwh:5.8,
   tips:['Ополосните и сплющите: в контейнер влезет втрое больше.','Крышки собирайте отдельно, у них другой пластик (♷ 5 PP).','Смотрите на треугольник с цифрой на дне.']},
  {k:'hdpe', name:'Флаконы и канистры', mark:'♴ 2 HDPE · ♷ 5 PP', unit:'шт. в неделю', per:52, w:.05, step:1, def:2, co2:1.3, kwh:4.5,
   tips:['Флаконы от шампуня, бытовой химии и молока часто из ПНД (♴ 2).','Удалите остатки содержимого, этикетку снимать не обязательно.','Пластик ♸ 3 PVC и ♹ 6 PS принимают редко: проверьте в пункте.']},
  {k:'glass', name:'Стеклянные банки и бутылки', mark:'GL 70–72', unit:'шт. в неделю', per:52, w:.3, step:1, def:3, co2:.3, kwh:.7,
   tips:['Стекло перерабатывается бесконечно без потери качества.','Зеркала, посуда, лампочки и оконное стекло к таре не относятся.','Крышки снимите: металлические идут в металл.']},
  {k:'alu', name:'Алюминиевые банки', mark:'ALU 41', unit:'шт. в неделю', per:52, w:.015, step:1, def:4, co2:9, kwh:14,
   tips:['Переработка алюминия экономит до 95% энергии по сравнению с новым.','Проверка магнитом: алюминий не магнитится.','Банку можно смять, так она займёт меньше места.']},
  {k:'tin', name:'Жестяные банки', mark:'FE 40', unit:'шт. в неделю', per:52, w:.06, step:1, def:1, co2:1.5, kwh:1.8,
   tips:['Банки из-под консервов магнитятся: это сталь.','Ополосните от остатков еды.','Острую крышку вдавите внутрь банки.']},
  {k:'textile', name:'Одежда и текстиль', mark:'TEX 60–61', unit:'вещей в месяц', per:12, w:.4, step:1, def:1, co2:3.4, kwh:0,
   tips:['Целые вещи лучше отдать, продать или обменять: см. «Барахолку».','Изношенный текстиль принимают контейнеры фондов и некоторые магазины одежды.','Сдавайте чистым и сухим, в пакете.']},
  {k:'bat', name:'Батарейки', mark:'опасные отходы', unit:'шт. в месяц', per:12, w:.023, step:1, def:2, co2:0, kwh:0, special:true,
   tips:['Батарейки нельзя выбрасывать в общий мусор: в них тяжёлые металлы.','Боксы для батареек есть во многих супермаркетах и магазинах электроники.','Перед сдачей заклейте контакты литиевых батарей скотчем.']}
];
const PRESETS = {
  'Пока не сдаю': {paper:0,pet:0,hdpe:0,glass:0,alu:0,tin:0,textile:0,bat:0},
  'Я одна': {paper:.5,pet:3,hdpe:1,glass:1,alu:2,tin:1,textile:0,bat:1},
  'Типичная семья': {paper:1.5,pet:6,hdpe:2,glass:3,alu:4,tin:1,textile:1,bat:2},
  'Большая семья': {paper:3,pet:12,hdpe:4,glass:6,alu:8,tin:3,textile:2,bat:4}
};

const DEFAULT_HABITS = [
  {id:'bag',name:'Шопер вместо пакета'},
  {id:'cup',name:'Своя кружка или бутылка'},
  {id:'sort',name:'Рассортировала отходы'},
  {id:'veg',name:'День без мяса'},
  {id:'walk',name:'Пешком, на велосипеде или транспорте'},
  {id:'shower',name:'Душ до 5 минут'}
];

const FASHION_TIPS = [
  ['Правило 30 носок','Перед покупкой спросите себя: надену ли я эту вещь хотя бы 30 раз? Если нет, лучше пройти мимо.'],
  ['Секонд-хенд и свопы','Вещь с историей экономит воду, краски и энергию на производство новой. Свопы с подругами ещё и весело.'],
  ['Капсульный гардероб','30–40 вещей, которые сочетаются между собой, дают больше образов, чем шкаф, набитый случайными покупками.'],
  ['Ремонт и апсайкл','Новая пуговица, заплатка или вышивка продлевают жизнь вещи и делают её единственной в своём роде.'],
  ['Стирка при 30°','Холодная стирка бережёт ткань и энергию. Сушите на воздухе: сушильная машина изнашивает волокна.'],
  ['Аксессуары с умом','Сумки из переработанных материалов, винтажные украшения, часы, которые можно ремонтировать.']
];
const FABRICS = [
  ['Лён','Растёт почти без полива и пестицидов, очень прочный','Мнётся, но это его шарм',5],
  ['Конопля','Неприхотлива, улучшает почву, ткань крепкая и дышит','Пока редко встречается',5],
  ['Органический хлопок','Без пестицидов и синтетических удобрений','Всё ещё много воды',4],
  ['Лиоцелл (тенсел)','Из древесины, растворитель используется по замкнутому циклу','Важно, откуда сырьё',4],
  ['Переработанный полиэстер','Вторая жизнь пластиковых бутылок','При стирке выделяет микропластик',3],
  ['Обычный хлопок','Мягкий, приятный к телу','Около 2 700 л воды на одну футболку',2],
  ['Полиэстер','Дешёвый и прочный','Делается из нефти, микропластик, не разлагается',1]
];

const SEASON = [
  ['Янв',['капуста','морковь','свёкла','картофель','лук','яблоки из хранилищ','квашеная капуста']],
  ['Фев',['капуста','свёкла','морковь','редька','проростки','клюква мороженая']],
  ['Мар',['зелень с подоконника','капуста','свёкла','редька','проростки','квашеные овощи']],
  ['Апр',['щавель','черемша','крапива','зелёный лук','редис']],
  ['Май',['щавель','крапива','ревень','редис','спаржа','укроп']],
  ['Июн',['клубника','черешня','молодой картофель','огурцы','кабачки','зелень']],
  ['Июл',['малина','смородина','черника','вишня','огурцы','горошек','кабачки']],
  ['Авг',['помидоры','кукуруза','перец','сливы','яблоки','арбузы','грибы']],
  ['Сен',['яблоки','груши','тыква','брусника','грибы','баклажаны','виноград']],
  ['Окт',['тыква','яблоки','клюква','брусника','облепиха','капуста','свёкла','топинамбур']],
  ['Ноя',['капуста','морковь','свёкла','тыква','клюква','хурма','редька']],
  ['Дек',['капуста','корнеплоды','квашеная капуста','мандарины','хурма','гранаты']]
];
const RECIPES = [
  ['Бульон из очистков','45 минут',['Складывайте в пакет в морозилке луковую шелуху, морковные хвостики, стебли петрушки и укропа.','Когда наберётся полный пакет, залейте 2 л воды, добавьте лавровый лист и перец горошком.','Варите 40 минут на слабом огне и процедите. Бульон хранится в холодильнике до 4 дней.']],
  ['Чипсы из яблочной кожуры','20 минут',['Кожуру от 4–5 яблок перемешайте с ложкой мёда и щепоткой корицы.','Разложите в один слой на противне с пергаментом.','Сушите при 120° 15–20 минут, пока не станут хрустящими.']],
  ['Тыквенный суп и семечки','45 минут',['Мякоть тыквы запеките с луком и морковью при 200° 25 минут, пробейте блендером с бульоном.','Семечки отмойте от волокон, обсушите, сбрызните маслом и посолите.','Обжарьте семечки в духовке при 160° 15 минут и посыпьте ими суп.']]
];

/* ---------- habits storage (db for signed-in, localStorage otherwise) ---------- */
const LS_KEY = 'planet-habits-v1';
let HAB = { habits: DEFAULT_HABITS.slice(), log: {} };
let habRec = null, habReady = false, habTimer = null;
function lsRead(){ try{ const v = localStorage.getItem(LS_KEY); return v ? JSON.parse(v) : null; }catch(e){ return null; } }
function lsWrite(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(HAB)); }catch(e){} }
function saveHabits(){
  lsWrite();
  if (!habReady || !COM.uid) return;
  clearTimeout(habTimer);
  habTimer = setTimeout(()=>{
    const data = JSON.parse(JSON.stringify(HAB));
    (habRec ? pb.collection('habits').update(habRec,{data}) : pb.collection('habits').create({owner:COM.uid, data}).then(r=>{ habRec = r.id; })).catch(()=>{});
  }, 800);
}
const stored = lsRead(); if (stored && stored.habits) HAB = stored;

/* ---------- dates ---------- */
const iso = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function mondayOf(d){ const x = new Date(d); x.setHours(0,0,0,0); const wd = (x.getDay()+6)%7; x.setDate(x.getDate()-wd); return x; }
let weekStart = mondayOf(new Date());
const DOW = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

/* ---------- page shell ---------- */
const app = document.getElementById('app');
function planetSVG(){
  return '<svg class="planet" viewBox="0 0 400 400" role="img" aria-label="Планета с ростком"><defs><clipPath id="pc"><circle cx="200" cy="230" r="150"/></clipPath></defs>'+
  '<circle cx="200" cy="230" r="150" fill="var(--leaf)" opacity=".28"/>'+
  '<g clip-path="url(#pc)"><path d="M40 210c40-30 80 10 120-10s60-50 110-30 70 40 100 20v200H40Z" fill="var(--moss)" opacity=".55"/><path d="M40 300c50-20 90 20 150 0s90-30 170-5v100H40Z" fill="var(--moss)" opacity=".8"/></g>'+
  '<circle cx="200" cy="230" r="150" fill="none" stroke="var(--moss)" stroke-width="3"/>'+
  '<path class="sprout" d="M200 82c0-30 2-50 0-74" stroke="var(--moss)" stroke-width="6" stroke-linecap="round" fill="none" transform="translate(0 0)"/>'+
  '<path class="leafA" d="M202 40c18-26 48-30 68-24-6 26-34 44-68 24Z" fill="var(--leaf)"/>'+
  '<path class="leafB" d="M198 60c-16-24-44-28-62-22 6 24 32 40 62 22Z" fill="var(--moss)"/>'+
  '<circle cx="330" cy="70" r="26" fill="var(--sun)" opacity=".9"/></svg>';
}
const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="18" r="12" fill="var(--leaf)" opacity=".35"/><circle cx="16" cy="18" r="12" fill="none" stroke="var(--moss)" stroke-width="2"/><path d="M16 12c0-5 3-8 9-8-1 6-4 8-9 8Z" fill="var(--moss)"/></svg>';

function sectionHead(eyebrow, title, lead){
  const tag = SEC_H1 ? 'h1' : 'h2'; SEC_H1 = false;
  return h('div',{class:'sec-head'}, h('div',{class:'eyebrow'},eyebrow), h(tag,null,title), lead ? h('p',{class:'lead'},lead) : null);
}

function render(){
  LIVE = [];
  PAGE_UNSUBS.forEach(u=>{ try{u();}catch(e){} }); PAGE_UNSUBS = [];
  const path = currentPath(), page = pageOf(path);
  document.title = page.title;
  SEC_H1 = false;
  app.replaceChildren(
    h('header',{class:'top'}, h('div',{class:'wrap'},
      h('a',{class:'logo',href:'/',html:LOGO+'<span>DashaBotanika</span>'}),
      h('span',{style:'flex:1'}),
      socialLinks(),
      accountButton(),
      siteMenu(path)
    )),
    h('main',null, path !== '/' ? backBar() : null, ...page.render()),
    h('footer',null, h('div',{class:'wrap'+(ART_RE.test(path) || path==='/politika' ? ' narrow' : path==='/kabinet' && accState()!=='member' ? ' narrow auth' : '')},
      h('span',null,'© ', new Date().getFullYear(), ' · ', 'DashaBotanika', ' · Разумный человек — счастливая планета · ', h('a',{href:'/politika'},'Политика конфиденциальности')),
      h('span',{id:'edit-slot'})
    )),
    editBar()
  );
  mountEditButton();
}

/* Dasha's Instagram and Telegram in the top bar; addresses come from the contacts block */
const IG_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.4" cy="6.6" r="1.3" fill="currentColor"/></svg>';
const TG_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 4.2 2.9 11.4c-1 .4-1 1.6 0 1.9l4.6 1.5 1.8 5.6c.2.7 1.1.9 1.6.4l2.6-2.4 4.8 3.5c.6.4 1.4.1 1.6-.6l3.1-15.2c.2-.9-.7-1.6-1.5-1.3ZM9.6 14.4l-.4 3.6-1.3-4.1 9.4-6.4-7.7 6.9Z" fill="currentColor"/></svg>';
function socialLinks(){
  const c = STATE.contacts || {}, handle = v => String(v||'').trim().replace(/^@/,'');
  return h('div',{class:'social'},
    handle(c.instagram) ? h('a',{class:'soc',href:'https://instagram.com/'+handle(c.instagram),target:'_blank',rel:'noopener','aria-label':'Instagram Даши: @'+handle(c.instagram),title:'Instagram @'+handle(c.instagram),html:IG_ICON}) : null,
    handle(c.telegram) ? h('a',{class:'soc',href:'https://t.me/'+handle(c.telegram),target:'_blank',rel:'noopener','aria-label':'Telegram Даши: @'+handle(c.telegram),title:'Telegram @'+handle(c.telegram),html:TG_ICON}) : null);
}
/* burger menu: all sections in a drop-down list, plus cabinet and sign-out */
function siteMenu(path){
  const btn = h('button',{type:'button',class:'burger','aria-label':'Меню','aria-expanded':'false','aria-controls':'site-menu'}, h('span'),h('span'),h('span'));
  const tail = h('div',{class:'menu-tail'});
  const panel = h('nav',{class:'menu',id:'site-menu','aria-label':'Разделы сайта',hidden:true},
    NAV_GROUPS.map(([g, items])=>h('div',{class:'menu-g'}, h('div',{class:'menu-gt'},g), items.map(([href,t])=>h('a',{href,'aria-current':href===path?'page':null},t)))), tail);
  live(()=>{
    tail.replaceChildren(...(accState()==='member'
      ? [h('a',{href:'/kabinet','aria-current':path==='/kabinet'?'page':null},'Личный кабинет'), h('button',{type:'button',class:'menu-out',onclick:logout},'Выйти из аккаунта')]
      : [h('a',{href:'/kabinet'},'Войти или зарегистрироваться')]));
  });
  const set = open => { panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); btn.classList.toggle('open', open); };
  btn.addEventListener('click', e=>{ e.stopPropagation(); set(panel.hidden); });
  panel.addEventListener('click', e=>{ if (e.target.closest('a,button')) set(false); });
  document.addEventListener('click', e=>{ if (!panel.hidden && !panel.contains(e.target)) set(false); });
  document.addEventListener('keydown', e=>{ if (e.key==='Escape' && !panel.hidden){ set(false); btn.focus(); } });
  return h('div',{class:'menu-wrap'}, btn, panel);
}
function hero(){
  return h('section',{class:'hero',id:'top'}, h('div',{class:'wrap'},
    h('div',null,
      h('div',{class:'brand'},'DashaBotanika'),
      h('h1',{html:'Эко: еда, быт, <em>мода</em>, образ жизни!'}),
      h('div',{class:'slogan',html:'Разумный человек — счастливая планета<svg viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true"><path d="M3 9c60-6 130-8 294-2" stroke="var(--sun)" stroke-width="4" fill="none" stroke-linecap="round"/></svg>'}),
      h('p',{class:'hero-intro'},'Сообщество людей, которые делают жизнь вкуснее, красивее и чище — маленькими шагами, без занудства и чувства вины. Выберите своего персонажа, поселитесь в «Счастливом мире» и растите его вместе с полезными привычками.'),
      heroCta()
    ),
    heroArt()
  ));
}

function heroCta(){
  const box = h('div',{class:'hero-cta'});
  live(()=>{ box.replaceChildren(...(accState()==='member'
    ? [h('a',{class:'btn',href:'/kabinet'},'Мой кабинет'), h('a',{class:'btn ghost',href:'/#steps'},'Первые шаги')]
    : [h('a',{class:'btn',href:'/kabinet?tab=register'},'Присоединиться'), h('a',{class:'btn ghost',href:'/#sections'},'Что здесь есть')])); });
  return box;
}
// a row wider than the screen: arrows at the edges and a bar below show it scrolls, and where you are
function scrollCues(row, label, withBack){
  const thumb = h('i'), bar = h('div',{class:'sn-bar','aria-hidden':'true'}, thumb);
  const go = dir => row.scrollBy({left:dir*row.clientWidth*0.8, behavior:'smooth'});
  const more = h('button',{type:'button',class:'sn-more','aria-label':label,onclick:()=>go(1)},'›');
  const back = withBack ? h('button',{type:'button',class:'sn-more sn-back','aria-label':'Назад',onclick:()=>go(-1)},'‹') : null;
  const sync = ()=>{
    const max = row.scrollWidth - row.clientWidth, scrollable = max > 4;
    bar.hidden = more.hidden = !scrollable; if (back) back.hidden = !scrollable;
    if (!scrollable) return;
    const part = row.clientWidth / row.scrollWidth;
    thumb.style.width = (part*100)+'%'; thumb.style.left = (row.scrollLeft/max*(1-part)*100)+'%';
    more.classList.toggle('end', row.scrollLeft >= max - 4);
    if (back) back.classList.toggle('end', row.scrollLeft <= 4);
  };
  row.addEventListener('scroll', sync, {passive:true});
  window.addEventListener('resize', sync);
  requestAnimationFrame(sync);
  return {more, back, bar, sync};
}
function sectionsNav(){
  // on phones the icons scroll sideways: the last one is cut in half, an arrow and a bar below show there is more
  const row = h('div',{class:'sn-row'}, SECTIONS.map(([ic,t,href])=>h('a',{class:'sn',href}, h('span',{class:'sn-ic','aria-hidden':'true'},ic), h('span',{class:'sn-t'},t))));
  const cues = scrollCues(row, 'Показать ещё разделы');
  return h('section',{class:'sections-nav',id:'sections','aria-label':'Разделы сайта'}, h('div',{class:'wrap'},
    h('div',{class:'sn-wrap'}, row, cues.more), cues.bar));
}

/* ---------- first steps: a guide like in games — what to do here, one step at a time ---------- */
const STEPS_HIDE = 'db-steps-hidden';
function firstSteps(){
  const sec = h('section',{class:'band steps-band',id:'steps'});
  live(()=>{
    let hidden = false; try{ hidden = localStorage.getItem(STEPS_HIDE)==='1'; }catch(e){}
    const member = accState()==='member';
    const steps = [
      ['🌱','Зарегистрироваться и выбрать персонажа','signup', member, '/kabinet?tab=register','Присоединиться'],
      ['📝','Заполнить профиль','profile_complete', member && profileDone(PROFILE.rec), '/kabinet?tab=profile#cabinet-tabs','Заполнить'],
      ['🎓','Пройти эко-тест','exam_passed', (STATS.examBest||0) > 0, '/eko-test','Пройти'],
      ['🏁','Начать свой эко-челлендж','challenge_done', member && challenges().length > 0, '/kabinet#challenges','Начать'],
      ['🎮','Сыграть в «Эко-уборку»','game', (STATS.gameBest||0) > 0, '/#game','Играть'],
      ['🌍','Написать соседу в «Счастливом мире»','', member && Object.keys(COM.threads).length > 0, '/#world','В мир'],
      ['💌','Пригласить друга','invite_friend', member && COM.refs.some(r=>r.inviter===COM.uid), member ? '/kabinet?tab=profile#invite' : '/kabinet?tab=register','Пригласить']
    ];
    const done = steps.filter(x=>x[3]).length, next = steps.find(x=>!x[3]), todo = steps.filter(x=>!x[3]).map(x=>x[1]);
    if (hidden || !next){ sec.replaceChildren(); sec.hidden = true; return; }
    sec.hidden = false;
    const pts = key => { const r = COM.growthRules.find(x=>x.key===key); return r && r.points ? ' +'+r.points : ''; };
    const guide = member ? emojiOf(COM.uid) : '🦔';
    sec.replaceChildren(h('div',{class:'wrap'}, h('div',{class:'steps card'},
      h('div',{class:'steps-head'},
        h('div',{class:'steps-guide','aria-hidden':'true'}, guide),
        h('div',{class:'steps-say'},
          h('div',{class:'eyebrow'},'Первые шаги · ',done,' из ',steps.length),
          h('p',{class:'steps-bubble'}, done === 0 ? 'Привет! Я покажу, что здесь делать. Начнём с персонажа — он будет расти вместе с вашими привычками.' : 'Отлично, так держать! Следующий шаг: «'+next[1]+'».'),
          h('div',{class:'steps-bar'}, h('i',{style:'width:'+Math.round(done/steps.length*100)+'%'})))),
      h('ol',{class:'steps-list'}, steps.map(([ic,t,key,ok,href,cta])=>h('li',{class:'step'+(ok?' ok':'')+(next[1]===t?' next':'')+(ok || todo.indexOf(t) > 2 ? ' later' : '')},
        h('span',{class:'step-ic','aria-hidden':'true'}, ok ? '✓' : ic),
        h('span',{class:'step-t'}, t, ok ? null : h('span',{class:'step-pts'}, pts(key))),
        ok ? null : h('a',{class:'btn small'+(next[1]===t?'':' ghost'),href},cta)))),
      todo.length + done > 3 ? h('button',{type:'button',class:'linkish steps-all',onclick:e=>{ const box = e.currentTarget.closest('.steps'); box.classList.toggle('all'); e.currentTarget.textContent = box.classList.contains('all') ? 'Свернуть' : 'Все шаги ('+steps.length+')'; }},'Все шаги ('+steps.length+')') : null,
      h('button',{type:'button',class:'linkish steps-hide',onclick:()=>{ try{ localStorage.setItem(STEPS_HIDE,'1'); }catch(e){} refresh(); }},'Скрыть подсказки'))));
  });
  return sec;
}

/* ---------- photos & natural elements ---------- */
const STONE_GRAD = '<defs><radialGradient id="stg" cx="35%" cy="28%" r="80%"><stop offset="0" style="stop-color:var(--stone-hi)"/><stop offset=".65" style="stop-color:var(--stone)"/><stop offset="1" style="stop-color:var(--stone-dk)"/></radialGradient><radialGradient id="stg2" cx="40%" cy="25%" r="85%"><stop offset="0" style="stop-color:var(--sand-deep)"/><stop offset="1" style="stop-color:var(--stone)"/></radialGradient></defs>';
const STONES = '<svg class="stones" viewBox="0 0 220 120" aria-hidden="true">'+STONE_GRAD+
  '<ellipse cx="110" cy="112" rx="100" ry="8" style="fill:var(--ink)" opacity=".12"/>'+
  '<path d="M18 104c-6-22 14-40 44-42 34-2 58 12 56 32-2 16-26 20-54 18-24-1-42-1-46-8Z" fill="url(#stg)"/>'+
  '<path d="M104 106c-4-18 10-32 34-34 30-3 62 6 64 24 1 12-18 16-48 15-28 0-46 3-50-5Z" fill="url(#stg2)"/>'+
  '<path d="M70 66c-4-14 6-24 22-26 18-2 34 4 34 16 0 10-14 14-30 14-14 0-24 2-26-4Z" fill="url(#stg)"/></svg>';
const SPRIG = '<svg class="sprig" viewBox="0 0 140 180" aria-hidden="true"><path d="M30 176C46 128 70 76 116 8" style="stroke:var(--moss)" stroke-width="3" fill="none" stroke-linecap="round"/>'+
  [[44,140,-40],[58,112,30],[66,96,-48],[80,74,24],[88,58,-50],[100,38,20],[108,22,-46]].map(([x,y,r],i)=>'<ellipse cx="'+x+'" cy="'+y+'" rx="'+(16-i)+'" ry="'+(8-i*0.5)+'" transform="rotate('+r+' '+x+' '+y+') translate('+(r>0?12:-12)+' 0)" style="fill:'+(i%2?'var(--leaf)':'var(--moss)')+'" opacity=".92"/>').join('')+'</svg>';
const CAIRN_SCENE = '<svg viewBox="0 0 400 500" aria-label="Пирамидка из камней на песке" role="img">'+STONE_GRAD+
  '<path d="M0 380c80-24 150-6 220-18s120-26 180-8v146H0Z" style="fill:var(--soft)" opacity=".9"/>'+
  '<path d="M0 420c90-18 170 4 250-8s110-16 150-6v94H0Z" style="fill:var(--paper)" opacity=".8"/>'+
  '<ellipse cx="200" cy="392" rx="120" ry="12" style="fill:var(--ink)" opacity=".12"/>'+
  '<ellipse cx="200" cy="364" rx="104" ry="32" fill="url(#stg)"/>'+
  '<ellipse cx="206" cy="306" rx="80" ry="27" fill="url(#stg2)"/>'+
  '<ellipse cx="196" cy="256" rx="60" ry="22" fill="url(#stg)"/>'+
  '<ellipse cx="202" cy="214" rx="42" ry="17" fill="url(#stg2)"/>'+
  '<path d="M202 197c-2-30 4-56 22-80" style="stroke:var(--moss)" stroke-width="4" fill="none" stroke-linecap="round"/>'+
  '<path d="M222 126c14-22 40-26 58-20-6 22-30 36-58 20Z" style="fill:var(--leaf)"/>'+
  '<path d="M210 158c-14-20-38-24-54-18 6 20 28 32 54 18Z" style="fill:var(--moss)"/>'+
  '<circle cx="318" cy="92" r="30" style="fill:var(--sun)" opacity=".85"/></svg>';
const CAIRN_ICON = '<svg class="cairn" viewBox="0 0 34 34" aria-hidden="true"><ellipse cx="17" cy="28" rx="12" ry="4.5" style="fill:var(--stone)"/><ellipse cx="17.5" cy="20.5" rx="9" ry="3.8" style="fill:var(--stone-hi)"/><ellipse cx="16.5" cy="14" rx="6.5" ry="3" style="fill:var(--stone)"/><path d="M17 11c0-4 2-7 6-8-1 4-3 6-6 8Z" style="fill:var(--moss)"/></svg>';
const photoURL = id => String(id);
// Лёгкие версии фото: для своих картинок рядом лежит копия «-480», для загруженных PocketBase делает миниатюры.
const SMALL_IMG = /^\/img\/[\w-]+\.webp$/;
function photoSrc(id){
  const u = photoURL(id);
  if (SMALL_IMG.test(u)) return {src:u, srcset:u.replace(/\.webp$/,'-480.webp')+' 480w, '+u+' 960w'};
  if (/^\/api\/files\/photos\/[^?]+\.jpe?g$/i.test(u)) return {src:u+'?thumb=960x0', srcset:u+'?thumb=480x0 480w, '+u+'?thumb=960x0 960w'};
  return {src:u};
}
function photoImg(id, alt, fallbackHTML, opts){
  const o = opts||{}, ps = photoSrc(id);
  const img = h('img',{src:ps.src, srcset:ps.srcset||null, sizes:ps.srcset ? (o.sizes||'(max-width: 700px) 100vw, 480px') : null, alt,
    loading:o.eager ? 'eager' : 'lazy', decoding:'async', fetchpriority:o.eager ? 'high' : null});
  img.addEventListener('error',()=>{ const f=h('div',{html:fallbackHTML||'',style:'width:100%;height:100%'}); img.replaceWith(f); });
  return img;
}
function pickAndUpload(onDone){
  if (!EDIT.can){ toast('Загрузка фото доступна только редакторам сайта'); return; }
  const inp = h('input',{type:'file',accept:'image/jpeg,image/png,image/webp'});
  inp.addEventListener('change', async ()=>{
    const f = inp.files && inp.files[0]; if (!f) return;
    if (f.size > 15*1024*1024){ toast('Фото больше 15 МБ, уменьшите его'); return; }
    toast('Загружаю фото…');
    try{
      const fd = new FormData(); fd.append('file', await fitPhoto(f)); fd.append('uploaded_by', COM.uid);
      const r = await pb.collection('photos').create(fd);
      onDone('/api/files/photos/'+r.id+'/'+encodeURIComponent(r.file)); markDirty(); render(); toast('Фото добавлено. Не забудьте сохранить');
    }catch(e){
      toast(e && e.status===400 ? 'Подходят JPG, PNG или WebP до 15 МБ' : 'Не получилось загрузить фото, попробуйте ещё раз');
    }
  });
  inp.click();
}
function uploadBtn(label, onDone, extraClass){
  if (!EDIT.can) return null;
  return h('button',{type:'button',class:'btn small edit-only '+(extraClass||''),onclick:()=>pickAndUpload(onDone)},label);
}
function heroArt(){
  const id = STATE.photos.hero;
  return h('div',{class:'hero-art'},
    h('div',{class:'pebble'}, id ? photoImg(id, STATE.about.name||'Фото', CAIRN_SCENE, {eager:true}) : h('div',{html:CAIRN_SCENE,style:'width:100%;height:100%'})),
    h('div',{html:STONES,style:'display:contents'}),
    h('div',{html:SPRIG,style:'display:contents'}),
    id && STATE.about.name ? h('span',{class:'caption'},STATE.about.name) : null,
    uploadBtn(id ? 'Заменить фото' : 'Загрузить фото Даши', nid=>{ STATE.photos.hero = nid; }, 'upl')
  );
}

/* ---------- sorting guide: "Начать путь в экологии — ЛЕГКО" ---------- */
const MAT_ART = {
  paper:'<svg viewBox="0 0 64 64"><rect x="10" y="30" width="34" height="24" rx="2" fill="#C89B62"/><path d="M10 30l8-8h34l-8 8z" fill="#D8B07A"/><path d="M44 30l8-8v24l-8 8z" fill="#B3854F"/><rect x="18" y="12" width="26" height="18" rx="2" fill="#F4EEDD" transform="rotate(-8 31 21)"/><g stroke="#9A8C6C" stroke-width="2" transform="rotate(-8 31 21)"><path d="M22 18h18M22 22h18M22 26h12"/></g><path d="M22 40h14" stroke="#8E6A3D" stroke-width="2"/></svg>',
  pet:'<svg viewBox="0 0 64 64"><rect x="27" y="6" width="10" height="6" rx="2" fill="#2F7FB0"/><path d="M26 12h12v6c6 3 8 7 8 12v24a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V30c0-5 2-9 8-12z" fill="#9FD3E6"/><rect x="18" y="32" width="28" height="10" fill="#5DB0D6"/><path d="M24 22v30" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/></svg>',
  hdpe:'<svg viewBox="0 0 64 64"><rect x="36" y="6" width="10" height="7" rx="2" fill="#E07B39"/><path d="M14 20c0-4 3-7 7-7h18c3 0 5 1 6 3l3 4v34a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z" fill="#F4F1EA" stroke="#C9C2B3" stroke-width="2"/><path d="M14 20h10v10H14z" fill="#E9E3D5"/><rect x="20" y="34" width="22" height="14" rx="3" fill="#8DC07A"/></svg>',
  glass:'<svg viewBox="0 0 64 64"><rect x="18" y="8" width="28" height="8" rx="2" fill="#7C8A80"/><path d="M16 20c0-2 2-4 4-4h24c2 0 4 2 4 4v32a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6z" fill="#7FBF8E" opacity=".85"/><rect x="21" y="30" width="22" height="12" rx="2" fill="#F4EEDD"/><path d="M22 22v28" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/></svg>',
  alu:'<svg viewBox="0 0 64 64"><ellipse cx="32" cy="10" rx="13" ry="4" fill="#C9CED3"/><path d="M19 10h26l-2 6v32l2 6H19l2-6V16z" fill="#D2483A"/><path d="M21 16h22v32H21z" fill="#E25B4C"/><path d="M21 26h22v8H21z" fill="#fff" opacity=".85"/><ellipse cx="32" cy="54" rx="13" ry="4" fill="#AEB4BA"/><circle cx="36" cy="10" r="2" fill="#8D959C"/></svg>',
  tin:'<svg viewBox="0 0 64 64"><ellipse cx="32" cy="14" rx="16" ry="5" fill="#9AA3AA"/><path d="M16 14h32v36H16z" fill="#B9C0C6"/><path d="M16 22h32v20H16z" fill="#E9C46F"/><path d="M22 32h20" stroke="#8B6B2E" stroke-width="2"/><ellipse cx="32" cy="50" rx="16" ry="5" fill="#8D959C"/><path d="M16 14v36M48 14v36" stroke="#8D959C" stroke-width="1.5"/></svg>',
  textile:'<svg viewBox="0 0 64 64"><path d="M22 8l-14 8 6 12 6-3v31h24V25l6 3 6-12-14-8c-2 4-6 6-10 6s-8-2-10-6z" fill="#86A85C"/><path d="M22 8c2 4 6 6 10 6s8-2 10-6" fill="none" stroke="#5E7F3E" stroke-width="2"/><path d="M26 34h12M26 40h12" stroke="#fff" stroke-width="2" opacity=".6"/></svg>',
  bat:'<svg viewBox="0 0 64 64"><rect x="27" y="6" width="10" height="5" rx="1.5" fill="#B9C0C6"/><rect x="20" y="10" width="24" height="46" rx="4" fill="#2B2B2B"/><rect x="20" y="10" width="24" height="16" rx="4" fill="#D9A933"/><path d="M34 32l-6 9h5l-3 8 8-11h-5l3-6z" fill="#F3D35B"/></svg>'
};
const MAT_COLOR = {paper:'#C89B62', pet:'#5DB0D6', hdpe:'#8DC07A', glass:'#4F9A69', alu:'#D2483A', tin:'#9AA3AA', textile:'#86A85C', bat:'#D9A933'};
const MAT_WHERE = {paper:'Синий контейнер «Бумага» или пункт приёма макулатуры', pet:'Жёлтый контейнер «Пластик» или фандомат', hdpe:'Контейнер «Пластик»; проверьте цифру на дне', glass:'Зелёный контейнер «Стекло»', alu:'Контейнер «Металл», «Пластик и металл» или фандомат', tin:'Контейнер «Металл»', textile:'Контейнеры для одежды, фонды и магазины с приёмом одежды', bat:'Боксы для батареек в супермаркетах и магазинах электроники'};
const MAT_REUSE = {
  paper:['Коробки — органайзеры для ящиков и игрушек','Чистая сторона листов — для заметок и рисования','Крафт-пакеты — обёртка для подарков'],
  pet:['Лейка для цветов: проколите крышку','Кормушка для птиц или рассада','А лучше — своя многоразовая бутылка вместо покупной воды'],
  hdpe:['Канистра — для полива дачи или хранения воды','Флаконы — для домашних средств на разлив','Берите средства на разлив в свою тару'],
  glass:['Банки — для круп, специй, заготовок','Подсвечник или вазочка','Ланч с собой в банке вместо одноразового контейнера'],
  alu:['Баночка — подставка для кисточек и ручек','Но лучше выбирать напитки в стекле на разлив'],
  tin:['Горшок для рассады: проделайте дырочки в дне','Подставка для столовых приборов на кухне'],
  textile:['Старые футболки — тряпки для уборки','Сшейте шопер или мешочки для овощей','Целые вещи — в барахолку: кому-то пригодятся'],
  bat:['Перейдите на аккумуляторы: один заменяет сотни батареек','Заряжайте и пользуйтесь годами']
};
const ECO_LADDER = [
  {ic:'🚫', t:'Откажитесь', d:'То, что можно просто убрать из жизни — самый простой и самый полезный шаг.', ex:['Пакеты на кассе','Одноразовые стаканы и трубочки','Бумажные чеки — берите электронные','Рекламные листовки и пробники'], link:null},
  {ic:'🔁', t:'Замените многоразовым', d:'Один раз купили — годами не производите мусор.', ex:['Шопер','Своя кружка и бутылка','Контейнеры для еды','Сетки для овощей'], link:['/tovary','Многоразовые товары']},
  {ic:'🫙', t:'Используйте повторно', d:'Дайте вещам вторую жизнь дома или отдайте тем, кому они нужнее.', ex:['Банки — под крупы','Коробки — для хранения','Одежду — обменять или отдать','Сломанное — починить'], link:['/baraholka','В барахолку']},
  {ic:'♻️', t:'Переработайте', d:'То, что осталось, сдайте во вторсырьё — как, смотрите в схеме ниже.', ex:['Бумага','Пластик','Стекло','Металл'], link:null}
];
function sortGuide(){
  let cur = 'paper';
  const ring = h('div',{class:'sg-ring'}), card = h('div',{class:'sg-card','aria-live':'polite'});
  function paint(){
    const m = MATERIALS.find(x=>x.k===cur);
    ring.replaceChildren(
      h('div',{class:'sg-center'}, h('div',{class:'sg-loop','aria-hidden':'true'}), h('span',{class:'sg-recy','aria-hidden':'true'},'♻'), h('b',null,'8 видов вторсырья'), h('small',null,'Нажмите на материал')),
      ...MATERIALS.map((x,i)=>h('button',{type:'button',class:'sg-item'+(x.k===cur?' on':''),style:'--c:'+MAT_COLOR[x.k]+';left:'+(50+39*Math.cos((i*45-90)*Math.PI/180)).toFixed(2)+'%;top:'+(50+39*Math.sin((i*45-90)*Math.PI/180)).toFixed(2)+'%','aria-pressed':String(x.k===cur),onclick:()=>{ cur = x.k; paint(); if (window.innerWidth < 860) card.scrollIntoView({behavior:'smooth',block:'nearest'}); }},
        h('span',{class:'sg-ic',html:MAT_ART[x.k]}), h('span',{class:'sg-name'},x.name), h('span',{class:'sg-mark'},x.mark))));
    card.replaceChildren(
      h('div',{class:'sg-card-head'}, h('span',{class:'sg-big',style:'--c:'+MAT_COLOR[m.k],html:MAT_ART[m.k]}),
        h('div',null, h('div',{class:'eyebrow'}, m.special ? 'Опасные отходы' : 'Вторсырьё'), h('h3',{style:'font-size:26px'},m.name), h('span',{class:'tag'},m.mark))),
      h('div',{class:'sg-where'}, h('span',{'aria-hidden':'true'},'📍'), h('span',null, h('b',null,'Куда сдавать: '), MAT_WHERE[m.k])),
      h('h4',null,'Как подготовить'),
      h('ol',{class:'sg-tips'}, m.tips.map(t=>h('li',null,t))),
      MAT_REUSE[m.k] ? h('div',{class:'sg-reuse'}, h('h4',null,'🔁 Можно использовать повторно'), h('ul',null, MAT_REUSE[m.k].map(t=>h('li',null,t)))) : null);
  }
  paint();
  const steps = [['🧺','Соберите','Поставьте рядом с обычным ведром второе — для сухого вторсырья.'],['🚿','Подготовьте','Ополосните, сплющите, разберите коробки. Две минуты в день.'],['♻️','Сдайте','В цветной контейнер во дворе или в пункт приёма раз в неделю.']];
  return h('section',{class:'band alt',id:'sort'}, h('div',{class:'wrap'},
    h('div',{class:'sec-head'}, h('div',{class:'eyebrow'},'Эко-путь'), h('h2',null,'Начать путь в экологии — ',h('span',{class:'sg-easy'},'ЛЕГКО')),
      h('p',{class:'lead'},'Меньше мусора — это не только сортировка. Сначала откажитесь от лишнего, замените одноразовое многоразовым, используйте вещи повторно — и только то, что осталось, отправьте в переработку.')),
    h('ol',{class:'ladder'}, ECO_LADDER.map((st,i)=>h('li',{class:'rung',style:'--n:'+i},
      h('div',{class:'rung-top'}, h('span',{class:'rung-num'},i+1), h('span',{class:'rung-ic','aria-hidden':'true'},st.ic)),
      h('h3',null,st.t), h('p',{class:'muted'},st.d),
      h('ul',{class:'rung-ex'}, st.ex.map(x=>h('li',null,x))),
      st.link ? h('a',{class:'btn ghost small',href:st.link[0].startsWith('#') ? st.link[0] : st.link[0],onclick:st.link[0].startsWith('#') ? e=>{ e.preventDefault(); const el = document.getElementById(st.link[0].slice(1)); if (el) el.scrollIntoView({behavior:'smooth'}); } : null}, st.link[1],' →') : null))),
    h('p',{class:'ladder-note'},'Чем раньше шаг — тем больше пользы: лучший мусор тот, которого не было.'),
    h('h3',{class:'sg-sub',id:'sort-scheme'},'Сортировка за 3 шага'),
    h('div',{class:'sg-steps'}, steps.flatMap(([ic,t,d],i)=>[h('div',{class:'sg-step'}, h('span',{class:'sg-num'},i+1), h('span',{class:'sg-step-ic','aria-hidden':'true'},ic), h('b',null,t), h('p',{class:'muted'},d)), i<2 ? h('span',{class:'sg-arrow','aria-hidden':'true'},'→') : null])),
    h('div',{class:'sg-main'}, ring, card)
  ));
}

/* ---------- calculator ---------- */
const calcVals = Object.fromEntries(MATERIALS.map(m=>[m.k,m.def]));
function calcSection(){
  const res = h('div',{class:'result','aria-live':'polite'});
  const list = h('div',{class:'mat-list'}, MATERIALS.map(m=>{
    const inp = h('input',{type:'number',min:'0',step:String(m.step),value:String(calcVals[m.k]),id:'calc-'+m.k,'aria-label':m.name+', '+m.unit});
    const set = v => { v = Math.max(0, Math.round(v*10)/10); calcVals[m.k]=v; inp.value=v; paint(); };
    inp.addEventListener('input',()=>{ const v=parseFloat(inp.value.replace(',','.')); calcVals[m.k]=isNaN(v)?0:Math.max(0,v); paint(); });
    return h('div',{class:'mat'},
      h('div',null, h('b',null,m.name, h('span',{class:'mark'},m.mark)), h('small',null,m.unit)),
      h('div',{class:'stepper'}, h('button',{type:'button','aria-label':'Меньше',onclick:()=>set(calcVals[m.k]-m.step)},'−'), inp, h('button',{type:'button','aria-label':'Больше',onclick:()=>set(calcVals[m.k]+m.step)},'+'))
    );
  }));
  function paint(){
    let co2=0,kwh=0,water=0,trees=0,kg=0,bat=0;
    for (const m of MATERIALS){
      const units = (calcVals[m.k]||0)*m.per, mass = units*m.w;
      if (m.special){ bat += units; continue; }
      kg+=mass; co2+=mass*m.co2; kwh+=mass*(m.kwh||0); water+=mass*(m.water||0); trees+=mass*(m.trees||0);
    }
    const km = co2/0.17, fridge = kwh/1.2;
    if (!kg && !bat){
      res.replaceChildren(h('div',{class:'zero'},
        h('div',{style:'font-size:40px','aria-hidden':'true'},'🌱'),
        h('div',{class:'big',style:'font-size:28px'},'Пока ноль — и это нормально'),
        h('p',null,'Начните с одного шага: например, сдавайте только батарейки или пластиковые бутылки. Даже 3 бутылки в неделю — это около 6 кг пластика в год, который не окажется на свалке.'),
        h('div',{style:'display:flex;gap:8px;flex-wrap:wrap'}, h('a',{class:'btn small',href:'/#sort'},'С чего начать'), h('a',{class:'btn ghost small',href:'/kabinet#challenges'},'Взять челлендж'))));
      return;
    }
    res.replaceChildren(
      h('div',null, h('div',{style:'font-weight:800;opacity:.85'},'За год вы не дадите выбросить в атмосферу'), h('div',{class:'big'},fmt(co2),' кг'), h('div',{style:'opacity:.85'},'CO₂-эквивалента')),
      h('div',{class:'tiles'},
        h('div',{class:'tile'}, h('b',null,fmt(kg)), h('span',null,'кг вторсырья в год')),
        h('div',{class:'tile'}, h('b',null,fmt(kwh)), h('span',null,'кВт·ч энергии сэкономлено')),
        h('div',{class:'tile'}, h('b',null,fmt(trees,1)), h('span',null,'деревьев сохранено (бумага)')),
        h('div',{class:'tile'}, h('b',null,fmt(bat)), h('span',null,'батареек не попадут на свалку'))
      ),
      h('p',{class:'equiv'},'Это как не проехать ', fmt(km), ' км на машине и ', fmt(fridge), ' дней работы холодильника бесплатно', water>0 ? ', плюс '+fmt(water)+' л воды на производстве бумаги' : '', '.')
    );
  }
  paint();
  const presets = h('div',{class:'presets'}, h('span',{class:'muted',style:'align-self:center;font-weight:700;font-size:14px'},'Быстро заполнить:'),
    Object.keys(PRESETS).map(name=>h('button',{type:'button',class:'btn ghost small',onclick:()=>{ Object.assign(calcVals,PRESETS[name]); for(const m of MATERIALS){ const el=document.getElementById('calc-'+m.k); if(el) el.value=calcVals[m.k]; } paint(); }},name)));
  return h('section',{class:'band',id:'calc'}, h('div',{class:'wrap'},
    sectionHead('Калькулятор переработки','Сколько пользы в вашем мусорном ведре?','Укажите, сколько отходов вы сдаёте на переработку, и посмотрите, что это даёт планете за год. Ниже коротко о том, как сдавать каждый вид вторсырья.'),
    h('div',{class:'calc'}, h('div',null,presets,list), res),
    h('p',{class:'note'},'Цифры ориентировочные: усреднённые оценки экономии выбросов и энергии при переработке по сравнению с производством из первичного сырья. Реальная польза зависит от региона и того, как устроена переработка. Маркировку ищите на упаковке: треугольник из стрелок с цифрой или буквенный код.')
  ));
}

/* ---------- eco challenges: own goal, own habits, own term; passed at 70% of the checks ---------- */
const CH_PASS = 0.7;
const CH_GOALS = [
  {k:'eco', l:'Экология', d:'меньше мусора и пластика', ic:'🌍', habits:['Шопер вместо пакета','Своя кружка или бутылка','Рассортировал(а) отходы','Пешком, на велосипеде или транспорте','Без доставки еды','Без одноразового пластика']},
  {k:'health', l:'Здоровье', d:'больше сил и хорошего самочувствия', ic:'💚', habits:['8 стаканов воды','30 минут прогулки','Сон 7–8 часов','Овощи в каждом приёме пищи','Зарядка утром','Без сладких напитков']},
  {k:'slim', l:'Похудение', d:'лёгкость без жёстких диет', ic:'🥗', habits:['Без сладкого','10 000 шагов','Ужин до 19:00','Вода вместо соков и газировки','Порция овощей к каждому блюду','Без фастфуда']},
  {k:'good', l:'Польза', d:'осознанные покупки и еда', ic:'🌿', habits:['День без мяса','Готовлю дома','Сезонные продукты','Без лишних покупок','Душ до 5 минут','20 минут читаю об экологии']}
];
const CH_DAYS = [7,14,21,30];
const goalOf = k => CH_GOALS.find(g=>g.k===k) || CH_GOALS[0];
const addDays = (s, n) => { const d = new Date(s+'T00:00:00'); d.setDate(d.getDate()+n); return iso(d); };
const fmtDay = s => new Date(s+'T00:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'});
function chStats(ch){
  const today = iso(new Date()), ids = ch.habits.map(x=>x.id), end = addDays(ch.start, ch.days-1);
  let checks = 0;
  for (const day in (ch.log||{})){ if (day < ch.start || day > end) continue; checks += (ch.log[day]||[]).filter(id=>ids.includes(id)).length; }
  const total = ch.days * Math.max(1, ids.length);
  const dayNo = today < ch.start ? 0 : Math.min(ch.days, Math.round((new Date(today+'T00:00:00') - new Date(ch.start+'T00:00:00'))/86400000) + 1);
  let streak = 0; let c = today > end ? end : today;
  if (!((ch.log||{})[c]||[]).length) c = addDays(c, -1);
  while (c >= ch.start && ((ch.log||{})[c]||[]).length){ streak++; c = addDays(c, -1); }
  const ratio = checks/total, finished = today >= end;
  return {today, end, checks, total, ratio, dayNo, streak, finished, over: today > end, passed: finished && ratio >= CH_PASS};
}
const challenges = () => (HAB.challenges = Array.isArray(HAB.challenges) ? HAB.challenges : []);
const chPoints = () => ((COM.growthRules.find(r=>r.key==='challenge_done')||{}).points) || 50;

function challengesSection(){
  const box = h('div',{class:'chs'});
  let wizard = null, pages = {}, calMonth = iso(new Date()).slice(0,7), calDay = null;
  function paint(){
    const list = challenges();
    const active = list.filter(ch=>!chStats(ch).over), past = list.filter(ch=>chStats(ch).over).reverse();
    box.replaceChildren(...[
      wizard ? wizardView() : h('div',{class:'ch-new'},
        h('button',{type:'button',class:'btn',onclick:()=>{ wizard = {step:1, goal:null, days:14, startToday:true, habits:[], custom:''}; paint(); }},'+ Создать челлендж'),
        h('p',{class:'hint'},'Выберите цель, срок и привычки. Отмечайте каждый день — и за пройденный челлендж получите +', chPoints(),' очков роста. ', h('a',{href:'/kabinet?tab=settings#tg'},'🔔 Напоминания в Telegram'))),
      ...(active.length ? active.map(card) : (wizard ? [] : [h('div',{class:'empty'},'У вас пока нет челленджей. Создайте первый — например, 14 дней без пластиковых пакетов.')])),
      list.length ? calendarView() : null,
      past.length ? h('div',null, h('h3',{style:'font-size:20px;margin:10px 0'},'Завершённые'), h('div',{class:'list'}, past.map(pastItem))) : null].filter(Boolean));
  }
  // habits calendar: a month at a glance; the colour of a day = share of the day's habits that are checked
  function dayPlan(d){
    return challenges().filter(ch=>d >= ch.start && d <= addDays(ch.start, ch.days-1)).map(ch=>({ch, on:new Set((ch.log||{})[d]||[])}));
  }
  function calendarView(){
    const today = iso(new Date()), [y, m] = calMonth.split('-').map(Number);
    const first = new Date(y, m-1, 1), daysIn = new Date(y, m, 0).getDate(), lead = (first.getDay()+6)%7;
    const title = first.toLocaleDateString('ru-RU',{month:'long', year:'numeric'});
    const shift = n => { const d = new Date(y, m-1+n, 1); calMonth = iso(d).slice(0,7); calDay = null; paint(); };
    // only months with challenges: from the first start to the last end (and always the current month)
    const chs = challenges(), cur = today.slice(0,7);
    const minM = chs.reduce((a,ch)=>ch.start.slice(0,7) < a ? ch.start.slice(0,7) : a, cur);
    const maxM = chs.reduce((a,ch)=>{ const e = addDays(ch.start, ch.days-1).slice(0,7); return e > a ? e : a; }, cur);
    let monthChecks = 0, fullDays = 0;
    const cells = [...Array(lead)].map(()=>h('span',{class:'cal-pad'}));
    for (let i=1; i<=daysIn; i++){
      const d = calMonth+'-'+String(i).padStart(2,'0'), plan = dayPlan(d);
      const total = plan.reduce((s,x)=>s+x.ch.habits.length,0), done = plan.reduce((s,x)=>s+x.ch.habits.filter(hb=>x.on.has(hb.id)).length,0);
      monthChecks += done; if (total && done===total) fullDays++;
      const lvl = !total ? '' : done===0 ? (d < today ? ' miss' : '') : done===total ? ' full' : ' part';
      cells.push(h('button',{type:'button',class:'cal-d'+lvl+(d===today?' today':'')+(d===calDay?' sel':'')+(total?'':' off'),
        'aria-label':fmtDay(d)+(total ? ': отмечено '+done+' из '+total : ''), disabled:total?null:'',
        onclick:()=>{ calDay = calDay===d ? null : d; paint(); }}, h('span',null,i), total ? h('i',{style:'--p:'+Math.round(done/total*100)+'%'}) : null));
    }
    let detail = null;
    if (calDay){
      const plan = dayPlan(calDay), future = calDay > today;
      detail = h('div',{class:'cal-detail'}, h('b',null, fmtDay(calDay), future ? ' — этот день ещё впереди' : ''),
        ...plan.map(({ch,on})=>h('div',{class:'cal-ch'}, h('div',{class:'hint'}, goalOf(ch.goal).ic,' ',ch.title),
          h('div',{class:'cal-habits'}, ch.habits.map(hb=>h('button',{type:'button',class:'chip'+(on.has(hb.id)?' on':''),disabled:future?'':null,'aria-pressed':String(on.has(hb.id)),
            onclick:()=>{ const set = new Set((ch.log||{})[calDay]||[]); set.has(hb.id) ? set.delete(hb.id) : set.add(hb.id); ch.log = ch.log||{}; if (set.size) ch.log[calDay] = [...set]; else delete ch.log[calDay]; save(); }},
            on.has(hb.id) ? '✓ ' : '', hb.name))))));
    }
    return h('div',{class:'card cal',id:'calendar'},
      h('div',{class:'cal-head'}, h('button',{type:'button',class:'btn ghost small','aria-label':'Предыдущий месяц',disabled:calMonth <= minM ? '' : null,onclick:()=>shift(-1)},'←'),
        h('h3',null,'Календарь привычек · ', title), h('button',{type:'button',class:'btn ghost small','aria-label':'Следующий месяц',disabled:calMonth >= maxM ? '' : null,onclick:()=>shift(1)},'→')),
      h('p',{class:'hint'},'За месяц: ',monthChecks,' ',plural(monthChecks,'отметка','отметки','отметок'),', ',fullDays,' ',plural(fullDays,'день','дня','дней'),' — всё отмечено. Нажмите на день, чтобы посмотреть или дополнить.'),
      h('div',{class:'cal-grid'}, DOW.map(w=>h('span',{class:'cal-w'},w)), cells),
      h('div',{class:'cal-legend'}, h('span',null,h('i',{class:'lg full'}),'всё'), h('span',null,h('i',{class:'lg part'}),'частично'), h('span',null,h('i',{class:'lg miss'}),'пропуск')),
      detail);
  }
  function save(){ saveHabits(); paint(); refresh(); }
  function wizardView(){
    const w = wizard, g = w.goal && goalOf(w.goal);
    const steps = h('div',{class:'ch-steps'}, ['Цель','Срок','Привычки'].map((t,i)=>h('span',{class:i+1===w.step?'on':i+1<w.step?'done':''}, (i+1)+'. '+t)));
    let body;
    if (w.step===1){
      body = [h('h3',null,'Зачем вам этот челлендж?'),
        h('div',{class:'ch-goals'}, CH_GOALS.map(x=>h('button',{type:'button',class:'ch-goal'+(w.goal===x.k?' on':''),onclick:()=>{ if (w.goal !== x.k && !w.touched) w.habits = x.habits.slice(0,4).map(n=>({id:'h'+uid(), name:n})); w.goal = x.k; w.step = 2; paint(); }},
          h('span',{class:'ic','aria-hidden':'true'},x.ic), h('b',null,x.l), h('small',null,x.d))))];
    } else if (w.step===2){
      body = [h('h3',null,'Сколько дней?'),
        h('div',{class:'ch-days'}, CH_DAYS.map(n=>h('button',{type:'button',class:'chip'+(w.days===n?' on':''),onclick:()=>{ w.days = n; paint(); }}, n+' дней'))),
        h('div',{class:'ch-days'}, [[true,'Начать сегодня'],[false,'Начать завтра']].map(([v,t])=>h('button',{type:'button',class:'chip'+(w.startToday===v?' on':''),onclick:()=>{ w.startToday = v; paint(); }},t))),
        h('p',{class:'hint'}, fmtDay(w.startToday ? iso(new Date()) : addDays(iso(new Date()),1)),' — ', fmtDay(addDays(w.startToday ? iso(new Date()) : addDays(iso(new Date()),1), w.days-1))),
        h('div',{class:'ch-nav'}, h('button',{type:'button',class:'btn ghost small',onclick:()=>{ w.step = 1; paint(); }},'← Назад'), h('button',{type:'button',class:'btn small',onclick:()=>{ w.step = 3; paint(); }},'Дальше →'))];
    } else {
      const chosen = new Set(w.habits.map(x=>x.name));
      const inp = h('input',{maxlength:'60',placeholder:'Своя привычка, например «Без доставки на этой неделе»','aria-label':'Своя привычка'});
      const addCustom = ()=>{ const v = inp.value.trim(); if (!v) return; if (!chosen.has(v)) w.habits.push({id:'h'+uid(), name:v.slice(0,60)}); w.touched = true; paint(); };
      inp.addEventListener('keydown', e=>{ if (e.key==='Enter'){ e.preventDefault(); addCustom(); } });
      body = [h('h3',null,'Привычки челленджа'),
        h('p',{class:'hint'},'Мы подобрали привычки под цель «',g.l,'». Уберите лишние, добавьте из подсказок или свои. Лучше 3–5 привычек, которые реально выполнять.'),
        h('div',{class:'ch-chosen'}, w.habits.length ? w.habits.map(x=>h('span',{class:'tag ch-tag'}, x.name, h('button',{type:'button',class:'x','aria-label':'Убрать «'+x.name+'»',onclick:()=>{ w.habits = w.habits.filter(y=>y.id!==x.id); w.touched = true; paint(); }},'×'))) : h('span',{class:'hint'},'Пока пусто — добавьте хотя бы одну привычку.')),
        h('div',{class:'ch-sugg'}, g.habits.filter(n=>!chosen.has(n)).map(n=>h('button',{type:'button',class:'chip',onclick:()=>{ w.habits.push({id:'h'+uid(), name:n}); w.touched = true; paint(); }},'+ ',n))),
        h('div',{class:'addrow'}, inp, h('button',{type:'button',class:'btn ghost',onclick:addCustom},'Добавить свою')),
        h('div',{class:'ch-nav'}, h('button',{type:'button',class:'btn ghost small',onclick:()=>{ w.step = 2; paint(); }},'← Назад'),
          h('button',{type:'button',class:'btn',onclick:()=>{
            if (!w.habits.length){ toast('Добавьте хотя бы одну привычку'); return; }
            const start = w.startToday ? iso(new Date()) : addDays(iso(new Date()),1);
            challenges().push({id:'c'+uid(), goal:w.goal, title:'Челлендж «'+g.l+'» на '+w.days+' дней', start, days:w.days, habits:w.habits, log:{}, created:Date.now()});
            wizard = null; save(); toast('Челлендж начат! Отмечайте привычки каждый день');
          }},'Начать челлендж'))];
    }
    return h('div',{class:'ch-wizard card'}, h('div',{style:'display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap'}, steps,
      h('button',{type:'button',class:'btn ghost small',onclick:()=>{ wizard = null; paint(); }},'Отмена')), ...body);
  }
  function card(ch){
    const st = chStats(ch), g = goalOf(ch.goal);
    const weeks = Math.ceil(ch.days/7);
    let page = pages[ch.id];
    if (page === undefined) page = pages[ch.id] = Math.max(0, Math.min(weeks-1, Math.floor(Math.max(0, st.dayNo-1)/7)));
    const days = [...Array(Math.min(7, ch.days - page*7))].map((_,i)=>addDays(ch.start, page*7+i));
    const cell = (hb, d)=>{ const on = ((ch.log||{})[d]||[]).includes(hb.id), future = d > st.today;
      return h('td',null, h('button',{type:'button',class:'cell'+(on?' on':''),disabled:future?'':null,'aria-pressed':String(on),'aria-label':hb.name+', '+fmtDay(d),html:on?LEAF:'',style:on?'color:var(--moss)':null,onclick:()=>{
        const set = new Set((ch.log||{})[d]||[]); set.has(hb.id) ? set.delete(hb.id) : set.add(hb.id);
        ch.log = ch.log || {}; if (set.size) ch.log[d] = [...set]; else delete ch.log[d]; save();
      }})); };
    const pct = Math.round(st.ratio*100), need = Math.round(CH_PASS*100);
    const status = st.passed ? h('span',{class:'status accepted'},'Пройден! +',chPoints(),' очков') : st.dayNo===0 ? h('span',{class:'status'},'Начнётся ',fmtDay(ch.start)) : h('span',{class:'status'},'День ',st.dayNo,' из ',ch.days);
    return h('article',{class:'ch-card'},
      h('div',{class:'ch-head'},
        h('div',null, h('div',{class:'eyebrow'}, g.ic,' ',g.l), h('h3',{style:'font-size:22px'},ch.title), h('div',{class:'hint'}, fmtDay(ch.start),' — ',fmtDay(st.end))),
        h('div',{style:'display:flex;gap:8px;align-items:center;flex-wrap:wrap'}, status,
          h('button',{type:'button',class:'btn ghost small',onclick:()=>{ if (confirm('Удалить челлендж «'+ch.title+'»? Отметки пропадут.')){ HAB.challenges = challenges().filter(x=>x.id!==ch.id); save(); } }},'Удалить'))),
      h('div',{class:'stats'},
        h('div',null,h('b',null,pct,'%'),h('span',null,'выполнено (нужно ',need,'%)')),
        h('div',null,h('b',null,st.checks),h('span',null,'отметок из ',st.total)),
        h('div',null,h('b',null,st.streak),h('span',null,'дней подряд'))),
      h('div',{class:'ch-bar'}, h('i',{style:'width:'+pct+'%'}), h('span',{class:'ch-goalmark',style:'left:'+need+'%',title:'Нужно для прохождения'})),
      weeks > 1 ? h('div',{class:'weeknav'},
        h('button',{type:'button',class:'btn ghost small','aria-label':'Предыдущая неделя',disabled:page===0?'':null,onclick:()=>{ pages[ch.id] = page-1; paint(); }},'←'),
        h('span',{style:'font-variant-numeric:tabular-nums'},'Неделя ',page+1,' из ',weeks,': ',fmtDay(days[0]),' — ',fmtDay(days[days.length-1])),
        h('button',{type:'button',class:'btn ghost small','aria-label':'Следующая неделя',disabled:page===weeks-1?'':null,onclick:()=>{ pages[ch.id] = page+1; paint(); }},'→')) : null,
      h('div',{class:'ch-grid'}, h('table',{class:'hgrid'},
        h('thead',null,h('tr',null,h('th',{style:'text-align:left'},'Привычка'), days.map(d=>{ const dd = new Date(d+'T00:00:00'); return h('th',{class:d===st.today?'today':null}, DOW[(dd.getDay()+6)%7],h('br'),dd.getDate()); }))),
        h('tbody',null, ch.habits.map(hb=>h('tr',null,
          h('td',null, hb.name, ch.habits.length > 1 ? h('button',{type:'button',class:'x',title:'Убрать привычку','aria-label':'Убрать «'+hb.name+'»',onclick:()=>{ if (confirm('Убрать привычку «'+hb.name+'» из челленджа?')){ ch.habits = ch.habits.filter(x=>x.id!==hb.id); save(); } }},'×') : null),
          days.map(d=>cell(hb,d))))))),
      addHabitRow(ch));
  }
  function addHabitRow(ch){
    const inp = h('input',{maxlength:'60',placeholder:'Добавить привычку в этот челлендж','aria-label':'Новая привычка для челленджа'});
    const add = ()=>{ const v = inp.value.trim(); if (!v) return; ch.habits.push({id:'h'+uid(), name:v.slice(0,60)}); save(); };
    inp.addEventListener('keydown', e=>{ if (e.key==='Enter'){ e.preventDefault(); add(); } });
    return h('div',{class:'addrow'}, inp, h('button',{type:'button',class:'btn ghost',onclick:add},'Добавить'));
  }
  function pastItem(ch){
    const st = chStats(ch), g = goalOf(ch.goal);
    return h('div',{class:'li'},
      h('div',{class:'meta'}, st.passed ? h('span',{class:'status accepted'},'✓ Пройден · +',chPoints()) : h('span',{class:'status declined'},'Не пройден'), h('span',null,g.ic,' ',g.l), h('span',null,fmtDay(ch.start),' — ',fmtDay(st.end))),
      h('b',null,ch.title), h('span',{class:'hint'},'Выполнено ',Math.round(st.ratio*100),'% (',st.checks,' из ',st.total,' отметок)'));
  }
  paint();
  challengesSection.repaint = paint;
  return h('section',{class:'band alt',id:'challenges'}, h('div',{class:'wrap'},
    sectionHead('Образ жизни','Мои эко-челленджи','Поставьте себе цель на 7–30 дней, выберите привычки и отмечайте каждый день. Пройдёте — получите очки роста для своего персонажа.'),
    box));
}

/* ---------- editable collections ---------- */
const SCHEMAS = {
  products:[{k:'title',l:'Название'},{k:'cat',l:'Категория (Кухня, Ванная…)'},{k:'replaces',l:'Чем заменяет'},{k:'why',l:'Почему это лучше',area:true}],
  cafes:[{k:'name',l:'Название'},{k:'kind',l:'Тип (кофейня, веган-кафе…)'},{k:'city',l:'Город'},{k:'address',l:'Адрес'},{k:'note',l:'Почему я его люблю',area:true}],
  articles:[{k:'title',l:'Заголовок'},{k:'cat',l:'Рубрика',options:['Статья','Новость']},{k:'lead',l:'Короткое описание',area:true},{k:'body',l:'Текст',area:true}],
  market:[{k:'title',l:'Что за вещь'},{k:'kind',l:'Формат',options:['Продам','Обмен','Отдам даром']},{k:'price',l:'Цена (если продаю)'},{k:'condition',l:'Состояние'},{k:'note',l:'Описание',area:true}]
};
function addForm(coll, title){
  const fields = SCHEMAS[coll];
  const inputs = {};
  const form = h('form',{class:'form edit-only'},
    h('h3',{style:'font-size:18px'},title),
    h('div',{class:'fields'}, fields.map(f=>{
      const id = 'new-'+coll+'-'+f.k;
      const el = f.options ? h('select',{id}, f.options.map(o=>h('option',null,o))) : f.area ? h('textarea',{id}) : h('input',{id});
      inputs[f.k]=el;
      return h('label',{for:id,style:f.area?'grid-column:1/-1':null},f.l,el);
    })),
    h('div',null,h('button',{type:'submit',class:'btn'},'Добавить'))
  );
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const item = {id:coll[0]+uid()};
    for (const f of fields) item[f.k]=inputs[f.k].value.trim();
    if (!item[fields[0].k]) { inputs[fields[0].k].focus(); return; }
    if (coll==='articles'){ item.date = iso(new Date()); STATE.articles.unshift(item); } else STATE[coll].push(item);
    markDirty(); render(); location.hash = coll==='products'?'goods':coll==='articles'?'journal':coll;
  });
  return form;
}
function delBtn(coll, id){
  return h('button',{type:'button',class:'btn danger small del edit-only',onclick:()=>{ STATE[coll]=STATE[coll].filter(x=>x.id!==id); markDirty(); render(); }},'Удалить');
}
const exMark = it => it.example ? h('span',{class:'ex'},'пример') : null;

function photoFig(key, alt, cls, caption){
  const id = STATE.photos[key];
  return h('figure',{class:'ph '+cls},
    h('div',{class:'frame'}, id ? photoImg(id, alt, CAIRN_SCENE) : h('div',{html:CAIRN_SCENE,style:'width:100%;height:100%'})),
    caption ? h('figcaption',null,caption) : null,
    uploadBtn(id ? 'Заменить фото' : 'Добавить фото', nid=>{ STATE.photos[key] = nid; })
  );
}

function fashionSection(){
  return h('section',{class:'band alt',id:'fashion'}, h('div',{class:'wrap'},
    sectionHead('Модная экология','Одежда и аксессуары','Самая экологичная вещь та, что уже висит в вашем шкафу. А когда хочется нового, вот что помогает выбирать с умом.'),
    h('div',{class:'split'},
      photoFig('fashion','Даша в белой рубашке и красной юбке с пайетками','arch','Образ, который хочется носить годами'),
      h('div',{class:'grid g2'}, FASHION_TIPS.map(([t,d],i)=>h('div',{class:'card'}, h('div',{class:'tip-num'},i+1), h('h3',{style:'font-size:20px'},t), h('p',{class:'muted',style:'font-size:15px'},d))))
    ),
    h('h3',{style:'margin:40px 0 14px'},'Шпаргалка по тканям'),
    h('div',{class:'tbl-wrap'}, h('table',{class:'fab'},
      h('thead',null,h('tr',null,h('th',null,'Ткань'),h('th',null,'Плюсы'),h('th',null,'Минусы'),h('th',null,'Эко-оценка'))),
      h('tbody',null,FABRICS.map(([n,p,m,s])=>h('tr',null,h('td',null,h('b',null,n)),h('td',null,p),h('td',{class:'muted'},m),h('td',null,h('span',{class:'leaves','aria-label':s+' из 5'},'❦'.repeat(s), h('span',{style:'opacity:.25'},'❦'.repeat(5-s)))))))
    ))
  ));
}

function foodSection(){
  let month = new Date().getMonth();
  const season = h('div',{class:'season','aria-live':'polite'});
  const btns = SEASON.map(([m],i)=>h('button',{type:'button','aria-pressed':String(i===month),onclick:()=>{ month=i; btns.forEach((b,j)=>b.setAttribute('aria-pressed',String(j===i))); paintS(); }},m));
  function paintS(){ season.replaceChildren(...SEASON[month][1].map(x=>h('span',null,x))); }
  paintS();
  return h('section',{class:'band',id:'food'}, h('div',{class:'wrap'},
    sectionHead('Еда','Вкусная польза!','Сезонные продукты вкуснее, дешевле и не летят к нам через полмира. А очистки и хвостики могут стать ещё одним блюдом.'),
    h('h3',{style:'margin-bottom:12px'},'Что сейчас в сезоне ', h('span',{class:'hand',style:'color:var(--clay);font-size:26px'},'средняя полоса')),
    h('div',{class:'months'},btns), season,
    h('h3',{style:'margin:40px 0 14px'},'Рецепты без отходов'),
    h('div',{class:'grid g3'}, RECIPES.map(([t,time,steps],i)=>h('article',{class:'card recipe'}, h('span',{class:'tag'},time), h('h3',{style:'font-size:20px'},t), h('ol',{style:'flex:1'},steps.map(s=>h('li',null,s))), commentsBlock('recipes:'+i)))),
    STATE.contacts.telegram ? h('p',{style:'margin-top:20px;font-weight:700'},'Больше рецептов в Telegram: ', h('a',{href:'https://t.me/'+STATE.contacts.telegram.replace(/^@/,''),target:'_blank',rel:'noopener'},'@'+STATE.contacts.telegram.replace(/^@/,''))) : null
  ));
}

function cafesSection(){
  const items = STATE.cafes;
  return h('section',{class:'band alt',id:'cafes'}, h('div',{class:'wrap'},
    sectionHead('Куда пойти','Моя подборка кафе 🍽️','Места, где вкусно и бережно: сезонное меню, своя кружка, минимум одноразового.'),
    h('div',{class:'split'},
      photoFig('cafes','Даша пьёт кофе','pebble2','Кофе — это ритуал'),
      h('div',null,
        items.length ? h('div',{class:'grid g2'}, items.map(it=>h('article',{class:'card'},
          delBtn('cafes',it.id), exMark(it),
          h('span',{class:'tag'},it.kind||'Кафе'),
          h('h3',null,it.name),
          h('p',{class:'muted',style:'font-size:14px;font-weight:700'},[it.city,it.address].filter(Boolean).join(', ')),
          h('p',{style:'font-size:15px;flex:1'},it.note),
          commentsBlock('cafes:'+it.id)
        ))) : h('div',{class:'empty'},'Скоро здесь появятся любимые места.'),
        addForm('cafes','Новое кафе')
      )
    )
  ));
}

function markRead(articleId){
  if (!pb || !COM.uid || !COM.readsLoaded || COM.reads[articleId]) return; // wait until we know what was read
  COM.reads[articleId] = true;
  pb.collection('reads').create({user:COM.uid, article:articleId}).catch(()=>{});
}
function likeBtn(target){
  const b = h('button',{type:'button',class:'like'});
  live(()=>{
    const all = COM.likes.filter(l=>l.target===target), mine = all.find(l=>l.user===COM.uid);
    b.replaceChildren(mine ? '♥' : '♡', ' ', all.length || '');
    b.setAttribute('aria-pressed', String(!!mine));
    b.setAttribute('aria-label', (mine ? 'Убрать лайк' : 'Нравится')+(all.length ? ', лайков: '+all.length : ''));
    b.onclick = ()=>{
      if (accState()!=='member'){ toast('Лайки ставят участники — войдите или зарегистрируйтесь'); return; }
      (mine ? pb.collection('likes').delete(mine.id) : pb.collection('likes').create({user:COM.uid, target})).catch(writeErr);
    };
  });
  return b;
}
/* every article has its own address: /zhurnal/<slug> (the server gives search engines the same page, see pb_hooks/seo.js) */
const ART_RE = /^\/zhurnal\/[^/]+$/;
const TRANSLIT = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
const slugify = s => String(s||'').toLowerCase().split('').map(c=>TRANSLIT[c]!==undefined ? TRANSLIT[c] : c).join('').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);
const articleSlug = a => a.slug || slugify(a.title) || String(a.id);
const articleUrl = a => '/zhurnal/'+articleSlug(a);
const fmtDate = s => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}); };
function articlePage(path){
  const key = decodeURIComponent(path.split('/')[2]||'');
  // old addresses keep working after the address is changed (old_slugs)
  const it = STATE.articles.find(a=>articleSlug(a)===key || String(a.id)===key || (a.old_slugs||[]).includes(key));
  if (!it) return {title:'Статья не найдена — DashaBotanika', render:()=>[h('section',{class:'band'}, h('div',{class:'wrap'},
    h('h1',null,'Статья не найдена'), h('p',{class:'lead'},'Возможно, её переименовали или убрали. Загляните в журнал — там все статьи.'),
    h('a',{class:'btn',href:'/#journal'},'Все статьи')))]};
  return {title:it.title+' — DashaBotanika', render:()=>{
    live(()=>{ if (COM.uid) markRead(it.id); });
    const others = STATE.articles.filter(a=>a!==it).slice(0,3);
    return [h('article',{class:'band art-page',id:'article'}, h('div',{class:'wrap narrow'},
      h('nav',{class:'crumbs','aria-label':'Навигация'}, h('a',{href:'/'},'Главная'),' › ',h('a',{href:'/#journal'},'Журнал')),
      h('div',{style:'display:flex;gap:10px;align-items:center;flex-wrap:wrap'}, h('span',{class:'tag'},it.cat||'Статья'), it.date ? h('time',{class:'date',datetime:it.date},fmtDate(it.date)) : null),
      h('h1',null,it.title),
      it.image ? h('figure',{class:'art-cover'}, photoImg(it.image, it.title, '', {sizes:'(max-width: 760px) 100vw, 760px'})) : null,
      it.lead ? h('p',{class:'lead'},it.lead) : null,
      it.by ? h('p',{class:'hint'},'Идею предложил участник: ', nameSpan(it.by)) : null,
      h('div',{class:'art-body'}, it.body),
      articleEditor(it),
      h('div',{style:'display:flex;gap:12px;align-items:center;flex-wrap:wrap'}, likeBtn('articles:'+it.id), h('a',{class:'btn ghost small',href:'/#journal'},'← Все статьи')),
      commentsBlock('articles:'+it.id),
      others.length ? h('div',{class:'art-more'}, h('h2',null,'Читайте также'), h('ul',null, others.map(a=>h('li',null, h('a',{href:articleUrl(a)},a.title))))) : null
    ))];
  }};
}

/* edit mode on the article page: the text itself and how it looks in search and in shared links */
function articleEditor(it){
  if (!EDIT.can) return null;
  const field = (k, label, opts) => {
    const el = h(opts && opts.area ? 'textarea' : 'input', {id:'ae-'+k, maxlength:opts && opts.max ? String(opts.max+40) : null, placeholder:(opts && opts.ph) || null, style:opts && opts.area ? 'min-height:'+(opts.h||100)+'px' : null});
    el.value = it[k] || '';
    const count = opts && opts.max ? h('span',{class:'ae-count'}) : null;
    const upd = ()=>{ if (count){ const n = el.value.length; count.textContent = n+' / '+opts.max; count.classList.toggle('over', n > opts.max); } paintSnippet(); };
    el.addEventListener('input', ()=>{ it[k] = el.value.trim() || undefined; if (k==='slug') it[k] = slugify(el.value) || undefined; markDirty(); upd(); });
    setTimeout(upd);
    return h('label',{for:'ae-'+k}, h('span',{class:'ae-l'}, label, count), el, opts && opts.hint ? h('span',{class:'hint'},opts.hint) : null);
  };
  const snip = h('div',{class:'snippet'});
  function paintSnippet(){
    const title = it.seo_title || (it.title+' — DashaBotanika'), desc = it.seo_desc || it.lead || String(it.body||'').slice(0,160);
    snip.replaceChildren(h('div',{class:'sn-url'},'dashabotanika.ru › zhurnal › ', articleSlug(it)),
      h('div',{class:'sn-title'}, title.length > 65 ? title.slice(0,62)+'…' : title),
      h('div',{class:'sn-desc'}, desc.length > 165 ? desc.slice(0,162)+'…' : desc));
  }
  // the address changes — keep the old one so links already shared still open the article
  const slugWas = articleSlug(it);
  const slugField = field('slug','Адрес страницы',{ph:slugWas, hint:'Латиницей, через дефис. Старый адрес продолжит открывать статью.'});
  slugField.querySelector('input').addEventListener('change', ()=>{ const now = articleSlug(it); if (now !== slugWas){ it.old_slugs = [...new Set([...(it.old_slugs||[]), slugWas])].filter(x=>x!==now); markDirty(); } });
  return h('div',{class:'form edit-only art-editor'},
    h('h3',null,'✏️ Редактировать статью'),
    field('title','Заголовок'), field('lead','Короткое описание',{area:true,h:70}), field('body','Текст',{area:true,h:320}),
    h('h3',{style:'margin-top:10px'},'🔎 Для поиска и ссылок'),
    h('p',{class:'hint'},'Если оставить пустым, сайт возьмёт заголовок и короткое описание статьи.'),
    field('seo_title','Заголовок в поиске',{max:60, ph:it.title+' — DashaBotanika', hint:'До 60 знаков, главный запрос — в начале. Например: «Куда сдать батарейки в Новосибирске: 5 мест».'}),
    field('seo_desc','Описание в поиске',{area:true,h:70,max:160, hint:'До 160 знаков: о чём статья и чем она полезна.'}),
    slugField,
    h('div',{class:'ae-l'},'Так статья будет выглядеть в Яндексе и Google'), snip,
    h('div',{class:'ae-l'},'Картинка превью'),
    h('p',{class:'hint'},'Видна в начале статьи, в журнале и в превью ссылки в Telegram, VK и WhatsApp. Лучше горизонтальная, от 1200×630.'),
    h('div',{style:'display:flex;gap:8px;flex-wrap:wrap'},
      uploadBtn(it.image ? 'Заменить картинку' : 'Загрузить картинку', nid=>{ it.image = nid; }),
      it.image ? h('button',{type:'button',class:'btn ghost small edit-only',onclick:()=>{ delete it.image; markDirty(); render(); }},'Убрать картинку') : null),
    h('p',{class:'hint'},'После правок нажмите «Сохранить изменения» внизу экрана.'));
}

function journalSection(){
  const items = STATE.articles;
  return h('section',{class:'band alt',id:'journal'}, h('div',{class:'wrap'},
    sectionHead('Журнал','Новости и статьи','Заметки об экологичной жизни. Есть тема или новость? Предложите её в личном кабинете, лучшие появятся здесь.'),
    h('div',{style:'margin:-12px 0 24px'}, h('button',{type:'button',class:'btn ghost small',onclick:()=>openAccount('suggest')},'Предложить новость или статью')),
    items.length ? h('div',{class:'grid g3'}, items.map(it=>{
      const more = h('a',{class:'linkish',href:articleUrl(it)},'Читать полностью');
      return h('article',{class:'card'},
        delBtn('articles',it.id),
        it.image ? h('a',{class:'art-thumb',href:articleUrl(it),tabindex:'-1','aria-hidden':'true'}, photoImg(it.image, '')) : null,
        h('div',{style:'display:flex;gap:10px;align-items:center;flex-wrap:wrap'}, h('span',{class:'tag'},it.cat||'Статья'), h('span',{class:'date'},fmtDate(it.date))),
        h('h3',{style:'font-size:22px'}, h('a',{class:'art-link',href:articleUrl(it)},it.title)),
        h('p',{class:'muted',style:'font-size:15px'},it.lead),
        it.by ? h('p',{class:'hint'},'Идею предложил участник: ', nameSpan(it.by)) : null,
        h('div',{style:'display:flex;gap:12px;align-items:center;flex-wrap:wrap'}, more, likeBtn('articles:'+it.id)),
        commentsBlock('articles:'+it.id)
      );
    })) : h('div',{class:'empty'},'Статьи скоро появятся.'),
    addForm('articles','Новая статья или новость')
  ));
}

function aboutSection(){
  const a = STATE.about;
  const nm = h('input',{id:'about-name',value:a.name}); nm.addEventListener('input',()=>{ a.name=nm.value; markDirty(); });
  const tx = h('textarea',{id:'about-text',style:'min-height:200px'}); tx.value=a.text; tx.addEventListener('input',()=>{ a.text=tx.value; markDirty(); });
  return h('section',{class:'band alt',id:'about'}, h('div',{class:'wrap'},
    h('div',{class:'about'},
      photoFig('about', 'Даша с семьёй у большого глобуса', 'round', 'Наша счастливая планета'),
      h('div',{style:'display:grid;gap:14px;min-width:0'},
        h('div',{class:'eyebrow',style:'display:flex;align-items:center;gap:8px'},h('span',{html:CAIRN_ICON,style:'display:contents'}),'Про меня'),
        h('h2',null,a.name),
        h('p',{class:'about-text'},a.text),
        h('div',{class:'form edit-only'}, h('label',{for:'about-name'},'Имя',nm), h('label',{for:'about-text'},'Текст о себе',tx))
      )
    )
  ));
}

function contactsSection(){
  const c = STATE.contacts;
  const handle = v => String(v||'').replace(/^@/,'');
  const rows = [
    ['instagram','Instagram', v=>'https://instagram.com/'+handle(v), v=>'@'+handle(v)],
    ['telegram','Telegram', v=>'https://t.me/'+handle(v), v=>'@'+handle(v)],
    ['email','Почта', null, v=>v]
  ];
  const filled = rows.filter(([k])=>c[k]);
  const copy = (btn,val)=>{ const done=()=>{ btn.textContent='Скопировано'; setTimeout(()=>btn.textContent='Копировать',1500); };
    try{ navigator.clipboard.writeText(val).then(done,()=>selectText(btn)); }catch(e){ selectText(btn); } };
  const selectText = btn => { const v=btn.parentElement.querySelector('.val'); if(!v) return; const r=document.createRange(); r.selectNodeContents(v); const s=getSelection(); s.removeAllRanges(); s.addRange(r); };
  const editInputs = rows.map(([k,l])=>{ const el=h('input',{id:'contact-'+k,value:c[k]||'',placeholder:k==='email'?'name@mail.ru':'username'}); el.addEventListener('input',()=>{ c[k]=el.value.trim(); markDirty(); }); return h('label',{for:'contact-'+k},l,el); });
  const note = h('textarea',{id:'contact-note'}); note.value=c.note||''; note.addEventListener('input',()=>{ c.note=note.value; markDirty(); });
  return h('section',{class:'band',id:'contacts'}, h('div',{class:'wrap'},
    sectionHead('Контакты','Давайте дружить', c.note),
    filled.length ? h('div',{class:'grid g3'}, filled.map(([k,l,link,show])=>{
      const val = show(c[k]);
      const right = link ? h('a',{class:'btn small',href:link(c[k]),target:'_blank',rel:'noopener'},'Открыть') : (()=>{ const b=h('button',{type:'button',class:'btn ghost small'},'Копировать'); b.addEventListener('click',()=>copy(b,val)); return b; })();
      return h('div',{class:'card contact'}, h('div',{style:'min-width:0'}, h('div',{class:'eyebrow',style:'color:var(--muted)'},l), h('div',{class:'val'},val)), right); }))
      : h('div',{class:'empty'},'Контакты скоро появятся.'),
    h('div',{class:'form edit-only'}, h('div',{class:'fields'},editInputs), h('label',{for:'contact-note'},'Подпись над контактами',note)),
    seoSettings()
  ));
}
/* codes for Yandex Webmaster / Google Search Console and the Yandex Metrika counter; the server puts them into every page */
function seoSettings(){
  STATE.seo = Object.assign({metrika:'', yandex:'', google:''}, STATE.seo||{});
  const f = [['metrika','Номер счётчика Яндекс.Метрики','например, 98765432'],['yandex','Код подтверждения Яндекс.Вебмастера','из мета-тега yandex-verification'],['google','Код подтверждения Google Search Console','из мета-тега google-site-verification']]
    .map(([k,l,ph])=>{ const el = h('input',{id:'seo-'+k,value:STATE.seo[k],placeholder:ph}); el.addEventListener('input',()=>{ STATE.seo[k] = el.value.trim(); markDirty(); }); return h('label',{for:'seo-'+k},l,el); });
  return h('div',{class:'form edit-only',style:'margin-top:20px'}, h('h3',null,'Поиск и счётчики'),
    h('p',{class:'hint'},'Вставьте только сам код (буквы и цифры из content="…"). Заработает после «Сохранить» и обновления страницы.'),
    h('div',{class:'fields'}, f));
}

/* ---------- privacy policy (152-ФЗ); operator name and email are edited by Dasha in edit mode ---------- */
const POLICY_DATE = '20 октября 2026';
function privacyPage(){
  STATE.policy = Object.assign({operator:'', email:''}, STATE.policy||{});
  const pol = STATE.policy;
  const op = pol.operator || 'Белова Дарья Михайловна', mail = pol.email || STATE.contacts.email || 'dashabotanika.site@yandex.com';
  const sec = (t, ...body) => h('section',{class:'pol-sec'}, h('h2',null,t), ...body);
  const ul = items => h('ul',null, items.map(x=>h('li',null,x)));
  const opIn = h('input',{id:'pol-op',value:pol.operator,placeholder:'ФИО владельца сайта (или ИП, самозанятый)'}); opIn.addEventListener('input',()=>{ pol.operator = opIn.value.trim(); markDirty(); });
  const mIn = h('input',{id:'pol-mail',value:pol.email,placeholder:'почта для вопросов о данных'}); mIn.addEventListener('input',()=>{ pol.email = mIn.value.trim(); markDirty(); });
  return h('section',{class:'band policy'}, h('div',{class:'wrap narrow'},
    h('div',{class:'eyebrow'},'Документы'),
    h('h1',null,'Политика конфиденциальности'),
    h('p',{class:'hint'},'Редакция от ',POLICY_DATE,'.'),
    h('div',{class:'form edit-only'}, h('div',{class:'fields'}, h('label',{for:'pol-op'},'Оператор персональных данных',opIn), h('label',{for:'pol-mail'},'Почта для обращений',mIn))),
    sec('1. О чём этот документ',
      h('p',null,'Здесь простыми словами написано, какие данные о вас собирает сайт dashabotanika.ru, зачем и как мы их защищаем. Политика составлена в соответствии с Федеральным законом № 152-ФЗ «О персональных данных».'),
      h('p',null,'Оператор персональных данных — ', h('b',null,op),'. Связаться по любым вопросам о данных: ', h('a',{href:'mailto:'+mail},mail),'.')),
    sec('2. Какие данные мы собираем',
      ul(['При регистрации: адрес электронной почты, пароль (хранится только в зашифрованном виде — его не видит даже администратор), имя на сайте и выбранный персонаж.',
        'По вашему желанию в профиле: возраст, пол, страна и город, эко-цели.',
        'То, что вы сами публикуете или отправляете: комментарии, объявления на барахолке и их фото, личные сообщения, обратная связь и предложения статей.',
        'Ваши результаты на сайте: эко-челленджи и отметки, результаты теста и игры, очки роста и уровни.',
        'Фото для ИИ-помощника (тарелка или упаковка): фото уменьшается в браузере и один раз отправляется на анализ в сервис Yandex Cloud (серверы в России). Мы его не сохраняем — запоминаем только, сколько разборов вы сделали сегодня.',
        'Технические данные: IP-адрес, время посещения, тип браузера и устройства. Они нужны для работы и защиты сайта.'])),
    sec('3. Зачем',
      ul(['Чтобы вы могли зарегистрироваться, входить в кабинет и пользоваться им: челленджи, рост персонажа, сертификаты, барахолка, переписка.',
        'Чтобы отправлять служебные письма: подтверждение почты и восстановление пароля. Рекламных рассылок без вашего отдельного согласия нет.',
        'Чтобы проверять объявления и защищать сайт от спама и злоупотреблений.',
        'Чтобы понимать, что на сайте полезно, и делать его лучше (обезличенная статистика посещений).'])),
    sec('4. На каком основании',
      h('p',null,'Мы обрабатываем данные с вашего согласия — вы даёте его, отмечая галочку при регистрации. Данные профиля вы указываете только по желанию. Согласие можно отозвать в любой момент (см. раздел 8).')),
    sec('5. Где и сколько хранятся',
      h('p',null,'Данные хранятся на серверах в России. Мы храним их, пока у вас есть аккаунт на сайте. После удаления аккаунта данные удаляются в течение 30 дней, включая резервные копии.')),
    sec('6. Кто ещё может их видеть',
      ul(['Другие посетители видят только ваше имя на сайте, персонажа, уровень и то, что вы сами опубликовали (комментарии, объявления). Почту и профиль они не видят.',
        'Администратор и модераторы сайта видят то, что нужно для проверки объявлений и ответов на обратную связь; профиль видит только администратор.',
        'Мы не продаём и не передаём ваши данные третьим лицам. Исключения — сервисы, без которых сайт не работает: хостинг (серверы сайта), почтовый сервис для отправки служебных писем, сервис статистики Яндекс.Метрика, Yandex Cloud для разбора фото в ИИ-помощнике и Telegram, если вы сами подключили уведомления, — а также случаи, прямо предусмотренные законом.'])),
    sec('7. Cookie и хранилище браузера',
      h('p',null,'Сайт сохраняет в вашем браузере то, что нужно для работы: вход в аккаунт, результаты без регистрации, выбранный город для чистоты воздуха, скрытые подсказки. Для статистики подключена Яндекс.Метрика: она использует cookie и Вебвизор — обезличенную запись действий на страницах (поля с паролями не записываются), чтобы понять, что на сайте удобно, а что нет. Отключить cookie можно в настройках браузера — сайт продолжит работать, но вход придётся выполнять заново.')),
    sec('8. Ваши права',
      h('p',null,'Вы можете узнать, какие ваши данные у нас есть, исправить их, удалить аккаунт со всеми данными или отозвать согласие. Имя, персонажа и профиль можно изменить в личном кабинете. По остальным вопросам напишите на ', h('a',{href:'mailto:'+mail},mail),' — ответим в течение 10 рабочих дней.')),
    sec('9. Изменения',
      h('p',null,'Если политика изменится, новая редакция появится на этой странице с новой датой. Продолжая пользоваться сайтом после изменений, вы соглашаетесь с новой редакцией.'))
  ));
}

/* ---------- pages: real addresses for every page, no reloads between them ---------- */
const PAGES = {
  '/': {title:'DashaBotanika — эко: еда, быт, мода, образ жизни', render:()=>homePage()},
  '/kabinet': {title:'Личный кабинет — DashaBotanika', render:()=>cabinetPage()},
  '/tovary': {title:'Товары, которые делают мир чище — DashaBotanika', render:()=>{ SEC_H1 = true; return [goodsSection(false)]; }},
  '/baraholka': {title:'Барахолка: отдать, обменять, продать — DashaBotanika', render:()=>{ SEC_H1 = true; return [marketSection()]; }},
  '/eko-test': {title:'Эко-экзамен с сертификатом — DashaBotanika', render:()=>{ SEC_H1 = true; return [examSection()]; }},
  '/politika': {title:'Политика конфиденциальности — DashaBotanika', render:()=>[privacyPage()]},
  '/servisy': {title:'Полезные сервисы для экологии: куда сдать вторсырьё — DashaBotanika', render:()=>{ SEC_H1 = true; return [servicesSection()]; }},
};
let SEC_H1 = false, PAGE_UNSUBS = [];
function currentPath(){ const p = location.pathname.replace(/\/+$/,'') || '/'; return PAGES[p] || ART_RE.test(p) || CITY_RE.test(p) ? p : '/'; }
const pageOf = path => PAGES[path] || (CITY_RE.test(path) ? cityPage(path) : articlePage(path));
function scrollToHash(hash){
  const el = hash && hash.length > 1 && !/^#(cert|verify|reset|email)\//.test(hash) ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
  if (el) el.scrollIntoView(); else window.scrollTo(0,0);
}
// how many steps the visitor made inside the site: "Назад" goes back if there is where to, otherwise home
let INNER_STEPS = 0;
function backBar(){
  return h('div',{class:'wrap backbar'},
    h('button',{type:'button',class:'back-btn',onclick:()=>{ if (INNER_STEPS > 0) history.back(); else go('/'); }},'← Назад'),
    h('a',{href:'/',class:'back-home'},'На главную'));
}
function go(url){
  const u = new URL(url, location.origin);
  const changed = (u.pathname.replace(/\/+$/,'') || '/') !== currentPath() || u.search !== location.search;
  closeModal();
  history.pushState(null,'',u.pathname+u.search+u.hash); INNER_STEPS++;
  if (changed){ render(); if (window.ym && window.METRIKA_ID) ym(window.METRIKA_ID,'hit',location.href,{title:document.title}); }
  scrollToHash(u.hash);
}
function goTo(id){ go('/#'+id); }
document.addEventListener('click', e=>{
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest && e.target.closest('a[href]');
  if (!a || a.target) return;
  const href = a.getAttribute('href');
  if (!href.startsWith('/') || href.startsWith('//') || /^\/(api|_|img|css|js)\//.test(href)) return;
  e.preventDefault(); go(href);
});
window.addEventListener('popstate', ()=>{ INNER_STEPS = Math.max(0, INNER_STEPS-1); closeModal(); render(); scrollToHash(location.hash); });

function homePage(){
  // people first (who we are, the community, how to start), then games and tests, then everyday eco
  return [hero(), sectionsNav(), firstSteps(), aboutSection(), worldSection(), examTeaser(), gameSection(), sortGuide(), airSection(), calcSection(), goodsSection(true), foodSection(), menuSection(), fashionSection(), cafesSection(), marketTeaser(), journalSection(), helperSection(), feedbackSection(), contactsSection()];
}
const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many; };

function examTeaser(){
  const best = h('p',{style:'font-weight:700'});
  live(()=>{ best.textContent = STATS.examBest ? 'Ваш лучший результат: '+STATS.examBest+' из 10'+(STATS.examPassed ? ' — сертификат получен!' : '') : ''; });
  return h('section',{class:'band alt',id:'exam'}, h('div',{class:'wrap'}, h('div',{class:'teaser'},
    h('div',{style:'display:grid;gap:10px'},
      h('div',{class:'eyebrow'},'Эко-экзамен'),
      h('h2',null,'Пройдите тест по экологии и получите сертификат'),
      h('p',{class:'lead'},'10 вопросов о переработке, еде и быте. Ответьте верно хотя бы на 8 — и получите именной сертификат «Эко-знаток». Результат засчитается для вашего эко-уровня.'),
      best),
    h('a',{class:'btn',href:'/eko-test'},'Пройти тест'))));
}

function marketTeaser(){
  const items = STATE.market.slice(0,3);
  const extra = h('p',{class:'muted'});
  live(()=>{ const n = publicListings().length; extra.textContent = n ? 'И ещё '+n+' '+plural(n,'вещь','вещи','вещей')+' от участников.' : 'Выставить свою вещь может любой участник — Даша проверит объявление.'; });
  return h('section',{class:'band',id:'market'}, h('div',{class:'wrap'},
    sectionHead('Вторая жизнь вещей','Барахолка','Отдавайте, меняйте и продавайте то, что ещё послужит другим.'),
    items.length ? h('div',{class:'grid g3'}, items.map(it=>h('article',{class:'card'},
      h('span',{class:'tag',style:kindStyle(it.kind)},it.kind||'Продам'),
      h('h3',{style:'font-size:20px'},it.title),
      h('p',{style:'font-weight:800;font-size:20px;font-variant-numeric:tabular-nums'}, priceLabel(it))))) : null,
    h('div',{class:'more-row'}, extra, h('a',{class:'btn',href:'/baraholka'},'Перейти в барахолку'))
  ));
}

function productCard(it){
  return h('article',{class:'card product'},
    delBtn('products',it.id),
    it.photo ? h('div',{class:'prod-img'}, photoImg(it.photo, it.title)) : it.icon ? h('div',{class:'prod-ic','aria-hidden':'true'}, it.icon) : null,
    uploadBtn(it.photo ? 'Заменить фото' : 'Добавить фото', nid=>{ it.photo = nid; }),
    h('span',{class:'tag'},it.cat||'Полезное'),
    h('h3',{style:'font-size:20px'},it.title),
    it.replaces ? h('p',{class:'muted',style:'font-size:14px;font-weight:700'},'Вместо: ',it.replaces) : null,
    h('p',{style:'font-size:15px;flex:1'},it.why),
    commentsBlock('products:'+it.id));
}
function goodsSection(preview){
  const items = preview ? STATE.products.slice(0,4) : STATE.products;
  return h('section',{class:'band',id:'goods'}, h('div',{class:'wrap'},
    sectionHead('Быт','Товары, которые делают мир чище','Вещи, которые один раз покупаешь и годами не производишь мусор. Главное правило — сначала доносить то, что уже есть дома.'),
    h('div',{class:'soon-banner'}, h('span',{'aria-hidden':'true'},'🛍️'), 'Скоро эти товары можно будет купить'),
    items.length ? h('div',{class:'grid g4'}, items.map(productCard)) : h('div',{class:'empty'},'Здесь пока пусто.'),
    preview ? h('div',{class:'more-row'}, h('span'), h('a',{class:'btn',href:'/tovary'},'Смотреть больше')) : addForm('products','Новый товар')
  ));
}

/* ---------- presence: who is online (only admins see it) ---------- */
function startPresence(){
  if (!pb || !COM.uid) return;
  const ping = ()=>{ if (document.visibilityState === 'visible') pb.send('/api/db/ping',{method:'POST', requestKey:null}).catch(()=>{}); };
  ping();
  setInterval(ping, 120000);
  document.addEventListener('visibilitychange', ping);
}
const ONLINE_MS = 5*60*1000, ACTIVE_MS = 30*24*3600*1000;
function seenLabel(ts){
  if (!ts) return 'ещё не заходил(а) после обновления';
  const d = Date.now() - ts;
  if (d < ONLINE_MS) return 'онлайн';
  if (d < 3600000) return 'был(а) '+Math.round(d/60000)+' мин назад';
  if (d < 86400000) return 'был(а) '+Math.round(d/3600000)+' ч назад';
  return 'был(а) '+new Date(ts).toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
}

/* ---------- backend: PocketBase ---------- */
const pb = window.PocketBase ? new PocketBase(location.origin) : null;
/* invitation link ?ref=<user id>: remember who invited until the visitor signs up */
const REF_KEY = 'db-ref';
(()=>{ const u = new URL(location.href), r = u.searchParams.get('ref');
  if (!r) return;
  if (/^[a-z0-9]{15}$/.test(r)) try{ localStorage.setItem(REF_KEY, r); }catch(e){}
  u.searchParams.delete('ref'); history.replaceState(null,'',u.pathname+u.search+u.hash); })();
const refOf = () => { try{ return localStorage.getItem(REF_KEY) || ''; }catch(e){ return ''; } };
const rulePoints = (key, def) => ((COM.growthRules.find(r=>r.key===key)||{}).points) || def;
const MOD_ROLES = ['moderator','admin'];
const tsOf = r => Date.parse(String((r && r.created) || '').replace(' ','T')) || 0;
function fileURL(r, field, thumb){ const f = r && r[field]; return f ? '/api/files/'+r.collectionId+'/'+r.id+'/'+encodeURIComponent(f)+(thumb ? '?thumb='+thumb : '') : null; }
/* load a whole collection, then reload it on every realtime change */
function watch(coll, opts, apply){
  if (!pb) return;
  const load = ()=>pb.collection(coll).getFullList(Object.assign({batch:500, requestKey:null}, opts||{})).then(list=>{ apply(list); refresh(); }).catch(()=>{});
  load();
  let t = null;
  pb.collection(coll).subscribe('*', ()=>{ clearTimeout(t); t = setTimeout(load, 200); }).catch(()=>{});
}

/* ---------- community: accounts, comments, reviews, suggestions ---------- */
function nameSpan(id){ const s = h('b'); live(()=>{ s.textContent = nameOf(id); }); return s; }
const COM = { uid:null, admin:false, owner:false, ready:false, me:null, members:{}, presence:{}, growthRules:[], likes:[], reads:{}, reviews:[], comments:[], feedback:[], listings:[], threads:{}, sugg:[], drafts:[], refs:[], services:[], reports:[], myReports:[], levels:[], characters:[] };
let LIVE = [], MODAL_LIVE = [];
function live(fn){ LIVE.push(fn); fn(); return fn; }
function mlive(fn){ MODAL_LIVE.push(fn); fn(); return fn; }
function refresh(){ for (const f of LIVE.concat(MODAL_LIVE)){ try{ f(); }catch(e){} } }
function accState(){
  if (!COM.ready) return 'loading';
  return COM.uid && COM.me ? 'member' : 'signedout';
}
function memberOf(r){ return {nick:r.name||'Участник', joined:tsOf(r), character:r.character||'', level:r.level||1, role:r.role||'member', history:Array.isArray(r.level_history) ? r.level_history : [], leaves:r.leaves||0, xp:r.xp||0, stage:r.stage||1, examBest:r.exam_best||0, verified:!!r.verified, customEmoji:r.custom_emoji||'', customName:r.custom_name||''}; }
function nameOf(id){ const m = COM.members[id]; return (m && m.nick) || 'Участник'; }
function charOf(id){ return COM.characters.find(c=>c.id===id) || null; }
function emojiOf(memberId){ const m = COM.members[memberId]; if (m && m.customEmoji) return m.customEmoji; const c = m && charOf(m.character); return c ? c.emoji : '🌱'; }
function levelOf(rank){ return COM.levels.find(l=>l.rank===rank) || null; }
const levelName = rank => (levelOf(rank) || {}).name || 'Эко малыш';
const dt = ts => { const d = new Date(ts); return isNaN(d) ? '' : d.toLocaleDateString('ru-RU',{day:'numeric',month:'long'}); };
const canDelete = author => author === COM.uid || COM.admin;
const WQ = {};
function write(path, fn){ const p = (WQ[path]||Promise.resolve()).catch(()=>{}).then(fn); WQ[path] = p; return p; }
function writeErr(e){
  const c = e && e.status;
  if (c===403 || c===401) toast('Нет прав на это действие. Войдите в аккаунт');
  else if (c===429) toast('Слишком часто, подождите немного');
  else if (c===400) toast('Проверьте, всё ли заполнено правильно');
  else toast('Не получилось отправить, попробуйте ещё раз');
  return null;
}
function delDoc(coll, id){ return write(coll+'/'+id, ()=>pb.collection(coll).delete(id)).catch(writeErr); }

function joinHint(what){
  const st = accState();
  if (st==='loading') return h('p',{class:'hint'},'Загружаем…');
  return h('p',{class:'hint'},'Чтобы '+what+', ', h('button',{type:'button',class:'linkish',onclick:()=>openAccount()},'войдите или зарегистрируйтесь'),'. Это займёт минуту.');
}

/* report a comment: pick a reason; Dasha and moderators see it in «Проверка» */
 // comments with reports nobody has decided on yet (admins and moderators see all reports)
const openReports = () => { const by = {}; COM.reports.filter(r=>!r.status).forEach(r=>{ (by[r.comment] = by[r.comment] || []).push(r); });
  return Object.keys(by).map(id=>({c:COM.comments.find(x=>x.id===id), rs:by[id]})).filter(x=>x.c); };
const REPORT_REASONS = ['Спам или реклама','Грубость или оскорбление','Не по теме','Другое'];
function reportBtn(c){
  if (COM.myReports.includes(c.id)) return h('span',{class:'cm-reported'},'⚑ жалоба отправлена');
  const box = h('span',{class:'cm-report'});
  const btn = h('button',{type:'button',class:'linkish cm-report-btn',title:'Пожаловаться на комментарий',onclick:()=>{
    box.replaceChildren(h('span',{class:'hint'},'Что не так? '), ...REPORT_REASONS.map(r=>h('button',{type:'button',class:'chip',onclick:()=>{
      pb.collection('reports').create({comment:c.id, reporter:COM.uid, reason:r}).then(()=>{ COM.myReports.push(c.id); toast('Спасибо! Модератор посмотрит'); refresh(); })
        .catch(e=>{ if (e && e.status===400){ COM.myReports.push(c.id); refresh(); } else writeErr(e); });
    }}, r)), h('button',{type:'button',class:'linkish',onclick:()=>box.replaceChildren(btn)},'отмена'));
  }}, '⚑ Пожаловаться');
  box.append(btn);
  return box;
}
function commentsBlock(target){
  let open = false, lastSt = null;
  const toggle = h('button',{type:'button',class:'cm-toggle'});
  const list = h('div',{class:'cm-list'});
  const formSlot = h('div');
  toggle.addEventListener('click',()=>{ open=!open; paint(); });
  const box = h('div',{class:'cm'}, toggle, list, formSlot);
  function form(){
    const inp = h('input',{maxlength:'1000',placeholder:'Ваш комментарий','aria-label':'Комментарий'});
    const f = h('form',{class:'cm-form'}, inp, h('button',{type:'submit',class:'btn small'},'Отправить'));
    f.addEventListener('submit',e=>{ e.preventDefault(); const t=inp.value.trim(); if(!t) return; inp.value='';
      pb.collection('comments').create({target, author:COM.uid, text:t.slice(0,1000)}).catch(err=>{ inp.value=t; writeErr(err); }); });
    return f;
  }
  function paint(){
    const items = COM.comments.filter(c=>c.target===target);
    toggle.textContent = (open ? 'Скрыть комментарии' : 'Комментарии') + (items.length ? ' ('+items.length+')' : '');
    toggle.setAttribute('aria-expanded', String(open));
    list.hidden = !open; formSlot.hidden = !open;
    if (!open) return;
    list.replaceChildren(...(items.length ? items.map(c=>h('div',{class:'cm-item'},
      h('div',null, h('span',{'aria-hidden':'true'},emojiOf(c.author)+' '), h('b',null,nameOf(c.author)),' ', h('span',{class:'meta'},dt(c.ts)),
        canDelete(c.author) ? h('button',{type:'button',class:'x',title:'Удалить комментарий','aria-label':'Удалить комментарий',onclick:()=>delDoc('comments',c.id)},'×') : null,
        accState()==='member' && c.author!==COM.uid ? reportBtn(c) : null),
      h('div',{style:'white-space:pre-line'},c.text))) : [h('div',{class:'hint'},'Комментариев пока нет.')]));
    const st = accState();
    if (st !== lastSt){ lastSt = st; formSlot.replaceChildren(st==='member' ? form() : joinHint('комментировать')); }
  }
  live(paint);
  return box;
}

function leaves(n){ n = Math.max(1, Math.min(5, n|0)); return h('span',{class:'stars','aria-label':n+' из 5'}, '❦'.repeat(n), h('span',{style:'opacity:.25'},'❦'.repeat(5-n))); }
const FB_STATUS = {'':'Новое', in_progress:'В работе', done:'Сделано', declined:'Не подошло'};
function feedbackOf(r){ return {id:r.id, author:r.author, text:r.text, status:r.status||'', reply:r.reply||'', ts:tsOf(r), photos:(r.photos||[]).map(f=>({thumb:'/api/files/'+r.collectionId+'/'+r.id+'/'+encodeURIComponent(f)+'?thumb=300x300', full:'/api/files/'+r.collectionId+'/'+r.id+'/'+encodeURIComponent(f)}))}; }
function fbPhotos(fb){ return fb.photos.length ? h('div',{class:'fb-photos'}, fb.photos.map(ph=>h('a',{href:ph.full,target:'_blank',rel:'noopener'}, h('img',{src:ph.thumb,alt:'Фото к сообщению',loading:'lazy'})))) : null; }
function fbItem(fb, admin){
  const st = h('span',{class:'status '+(fb.status==='done'?'accepted':fb.status==='declined'?'declined':'')}, FB_STATUS[fb.status]||'Новое');
  return h('div',{class:'li'},
    h('div',{class:'meta'}, st, admin ? h('b',null,emojiOf(fb.author)+' '+nameOf(fb.author)) : null, h('span',null,dt(fb.ts)),
      fb.author===COM.uid || admin ? h('button',{type:'button',class:'x',title:'Удалить','aria-label':'Удалить сообщение',onclick:()=>{ if (confirm('Удалить сообщение?')) delDoc('feedback',fb.id); }},'×') : null),
    h('div',{style:'white-space:pre-line'},fb.text), fbPhotos(fb),
    fb.reply ? h('div',{class:'fb-reply'}, h('b',null,'Ответ Даши: '), fb.reply) : null,
    admin ? fbAdminControls(fb) : null);
}
function fbAdminControls(fb){
  const reply = h('textarea',{maxlength:'2000',placeholder:'Ответ автору (увидит в своём сообщении)','aria-label':'Ответ автору',style:'min-height:60px'}); reply.value = fb.reply;
  const set = data => write('feedback/'+fb.id, ()=>pb.collection('feedback').update(fb.id, data)).then(()=>toast('Сохранено')).catch(writeErr);
  return h('div',{style:'display:grid;gap:8px;margin-top:6px'}, reply,
    h('div',{style:'display:flex;gap:8px;flex-wrap:wrap'},
      h('button',{type:'button',class:'btn small',onclick:()=>set({reply:reply.value.trim()})},'Сохранить ответ'),
      ...[['in_progress','В работе'],['done','Сделано'],['declined','Не подошло']].map(([k,l])=>h('button',{type:'button',class:'btn ghost small','aria-pressed':String(fb.status===k),onclick:()=>set({status:k})},l))));
}
function feedbackSection(){
  const formSlot = h('div',{style:'margin-bottom:24px'});
  const mine = h('div');
  let lastSt = null;
  function form(){
    const ta = h('textarea',{id:'fb-text',maxlength:'3000',placeholder:'Что неудобно, чего не хватает, что можно сделать лучше?',style:'min-height:120px'});
    const files = h('input',{id:'fb-photos',type:'file',accept:'image/jpeg,image/png,image/webp,image/heic',multiple:''});
    const btn = h('button',{type:'submit',class:'btn'},'Отправить Даше');
    const f = h('form',{class:'form',style:'margin-top:0;border-style:solid;border-color:var(--line)'},
      h('label',{for:'fb-text'},'Ваше замечание или предложение',ta),
      h('label',{for:'fb-photos'},'Фото или скриншоты (до 5 штук, необязательно)',files),
      h('div',null,btn));
    f.addEventListener('submit', async e=>{ e.preventDefault();
      const t = ta.value.trim(); if (t.length < 3){ ta.focus(); return; }
      const fl = Array.from(files.files||[]);
      if (fl.length > 5){ toast('Можно приложить до 5 фото'); return; }
      if (fl.some(x=>x.size > 10*1024*1024)){ toast('Каждое фото — до 10 МБ'); return; }
      btn.disabled = true; btn.textContent = 'Отправляю…';
      try{
        const fd = new FormData(); fd.append('author', COM.uid); fd.append('text', t.slice(0,3000));
        for (const x of fl) fd.append('photos', await fitPhoto(x));
        await pb.collection('feedback').create(fd);
        f.reset(); toast('Спасибо! Даша прочитает и ответит');
      }catch(err){ writeErr(err); }
      btn.disabled = false; btn.textContent = 'Отправить Даше';
    });
    return f;
  }
  live(()=>{
    const st = accState();
    if (st !== lastSt){ lastSt = st; formSlot.replaceChildren(st==='member' ? form() : h('div',{class:'card'}, joinHint('написать Даше'))); }
    const my = COM.feedback.filter(x=>x.author===COM.uid);
    mine.replaceChildren(...(st==='member' && my.length ? [h('h3',{style:'font-size:20px;margin-bottom:10px'},'Мои сообщения'), h('div',{class:'list'}, my.map(x=>fbItem(x,false)))] : []));
  });
  return h('section',{class:'band',id:'feedback'}, h('div',{class:'wrap'},
    sectionHead('Обратная связь','Помогите сделать сайт лучше','Помогите мне сделать сайт полезнее и удобнее: ниже вы можете написать свои замечания и предложения, а также приложить фото. Я с радостью буду улучшать свой проект. Спасибо!'),
    formSlot, mine
  ));
}

/* ---------- flea market: participants' listings, moderation, deal chats ---------- */
const MK_KINDS = ['Продам','Обмен','Отдам даром'];
const mkState = l => l.moderation==='approved' ? 'approved' : l.moderation==='rejected' ? 'rejected' : 'pending';
function publicListings(){ return COM.listings.filter(l=>l.status!=='gone' && mkState(l)==='approved').sort((a,b)=>b.ts-a.ts); }
function pendingListings(){ return COM.listings.filter(l=>l.status!=='gone' && mkState(l)==='pending').sort((a,b)=>a.ts-b.ts); }
const priceLabel = it => it.kind==='Продам' && it.price ? it.price : it.kind==='Отдам даром' ? 'Бесплатно' : 'Обмен';
const kindStyle = k => k==='Отдам даром' ? 'background:var(--leaf);color:var(--on-moss)' : k==='Обмен' ? 'background:var(--sun);color:#2A1C05' : null;
function dealLabel(kind){ return kind==='Отдам даром' ? 'Хочу забрать' : kind==='Обмен' ? 'Предложить обмен' : 'Хочу купить'; }
function dealBtn(ref, title, seller, kind){
  return h('button',{type:'button',class:'btn small',style:'align-self:flex-start',onclick:()=>openDeal(ref, title, seller)}, dealLabel(kind));
}
function myItems(){ return COM.listings.filter(l=>l.seller===COM.uid); }
function setMyItemStatus(id, status){ return write('listings/'+id, ()=>pb.collection('listings').update(id,{status})).catch(writeErr); }
function listingOf(r){ return {id:r.id, seller:r.seller, title:r.title, kind:r.kind, price:r.price, condition:r.condition, city:r.city, note:r.note, photo:fileURL(r,'photo','600x450'), status:r.status||'active', moderation:r.moderation||'', reason:r.reason||'', ts:tsOf(r)}; }

function userListingCard(it){
  const mine = it.seller === COM.uid;
  const img = it.photo ? h('img',{src:it.photo,alt:it.title,loading:'lazy',style:'width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;display:block'}) : null;
  if (img) img.addEventListener('error',()=>img.remove());
  return h('article',{class:'card'},
    img,
    h('div',{style:'display:flex;gap:6px;flex-wrap:wrap'}, h('span',{class:'tag',style:kindStyle(it.kind)},it.kind||'Продам'), it.status==='reserved' ? h('span',{class:'tag',style:'background:var(--clay);color:#fff'},'Забронировано') : null),
    h('h3',{style:'font-size:20px'},it.title),
    h('p',{style:'font-weight:800;font-size:20px;font-variant-numeric:tabular-nums'}, priceLabel(it)),
    it.condition ? h('p',{class:'muted',style:'font-size:14px'},'Состояние: ',it.condition) : null,
    it.city ? h('p',{class:'muted',style:'font-size:14px'},'Где забрать: ',it.city) : null,
    it.note ? h('p',{style:'font-size:15px;flex:1;white-space:pre-line'},it.note) : null,
    h('p',{class:'hint'},'Разместил(а): ', nameSpan(it.seller)),
    mine ? h('p',{class:'hint',style:'font-weight:800'},'Это ваша вещь. Сообщения покупателей — в кабинете.') : dealBtn({listing:it.id}, it.title, it.seller, it.kind),
    commentsBlock('mk:'+it.id)
  );
}

function threadOf(r){ return {key:r.key, title:r.title, listing:r.listing||'', seller:r.seller||'', buyer:r.buyer, last_from:r.last_from||'', last_at:r.last_at||0, read_by:r.read_by||{}}; }
async function openDeal(ref, title, seller){
  if (accState() !== 'member'){ openAccount(); toast('Сначала войдите или зарегистрируйтесь, это быстро'); return; }
  if (seller && seller === COM.uid){ toast('Это ваша вещь'); return; }
  const key = (ref.listing ? 'L'+ref.listing : 'S'+ref.site)+'_'+COM.uid;
  let tid = Object.keys(COM.threads).find(id=>COM.threads[id].key===key);
  try{
    if (!tid){
      let r;
      try{ r = await pb.collection('chats').getFirstListItem(pb.filter('key = {:k}',{k:key}),{requestKey:null}); }
      catch(e){ const now = Date.now(); r = await pb.collection('chats').create({key, title:String(title).slice(0,120), listing:ref.listing||'', seller:seller||'', buyer:COM.uid, last_from:COM.uid, last_at:now, read_by:{[COM.uid]:now}}); }
      COM.threads[r.id] = threadOf(r); tid = r.id;
    }
    openAccount('chats', tid);
  }catch(e){ writeErr(e); }
}
const isUnread = t => t.last_from!==COM.uid && (t.last_at||0) > ((t.read_by||{})[COM.uid]||0);
function unreadCount(){ return Object.values(COM.threads).filter(isUnread).length; }
function partnerName(t){
  if (t.buyer === COM.uid) return t.seller ? nameOf(t.seller) : 'Даша';
  return nameOf(t.buyer);
}

/* thread view inside the cabinet */
function threadView(tid, back){
  const t = COM.threads[tid];
  const msgs = h('div',{class:'list',style:'max-height:46vh;overflow:auto'});
  const inp = h('textarea',{id:'chat-input',maxlength:'2000',placeholder:'Сообщение',style:'min-height:60px'});
  const f = h('form',{class:'form',style:'margin:0;border-style:solid;border-color:var(--line);padding:12px'}, inp, h('div',null,h('button',{type:'submit',class:'btn small'},'Отправить')));
  let list = [], lastSeen = 0;
  function markRead(){
    const tt = COM.threads[tid]; if (!tt) return;
    const now = Date.now();
    if (((tt.read_by||{})[COM.uid]||0) >= (tt.last_at||0) || now - lastSeen < 3000) return;
    lastSeen = now;
    const read_by = Object.assign({}, tt.read_by, {[COM.uid]:now});
    tt.read_by = read_by;
    write('chats/'+tid, ()=>pb.collection('chats').update(tid,{read_by})).catch(()=>{});
  }
  function paintMsgs(){
    msgs.replaceChildren(...(list.length ? list.map(m=>h('div',{class:'li',style:m.from===COM.uid?'background:color-mix(in srgb,var(--leaf) 16%,var(--surface));margin-left:12%':'margin-right:12%'},
      h('div',{class:'meta'}, h('b',null, m.from===COM.uid ? 'Вы' : (!t.seller && m.from!==t.buyer) ? 'Даша' : nameOf(m.from)), h('span',null,new Date(m.ts).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))),
      h('div',{style:'white-space:pre-line'},m.text))) : [h('p',{class:'hint'}, isDM(t) ? 'Напишите первое сообщение — познакомьтесь и поделитесь эко-привычками.' : 'Напишите, когда и где удобно встретиться, задайте вопросы о вещи.')]));
    msgs.scrollTop = msgs.scrollHeight;
  }
  const load = ()=>pb.collection('messages').getFullList({filter:pb.filter('chat = {:c}',{c:tid}), sort:'created', requestKey:null})
    .then(r=>{ list = r.map(m=>({from:m.from, text:m.text, ts:tsOf(m)})); paintMsgs(); markRead(); }).catch(()=>{});
  load();
  let stop = null;
  pb.collection('messages').subscribe('*', e=>{ if (e.record && e.record.chat===tid) load(); }).then(u=>{ stop = u; }).catch(()=>{});
  PAGE_UNSUBS.push(()=>{ if (stop) stop(); });
  f.addEventListener('submit',e=>{ e.preventDefault(); const x = inp.value.trim(); if (!x) return; inp.value = '';
    const now = Date.now();
    pb.collection('messages').create({chat:tid, from:COM.uid, text:x.slice(0,2000)})
      .then(()=>write('chats/'+tid, ()=>pb.collection('chats').update(tid,{last_from:COM.uid, last_at:now, read_by:Object.assign({}, (COM.threads[tid]||t).read_by, {[COM.uid]:now})})))
      .catch(err=>{ inp.value = x; writeErr(err); }); });
  const myIt = t.listing ? myItems().find(l=>l.id===t.listing) : null;
  const actions = myIt ? h('div',{style:'display:flex;gap:8px;flex-wrap:wrap'},
    myIt.status!=='reserved' && myIt.status!=='gone' ? h('button',{type:'button',class:'btn ghost small',onclick:()=>setMyItemStatus(myIt.id,'reserved').then(()=>toast('Вещь отмечена как забронированная'))},'Забронировать') : null,
    myIt.status==='reserved' ? h('button',{type:'button',class:'btn ghost small',onclick:()=>setMyItemStatus(myIt.id,'active').then(()=>toast('Бронь снята'))},'Снять бронь') : null,
    myIt.status!=='gone' ? h('button',{type:'button',class:'btn ghost small',onclick:()=>setMyItemStatus(myIt.id,'gone').then(()=>toast('Готово! Вещь убрана из барахолки'))},'Отдано / продано') : h('span',{class:'status'},'Сделка завершена')) : null;
  paintMsgs();
  const iAmSeller = t.seller === COM.uid || (!t.seller && t.buyer !== COM.uid);
  return [
    h('div',{style:'display:flex;gap:10px;align-items:center;flex-wrap:wrap'}, h('button',{type:'button',class:'btn ghost small',onclick:back},'← Все сообщения'),
      h('div',{style:'min-width:0'}, h('b',null,t.title), h('div',{class:'hint'}, isDM(t) ? 'Собеседник: ' : iAmSeller ? 'Покупатель: ' : 'Продавец: ', partnerName(t)))),
    actions, msgs, f,
    h('p',{class:'hint'},'Сайт не принимает оплату. Договоритесь о передаче и способе оплаты напрямую. Не отправляйте здесь паспортные и банковские данные: переписку видят модераторы.')
  ];
}
let MODAL_UNSUBS = [];

/* ---------- picked for you: listings that fit the city and the eco goals from the profile ---------- */
const GOAL_WORDS = {
  'Меньше мусора и пластика':['многоразов','шопер','сумк','бутыл','контейнер','термос','кружк','ланч','сетк','мешоч','банк'],
  'Научиться сортировать отходы':['контейнер','ведр','короб','органайзер','корзин','ящик'],
  'Покупать осознанно: меньше и лучше':['ремонт','винтаж','качеств','почти нов','новый','как нов'],
  'Питаться экологичнее':['кухн','посуд','кастрюл','сковород','блендер','банк','контейнер','тарел','книга рецеп','мультиварк'],
  'Экономить воду и энергию':['лампа','светодиод','насадк','лейк','сушилк','обогрев','утеплит'],
  'Экологичный гардероб':['плать','куртк','пальто','джинс','рубаш','юбк','свитер','обув','ботин','кроссов','сумк','шарф','костюм','одежд','кофт'],
  'Здоровье и чистый воздух':['растени','цвет','горшк','очистит','велосипед','самокат','коврик','спорт','гантел'],
  'Научить детей заботиться о планете':['детск','игрушк','книг','конструктор','пазл','настольн','коляск','самокат'],
  'Пока просто интересуюсь':[]
};
function pickedForYou(){
  const p = PROFILE.rec; if (!p) return [];
  const city = String(p.city||'').trim().toLowerCase(), goals = p.goals||[];
  return publicListings().filter(l=>l.seller!==COM.uid && l.status!=='reserved').map(l=>{
    const text = [l.title,l.note,l.condition].join(' ').toLowerCase(), why = [];
    let score = 0;
    if (city && String(l.city||'').toLowerCase().includes(city)){ score += 3; why.push('📍 в вашем городе'); }
    goals.forEach(g=>{ if ((GOAL_WORDS[g]||[]).some(w=>text.includes(w))){ score += 2; why.push('🎯 '+g.toLowerCase()); } });
    if (l.kind==='Отдам даром'){ score += 1; why.push('🎁 даром'); }
    return {l, score, why};
  }).filter(x=>x.score >= 2).sort((a,b)=>b.score-a.score || b.l.ts-a.l.ts).slice(0,3);
}
function pickedBlock(){
  const box = h('div',{class:'picked'});
  if (accState()==='member' && !PROFILE.loaded) loadProfile();
  live(()=>{
    if (accState()!=='member'){ box.replaceChildren(); return; }
    if (!PROFILE.loaded){ box.replaceChildren(); return; }
    if (!profileDone(PROFILE.rec)){ box.replaceChildren(h('div',{class:'card picked-hint'}, h('span',{'aria-hidden':'true',style:'font-size:26px'},'🎯'),
      h('div',{style:'flex:1;min-width:200px'}, h('b',null,'Подберём вещи для вас'), h('div',{class:'hint'},'Укажите в профиле город и эко-цели — покажем подходящие объявления.')),
      h('a',{class:'btn small',href:'/kabinet?tab=profile#cabinet-tabs'},'Заполнить профиль'))); return; }
    const list = pickedForYou();
    box.replaceChildren(h('h3',{style:'margin-bottom:12px'},'🎯 Подобрано для вас'),
      list.length ? h('div',{class:'grid g3'}, list.map(({l,why})=>{ const c = userListingCard(l); c.classList.add('picked-card'); c.prepend(h('div',{class:'picked-why'}, why.slice(0,3).map(w=>h('span',null,w)))); return c; }))
        : h('p',{class:'hint'},'Пока нет вещей под ваш город и цели — загляните позже или посмотрите всё ниже.'));
  });
  return box;
}
function marketSection(){
  const items = STATE.market;
  const userGrid = h('div');
  const cache = new Map();
  live(()=>{
    const pub = publicListings();
    const st = accState();
    if (!pub.length){ userGrid.replaceChildren(h('div',{class:'empty'}, st==='loading' ? 'Загружаем…' : 'Пока никто ничего не выставил. Будьте первым!')); cache.clear(); return; }
    const els = pub.map(it=>{
      const v = [it.title,it.kind,it.price,it.condition,it.city,it.note,it.photo,it.status,st,COM.uid].join('|');
      let c = cache.get(it.id);
      if (!c || c.v !== v){ c = {v, el:userListingCard(it)}; cache.set(it.id,c); }
      return c.el;
    });
    userGrid.replaceChildren(h('div',{class:'grid g3'}, els));
  });
  const addBtn = h('div');
  live(()=>{ const st = accState(); addBtn.replaceChildren(st==='member' ? h('button',{type:'button',class:'btn',onclick:()=>openAccount('things')},'Выставить свою вещь') : joinHint('выставить свою вещь')); });
  return h('section',{class:'band',id:'market'}, h('div',{class:'wrap'},
    sectionHead('Вторая жизнь вещей','Барахолка','Отдавайте, меняйте и продавайте то, что ещё послужит другим. Каждое объявление участников проверяет Даша.'),
    h('div',{class:'grid g3',style:'margin-bottom:28px'},
      [['1','Выставьте вещь','В личном кабинете: фото, описание и цена. Объявление появится после проверки.'],
       ['2','Договоритесь','Нажмите «Хочу купить» или «Хочу забрать» и обсудите детали в личных сообщениях.'],
       ['3','Передайте из рук в руки','Встреча или доставка — как удобно. Оплата напрямую, сайт деньги не принимает.']].map(([n,t,d])=>h('div',{class:'card',style:'background:transparent'}, h('div',{class:'tip-num'},n), h('h3',{style:'font-size:19px'},t), h('p',{class:'muted',style:'font-size:15px'},d)))),
    pickedBlock(),
    h('h3',{style:'margin-bottom:14px'},'От Даши'),
    items.length ? h('div',{class:'grid g3'}, items.map(it=>h('article',{class:'card'},
      delBtn('market',it.id), exMark(it),
      h('span',{class:'tag',style:kindStyle(it.kind)},it.kind||'Продам'),
      h('h3',{style:'font-size:20px'},it.title),
      h('p',{style:'font-weight:800;font-size:20px;font-variant-numeric:tabular-nums'}, priceLabel(it)),
      it.condition ? h('p',{class:'muted',style:'font-size:14px'},'Состояние: ',it.condition) : null,
      it.note ? h('p',{style:'font-size:15px;flex:1'},it.note) : null,
      dealBtn({site:it.id}, it.title, '', it.kind),
      commentsBlock('market:'+it.id)
    ))) : h('div',{class:'empty'},'Сейчас ничего нет, загляните позже.'),
    addForm('market','Новое объявление от Даши'),
    h('div',{style:'display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:40px 0 14px'}, h('h3',null,'От участников'), addBtn),
    userGrid
  ));
}

/* cabinet panels for the market */
function thingsPanel(lists){
  const title = h('input',{id:'mk-title',maxlength:'100',placeholder:'Например, детский велосипед'});
  const kind = h('select',{id:'mk-kind'}, MK_KINDS.map(o=>h('option',null,o)));
  const price = h('input',{id:'mk-price',maxlength:'30',placeholder:'1500 ₽'});
  const cond = h('input',{id:'mk-cond',maxlength:'60',placeholder:'Как новое'});
  const city = h('input',{id:'mk-city',maxlength:'80',placeholder:'Город, район или метро'});
  const note = h('textarea',{id:'mk-note',maxlength:'1500'});
  const file = h('input',{id:'mk-photo',type:'file',accept:'image/jpeg,image/png,image/webp'});
  const btn = h('button',{type:'submit',class:'btn'},'Отправить на проверку');
  const f = h('form',{class:'form',style:'margin:0;border-style:solid;border-color:var(--line)'},
    h('div',{class:'fields'},
      h('label',{for:'mk-title',style:'grid-column:1/-1'},'Что за вещь',title),
      h('label',{for:'mk-kind'},'Формат',kind), h('label',{for:'mk-price'},'Цена (если продаёте)',price),
      h('label',{for:'mk-cond'},'Состояние',cond), h('label',{for:'mk-city'},'Где забрать',city)),
    h('label',{for:'mk-note'},'Описание: размер, бренд, особенности',note),
    h('label',{for:'mk-photo'},'Фото (необязательно)',file),
    h('div',null,btn));
  f.addEventListener('submit', async e=>{
    e.preventDefault();
    const t = title.value.trim(); if (t.length < 2){ title.focus(); return; }
    const fl = file.files && file.files[0];
    if (fl && fl.size > 15*1024*1024){ toast('Фото больше 15 МБ'); return; }
    btn.disabled = true; btn.textContent = 'Отправляю…';
    try{
      const fd = new FormData();
      Object.entries({seller:COM.uid, title:t, kind:kind.value, price:kind.value==='Продам' ? price.value.trim() : '', condition:cond.value.trim(), city:city.value.trim(), note:note.value.trim(), status:'active'}).forEach(([k,v])=>fd.append(k,v));
      if (fl) fd.append('photo', await fitPhoto(fl, 1200));
      await pb.collection('listings').create(fd);
      f.reset(); toast('Отправлено! Объявление появится после проверки');
    }catch(err){ writeErr(err); }
    btn.disabled = false; btn.textContent = 'Отправить на проверку';
  });
  lists.things = h('div',{class:'list'});
  return [h('p',{class:'muted'},'Даша проверяет каждое объявление, обычно в течение дня. Потом оно появится в барахолке, а покупатели смогут написать вам.'), f, h('h3',{style:'font-size:18px'},'Мои объявления'), lists.things];
}
function paintThings(el){
  const items = myItems().slice().sort((a,b)=>b.ts-a.ts);
  const lbl = {pending:'На проверке', approved:'Опубликовано', rejected:'Отклонено'};
  el.replaceChildren(...(items.length ? items.map(it=>{
    const ms = mkState(it);
    const stl = it.status==='gone' ? 'Отдано' : it.status==='reserved' ? 'Забронировано' : lbl[ms];
    return h('div',{class:'li'},
      h('div',{class:'meta'}, h('span',{class:'status '+(ms==='approved'?'accepted':ms==='rejected'?'declined':'')},stl), h('span',null,it.kind), h('span',null,priceLabel(it)), h('span',null,dt(it.ts))),
      h('b',null,it.title),
      ms==='rejected' && it.reason ? h('div',{class:'hint'},'Причина: ',it.reason) : null,
      h('div',{style:'display:flex;gap:8px;flex-wrap:wrap'},
        it.status!=='gone' ? h('button',{type:'button',class:'btn ghost small',onclick:()=>setMyItemStatus(it.id,'gone')},'Отдано / продано') : null,
        h('button',{type:'button',class:'btn danger small',onclick:()=>delDoc('listings',it.id)},'Удалить')));
  }) : [h('p',{class:'hint'},'Вы пока ничего не выставили.')]));
}
function paintChats(el, openThread){
  const ts = Object.entries(COM.threads).sort((a,b)=>(b[1].last_at||0)-(a[1].last_at||0));
  el.replaceChildren(...(ts.length ? ts.map(([tid,t])=>h('button',{type:'button',class:'li',style:'text-align:left;cursor:pointer;font:inherit;color:inherit',onclick:()=>openThread(tid)},
      h('div',{class:'meta'}, isUnread(t) ? h('span',{class:'status accepted'},'Новое') : null, h('span',null, isDM(t) ? 'Личные сообщения' : t.buyer===COM.uid ? 'Вы покупаете' : 'Вас спрашивают'), h('span',null,dt(t.last_at))),
      h('b',null,t.title), h('span',{class:'hint'},'Собеседник: ',partnerName(t)))
  ) : [h('p',{class:'hint'},'Сообщений пока нет. Нажмите «Хочу купить» или «Хочу забрать» на любой вещи в барахолке.')]));
}
function paintModeration(el){
  const pend = pendingListings();
  el.replaceChildren(...(pend.length ? pend.map(it=>{
    const reason = h('input',{maxlength:'200',placeholder:'Причина отказа (увидит автор)','aria-label':'Причина отказа'});
    const set = data => write('listings/'+it.id, ()=>pb.collection('listings').update(it.id, data));
    return h('div',{class:'li'},
      it.photo ? h('img',{src:it.photo,alt:'',loading:'lazy',decoding:'async',style:'width:120px;aspect-ratio:4/3;object-fit:cover;border-radius:8px'}) : null,
      h('div',{class:'meta'}, h('span',{class:'status'},it.kind), h('b',null,nameOf(it.seller)), h('span',null,dt(it.ts)), h('span',null,priceLabel(it))),
      h('b',null,it.title),
      h('div',{style:'font-size:14px;white-space:pre-line'}, [it.condition && 'Состояние: '+it.condition, it.city && 'Где: '+it.city, it.note].filter(Boolean).join('\n')),
      h('div',{class:'cm-form',style:'flex-wrap:wrap'},
        h('button',{type:'button',class:'btn small',onclick:()=>set({moderation:'approved', reason:''}).then(()=>toast('Опубликовано')).catch(writeErr)},'Опубликовать'),
        reason,
        h('button',{type:'button',class:'btn ghost small',onclick:()=>set({moderation:'rejected', reason:reason.value.trim().slice(0,200)}).then(()=>toast('Отклонено')).catch(writeErr)},'Отклонить')));
  }) : [h('p',{class:'hint'},'Новых объявлений на проверку нет.')]));
}
// admin: say who invited this member (when the invitation link was opened in another browser)
function refPicker(id){
  const sel = h('select',{'aria-label':'Кто пригласил '+nameOf(id)}, h('option',{value:''},'Кто пригласил? —'),
    Object.keys(COM.members).filter(x=>x!==id).map(x=>h('option',{value:x},nameOf(x))));
  const btn = h('button',{type:'button',class:'btn ghost small',onclick:()=>{
    if (!sel.value) { sel.focus(); return; }
    btn.disabled = true;
    pb.collection('referrals').create({inviter:sel.value, invited:id}).then(()=>toast('Записано: '+nameOf(id)+' пришёл(ла) по приглашению '+nameOf(sel.value)), e=>{ btn.disabled = false; writeErr(e); });
  }},'Записать приглашение');
  return h('div',{class:'ref-pick'}, sel, btn);
}
function paintPeople(el){
  if (el.querySelector('select:focus')) return; // do not reset a choice in progress
  const now = Date.now();
  const seen = id => COM.presence[id] || 0;
  const ids = Object.keys(COM.members).sort((a,b)=>(seen(b)-seen(a)) || ((COM.members[b].joined||0)-(COM.members[a].joined||0)));
  const online = ids.filter(id=>now-seen(id) < ONLINE_MS).length, active = ids.filter(id=>now-seen(id) < ACTIVE_MS).length;
  el.replaceChildren(
    h('div',{class:'kv people-sum'},
      h('div',null,h('b',null,ids.length),h('span',null,plural(ids.length,'участник','участника','участников')+' всего')),
      h('div',null,h('b',null,online),h('span',null,'онлайн сейчас')),
      h('div',null,h('b',null,active),h('span',null,'активных за месяц'))),
    ...(ids.length ? ids.map(id=>{
      const m = COM.members[id], isMod = m.role==='moderator', on = now-seen(id) < ONLINE_MS;
      return h('div',{class:'li'},
        h('div',{class:'meta'}, h('span',{class:'online-dot'+(on?' on':''),'aria-hidden':'true'}), h('span',{'aria-hidden':'true'},emojiOf(id)), h('b',null,m.nick), id===COM.uid ? h('span',{class:'status'},'Это вы') : null,
          m.role==='admin' ? h('span',{class:'status accepted'},'Администратор') : isMod ? h('span',{class:'status accepted'},'Модератор') : null,
          h('span',null,levelName(m.level))),
        h('div',{class:'hint'}, seenLabel(seen(id)), ' · с нами с ', dt(m.joined), m.verified ? ' · ✓ почта' : ' · почта не подтверждена',
          (()=>{ const r = COM.refs.find(x=>x.invited===id); return r ? ' · пришёл(ла) по приглашению: '+nameOf(r.inviter) : ''; })(),
          (()=>{ const n = COM.refs.filter(x=>x.inviter===id).length; return n ? ' · пригласил(а): '+n : ''; })()),
        !COM.refs.some(x=>x.invited===id) && Object.keys(COM.members).length > 1 ? refPicker(id) : null,
        id!==COM.uid && m.role!=='admin' ? h('div',null, h('button',{type:'button',class:'btn ghost small',onclick:()=>{
          pb.collection('users').update(id,{role: isMod ? 'member' : 'moderator'}).then(()=>toast(isMod ? 'Модератор снят' : 'Назначен модератором')).catch(writeErr);
        }}, isMod ? 'Снять модератора' : 'Сделать модератором')) : null);
    }) : [h('p',{class:'hint'},'Пока никто не зарегистрировался.')]));
}

/* ---------- personal stats ---------- */
const ME_KEY = 'botanica-me-v1';
let STATS = { examBest:0, examPassed:null, gameBest:0 };
try{ const v = JSON.parse(localStorage.getItem(ME_KEY)||'null'); if (v) STATS = Object.assign(STATS, v); }catch(e){}
let statsTimer = null;
function saveStats(){
  try{ localStorage.setItem(ME_KEY, JSON.stringify(STATS)); }catch(e){}
  if (pb && COM.uid){
    clearTimeout(statsTimer);
    statsTimer = setTimeout(()=>{ pb.collection('users').update(COM.uid,{exam_best:STATS.examBest||0, game_best:STATS.gameBest||0, exam_passed:STATS.examPassed ? String(STATS.examPassed) : ''}).catch(()=>{}); }, 600);
  }
  refresh();
}
const leavesTotal = () => Object.values(HAB.log||{}).reduce((a,v)=>a+(v?v.length:0),0) + (Array.isArray(HAB.challenges) ? HAB.challenges.reduce((a,ch)=>a+chStats(ch).checks,0) : 0);
const postsCount = () => COM.reviews.filter(r=>r.author===COM.uid).length + COM.comments.filter(c=>c.author===COM.uid).length + COM.feedback.filter(f=>f.author===COM.uid).length;

/* ---------- character growth ("tamagotchi") ---------- */
/* one progress line: growth points lead the character through the levels; every level gives a certificate */
function growthBlock(){
  const me = COM.me; if (!me) return null;
  const cur = levelOf(me.level), next = levelOf(me.level+1);
  const from = cur ? cur.min_xp||0 : 0, to = next ? next.min_xp||0 : from;
  const frac = next ? Math.max(0, Math.min(1, (me.xp-from)/((to-from)||1))) : 0;
  const n = Math.max(1, COM.levels.length), idx = Math.max(0, COM.levels.findIndex(l=>l.rank===me.level));
  // steps are equal columns: fill from the first column centre to the current one, plus the share done towards the next
  const pathPct = n === 1 ? 100 : (50/n) + (idx + frac) / (n-1) * (100 - 100/n);
  const ch = charOf(me.character), em = emojiOf(COM.uid), chName = me.customName || (ch && ch.kind!=='custom' ? ch.name : 'Персонаж');
  const have = {min_leaves:Math.max(me.leaves||0, leavesTotal()), min_exam:STATS.examBest||0, min_game:STATS.gameBest||0, min_reviews:postsCount()};
  const extra = next ? [['min_leaves','эко-листочков в трекере'],['min_exam','баллов на эко-экзамене (из 10)'],['min_game','очков в игре «Эко-уборка»'],['min_reviews','комментариев и сообщений Даше']]
    .filter(([k])=>(next[k]||0) > 0).map(([k,l])=>h('div',{class:'lvl-row'+(have[k]>=next[k]?' ok':'')}, h('span',null, have[k]>=next[k] ? '✓ ' : '', l), h('b',null, Math.min(have[k],next[k]),' / ',next[k]))) : [];
  const certs = me.history.filter(x=>x.rank<=me.level).sort((a,b)=>a.rank-b.rank);
  return h('div',{class:'grow'},
    h('div',{class:'grow-pet st-'+me.level},
      h('div',{class:'grow-aura','aria-hidden':'true'}),
      h('span',{class:'grow-em',role:'img','aria-label':chName+', уровень «'+levelName(me.level)+'»'}, em),
      h('div',{class:'grow-deco','aria-hidden':'true'}, ['','','🌱','🌿','🌳','✨'][me.level] || ''),
      h('button',{type:'button',class:'btn grow-cta','aria-expanded':String(GROW_OPEN),'aria-controls':'grow-ways',onclick:()=>{ GROW_OPEN = !GROW_OPEN; refresh(); if (GROW_OPEN) setTimeout(()=>{ const w = document.getElementById('grow-ways'); if (w) w.scrollIntoView({behavior:'smooth',block:'nearest'}); }, 50); }}, GROW_OPEN ? 'Свернуть' : '🌱 Растить персонажа')),
    GROW_OPEN ? growWays() : null,
    h('div',{class:'grow-info'},
      h('div',{class:'eyebrow'},'Развивайте своего персонажа'),
      h('h2',{style:'font-size:clamp(26px,4vw,36px)'}, chName,' — ', levelName(me.level)),
      cur && cur.description ? h('p',{class:'muted'}, cur.description) : null,
      h('div',{class:'grow-steps'}, COM.levels.map(l=>h('div',{class:'grow-step'+(l.rank<=me.level?' on':'')+(l.rank===me.level?' now':''),title:l.name+(l.min_xp ? ' — от '+l.min_xp+' очков роста' : '')},
        h('span',{style:'font-size:'+(14+l.rank*4)+'px','aria-hidden':'true'}, em), h('small',null,l.name), h('small',{class:'grow-xp'}, (l.min_xp||0)+' очк.')))),
      h('div',{class:'grow-bar',role:'progressbar','aria-valuemin':'0','aria-valuemax':String(to||me.xp),'aria-valuenow':String(me.xp),'aria-label':'Очки роста'}, h('i',{style:'width:'+pathPct.toFixed(1)+'%'})),
      h('p',{class:'hint',style:'font-weight:800'}, next ? 'Очки роста: '+me.xp+' из '+to+' до уровня «'+next.name+'»' : 'Очки роста: '+me.xp+'. Это высший уровень — вы эко-эксперт!'),
      xpBreakdown(),
      extra.length ? h('div',{class:'lvl-next'}, h('div',{class:'hint',style:'font-weight:800'},'Ещё для уровня «',next.name,'»:'), extra) : null,
      certs.length ? h('div',null, h('div',{class:'hint',style:'font-weight:800;margin-bottom:6px'},'Мои сертификаты'),
        h('div',{style:'display:flex;gap:8px;flex-wrap:wrap'}, certs.map(x=>h('a',{class:'chip',href:'#cert/'+COM.uid+'/'+x.rank},'🎓 ',levelName(x.rank))))) : null,
      h('p',{class:'hint'},'За каждый новый уровень — именной сертификат. Чем выше уровень, тем крупнее ваш персонаж в «Счастливом мире». Как расти — кнопка «Растить персонажа».')));
}

/* "Растить персонажа": every way to grow with a link straight to it */
let GROW_OPEN = false;
const GROW_WAYS = {
  challenge_done:['🏁','/kabinet#challenges','Создать челлендж'], leaf:['🍃','/kabinet#challenges','Отметить привычки'],
  exam_passed:['🎓','/eko-test','Пройти тест'], game:['🎮','/#game','Играть'], article_read:['📖','/#journal','Читать журнал'],
  like:['♥','/#journal','К статьям'], comment:['💬','/#journal','Обсудить'], feedback:['💡','/#feedback','Написать Даше'],
  listing_approved:['📦','/kabinet?tab=things','Выставить вещь'], deal_done:['🤝','/baraholka','В барахолку'], signup:['✅',null,null],
  profile_complete:['📝','/kabinet?tab=profile#cabinet-tabs','Заполнить'], invited:['🎁',null,null], invite_friend:['💌','/kabinet?tab=profile#invite','Пригласить']
};
function growWays(){
  const done = {signup:true, exam_passed:!!STATS.examPassed || (STATS.examBest||0) >= 8, profile_complete:profileDone(PROFILE.rec), invited:COM.refs.some(r=>r.invited===COM.uid)};
  // "came by invitation" is shown only to those who did
  const rows = COM.growthRules.filter(r=>r.points>0 && (r.key!=='invited' || done.invited)).map(r=>{
    const [ic, href, cta] = GROW_WAYS[r.key] || ['🌱',null,null];
    const ok = done[r.key];
    return h('div',{class:'way'+(ok?' ok':'')},
      h('span',{class:'way-ic','aria-hidden':'true'},ic),
      h('div',{class:'way-t'}, h('b',null,r.title), r.per ? h('span',{class:'hint'}, r.per) : null),
      h('span',{class:'way-pts'},'+',r.points),
      ok ? h('span',{class:'status accepted'},'✓ сделано') : href ? h('a',{class:'btn small',href},cta) : null);
  });
  return h('div',{class:'grow-ways',id:'grow-ways'},
    h('h3',{style:'font-size:22px'},'Как растить персонажа'),
    h('p',{class:'hint'},'Выбирайте, что по душе: за каждое действие персонаж получает очки роста, а с ними — новые уровни и сертификаты.'),
    h('div',{class:'ways'}, rows));
}

/* where the growth points come from — the same formula as on the server */
function xpBreakdown(){
  const me = COM.me; if (!me) return null;
  const mine = (arr, f) => arr.filter(x=>x[f]===COM.uid).length;
  const done = {
    signup: 1,
    leaf: Math.max(me.leaves||0, leavesTotal()),
    exam_passed: (STATS.examBest||0) >= 8 ? 1 : 0,
    game: Math.floor((STATS.gameBest||0)/10),
    article_read: Object.keys(COM.reads).length,
    like: mine(COM.likes,'user'),
    comment: mine(COM.comments,'author'),
    feedback: mine(COM.feedback,'author'),
    listing_approved: COM.listings.filter(l=>l.seller===COM.uid && l.moderation==='approved').length,
    deal_done: COM.listings.filter(l=>l.seller===COM.uid && l.status==='gone').length,
    profile_complete: profileDone(PROFILE.rec) ? 1 : 0,
    invited: COM.refs.some(r=>r.invited===COM.uid) ? 1 : 0,
    invite_friend: COM.refs.filter(r=>r.inviter===COM.uid).length,
  };
  const label = {signup:()=>'Регистрация', leaf:n=>n+' '+plural(n,'листочек','листочка','листочков')+' в челлендже', exam_passed:()=>'Эко-экзамен сдан',
    game:()=>'Рекорд в игре '+(STATS.gameBest||0)+' ('+Math.floor((STATS.gameBest||0)/10)+' × 10 очков)', article_read:n=>n+' '+plural(n,'статья прочитана','статьи прочитаны','статей прочитано'),
    like:n=>n+' '+plural(n,'лайк','лайка','лайков'), comment:n=>n+' '+plural(n,'комментарий','комментария','комментариев'), feedback:n=>n+' '+plural(n,'сообщение','сообщения','сообщений')+' Даше',
    profile_complete:()=>'Профиль заполнен', invited:()=>'Пришли по приглашению', invite_friend:n=>n+' '+plural(n,'друг пришёл','друга пришли','друзей пришли')+' по вашей ссылке',
    listing_approved:n=>n+' '+plural(n,'вещь опубликована','вещи опубликованы','вещей опубликовано'), deal_done:n=>n+' '+plural(n,'сделка','сделки','сделок')+' на барахолке'};
  const rows = COM.growthRules.map(r=>({r, n:done[r.key]||0})).filter(x=>x.n > 0 && x.r.points > 0);
  if (!rows.length) return null;
  return h('details',{class:'grow-how'},
    h('summary',null,'Откуда ваши ',me.xp,' ',plural(me.xp,'очко','очка','очков'),' роста'),
    h('ul',null, rows.map(({r,n})=>h('li',null, (label[r.key]||(()=>r.title))(n), ' — ', h('b',null,'+',n*r.points)))));
}

/* admin: level names, thresholds, certificate texts and growth points — right on the site */
function levelsAdminPanel(){
  const save = (coll, id, data) => write(coll+'/'+id, ()=>pb.collection(coll).update(id, data)).then(()=>toast('Сохранено')).catch(writeErr);
  const lv = COM.levels.map(l=>{
    const name = h('input',{maxlength:'40',value:l.name,'aria-label':'Название уровня '+l.rank});
    const xp = h('input',{type:'number',min:'0',step:'1',value:String(l.min_xp||0),'aria-label':'Очков роста для уровня '+l.rank,style:'max-width:120px'});
    const desc = h('input',{maxlength:'500',value:l.description||'',placeholder:'Описание уровня','aria-label':'Описание уровня '+l.rank});
    const cert = h('input',{maxlength:'300',value:l.certificate_text||'',placeholder:'Текст сертификата: «… стал(а) эко-экспертом»','aria-label':'Текст сертификата '+l.rank});
    return h('div',{class:'li'},
      h('div',{class:'meta'}, h('span',{class:'lvl-step on'}, l.rank), h('b',null,'Уровень ',l.rank)),
      h('div',{class:'adm-row'}, h('label',null,'Название',name), h('label',null,'Очков роста нужно',xp)),
      h('label',{class:'adm-full'},'Описание',desc), h('label',{class:'adm-full'},'Текст сертификата',cert),
      h('div',null, h('button',{type:'button',class:'btn small',onclick:()=>{
        const n = name.value.trim(); if (!n){ name.focus(); return; }
        save('levels', l.id, {name:n.slice(0,40), min_xp:Math.max(0, parseInt(xp.value,10)||0), description:desc.value.trim(), certificate_text:cert.value.trim()});
      }},'Сохранить уровень')));
  });
  const rules = COM.growthRules.map(r=>{
    const title = h('input',{maxlength:'80',value:r.title,'aria-label':'Действие'});
    const pts = h('input',{type:'number',min:'0',step:'1',value:String(r.points||0),'aria-label':'Очки за действие',style:'max-width:90px'});
    const per = h('input',{maxlength:'40',value:r.per||'','aria-label':'За что','placeholder':'за статью'});
    return h('div',{class:'adm-rule'}, pts, title, per, h('button',{type:'button',class:'btn ghost small',onclick:()=>{
      const t = title.value.trim(); if (!t){ title.focus(); return; }
      save('growth_rules', r.id, {title:t.slice(0,80), points:Math.max(0, parseInt(pts.value,10)||0), per:per.value.trim().slice(0,40)});
    }},'Сохранить'));
  });
  return [
    h('p',{class:'muted'},'Здесь меняются названия уровней, сколько очков роста нужно для каждого, описания и тексты сертификатов. После сохранения уровни всех участников пересчитываются; полученные сертификаты не пропадают.'),
    h('div',{class:'list'}, lv),
    h('h3',{style:'font-size:20px'},'Сколько очков роста за какое действие'),
    h('p',{class:'muted'},'Поставьте 0, чтобы действие не давало роста.'),
    h('div',{class:'list'}, rules)];
}

/* ---------- levels & certificates ---------- */
async function openCert(userId, rank){
  if (!pb) return;
  let u, lv;
  try{
    u = await pb.collection('users').getOne(userId,{requestKey:null});
    lv = await pb.collection('levels').getFirstListItem(pb.filter('rank = {:r}',{r:rank}),{requestKey:null});
  }catch(e){ toast('Сертификат не найден'); return; }
  const got = (u.level_history||[]).find(x=>x.rank===rank);
  if (!got || (u.level||0) < rank){ toast('Этот уровень ещё не получен'); return; }
  let ch = null; try{ ch = await pb.collection('characters').getOne(u.character,{requestKey:null}); }catch(e){}
  const link = location.origin+'/#cert/'+userId+'/'+rank;
  openModal(sheet=>{
    sheet.classList.add('cert-sheet');
    sheet.append(h('div',{class:'cert big'},
      h('div',{class:'seal',style:'font-size:30px'}, u.custom_emoji || (ch ? ch.emoji : '🌱')),
      h('div',{class:'eyebrow'},'Сертификат DashaBotanika'),
      h('h2',{style:'font-size:clamp(30px,6vw,44px)'}, lv.name),
      h('p',{class:'muted'},'Подтверждаем, что'),
      h('p',{style:'font-family:var(--font-hand);font-size:clamp(34px,7vw,52px);line-height:1'}, u.name),
      h('p',{style:'font-size:18px'}, lv.certificate_text || 'достиг(ла) нового эко-уровня'),
      h('p',{class:'muted'}, new Date(got.at).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}), ' · № ', userId.slice(0,6).toUpperCase(),'-',rank),
      h('p',{class:'hand',style:'font-size:26px;color:var(--moss)'},'Даша, DashaBotanika'),
      h('div',{class:'no-print',style:'display:flex;gap:8px;flex-wrap:wrap;justify-content:center'},
        h('button',{type:'button',class:'btn',onclick:()=>{ (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(()=>toast('Ссылка скопирована'),()=>toast(link)); }},'Скопировать ссылку'),
        h('button',{type:'button',class:'btn ghost',onclick:()=>window.print()},'Распечатать или сохранить PDF'))
    ));
  });
}
/* links from emails: #verify/<token>, #reset/<token>, #email/<token> */
function clearHash(){ history.replaceState(null,'',location.pathname+location.search); }
function mailLink(kind, token){
  clearHash();
  if (kind==='verify'){
    pb.collection('users').confirmVerification(token)
      .then(()=>{ toast('Почта подтверждена, спасибо!'); if (COM.uid) pb.collection('users').authRefresh().then(()=>{ COM.verified = true; refresh(); }).catch(()=>{}); },
            ()=>toast('Ссылка устарела или уже использована'));
    return;
  }
  openModal(sheet=>{
    const pass = h('input',{id:'np-pass',type:'password',autocomplete:kind==='reset'?'new-password':'current-password',minlength:'8',required:''});
    const btn = h('button',{type:'submit',class:'btn'}, kind==='reset' ? 'Сохранить пароль' : 'Подтвердить');
    const f = h('form',{class:'form',style:'margin:0;border-style:solid;border-color:var(--line)'},
      h('label',{for:'np-pass'}, kind==='reset' ? 'Новый пароль (от 8 символов)' : 'Ваш пароль', pass), h('div',null,btn));
    f.addEventListener('submit', async e=>{ e.preventDefault();
      if (kind==='reset' && pass.value.length < 8){ toast('Пароль — минимум 8 символов'); return; }
      btn.disabled = true;
      try{
        if (kind==='reset'){ await pb.collection('users').confirmPasswordReset(token, pass.value, pass.value); closeModal(); toast('Пароль изменён, теперь можно войти'); if (!COM.uid) openAccount(); }
        else { await pb.collection('users').confirmEmailChange(token, pass.value); pb.authStore.clear(); try{ sessionStorage.setItem('db-welcome','Почта изменена. Войдите с новой почтой'); }catch(e){} location.reload(); }
      }catch(err){ btn.disabled = false; toast(err && err.status===400 ? 'Ссылка устарела или пароль неверный' : 'Не получилось, попробуйте ещё раз'); }
    });
    sheet.append(h('h2',null, kind==='reset' ? 'Новый пароль' : 'Подтверждение новой почты'), f);
  });
}
function routeHash(){
  const mail = /^#(verify|reset|email)\/([A-Za-z0-9._-]{20,})$/.exec(location.hash);
  if (mail && pb){ mailLink(mail[1], mail[2]); return; }
  const m = /^#cert\/([a-z0-9]{15})\/([1-9])$/.exec(location.hash);
  if (m) openCert(m[1], +m[2]);
  else if (MODAL && MODAL.querySelector('.cert-sheet')) closeModal();
}

/* ---------- happy world ---------- */
const WORLD_BG = '<svg viewBox="0 0 1000 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'+
  '<defs>'+
  '<linearGradient id="wsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BFDDEE"/><stop offset=".55" stop-color="#E6EEE4"/><stop offset="1" stop-color="#F3ECD9"/></linearGradient>'+
  '<radialGradient id="wsun"><stop offset="0" stop-color="#FFE6A3"/><stop offset=".45" stop-color="#F6C85F"/><stop offset="1" stop-color="#F6C85F" stop-opacity="0"/></radialGradient>'+
  '<linearGradient id="wwater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A9D6EA"/><stop offset="1" stop-color="#5F9FC6"/></linearGradient>'+
  '<linearGradient id="wfall" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8FC6E2"/><stop offset=".5" stop-color="#E7F5FB"/><stop offset="1" stop-color="#8FC6E2"/></linearGradient>'+
  '<linearGradient id="wmeadow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8DB565"/><stop offset="1" stop-color="#6E9A4C"/></linearGradient>'+
  '</defs>'+
  '<rect width="1000" height="420" fill="url(#wsky)"/>'+
  '<circle cx="870" cy="72" r="70" fill="url(#wsun)"/><circle cx="870" cy="72" r="30" fill="#F7CF6B"/>'+
  // облака плывут
  '<g class="w-cloud" fill="#fff" opacity=".9"><ellipse cx="140" cy="62" rx="46" ry="16"/><ellipse cx="170" cy="52" rx="30" ry="18"/><ellipse cx="112" cy="56" rx="22" ry="13"/></g>'+
  '<g class="w-cloud w-cloud2" fill="#fff" opacity=".8"><ellipse cx="560" cy="44" rx="40" ry="13"/><ellipse cx="586" cy="36" rx="24" ry="14"/></g>'+
  '<g class="w-cloud w-cloud3" fill="#fff" opacity=".85"><ellipse cx="760" cy="110" rx="36" ry="12"/><ellipse cx="782" cy="102" rx="22" ry="12"/></g>'+
  // горы вдали со снежными шапками
  '<path d="M0 230 L80 168 L140 196 L230 112 L320 196 L410 150 L500 212 L590 128 L690 200 L790 118 L890 178 L1000 142 V300 H0Z" fill="#A7B8C6"/>'+
  '<path d="M0 250 L120 200 L210 236 L300 186 L420 240 L540 198 L660 244 L760 196 L880 232 L1000 204 V310 H0Z" fill="#8FA5B5" opacity=".9"/>'+
  '<g fill="#F7FAFC"><path d="M230 112 L252 132 L240 128 L230 138 L220 128 L208 132Z"/><path d="M590 128 L610 146 L598 143 L590 152 L582 143 L570 146Z"/><path d="M790 118 L812 138 L800 134 L790 144 L780 134 L768 138Z"/></g>'+
  // холмы
  '<path d="M0 262 Q150 222 300 252 T620 240 T1000 236 V420 H0Z" fill="#A9C784"/>'+
  // скала с водопадом
  '<path d="M240 300 L250 214 L274 190 L312 186 L336 206 L344 300Z" fill="#8C877B"/><path d="M250 214 L274 190 L312 186 L300 200 L270 206Z" fill="#A39E92"/>'+
  '<rect x="282" y="196" width="22" height="98" fill="url(#wfall)"/>'+
  '<g class="w-fall" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".85"><path d="M287 198 V292"/><path d="M293 198 V292"/><path d="M299 198 V292"/></g>'+
  '<ellipse cx="293" cy="296" rx="44" ry="10" fill="#9FD0E6"/><g class="w-splash" fill="#fff" opacity=".8"><circle cx="276" cy="292" r="4"/><circle cx="312" cy="291" r="3.5"/><circle cx="293" cy="288" r="3"/></g>'+
  // холм с мельницей
  '<path d="M520 300 Q640 214 780 296Z" fill="#97BC70"/>'+
  '<g transform="translate(642 270) scale(1.45) translate(-642 -270)">'+
  '<path d="M630 268 L654 268 L648 204 L636 204Z" fill="#F2E8D5" stroke="#8B7A5E" stroke-width="2"/><path d="M630 206 L642 186 L654 206Z" fill="#B0604A"/><rect x="638" y="250" width="8" height="18" rx="3" fill="#8B7A5E"/><rect x="637" y="222" width="10" height="10" rx="2" fill="#9CC3DA" stroke="#8B7A5E"/>'+
  '<g class="w-blades" fill="#F7F1E4" stroke="#8B7A5E" stroke-width="1.5"><path d="M642 196 L637 152 L647 152Z"/><path d="M642 196 L686 191 L686 201Z"/><path d="M642 196 L647 240 L637 240Z"/><path d="M642 196 L598 201 L598 191Z"/><circle cx="642" cy="196" r="4" fill="#8B7A5E"/></g></g>'+
  // луг
  '<path d="M0 300 Q200 278 420 296 T1000 290 V420 H0Z" fill="url(#wmeadow)"/>'+
  // река от водопада
  '<path d="M266 296 C238 322 206 342 196 368 S178 410 150 420 L262 420 C270 400 282 378 300 360 S334 322 320 296Z" fill="url(#wwater)"/>'+
  '<path d="M290 304 C272 330 246 352 238 376" stroke="#fff" stroke-width="2" fill="none" opacity=".45" stroke-linecap="round"/>'+
  // деревья
  '<g fill="#3F6B37"><path d="M60 300 l16 -44 16 44z"/><path d="M64 284 l12 -32 12 32z"/><path d="M96 306 l13 -36 13 36z"/><path d="M904 296 l17 -48 17 48z"/><path d="M940 304 l13 -36 13 36z"/><path d="M420 292 l11 -30 11 30z"/></g>'+
  '<g><rect x="503" y="282" width="6" height="18" fill="#6B4E31"/><circle cx="506" cy="274" r="16" fill="#5C8C45"/><rect x="842" y="284" width="6" height="18" fill="#6B4E31"/><circle cx="845" cy="275" r="17" fill="#5C8C45"/><circle cx="855" cy="268" r="10" fill="#6E9E52"/></g>'+
  // цветы
  '<g><circle cx="380" cy="352" r="3" fill="#F3D35B"/><circle cx="560" cy="378" r="3" fill="#E98AA0"/><circle cx="720" cy="340" r="3" fill="#F3D35B"/><circle cx="880" cy="370" r="3" fill="#E98AA0"/><circle cx="640" cy="400" r="3" fill="#FFFFFF"/><circle cx="460" cy="404" r="3" fill="#F3D35B"/><circle cx="960" cy="400" r="3" fill="#FFFFFF"/></g>'+
  '</svg>';

const WORLD_SPOTS = [[62,80],[46,77],[78,77],[38,89],[54,91],[70,90],[87,86],[30,78],[94,78],[62,95],[46,96],[82,95]];

/* private messages between members: a chat whose "seller" is the other member */
async function openDM(userId){
  if (accState() !== 'member'){ openAccount(); toast('Чтобы писать участникам, войдите или зарегистрируйтесь'); return; }
  if (userId === COM.uid) return;
  const key = 'D_'+[COM.uid, userId].sort().join('_');
  let tid = Object.keys(COM.threads).find(id=>COM.threads[id].key===key);
  try{
    if (!tid){
      let r;
      try{ r = await pb.collection('chats').getFirstListItem(pb.filter('key = {:k}',{k:key}),{requestKey:null}); }
      catch(e){ const now = Date.now(); r = await pb.collection('chats').create({key, title:'Личная переписка', seller:userId, buyer:COM.uid, last_from:COM.uid, last_at:now, read_by:{[COM.uid]:now}}); }
      COM.threads[r.id] = threadOf(r); tid = r.id;
    }
    openAccount('chats', tid);
  }catch(e){ writeErr(e); }
}
const isDM = t => String(t.key||'').startsWith('D_');

function worldSection(){
  const box = h('div',{class:'world'});
  const count = h('p',{class:'muted',style:'margin-top:12px'});
  const cta = h('div',{style:'margin-top:14px'});
  let lastKey = null;
  live(()=>{
    const isDasha = id => COM.members[id].role==='admin' && (charOf(COM.members[id].character)||{}).name==='Слон';
    const ids = Object.keys(COM.members).filter(id=>COM.members[id].character)
      .sort((a,b)=>isDasha(a)!==isDasha(b) ? (isDasha(a) ? -1 : 1) : COM.members[a].joined-COM.members[b].joined);
    const key = ids.map(id=>id+COM.members[id].character+COM.members[id].nick+COM.members[id].level).join()+COM.characters.length+COM.levels.map(l=>l.name).join()+'|'+COM.uid;
    if (key === lastKey) return; lastKey = key;
    const n = ids.length;
    box.replaceChildren(h('div',{html:WORLD_BG,style:'position:absolute;inset:0'}), ...ids.map((id,i)=>{
      const m = COM.members[id];
      const r = Math.sqrt(i/(n+1)), a = i*2.39996;
      // first places are chosen spots on the meadow (Dasha in the middle), then a spiral around them
      const spot = WORLD_SPOTS[i];
      const x = spot ? spot[0] : 62 + Math.cos(a)*r*34, y = spot ? spot[1] : 82 + Math.sin(a)*r*11;
      const label = m.nick+' · '+levelName(m.level);
      const el = h('div',{class:'dweller st-'+(m.level||1)+(isDasha(id)?' first':'')+(id===COM.uid?' me':''),style:'left:'+x.toFixed(1)+'%;top:'+y.toFixed(1)+'%','aria-label':label,tabindex:'0'},
        h('span',{class:'em'}, emojiOf(id)), n <= 40 || isDasha(id) || id===COM.uid ? h('span',{class:'nm'}, m.nick) : null,
        h('div',{class:'pop'}, h('b',null, emojiOf(id),' ',m.nick), h('span',{class:'hint'}, levelName(m.level)),
          id===COM.uid ? h('span',{class:'hint'},'Это вы') : h('button',{type:'button',class:'btn small',onclick:e=>{ e.stopPropagation(); openDM(id); }},'✉ Написать')));
      el.addEventListener('click', ()=>{ const was = el.classList.contains('open'); box.querySelectorAll('.dweller.open').forEach(d=>d.classList.remove('open')); if (!was) el.classList.add('open'); });
      return el;
    }));
    const dashaHere = ids.some(id=>COM.members[id].role==='admin' && (charOf(COM.members[id].character)||{}).name==='Слон');
    count.textContent = (n ? 'Жителей в мире: '+n+'. ' : '') + (dashaHere ? 'Первой поселилась Даша — слон. ' : 'Скоро здесь поселится Даша — слон. ') + 'Каждый новый участник выбирает себе животное или растение и появляется здесь.';
    cta.replaceChildren(accState()==='member' ? h('p',{class:'hint'},'Вы здесь: ', emojiOf(COM.uid),' ',COM.me.nick,'. Растите в уровнях — и мир будет расти вместе с вами.') : h('button',{type:'button',class:'btn',onclick:()=>openAccount('register')},'Поселиться в мире'));
  });
  // on phones the map is wider than the screen and moves sideways; it opens on the middle, where Dasha lives
  const view = h('div',{class:'world-view'}, box);
  const cues = scrollCues(view, 'Подвинуть мир вправо', true);
  requestAnimationFrame(()=>{ view.scrollLeft = (view.scrollWidth - view.clientWidth) * 0.45; cues.sync(); });
  return h('section',{class:'band alt',id:'world'}, h('div',{class:'wrap'},
    sectionHead('Счастливый мир','Наш эко-мир','Каждый участник — животное или растение. Чем больше нас, тем живее мир.'),
    h('div',{class:'world-wrap sn-wrap'}, view, cues.back, cues.more), h('p',{class:'hint world-hint'},'👆 Двигайте мир пальцем, чтобы увидеть всех жителей'), cues.bar, count, cta
  ));
}

/* ---------- useful eco services: where to take recyclables, batteries, clothes — by city ---------- */
const SVC_CATS = ['Карты пунктов приёма','Пункты и вывоз вторсырья','Батарейки и техника','Одежда и вещи','Экоакции и сообщества'];
const SVC_CITY_KEY = 'db-svc-city', ALL_RU = 'Вся Россия';
// pages for search: «Куда сдать … в Казани» — for every city with its own services (the same list the server uses, pb_hooks/seo.js)
const CITY_RE = /^\/kuda-sdat\/[a-z0-9-]+$/;
const CITY_IN = {'Москва':'Москве','Санкт-Петербург':'Санкт-Петербурге','Новосибирск':'Новосибирске','Екатеринбург':'Екатеринбурге','Казань':'Казани','Нижний Новгород':'Нижнем Новгороде',
  'Челябинск':'Челябинске','Красноярск':'Красноярске','Самара':'Самаре','Уфа':'Уфе','Ростов-на-Дону':'Ростове-на-Дону','Омск':'Омске','Краснодар':'Краснодаре','Воронеж':'Воронеже',
  'Пермь':'Перми','Волгоград':'Волгограде','Тюмень':'Тюмени','Саратов':'Саратове','Тольятти':'Тольятти','Ижевск':'Ижевске','Барнаул':'Барнауле','Иркутск':'Иркутске','Хабаровск':'Хабаровске',
  'Ярославль':'Ярославле','Владивосток':'Владивостоке','Томск':'Томске','Оренбург':'Оренбурге','Кемерово':'Кемерове','Калининград':'Калининграде','Сочи':'Сочи','Тула':'Туле','Рязань':'Рязани'};
const inCity = c => CITY_IN[c] ? 'в '+CITY_IN[c] : '— '+c;
const cityUrl = c => '/kuda-sdat/'+slugify(c);
function cityPage(path){
  const slug = path.split('/')[2];
  const city = ()=>[...new Set(COM.services.filter(x=>x.status==='approved').map(x=>x.city))].find(c=>c!==ALL_RU && slugify(c)===slug);
  const c = city();
  return {title:(c ? 'Куда сдать вторсырьё, батарейки и технику '+inCity(c) : 'Куда сдать вторсырьё')+' — DashaBotanika', render:()=>[servicesSection({cityOf:city})]};
}
function servicesSection(opts){
  const cityOf = opts && opts.cityOf;
  let city = ''; try{ city = localStorage.getItem(SVC_CITY_KEY) || ''; }catch(e){}
  let cat = '';
  const list = h('div'), cityBox = h('div'), catBox = h('div'), mineBox = h('div');
  const norm = x => String(x||'').trim().toLowerCase().replace(/ё/g,'е');
  function paint(){
    const all = COM.services.filter(x=>x.status==='approved');
    const cities = [...new Set(all.map(x=>x.city).filter(c=>c && c!==ALL_RU))].sort((a,b)=>a.localeCompare(b,'ru'));
    if (cityOf){ const c = cityOf(); if (c){ city = c; document.title = 'Куда сдать вторсырьё, батарейки и технику '+inCity(c)+' — DashaBotanika'; } head.replaceChildren(sectionHeadFor(c)); }
    if (!city && PROFILE.rec && cities.some(c=>norm(c)===norm(PROFILE.rec.city))) city = cities.find(c=>norm(c)===norm(PROFILE.rec.city));
    const sel = h('select',{id:'svc-city','aria-label':'Город'}, h('option',{value:''},'Все города'), cities.map(c=>h('option',{value:c,selected:c===city?'':null},c)));
    sel.addEventListener('change',()=>{ city = sel.value; try{ localStorage.setItem(SVC_CITY_KEY, city); }catch(e){} if (cityOf) go(city ? cityUrl(city) : '/servisy'); else paint(); });
    cityBox.replaceChildren(h('label',{class:'svc-city',for:'svc-city'},'📍 Ваш город', sel),
      city && !cityOf ? h('a',{class:'hint',href:cityUrl(city)},'Страница города: куда сдать ',inCity(city),' →') : null);
    catBox.replaceChildren(h('div',{class:'chips svc-cats'}, [['','Все']].concat(SVC_CATS.map(c=>[c,c])).map(([k,l])=>h('button',{type:'button',class:'chip'+(cat===k?' on':''),'aria-pressed':String(cat===k),onclick:()=>{ cat = k; paint(); }},l))));
    const shown = all.filter(x=>(!city || x.city===city || x.city===ALL_RU) && (!cat || x.category===cat))
      .sort((a,b)=>(a.city===ALL_RU) - (b.city===ALL_RU) || a.name.localeCompare(b.name,'ru'));
    list.replaceChildren(shown.length ? h('div',{class:'grid g3'}, shown.map(x=>h('article',{class:'card svc'},
      h('div',{style:'display:flex;gap:6px;flex-wrap:wrap'}, h('span',{class:'tag'},x.category), h('span',{class:'tag svc-city-tag'},'📍 ',x.city)),
      h('h3',{style:'font-size:20px'},x.name),
      x.accepts ? h('p',{style:'font-size:15px'}, h('b',null,'Принимают: '), x.accepts) : null,
      x.note ? h('p',{class:'muted',style:'font-size:14px;flex:1'},x.note) : h('span',{style:'flex:1'}),
      x.url ? h('a',{class:'btn small',href:x.url,target:'_blank',rel:'noopener nofollow',style:'align-self:flex-start'},'На сайт ↗') : null)))
      : h('div',{class:'empty'}, COM.ready ? 'В этом городе пока ничего нет — посмотрите «Все города» или предложите свой сервис ниже.' : 'Загружаем…'));
    const mine = COM.services.filter(x=>x.suggested_by===COM.uid && COM.uid);
    mineBox.replaceChildren(...(mine.length ? [h('h3',{style:'font-size:18px;margin-top:10px'},'Мои предложения'), h('div',{class:'list'}, mine.map(x=>h('div',{class:'li'},
      h('div',{class:'meta'}, h('span',{class:'status '+(x.status==='approved'?'accepted':x.status==='rejected'?'declined':'')}, x.status==='approved' ? 'В подборке' : x.status==='rejected' ? 'Не подошло' : 'На проверке'), h('span',null,x.city)), h('b',null,x.name))))] : []));
  }
  // suggest a service: members only, goes to Dasha for checking
  const f = {name:h('input',{id:'sv-name',maxlength:'120'}), city:h('input',{id:'sv-city',maxlength:'80',placeholder:'Например, Казань или «Вся Россия»'}),
    category:h('select',{id:'sv-cat'}, SVC_CATS.map(c=>h('option',null,c))), accepts:h('input',{id:'sv-acc',maxlength:'300',placeholder:'Например, пластик, стекло, батарейки'}),
    url:h('input',{id:'sv-url',inputmode:'url',placeholder:'например, ecopunkt.ru'}), note:h('textarea',{id:'sv-note',maxlength:'600',style:'min-height:80px',placeholder:'Чем полезен, условия, график'})};
  const form = h('form',{class:'form svc-form'},
    h('h3',{style:'font-size:20px'},'Предложить сервис'),
    h('p',{class:'hint'},'Знаете компанию или проект, который принимает вторсырьё, технику или вещи? Расскажите — Даша проверит и добавит в подборку.'),
    h('div',{class:'fields'}, h('label',{for:'sv-name'},'Название',f.name), h('label',{for:'sv-city'},'Город',f.city)),
    h('div',{class:'fields'}, h('label',{for:'sv-cat'},'Что это',f.category), h('label',{for:'sv-url'},'Сайт',f.url)),
    h('label',{for:'sv-acc'},'Что принимают',f.accepts), h('label',{for:'sv-note'},'Комментарий',f.note),
    h('div',null, h('button',{type:'submit',class:'btn'},'Отправить на проверку')));
  form.addEventListener('submit', e=>{ e.preventDefault();
    if (accState()!=='member'){ openAccount('register'); return; }
    const v = k => f[k].value.trim();
    if (v('name').length < 2){ f.name.focus(); return; }
    if (!v('city')){ f.city.focus(); return; }
    let url = v('url'); if (url && !/^https?:\/\//.test(url)) url = 'https://'+url;
    pb.collection('services').create({name:v('name'), city:v('city'), category:f.category.value, accepts:v('accepts'), url, note:v('note'), suggested_by:COM.uid})
      .then(()=>{ Object.values(f).forEach(el=>{ if (el.tagName!=='SELECT') el.value=''; }); toast('Спасибо! Даша проверит и добавит'); }).catch(writeErr);
  });
  function sectionHeadFor(c){
    SEC_H1 = true;
    return c ? sectionHead('Куда сдать', 'Куда сдать вторсырьё, батарейки и технику '+inCity(c), 'Сервисы и пункты приёма '+inCity(c)+' и те, что работают по всей России. Перед поездкой уточняйте график на сайте.')
      : sectionHead('Куда сдать','Полезные сервисы для экологии','Компании и проекты, которые принимают вторсырьё, батарейки, технику и вещи. Выберите город — покажем, что работает рядом и по всей России.');
  }
  const head = h('div',null, sectionHeadFor(null));
  live(paint);
  return h('section',{class:'band',id:'services'}, h('div',{class:'wrap'},
    head,
    h('div',{class:'svc-bar'}, cityBox, catBox), list,
    cityOf ? h('div',{class:'card city-tips'}, h('h2',{style:'font-size:22px'},'Как подготовить вторсырьё'),
      h('ul',null, ['Пластик и стекло — ополосните и снимите крышки; бутылки сплющите.','Бумагу и картон — сухими, без скотча и жирных пятен; коробки сложите.','Металлические банки — ополосните, можно смять.','Батарейки и лампы — только в специальные боксы, не в общий контейнер.','Одежду и вещи в хорошем состоянии лучше отдать: барахолка, благотворительные пункты.'].map(t=>h('li',null,t))),
      h('div',{style:'display:flex;gap:8px;flex-wrap:wrap'}, h('a',{class:'btn small',href:'/#sort'},'Схема сортировки'), h('a',{class:'btn ghost small',href:'/baraholka'},'Барахолка'), h('a',{class:'btn ghost small',href:'/servisy'},'Все города'))) : null,
    h('p',{class:'hint',style:'margin-top:12px'},'Условия и адреса меняются — перед поездкой уточняйте на сайте сервиса.'),
    form, mineBox));
}

/* ---------- menu builder: a week of simple eco dishes for your goal and diet, with a shopping list ---------- */
// m: b/l/d — завтрак/обед/ужин; d: vegan | veg | fish | meat; has: what is inside (for «без …»); g: goals it suits
const DISHES = [
  ['Овсянка с яблоком и корицей','b','vegan',['gluten'],['eco','light','energy'],['овсяные хлопья','яблоки','корица','растительное молоко'],10],
  ['Сырники с ягодами','b','veg',['dairy','gluten','eggs'],['energy'],['творог','яйца','мука','ягоды'],25],
  ['Тост с авокадо и яйцом','b','veg',['gluten','eggs'],['energy'],['цельнозерновой хлеб','авокадо','яйца'],10],
  ['Гречневая каша с тыквой','b','vegan',[],['eco','light'],['гречка','тыква','корица'],20],
  ['Йогурт с гранолой и ягодами','b','veg',['dairy','gluten','nuts'],['light'],['йогурт','гранола','ягоды'],5],
  ['Омлет со шпинатом и помидорами','b','veg',['eggs'],['light','energy'],['яйца','шпинат','помидоры'],10],
  ['Смузи-боул банан и шпинат','b','vegan',['gluten'],['light','eco'],['бананы','шпинат','овсяные хлопья','растительное молоко'],5],
  ['Пшённая каша с тыквой','b','vegan',[],['eco','energy'],['пшено','тыква','растительное молоко'],30],
  ['Творог с сезонными фруктами','b','veg',['dairy'],['light'],['творог','яблоки','груши'],5],
  ['Бутерброд с хумусом и огурцом','b','vegan',['gluten'],['eco'],['цельнозерновой хлеб','хумус','огурцы'],5],
  ['Чечевичный суп с морковью','l','vegan',[],['eco','energy','light'],['красная чечевица','морковь','лук','томаты'],35],
  ['Борщ без мяса','l','vegan',[],['eco'],['свёкла','капуста','картофель','морковь','лук'],60],
  ['Тыквенный крем-суп','l','vegan',[],['eco','light'],['тыква','лук','морковь','бульон из очистков'],45],
  ['Булгур с овощами и нутом','l','vegan',['gluten'],['energy','eco'],['булгур','нут','перец','кабачки'],25],
  ['Куриный суп с лапшой','l','meat',['gluten'],['energy'],['курица','лапша','морковь','лук'],50],
  ['Плов с курицей','l','meat',[],['energy'],['рис','курица','морковь','лук'],60],
  ['Салат с киноа, свёклой и фетой','l','veg',['dairy'],['light'],['киноа','свёкла','сыр фета','руккола'],25],
  ['Уха из трески','l','fish',['fish'],['light','energy'],['треска','картофель','морковь','лук'],40],
  ['Овощное рагу с фасолью','l','vegan',[],['eco','light'],['кабачки','баклажаны','перец','фасоль','томаты'],40],
  ['Паста с томатами и фасолью','l','vegan',['gluten'],['eco','energy'],['паста','томаты','фасоль','базилик'],20],
  ['Запечённые корнеплоды с хумусом','d','vegan',[],['eco','light'],['тыква','морковь','свёкла','хумус'],40],
  ['Гречка с грибами и луком','d','vegan',[],['eco','energy'],['гречка','грибы','лук'],25],
  ['Минтай на пару с брокколи','d','fish',['fish'],['light'],['минтай','брокколи','лимон'],25],
  ['Котлеты из чечевицы с салатом','d','vegan',[],['eco','energy'],['красная чечевица','морковь','лук','капуста'],35],
  ['Курица с запечёнными овощами','d','meat',[],['energy'],['курица','картофель','морковь','свёкла'],45],
  ['Фриттата с кабачком и сыром','d','veg',['eggs','dairy'],['light'],['яйца','кабачки','перец','сыр'],20],
  ['Тофу с овощами и рисом','d','vegan',[],['eco','energy'],['тофу','капуста','морковь','перец','рис'],20],
  ['Перцы, фаршированные рисом и овощами','d','vegan',[],['eco'],['перец','рис','морковь','томаты'],50],
  ['Тушёная капуста с фасолью','d','vegan',[],['eco','light'],['капуста','фасоль','морковь','томаты'],40],
  ['Тёплый салат с курицей и овощами','d','meat',[],['light','energy'],['курица','салат','огурцы','помидоры'],20],
  // завтраки
  ['Рисовая каша на кокосовом молоке с манго','b','vegan',[],['energy'],['рис','кокосовое молоко','манго'],25],
  ['Оладьи из кабачков со сметаной','b','veg',['eggs','gluten','dairy'],['light'],['кабачки','яйца','мука','сметана'],25],
  ['Шакшука с перцем','b','veg',['eggs'],['light','energy'],['яйца','томаты','перец','лук'],20],
  ['Овсяноблин с сыром и зеленью','b','veg',['eggs','dairy','gluten'],['energy','light'],['овсяные хлопья','яйца','сыр','зелень'],10],
  ['Ленивая овсянка в банке с ягодами','b','vegan',['gluten'],['eco','light'],['овсяные хлопья','растительное молоко','ягоды','семена чиа'],5],
  ['Тост с арахисовой пастой и бананом','b','vegan',['gluten','nuts'],['energy'],['цельнозерновой хлеб','арахисовая паста','бананы'],5],
  ['Пшеничная каша с изюмом и орехами','b','vegan',['gluten','nuts'],['energy','eco'],['пшеничная крупа','изюм','грецкие орехи'],20],
  ['Запечённые яблоки с творогом','b','veg',['dairy'],['light'],['яблоки','творог','корица','мёд'],25],
  ['Скрэмбл из тофу с овощами','b','vegan',[],['eco','energy'],['тофу','шпинат','помидоры','куркума'],15],
  ['Кукурузная каша с тыквой и курагой','b','vegan',[],['eco','light'],['кукурузная крупа','тыква','курага'],30],
  ['Яйца пашот на тосте с рукколой','b','veg',['eggs','gluten'],['energy'],['яйца','цельнозерновой хлеб','руккола'],15],
  ['Банановые панкейки без сахара','b','veg',['eggs','gluten'],['energy'],['бананы','яйца','овсяная мука'],20],
  ['Сэндвич с запечённым перцем и фетой','b','veg',['gluten','dairy'],['light'],['цельнозерновой хлеб','перец','сыр фета'],10],
  // обеды
  ['Щи из свежей капусты','l','vegan',[],['eco','light'],['капуста','картофель','морковь','лук','томаты'],50],
  ['Гороховый суп с копчёной паприкой','l','vegan',[],['eco','energy'],['горох','картофель','морковь','копчёная паприка'],60],
  ['Грибной суп с перловкой','l','vegan',['gluten'],['eco','energy'],['грибы','перловка','картофель','лук'],50],
  ['Окрошка на кефире','l','veg',['dairy','eggs'],['light'],['кефир','огурцы','редис','картофель','яйца','зелень'],20],
  ['Свекольник холодный','l','veg',['eggs','dairy'],['light','eco'],['свёкла','огурцы','яйца','сметана','зелень'],30],
  ['Нут с овощами в томатах','l','vegan',[],['eco','energy'],['нут','томаты','шпинат','лук'],25],
  ['Рис с фасолью и кукурузой','l','vegan',[],['eco','energy'],['рис','фасоль','кукуруза','перец'],25],
  ['Лобио из красной фасоли','l','vegan',['nuts'],['eco'],['фасоль','лук','грецкие орехи','кинза'],30],
  ['Индейка с гречкой и овощами','l','meat',[],['energy','light'],['индейка','гречка','морковь','лук'],40],
  ['Минестроне с фасолью','l','vegan',['gluten'],['eco','light'],['кабачки','морковь','фасоль','томаты','паста'],40],
  ['Суп с фрикадельками из индейки','l','meat',['eggs'],['energy'],['индейка','картофель','морковь','яйца'],45],
  ['Тёплый салат из чечевицы и тыквы','l','vegan',[],['eco','light','energy'],['зелёная чечевица','тыква','руккола'],35],
  ['Голубцы с рисом и овощами','l','vegan',[],['eco'],['капуста','рис','морковь','томаты'],70],
  ['Карри из нута с кокосовым молоком','l','vegan',[],['eco','energy'],['нут','кокосовое молоко','шпинат','рис'],30],
  ['Рыбные котлеты из минтая с пюре','l','fish',['fish','eggs'],['energy'],['минтай','яйца','картофель','лук'],40],
  // ужины
  ['Картофельные драники со сметаной','d','veg',['eggs','dairy'],['energy'],['картофель','лук','яйца','сметана'],30],
  ['Запечённая скумбрия с овощами','d','fish',['fish'],['energy'],['скумбрия','картофель','лук','лимон'],40],
  ['Кабачки, фаршированные булгуром','d','vegan',['gluten'],['eco','light'],['кабачки','булгур','томаты','зелень'],45],
  ['Цветная капуста в панировке из нута','d','vegan',[],['eco','light'],['цветная капуста','нутовая мука','специи'],35],
  ['Перловка с грибами и тыквой','d','vegan',['gluten'],['eco','energy'],['перловка','грибы','тыква','лук'],50],
  ['Тушёная чечевица с овощами','d','vegan',[],['eco','energy'],['зелёная чечевица','морковь','лук','томаты'],35],
  ['Ленивые вареники с ягодами','d','veg',['dairy','eggs','gluten'],['energy'],['творог','яйца','мука','ягоды'],25],
  ['Запеканка из брокколи и цветной капусты','d','veg',['eggs','dairy'],['light'],['брокколи','цветная капуста','яйца','сыр'],35],
  ['Сёмга с киноа и огурцом','d','fish',['fish'],['light','energy'],['сёмга','киноа','огурцы','лимон'],25],
  ['Грибы с картофелем в духовке','d','vegan',[],['eco'],['грибы','картофель','лук','розмарин'],45],
  ['Лаваш-ролл с хумусом и овощами','d','vegan',['gluten'],['eco','light'],['лаваш','хумус','морковь','капуста','огурцы'],10],
  ['Стир-фрай из гречневой лапши с овощами','d','vegan',[],['eco','energy'],['гречневая лапша','перец','морковь','брокколи'],20]
].map(([n,m,d,has,g,ing,t],i)=>({id:i, n, m, d, has, g, ing, t}));
const MEALS = [['b','Завтрак'],['l','Обед'],['d','Ужин']];
const DIETS = [['all','Всё ем'],['veg','Вегетарианское'],['vegan','Веганское']];
const MENU_GOALS = [['eco','🌍 Меньше следа'],['light','🥗 Лёгкость'],['energy','⚡ Энергия']];
const NO_OPTS = [['dairy','без молочного'],['gluten','без глютена'],['eggs','без яиц'],['nuts','без орехов'],['fish','без рыбы']];
const leavesOf = d => d.d==='vegan' ? 3 : d.d==='meat' ? 1 : 2;
const MENU_KEY = 'db-menu-v1';
function menuSection(){
  let st = {goal:'eco', diet:'all', no:[], days:7, menu:null, got:[]};
  try{ Object.assign(st, JSON.parse(localStorage.getItem(MENU_KEY)||'{}')); }catch(e){}
  const keep = ()=>{ try{ localStorage.setItem(MENU_KEY, JSON.stringify(st)); }catch(e){} };
  const box = h('div',{class:'menu-b'});
  const seasonal = SEASON[new Date().getMonth()][1].map(x=>x.split(' ')[0].slice(0,5));
  const isSeasonal = ing => seasonal.some(w=>ing.toLowerCase().includes(w));
  const fits = d => (st.diet==='all' || (st.diet==='veg' ? d.d==='vegan' || d.d==='veg' : d.d==='vegan')) && !d.has.some(x=>st.no.includes(x));
  const score = d => (d.g.includes(st.goal) ? 3 : 0) + d.ing.filter(isSeasonal).length + (st.goal==='eco' ? leavesOf(d) : 0) + Math.random()*2.5;
  function pick(meal, used){
    const pool = DISHES.filter(d=>d.m===meal && fits(d));
    if (!pool.length) return null;
    const fresh = pool.filter(d=>!used.has(d.id));
    return (fresh.length ? fresh : pool).map(d=>[score(d),d]).sort((a,b)=>b[0]-a[0])[0][1].id;
  }
  function build(){
    const used = new Set();
    st.menu = [...Array(st.days)].map(()=>MEALS.map(([m])=>{ const id = pick(m, used); if (id!=null) used.add(id); return id; }));
    st.got = []; keep(); paint();
  }
  function swap(di, mi){
    const used = new Set(st.menu.flat());
    const pool = DISHES.filter(d=>d.m===MEALS[mi][0] && fits(d) && d.id!==st.menu[di][mi]);
    if (!pool.length){ toast('Других подходящих блюд нет'); return; }
    const fresh = pool.filter(d=>!used.has(d.id)), list = fresh.length ? fresh : pool;
    st.menu[di][mi] = list[Math.floor(Math.random()*list.length)].id; keep(); paint();
  }
  const chips = (opts, cur, set, multi) => h('div',{class:'chips menu-chips'}, opts.map(([k,l])=>h('button',{type:'button',class:'chip'+((multi ? cur.includes(k) : cur===k)?' on':''),
    'aria-pressed':String(multi ? cur.includes(k) : cur===k), onclick:()=>{ set(k); keep(); paint(); }}, l)));
  function paint(){
    const form = h('div',{class:'menu-form card'},
      h('div',{class:'menu-l'},'Цель'), chips(MENU_GOALS, st.goal, k=>{ st.goal = k; }),
      h('div',{class:'menu-l'},'Питание'), chips(DIETS, st.diet, k=>{ st.diet = k; }),
      h('div',{class:'menu-l'},'Исключить'), chips(NO_OPTS, st.no, k=>{ st.no = st.no.includes(k) ? st.no.filter(x=>x!==k) : st.no.concat(k); }, true),
      h('div',{class:'menu-l'},'Срок'), chips([[3,'3 дня'],[7,'Неделя']], st.days, k=>{ st.days = k; }),
      h('div',null, h('button',{type:'button',class:'btn',onclick:build}, st.menu ? '🔄 Собрать заново' : '✨ Собрать меню')));
    if (!st.menu){ box.replaceChildren(form); return; }
    const dish = id => DISHES[id];
    const all = st.menu.flat().filter(x=>x!=null).map(dish);
    const plant = all.filter(d=>d.d==='vegan' || d.d==='veg').length, avg = all.length ? all.reduce((s,d)=>s+leavesOf(d),0)/all.length : 0;
    const counts = {};
    all.forEach(d=>d.ing.forEach(i=>{ counts[i] = (counts[i]||0)+1; }));
    const shop = Object.keys(counts).sort((a,b)=>counts[b]-counts[a] || a.localeCompare(b,'ru'));
    const table = h('div',{class:'menu-days'}, st.menu.map((day,di)=>h('div',{class:'menu-day card'},
      h('b',{class:'menu-dn'},'День ',di+1),
      day.map((id,mi)=>{ const d = id==null ? null : dish(id);
        return h('div',{class:'menu-m'}, h('span',{class:'hint'},MEALS[mi][1]),
          d ? h('div',{class:'menu-dish'}, h('span',null,d.n), h('span',{class:'hint'},'⏱ ',d.t,' мин · ', h('span',{class:'leaves','aria-label':'эко-оценка '+leavesOf(d)+' из 3'},'❦'.repeat(leavesOf(d))))) : h('span',{class:'hint'},'нет подходящих блюд'),
          d ? h('button',{type:'button',class:'menu-swap',title:'Заменить блюдо','aria-label':'Заменить «'+d.n+'»',onclick:()=>swap(di,mi)},'↻') : null); }))));
    const shopList = h('ul',{class:'shop'}, shop.map(i=>{ const on = st.got.includes(i);
      return h('li',null, h('label',{class:on?'on':''}, h('input',{type:'checkbox',checked:on?'':null,onchange:()=>{ st.got = on ? st.got.filter(x=>x!==i) : st.got.concat(i); keep(); paint(); }}),
        h('span',null,i, isSeasonal(i) ? ' 🍂' : '', counts[i] > 1 ? h('span',{class:'hint'},' ×',counts[i]) : null))); }));
    box.replaceChildren(form,
      h('div',{class:'kv menu-sum'}, h('div',null,h('b',null,plant,' из ',all.length),h('span',null,'растительных блюд')), h('div',null,h('b',null,'❦ ',avg.toFixed(1)),h('span',null,'средняя эко-оценка из 3')),
        h('div',null,h('b',null,shop.filter(isSeasonal).length),h('span',null,'сезонных продуктов в списке'))),
      table,
      h('div',{class:'card'}, h('div',{class:'pf-head'}, h('h3',null,'🛒 Список покупок'), h('span',{class:'hint'}, st.got.length,' из ',shop.length,' куплено')),
        h('p',{class:'hint'},'🍂 — сезонный продукт: вкуснее, дешевле и с меньшим следом. Количество зависит от того, на сколько человек готовите.'), shopList));
  }
  paint();
  return h('section',{class:'band alt',id:'menu'}, h('div',{class:'wrap'},
    sectionHead('Конструктор меню','Меню на неделю за минуту','Выберите цель и тип питания — соберём простое меню из сезонных продуктов и список покупок. Любое блюдо можно заменить.'),
    box));
}

/* ---------- smart helper (AI): photo of a plate or of packaging → advice (Yandex AI Studio, see pb_hooks/ai.js) ---------- */
// the photo is made smaller in the browser (max 1024 px) before it is sent; it is not stored anywhere
// Перед загрузкой уменьшаем фото с телефона (часто 4–10 МБ) до разумных 1600 px — грузится быстрее и у нас, и у гостей.
// Если браузер не умеет открыть файл (например, HEIC), отправляем как есть.
function fitPhoto(file, max){
  max = max || 1600;
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return Promise.resolve(file);
  return new Promise(ok=>{
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = ()=>{ URL.revokeObjectURL(url);
      const k = Math.min(1, max/Math.max(img.width, img.height));
      if (k === 1 && file.size < 700*1024){ ok(file); return; }
      const c = document.createElement('canvas'); c.width = Math.round(img.width*k); c.height = Math.round(img.height*k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b=>ok(b && b.size < file.size ? new File([b], file.name.replace(/\.\w+$/,'')+'.jpg', {type:'image/jpeg'}) : file), 'image/jpeg', 0.85);
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); ok(file); };
    img.src = url;
  });
}
function shrinkPhoto(file){
  return new Promise((ok, fail)=>{
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = ()=>{ const k = Math.min(1, 1024/Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width*k); c.height = Math.round(img.height*k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.85)); };
    img.onerror = ()=>{ URL.revokeObjectURL(url); fail(new Error('bad image')); };
    img.src = url;
  });
}
function aiAnswer(text){
  // plain text from the model: lines «Заголовок: …» and «— пункт»
  return h('div',{class:'ai-text'}, String(text).split(/\n+/).map(l=>l.trim()).filter(Boolean).map(l=>{
    if (/^[—–-]\s*/.test(l)) return h('div',{class:'ai-li'}, '🌿 ', l.replace(/^[—–-]\s*/,''));
    const m = l.match(/^([^:]{2,40}):\s*(.*)$/);
    return m ? h('p',null, h('b',null,m[1].replace(/\*+/g,''),': '), m[2].replace(/\*+/g,'')) : h('p',null,l.replace(/\*+/g,''));
  }));
}
function helperSection(){
  const out = h('div',{class:'ai-out','aria-live':'polite'}), left = h('p',{class:'hint ai-left'});
  let st = null;
  const loadLeft = ()=>{ if (accState()!=='member' || !pb) return; pb.send('/api/ai/left',{requestKey:null}).then(r=>{ st = r; paintLeft(); }).catch(()=>{}); };
  const paintLeft = ()=>{ left.textContent = accState()!=='member' ? 'Помощник доступен участникам — войдите или зарегистрируйтесь.' : !st ? '' : !st.enabled ? 'Помощник скоро заработает — подключаем распознавание фото.' : 'Сегодня осталось разборов: '+st.left+' из '+st.limit+'.'; };
  live(()=>{ paintLeft(); if (accState()==='member' && !st) loadLeft(); });
  async function run(kind, file, btn){
    if (accState()!=='member'){ openAccount('register'); return; }
    const label = btn.textContent; btn.disabled = true; btn.textContent = 'Смотрю на фото…';
    out.replaceChildren(h('div',{class:'card ai-wait'}, h('span',{class:'ai-spin','aria-hidden':'true'},'🌀'), 'Помощник разглядывает фото, это займёт до минуты…'));
    try{
      const image = await shrinkPhoto(file);
      const r = await pb.send('/api/ai/photo',{method:'POST', body:{kind, image}, requestKey:null});
      st = r; paintLeft();
      out.replaceChildren(r.ok
        ? h('div',{class:'card ai-res'}, h('div',{class:'ai-res-head'}, h('img',{src:image,alt:'Ваше фото',class:'ai-photo'}), h('div',null, h('div',{class:'eyebrow'}, kind==='food' ? '🥗 Совет по тарелке' : '♻️ Куда сдать упаковку'), h('p',{class:'hint'},'Совет от ИИ — проверяйте важное, особенно про здоровье.'))), aiAnswer(r.text))
        : h('div',{class:'card tg-err'}, r.message));
    }catch(e){ out.replaceChildren(h('div',{class:'card tg-err'},'Не получилось отправить фото. Попробуйте другое фото или чуть позже.')); }
    btn.disabled = false; btn.textContent = label;
  }
  const photoBtn = (kind, label) => {
    const inp = h('input',{type:'file',accept:'image/*',hidden:true,'data-kind':kind});
    const btn = h('button',{type:'button',class:'btn small',onclick:()=>{ if (accState()!=='member'){ openAccount('register'); return; } inp.click(); }}, label);
    inp.addEventListener('change',()=>{ const f = inp.files && inp.files[0]; inp.value = ''; if (f) run(kind, f, btn); });
    return h('div',{style:'display:contents'}, btn, inp);
  };
  const cards = [
    ['🥗','Фото еды','Сфотографируйте тарелку — помощник подскажет, как сделать блюдо полезнее и экологичнее, и что сделать с остатками.', photoBtn('food','📷 Загрузить фото еды')],
    ['♻️','Фото упаковки','Сфотографируйте упаковку или вещь — узнаете, из чего она, куда её сдать, нужно ли мыть и как использовать повторно.', photoBtn('pack','📷 Загрузить фото упаковки')],
    ['🍽️','Меню под цель','Конструктор меню соберёт меню на неделю под вашу цель и тип питания — со списком покупок.', h('a',{class:'btn small',href:'/#menu'},'Открыть конструктор')]
  ];
  return h('section',{class:'band',id:'helper'}, h('div',{class:'wrap'},
    sectionHead('Умный помощник','Эко-помощник на основе ИИ','Загрузите фото — и получите совет за минуту. Фото не сохраняются: помощник смотрит на них один раз.'),
    h('div',{class:'grid g3'}, cards.map(([ic,t,d,action])=>h('article',{class:'card'},
      h('span',{style:'font-size:34px','aria-hidden':'true'},ic),
      h('h3',{style:'font-size:20px'},t), h('p',{class:'muted',style:'font-size:15px;flex:1'},d),
      h('div',{style:'align-self:flex-start'}, action)))),
    left, out));
}

/* ---------- modal & personal account ---------- */
let MODAL = null;
function closeModal(){ if (MODAL){ MODAL.remove(); MODAL = null; MODAL_LIVE = []; MODAL_UNSUBS.forEach(u=>{ try{u();}catch(e){} }); MODAL_UNSUBS = []; document.removeEventListener('keydown', escClose); if (/^#cert\//.test(location.hash)) history.replaceState(null,'',location.pathname+location.search); } }
function escClose(e){ if (e.key==='Escape') closeModal(); }
function openModal(build){
  closeModal();
  const sheet = h('div',{class:'sheet',role:'dialog','aria-modal':'true'});
  MODAL = h('div',{class:'modal',onclick:e=>{ if (e.target===MODAL) closeModal(); }}, sheet);
  document.body.append(MODAL);
  document.addEventListener('keydown', escClose);
  sheet.append(h('button',{type:'button',class:'btn ghost small close no-print',onclick:closeModal},'Закрыть'));
  build(sheet);
  const f = sheet.querySelector('input,textarea,button:not(.close)'); if (f) f.focus();
}

/* «свой персонаж»: any icon from this palette and any name; the dice picks a ready-made pair */
const CUSTOM_EMOJI = ['🦒','🦓','🦘','🦙','🐫','🦬','🦛','🐊','🦖','🦕','🐉','🦄','🐸','🐍','🦎','🦞','🦐','🐠','🐡','🦑','🐳','🦃','🐓','🦚','🐣','🦫','🦔','🐛','🕷️','🌴','🌳','🌸','🌹','🌺','🪷','🌾','🍁','🍓','🥑','🥕','🌙','⭐','🌈','☁️','💧','🔥','🌊','🪨'];
const CUSTOM_IDEAS = [['🦫','Капибара Кира'],['🐉','Дракончик Искра'],['🦄','Единорог Пломбир'],['🐸','Лягушка Квака'],['🌵','Кактус Колючкин'],['☁️','Облачко Пух'],['⭐','Звёздочка Стелла'],['🍄','Гриб Боровичок'],['🦎','Радужный хамелеон'],['🐳','Звёздный кит'],['🥑','Авокадо Авдотья'],['🌈','Радуга-Дуга'],['🐣','Цыплёнок Цып'],['🦖','Динозаврик Дино'],['🪷','Лотос Лиля']];
const customChar = () => COM.characters.find(c=>c.kind==='custom') || null;
function characterPicker(name, selected, custom){
  const box = h('div',{class:'chars',role:'radiogroup','aria-label':'Ваш персонаж'});
  box.value = selected || '';
  box.custom = custom && custom.emoji ? {emoji:custom.emoji, name:custom.name||''} : null;
  const mark = ()=>{
    box.querySelectorAll('.char').forEach(l=>{ const on = l.dataset.id===box.value && !box.custom; l.classList.toggle('on', on); const r = l.querySelector('input'); if (r) r.checked = on; });
    const own = box.querySelector('.own'); if (own) own.classList.toggle('on', !!box.custom);
  };
  const one = c=>h('label',{class:'char','data-id':c.id},
    h('input',{type:'radio',name,value:c.id,onchange:()=>{ box.value = c.id; box.custom = null; mark(); }}),
    h('span',{class:'em','aria-hidden':'true'},c.emoji), h('span',null,c.name));
  // own character: pick an icon, type a name or roll the dice
  function ownBlock(cc){
    const prev = h('span',{class:'own-prev','aria-hidden':'true'}, (box.custom && box.custom.emoji) || '✨');
    const nm = h('input',{maxlength:'30',placeholder:'Имя персонажа, например «Капибара Кира»','aria-label':'Имя своего персонажа',value:(box.custom && box.custom.name)||''});
    const use = (emoji, nameV)=>{ box.value = cc.id; box.custom = {emoji, name:nameV==null ? nm.value.trim() : nameV}; if (nameV!=null) nm.value = nameV; prev.textContent = emoji; mark(); };
    nm.addEventListener('input', ()=>{ if (box.custom) box.custom.name = nm.value.trim(); else use(CUSTOM_EMOJI[0]); });
    const grid = h('div',{class:'own-grid'}, CUSTOM_EMOJI.map(e=>h('button',{type:'button',class:'own-em','aria-label':'Значок '+e,onclick:()=>use(e)},e)));
    return h('div',{class:'own'},
      h('div',{class:'own-head'}, prev, h('div',{style:'flex:1;min-width:0'}, h('b',null,'Свой персонаж'), h('div',{class:'hint'},'Выберите значок и придумайте имя — или доверьтесь кубику.')),
        h('button',{type:'button',class:'btn ghost small',onclick:()=>{ const [e,n] = CUSTOM_IDEAS[Math.floor(Math.random()*CUSTOM_IDEAS.length)]; use(e, n); }},'🎲 Сгенерировать')),
      nm, grid);
  }
  // search by name: «лев», «птиц», «морск» — matches names and group titles
  const list = h('div',{class:'chars-list'}), none = h('p',{class:'hint',hidden:true},'Такого персонажа нет — создайте своего ниже ✨');
  const search = h('input',{type:'search',class:'chars-search',placeholder:'🔍 Найти персонажа: лев, сова, кактус…','aria-label':'Поиск персонажа'});
  const filter = ()=>{
    const q = search.value.trim().toLowerCase().replace(/ё/g,'е'); let shown = 0;
    list.querySelectorAll('.chars-sec').forEach(sec=>{
      const inGroup = q && sec.dataset.g.toLowerCase().replace(/ё/g,'е').split(/\s+/).some(w=>w.startsWith(q));
      let n = 0;
      sec.querySelectorAll('.char').forEach(l=>{ const ok = !q || inGroup || l.dataset.n.split(/[\s-]+/).some(w=>w.startsWith(q)); l.hidden = !ok; if (ok) n++; });
      sec.hidden = !n; shown += n;
    });
    none.hidden = shown > 0;
  };
  search.addEventListener('input', filter);
  search.addEventListener('keydown', e=>{ if (e.key==='Enter') e.preventDefault(); }); // not the registration submit
  // characters come in groups (звери, растения, редкие, птицы…), each a row you scroll sideways
  const paint = ()=>{
    const groups = [];
    // a character with an owner (Слон — Дашин) is shown only to its owner
    COM.characters.filter(c=>c.kind!=='custom' && (!c.reserved_for || c.reserved_for===COM.uid)).forEach(c=>{ const g = c.group || ''; let x = groups.find(y=>y.g===g); if (!x) groups.push(x = {g, list:[]}); x.list.push(c); });
    const cc = customChar();
    list.replaceChildren(...groups.map(({g,list:cs})=>h('div',{class:'chars-sec','data-g':g},
      g && groups.length > 1 ? h('div',{class:'chars-g'},g,h('span',null,' · ',cs.length)) : null,
      h('div',{class:'chars-row'}, cs.map(c=>{ const l = one(c); l.dataset.n = c.name.toLowerCase().replace(/ё/g,'е'); return l; })))));
    box.replaceChildren(...[COM.characters.length > 12 ? search : null, list, none, cc ? ownBlock(cc) : null].filter(Boolean));
    mark(); filter();
  };
  // characters may arrive after the form is drawn (page opened straight on /kabinet)
  let seen = -1; live(()=>{ if (COM.characters.length !== seen){ seen = COM.characters.length; paint(); } });
  return box;
}
// what to send to the server for the chosen character
const pickData = pick => ({character:pick.value, custom_emoji:pick.custom ? pick.custom.emoji : '', custom_name:pick.custom ? (pick.custom.name||'').slice(0,30) : ''});
function authForms(mode){
  const wrap = h('div',{style:'display:grid;gap:14px'});
  function show(m){
    mode = m;
    const tabs = h('div',{class:'tabs',role:'tablist'}, [['login','Вход'],['register','Регистрация']].map(([k,l])=>h('button',{type:'button',role:'tab','aria-selected':String(k===mode),onclick:()=>show(k)},l)));
    wrap.replaceChildren(tabs, ...(mode==='register' ? registerForm() : loginForm()));
  }
  function done(msg){ try{ sessionStorage.setItem('db-welcome', msg); }catch(e){} location.reload(); }
  function loginForm(){
    const email = h('input',{id:'li-email',type:'email',autocomplete:'email',required:''});
    const pass = h('input',{id:'li-pass',type:'password',autocomplete:'current-password',required:''});
    const btn = h('button',{type:'submit',class:'btn'},'Войти');
    const f = h('form',{class:'form',style:'margin:0;border-style:solid;border-color:var(--line)'},
      h('label',{for:'li-email'},'Почта',email), h('label',{for:'li-pass'},'Пароль',pass), h('div',null,btn));
    f.addEventListener('submit', async e=>{ e.preventDefault(); btn.disabled = true;
      try{ await pb.collection('users').authWithPassword(email.value.trim(), pass.value); done('С возвращением!'); }
      catch(err){ btn.disabled = false; toast(err && err.status===400 ? 'Неверная почта или пароль' : 'Не получилось войти, попробуйте ещё раз'); } });
    const forgot = h('button',{type:'button',class:'linkish',onclick:()=>{
      const v = email.value.trim(); if (!v){ email.focus(); toast('Впишите почту, и мы пришлём ссылку для нового пароля'); return; }
      pb.collection('users').requestPasswordReset(v).then(()=>toast('Если такая почта зарегистрирована, мы отправили письмо'),()=>toast('Не получилось отправить письмо, попробуйте позже'));
    }},'Забыли пароль?');
    return [f, h('p',{class:'hint'}, forgot)];
  }
  function registerForm(){
    const email = h('input',{id:'rg-email',type:'email',autocomplete:'email',required:''});
    const pass = h('input',{id:'rg-pass',type:'password',autocomplete:'new-password',minlength:'6',required:''});
    const nick = h('input',{id:'rg-nick',maxlength:'30',placeholder:'Например, Лиза из Москвы',autocomplete:'nickname',required:''});
    const pick = characterPicker('rg-char');
    const consent = h('input',{type:'checkbox',id:'rg-consent',required:''});
    const btn = h('button',{type:'submit',class:'btn'},'Зарегистрироваться');
    const f = h('form',{class:'form',style:'margin:0;border-style:solid;border-color:var(--line)'},
      h('div',{class:'fields'}, h('label',{for:'rg-email'},'Почта',email), h('label',{for:'rg-pass'},'Пароль (от 6 символов)',pass)),
      h('label',{for:'rg-nick'},'Как вас подписывать',nick),
      h('div',null, h('div',{style:'font-weight:700;margin-bottom:6px'},'Кем вы будете в «Счастливом мире»?'), pick),
      h('p',{class:'hint'},'Имя и персонажа видят все посетители сайта. Почту не видит никто.'),
      h('label',{class:'consent'}, consent, h('span',null,'Я согласен(на) на обработку моих персональных данных в соответствии с ', h('a',{href:'/politika',target:'_blank'},'Политикой конфиденциальности'))),
      h('div',null,btn));
    const ref = refOf(), invite = h('div');
    if (ref) live(()=>{ invite.replaceChildren(h('div',{class:'invite-banner'}, h('span',{'aria-hidden':'true'},'🎁'),
      h('div',null, h('b',null, COM.members[ref] ? nameOf(ref)+' приглашает вас в «Счастливый мир»' : 'Вас пригласили в «Счастливый мир»'),
        h('div',null,'Зарегистрируйтесь — и ваш персонаж сразу получит +'+rulePoints('invited',50)+' к росту.')))); });
    f.addEventListener('submit', async e=>{ e.preventDefault();
      const v = nick.value.trim();
      if (v.length < 2){ nick.focus(); toast('Имя должно быть не короче двух букв'); return; }
      if (pass.value.length < 6){ pass.focus(); toast('Пароль — минимум 6 символов'); return; }
      if (!pick.value){ toast('Выберите животное или растение'); return; }
      if (!consent.checked){ consent.focus(); toast('Отметьте согласие с политикой конфиденциальности'); return; }
      btn.disabled = true;
      try{
        await pb.collection('users').create({email:email.value.trim(), password:pass.value, passwordConfirm:pass.value, name:v.slice(0,30), ...pickData(pick), consent_at:new Date().toISOString(), emailVisibility:false});
        const auth = await pb.collection('users').authWithPassword(email.value.trim(), pass.value);
        if (ref && ref !== auth.record.id){
          try{ await pb.collection('referrals').create({inviter:ref, invited:auth.record.id}); }catch(e){}
        }
        try{ localStorage.removeItem(REF_KEY); }catch(e){}
        pb.collection('users').requestVerification(email.value.trim()).catch(()=>{});
        done('Добро пожаловать, '+v+'! Вы появились в «Счастливом мире»');
      }catch(err){
        btn.disabled = false;
        const d = err && err.response && err.response.data || {};
        toast(d.email ? 'Эта почта уже зарегистрирована или указана неверно' : d.password ? 'Пароль слишком простой или короткий' : 'Не получилось зарегистрироваться, проверьте поля');
      }
    });
    return [invite, h('p',null,'В личном кабинете хранятся ваши эко-привычки, уровень и сертификаты, результаты экзамена и игры. Ещё можно оставлять отзывы, комментировать, выставлять вещи на барахолку и предлагать статьи.'), f];
  }
  show(mode==='register' ? 'register' : 'login');
  return wrap;
}

/* ---------- personal cabinet: its own page /kabinet ---------- */
function openAccount(tab, tid){
  const q = new URLSearchParams();
  if (tab) q.set('tab', tab);
  if (tid) q.set('t', tid);
  go('/kabinet'+(q.toString() ? '?'+q : ''));
}
function statsRow(){
  return h('div',{class:'kv'},
    h('div',null,h('b',null,leavesTotal()),h('span',null,'эко-листочков')),
    h('div',null,h('b',null,STATS.examBest,'/10'),h('span',null,STATS.examPassed?'экзамен сдан':'лучший экзамен')),
    h('div',null,h('b',null,STATS.gameBest),h('span',null,'рекорд в игре')),
    h('div',null,h('b',null,postsCount()),h('span',null,'комментариев и сообщений')));
}
function logout(){
  if (!confirm('Выйти из аккаунта?')) return;
  pb.authStore.clear();
  try{ sessionStorage.setItem('db-welcome','Вы вышли из аккаунта. До встречи!'); }catch(e){}
  location.href = '/';
}
function cabinetPage(){
  const q = new URLSearchParams(location.search);
  const tab = q.get('tab') || '', tid = q.get('t') || null;
  const st = accState();
  if (st==='loading') return [h('section',{class:'band',id:'cabinet'}, h('div',{class:'wrap'}, h('h1',{class:'cab-name'},'Личный кабинет'), h('p',{class:'muted'},'Загружаем…')))];
  if (st==='signedout') return [h('section',{class:'band',id:'cabinet'}, h('div',{class:'wrap cab-auth'},
    h('div',{class:'eyebrow'},'Личный кабинет'),
    h('h1',{class:'cab-name'}, tab==='register' || (!tab && refOf()) ? 'Регистрация' : 'Вход'),
    h('p',{class:'lead'},'В кабинете — ваш эко-челлендж недели, уровень и сертификаты, вещи на барахолке и переписка. А ещё вы появитесь в «Счастливом мире».'),
    authForms(tab || (refOf() ? 'register' : '')),
    h('p',{class:'hint'},'Без входа можно пользоваться калькулятором, играть и сдавать экзамен — результаты сохранятся в этом браузере.')))];
  return [cabinetHead(), challengesSection(), cabinetTabs(tab, tid)];
}
function cabinetHead(){
  const head = h('div',{class:'cab-head'}), grow = h('div'), stats = h('div');
  live(()=>{
    const me = COM.me; if (!me) return;
    head.replaceChildren(h('div',{class:'mono cab-ava','aria-hidden':'true'}, emojiOf(COM.uid)),
      h('div',{style:'flex:1;min-width:0'}, h('div',{class:'eyebrow'},'Личный кабинет'), h('h1',{class:'cab-name'},me.nick), h('div',{class:'hint'}, levelName(me.level),' · с нами с ', dt(me.joined), COM.verified ? h('span',{class:'mail-ok'},' · ✓ почта подтверждена') : null)),
      h('button',{type:'button',class:'btn ghost small cab-logout',onclick:logout},'Выйти'));
    grow.replaceChildren(growthBlock() || '');
    stats.replaceChildren(statsRow());
  });
  const verify = !COM.verified && COM.email ? h('div',{class:'card',style:'padding:12px 14px;gap:6px'},
    h('b',null,'Подтвердите почту'),
    h('p',{class:'hint'},'Мы отправили письмо на ',COM.email,'. Подтверждённая почта нужна, чтобы восстановить пароль, если вы его забудете.'),
    h('div',null, h('button',{type:'button',class:'btn ghost small',onclick:e=>{ const b = e.currentTarget; b.disabled = true; b.textContent = 'Отправляю…';
      pb.collection('users').requestVerification(COM.email).then(()=>{ b.textContent = 'Письмо отправлено ✓'; toast('Письмо отправлено, проверьте почту и папку «Спам»'); },()=>{ b.disabled = false; b.textContent = 'Отправить письмо ещё раз'; toast('Не получилось отправить письмо, попробуйте позже'); }); }},'Отправить письмо ещё раз'))) : null;
  const nudge = h('div');
  if (!PROFILE.loaded) loadProfile();
  live(()=>{ nudge.replaceChildren(PROFILE.loaded && !profileDone(PROFILE.rec) ? h('div',{class:'card pf-nudge'},
    h('span',{'aria-hidden':'true',style:'font-size:28px'},'📝'),
    h('div',{style:'flex:1;min-width:200px'}, h('b',null,'Заполните профиль — +'+rulePoints('profile_complete',20)+' к росту'), h('div',{class:'hint'},'Возраст, город и ваша эко-цель — пара минут.')),
    h('a',{class:'btn small',href:'/kabinet?tab=profile#cabinet-tabs'},'Заполнить')) : ''); });
  return h('section',{class:'band',id:'cabinet'}, h('div',{class:'wrap',style:'display:grid;gap:18px'}, head, verify, nudge, grow, stats));
}
// old tab addresses still open the right place after the tabs were merged
const TAB_ALIAS = {xp:'path', settings:'profile', suggest:'mine', drafts:'articles', inbox:'articles'};
function cabinetTabs(tab, tid){
  let cur = TAB_ALIAS[tab] || tab || (unreadCount() ? 'chats' : 'path'), lastKey = null, openTid = tid || null, tabBtns = {};
  const openThread = id=>{ openTid = id; paint(true); };
  const body = h('div',{style:'display:grid;gap:16px'});
  const lists = {};
  function build(){
    const me = COM.me;
    // my things — for every member; site management — a separate row, only for Dasha and moderators
    const mineTabs = [['path','🌱 Мой эко путь'],['profile','👤 Профиль и настройки'],['chats','💬 Сообщения'],['things','📦 Мои вещи'],['mine','✍️ Мои публикации']];
    const adminTabs = (COM.admin ? [['articles','📝 Статьи'],['moder','✅ Проверка'],['fb','💡 Обратная связь']] : []).concat(COM.owner ? [['people','👥 Участники'],['levels','🏅 Уровни и рост']] : []);
    if (!mineTabs.concat(adminTabs).some(([k])=>k===cur)) cur = 'path';
    tabBtns = {};
    const row = list => h('div',{class:'tabs',role:'tablist'}, list.map(([k,l])=>{ const b = h('button',{type:'button',role:'tab','aria-selected':String(k===cur),'data-l':l,onclick:()=>{ cur=k; openTid=null; history.replaceState(null,'','/kabinet?tab='+k); paint(true); }},l); tabBtns[k]=b; return b; }));
    const out = [row(mineTabs)];
    if (adminTabs.length) out.push(h('div',{class:'admin-bar'}, h('div',{class:'admin-l'},'🛠 Управление сайтом', h('span',{class:'hint'},' — видите только вы', COM.owner ? '' : ' и модераторы')), row(adminTabs)));
    if (cur==='things') out.push(...thingsPanel(lists));
    if (cur==='profile') out.push(profilePanel(), inviteCard());
    if (cur==='path') out.push(ecoPath(), xpHistory());
    if (cur==='chats'){ if (openTid && COM.threads[openTid]) out.push(...threadView(openTid, ()=>{ openTid=null; paint(true); })); else { lists.chats = h('div',{class:'list'}); out.push(lists.chats); } }
    if (cur==='moder'){ lists.moder = h('div',{class:'list'}); lists.svc = h('div',{class:'list'});
      out.push(h('h3',{style:'font-size:20px'},'Объявления барахолки'), h('p',{class:'muted'},'Объявления участников появляются в барахолке только после вашего одобрения.'), lists.moder,
        h('h3',{style:'font-size:20px'},'Предложенные сервисы'), h('p',{class:'muted'},'Компании и проекты, которые участники предложили для раздела «Полезные сервисы».'), lists.svc,
        h('h3',{style:'font-size:20px'},'Жалобы на комментарии'), h('p',{class:'muted'},'Участники отметили эти комментарии. Удалите или оставьте — автор жалобы не узнаёт, кто решал.'), lists.rep = h('div',{class:'list'})); }
    if (cur==='people'){ lists.people = h('div',{class:'list'}); out.push(h('p',{class:'muted'},'Модераторы проверяют объявления, видят предложения и обратную связь и могут редактировать сайт.'), lists.people); }
    if (cur==='profile'){
      const nick = h('input',{id:'acc-nick',maxlength:'30',value:me.nick});
      const f = h('form',{class:'cm-form'}, nick, h('button',{type:'submit',class:'btn small'},'Сохранить имя'));
      f.addEventListener('submit',e=>{ e.preventDefault(); const v=nick.value.trim(); if(v.length<2) return;
        pb.collection('users').update(COM.uid,{name:v.slice(0,30)}).then(()=>toast('Имя обновлено')).catch(writeErr); });
      const pick = characterPicker('acc-char', me.character, {emoji:me.customEmoji, name:me.customName});
      const cf = h('form',{style:'display:grid;gap:8px'}, pick, h('div',null,h('button',{type:'submit',class:'btn ghost small'},'Сменить персонажа')));
      cf.addEventListener('submit',e=>{ e.preventDefault(); if (!pick.value) return;
        pb.collection('users').update(COM.uid,pickData(pick)).then(()=>toast('Персонаж обновлён')).catch(writeErr); });
      out.push(h('div',{class:'card acc-card'}, h('h3',null,'Аккаунт и персонаж'),
        h('div',{class:'hint',style:'font-weight:800'},'Почта'),
        h('div',{class:'mail-row'}, h('b',null,COM.email||'—'),
          COM.verified ? h('span',{class:'status accepted'},'✓ подтверждена') : h('span',{class:'status declined'},'не подтверждена'),
          COM.verified ? null : h('button',{type:'button',class:'btn ghost small',onclick:e=>{ const b = e.currentTarget; b.disabled = true; b.textContent = 'Отправляю…';
            pb.collection('users').requestVerification(COM.email).then(()=>{ b.textContent = 'Письмо отправлено ✓'; toast('Письмо отправлено, проверьте почту и папку «Спам»'); },()=>{ b.disabled = false; b.textContent = 'Отправить письмо ещё раз'; toast('Не получилось отправить письмо, попробуйте позже'); }); }},'Отправить письмо ещё раз')),
        h('p',{class:'hint'},'Почту видите только вы. Она нужна для входа и восстановления пароля.'),
        h('label',{for:'acc-nick',class:'hint',style:'font-weight:800'},'Имя на сайте'), f,
        h('div',{class:'hint',style:'font-weight:800'},'Мой персонаж в «Счастливом мире»'), cf),
        tgCard());
    }
    if (cur==='mine'){
      const kind = h('select',{id:'sg-kind'}, ['Новость','Статья','Идея для сайта'].map(o=>h('option',null,o)));
      const title = h('input',{id:'sg-title',maxlength:'120'});
      const text = h('textarea',{id:'sg-text',maxlength:'4000',style:'min-height:140px'});
      const f = h('form',{class:'form',style:'margin:0;border-style:solid;border-color:var(--line)'},
        h('div',{class:'fields'}, h('label',{for:'sg-kind'},'Что предлагаете',kind), h('label',{for:'sg-title'},'Заголовок',title)),
        h('label',{for:'sg-text'},'Текст или ссылка на источник',text),
        h('div',null,h('button',{type:'submit',class:'btn'},'Отправить Даше')));
      f.addEventListener('submit',e=>{ e.preventDefault(); const t=title.value.trim(), x=text.value.trim(); if(!t){ title.focus(); return; } if(!x){ text.focus(); return; }
        pb.collection('suggestions').create({author:COM.uid, kind:kind.value, title:t.slice(0,120), text:x.slice(0,4000)}).then(()=>{ title.value=''; text.value=''; toast('Отправлено! Даша посмотрит'); }).catch(writeErr); });
      lists.mySugg = h('div',{class:'list'});
      lists.mine = h('div',{class:'list'});
      out.push(h('h3',{style:'font-size:20px'},'Предложить новость, статью или идею'), h('p',{class:'muted'},'Даша читает все предложения. Лучшие появятся в журнале с подписью автора.'), f,
        h('h3',{style:'font-size:18px'},'Мои предложения'), lists.mySugg, h('h3',{style:'font-size:18px'},'Мои комментарии'), lists.mine);
    }
    if (cur==='levels') out.push(...levelsAdminPanel());
    if (cur==='fb'){ lists.fb = h('div',{class:'list'}); out.push(h('p',{class:'muted'},'Замечания и предложения участников. Видите только вы и модераторы; ваш ответ автор увидит в разделе «Обратная связь».'), lists.fb); }
    if (cur==='articles'){
      lists.drafts = h('div',{class:'list'}); lists.inbox = h('div',{class:'list'});
      out.push(h('h3',{style:'font-size:20px'},'Черновики от помощника'), h('p',{class:'muted'},'Прочитайте, поправьте и опубликуйте — статья сразу появится в журнале со своей страницей.'), lists.drafts,
        h('h3',{style:'font-size:20px'},'Предложения участников'), h('p',{class:'muted'},'Новости, статьи и идеи от участников. Видите только вы и модераторы.'), lists.inbox);
    }
    out.push(h('div',{class:'cab-foot'}, h('button',{type:'button',class:'btn ghost small',onclick:logout},'Выйти из аккаунта')));
    return out;
  }
  const statusLabel = s => s==='accepted' ? 'В журнале' : s==='declined' ? 'Не подошло' : 'На рассмотрении';
  function paintLists(){
    if (lists.things && lists.things.isConnected) paintThings(lists.things);
    if (lists.chats && lists.chats.isConnected) paintChats(lists.chats, openThread);
    if (lists.moder && lists.moder.isConnected) paintModeration(lists.moder);
    if (lists.rep && lists.rep.isConnected){
      const open = openReports();
      lists.rep.replaceChildren(...(open.length ? open.map(({c, rs})=>h('div',{class:'li'},
        h('div',{class:'meta'}, h('span',{class:'status declined'},'⚑ ',rs.length,' ',plural(rs.length,'жалоба','жалобы','жалоб')), h('span',null,[...new Set(rs.map(r=>r.reason))].join(', ')), h('b',null,emojiOf(c.author),' ',nameOf(c.author)), h('span',null,dt(c.ts))),
        h('div',{style:'white-space:pre-line;font-size:15px'},c.text),
        h('div',{style:'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px'},
          h('button',{type:'button',class:'btn small',onclick:()=>pb.collection('comments').delete(c.id).then(()=>toast('Комментарий удалён')).catch(writeErr)},'Удалить комментарий'),
          h('button',{type:'button',class:'btn ghost small',onclick:()=>Promise.all(rs.map(r=>pb.collection('reports').update(r.id,{status:'kept'}))).then(()=>toast('Оставили')).catch(writeErr)},'Оставить')))) : [h('p',{class:'hint'},'Жалоб нет.')]));
    }
    if (lists.svc && lists.svc.isConnected){
      const pend = COM.services.filter(x=>!x.status);
      lists.svc.replaceChildren(...(pend.length ? pend.map(x=>h('div',{class:'li'},
        h('div',{class:'meta'}, h('span',{class:'status'},'На проверке'), h('span',null,x.category), h('span',null,'📍 ',x.city), x.suggested_by ? h('span',null,'от ',nameOf(x.suggested_by)) : null),
        h('b',null,x.name), x.accepts ? h('div',{style:'font-size:15px'},'Принимают: ',x.accepts) : null, x.note ? h('div',{class:'hint'},x.note) : null,
        x.url ? h('a',{href:x.url,target:'_blank',rel:'noopener nofollow'},x.url) : null,
        h('div',{style:'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px'},
          h('button',{type:'button',class:'btn small',onclick:()=>pb.collection('services').update(x.id,{status:'approved'}).then(()=>toast('Добавлено в подборку')).catch(writeErr)},'Добавить в подборку'),
          h('button',{type:'button',class:'btn ghost small',onclick:()=>pb.collection('services').update(x.id,{status:'rejected'}).catch(writeErr)},'Отклонить')))) : [h('p',{class:'hint'},'Новых предложений нет.')]));
    }
    if (lists.people && lists.people.isConnected) paintPeople(lists.people);
    if (lists.mySugg && lists.mySugg.isConnected){
      const it = COM.sugg.filter(s=>s.author===COM.uid);
      lists.mySugg.replaceChildren(...(it.length ? it.map(s=>h('div',{class:'li'}, h('div',{class:'meta'}, h('span',{class:'status '+(s.status||'')},statusLabel(s.status)), h('span',null,s.kind), h('span',null,dt(s.ts))), h('b',null,s.title))) : [h('p',{class:'hint'},'Вы пока ничего не предлагали.')]));
    }
    if (lists.mine && lists.mine.isConnected){
      const rv = COM.reviews.filter(r=>r.author===COM.uid).map(r=>({...r,kind:'Отзыв',coll:'reviews'}));
      const cm = COM.comments.filter(c=>c.author===COM.uid).map(c=>({...c,kind:'Комментарий',coll:'comments'}));
      const all = rv.concat(cm).sort((a,b)=>b.ts-a.ts);
      lists.mine.replaceChildren(...(all.length ? all.map(x=>h('div',{class:'li'}, h('div',{class:'meta'}, h('span',{class:'status'},x.kind), h('span',null,dt(x.ts)), h('button',{type:'button',class:'x',title:'Удалить','aria-label':'Удалить',onclick:()=>delDoc(x.coll,x.id)},'×')), h('div',{style:'white-space:pre-line'},x.text))) : [h('p',{class:'hint'},'Здесь появятся ваши комментарии.')]));
    }
    if (lists.fb && lists.fb.isConnected){
      lists.fb.replaceChildren(...(COM.feedback.length ? COM.feedback.map(x=>fbItem(x,true)) : [h('p',{class:'hint'},'Сообщений пока нет.')]));
    }
    if (lists.drafts && lists.drafts.isConnected) paintDrafts(lists.drafts);
    if (lists.inbox && lists.inbox.isConnected){
      const all = COM.sugg.slice();
      lists.inbox.replaceChildren(...(all.length ? all.map(s=>h('div',{class:'li'},
        h('div',{class:'meta'}, h('span',{class:'status '+(s.status||'')},statusLabel(s.status)), h('span',null,s.kind), h('b',null,nameOf(s.author)), h('span',null,dt(s.ts))),
        h('b',null,s.title), h('div',{style:'white-space:pre-line;font-size:15px'},s.text),
        !s.status ? h('div',{style:'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px'},
          h('button',{type:'button',class:'btn small',onclick:()=>acceptSugg(s)},'Опубликовать в журнале'),
          h('button',{type:'button',class:'btn ghost small',onclick:()=>setSuggStatus(s.id,'declined')},'Отклонить')) : null
      )) : [h('p',{class:'hint'},'Новых предложений нет.')]));
    }
  }
  function paint(force){
    const me = COM.me || {};
    const key = cur+'|'+COM.admin+'|'+COM.owner+'|'+(me.nick||'')+'|'+(me.character||'')+'|'+COM.characters.length+'|'+(openTid && COM.threads[openTid] ? openTid : '')+(cur==='levels' ? '|'+COM.levels.length+'/'+COM.growthRules.length : '');
    if (force || key !== lastKey){ lastKey = key; PAGE_UNSUBS.forEach(u=>{ try{u();}catch(e){} }); PAGE_UNSUBS = []; for (const k in lists) delete lists[k]; body.replaceChildren(...build().filter(x=>x!=null)); }
    paintLists();
    const badge = (k,n)=>{ const b = tabBtns[k]; if (b && b.isConnected) b.textContent = b.dataset.l + (n ? ' ('+n+')' : ''); };
    badge('chats', unreadCount()); badge('moder', COM.admin ? pendingListings().length + COM.services.filter(x=>!x.status).length + openReports().length : 0); badge('fb', COM.admin ? COM.feedback.filter(f=>!f.status).length : 0); badge('articles', COM.admin ? newDrafts().length + COM.sugg.filter(s=>!s.status).length : 0);
  }
  live(()=>paint(false));
  return h('section',{class:'band',id:'cabinet-tabs'}, h('div',{class:'wrap'}, body));
}
/* ---------- article drafts: read, fix, publish ---------- */
const newDrafts = () => (COM.drafts||[]).filter(d=>!d.status);
const DRAFT_OPEN = {};
function paintDrafts(el){
  // keep an open editor while realtime updates arrive
  if (el.querySelector('.draft-ed textarea:focus, .draft-ed input:focus')) return;
  const list = (COM.drafts||[]).slice().sort((a,b)=>(!a.status ? 0 : 1) - (!b.status ? 0 : 1));
  const st = d => d.status==='published' ? h('span',{class:'status accepted'},'Опубликовано') : d.status==='rejected' ? h('span',{class:'status declined'},'Отклонено') : h('span',{class:'status'},'Новый');
  el.replaceChildren(...(list.length ? list.map(d=>{
    const box = h('div',{class:'li draft'});
    const head = h('div',{class:'meta'}, st(d), h('span',null,d.cat||'Статья'), h('span',null,dt(tsOf(d))), d.keywords ? h('span',{class:'hint'},'🔎 '+d.keywords) : null);
    if (!DRAFT_OPEN[d.id] || d.status){
      box.append(head, h('b',null,d.title), d.lead ? h('div',{class:'muted',style:'font-size:15px'},d.lead) : null,
        !d.status ? h('div',null, h('button',{type:'button',class:'btn small',onclick:()=>{ DRAFT_OPEN[d.id] = true; paintDrafts(el); }},'Читать и править')) : null);
      return box;
    }
    const f = {title:h('input',{maxlength:'160',value:d.title}), lead:h('textarea',{maxlength:'400',style:'min-height:70px'}), body:h('textarea',{style:'min-height:340px'}),
      cat:h('select',null, ['Статья','Новость'].map(o=>h('option',{selected:(d.cat||'Статья')===o},o)))};
    f.lead.value = d.lead||''; f.body.value = d.body||'';
    const vals = () => ({title:f.title.value.trim(), lead:f.lead.value.trim(), body:f.body.value.trim(), cat:f.cat.value});
    box.append(head, h('div',{class:'form draft-ed'},
      h('label',null,'Заголовок',f.title), h('label',null,'Рубрика',f.cat), h('label',null,'Короткое описание (видно в журнале и в поиске)',f.lead), h('label',null,'Текст статьи',f.body),
      d.sources ? h('div',{class:'hint',style:'white-space:pre-line'}, h('b',null,'Источники для проверки: '), d.sources) : null,
      d.note ? h('div',{class:'hint',style:'white-space:pre-line'}, h('b',null,'Заметка помощника: '), d.note) : null,
      h('div',{style:'display:flex;gap:8px;flex-wrap:wrap'},
        h('button',{type:'button',class:'btn small',onclick:e=>publishDraft(d, vals(), e.currentTarget)},'Опубликовать'),
        h('button',{type:'button',class:'btn ghost small',onclick:()=>pb.collection('drafts').update(d.id, vals()).then(()=>toast('Черновик сохранён')).catch(writeErr)},'Сохранить черновик'),
        h('button',{type:'button',class:'btn ghost small',onclick:()=>{ DRAFT_OPEN[d.id] = false; paintDrafts(el); }},'Свернуть'),
        h('button',{type:'button',class:'btn ghost small',onclick:()=>{ if (confirm('Отклонить черновик?')) pb.collection('drafts').update(d.id,{status:'rejected'}).catch(writeErr); }},'Отклонить'))));
    return box;
  }) : [h('p',{class:'hint'},'Черновиков пока нет. Помощник присылает новые каждое утро.')]));
}
async function publishDraft(d, v, btn){
  if (!v.title || !v.body){ toast('Нужны заголовок и текст'); return; }
  if (EDIT.on && EDIT.dirty){ toast('Сначала сохраните или отмените правки сайта'); return; }
  btn.disabled = true; btn.textContent = 'Публикую…';
  try{
    // take the latest site content so nothing edited meanwhile is lost
    const c = await pb.collection('content').getOne(CONTENT.id, {requestKey:null});
    const data = c.data || {};
    data.articles = Array.isArray(data.articles) ? data.articles : [];
    let slug = slugify(v.title) || 'statya';
    if (data.articles.some(a=>articleSlug(a)===slug)) slug += '-'+iso(new Date());
    const lead = v.lead || (v.body.length > 200 ? v.body.slice(0,197).replace(/\s+\S*$/,'')+'…' : v.body);
    const art = {id:'a'+uid(), cat:v.cat||'Статья', date:iso(new Date()), title:v.title, lead, body:v.body, slug};
    data.articles.unshift(art);
    const r = await pb.collection('content').update(CONTENT.id, {data});
    CONTENT.data = JSON.parse(JSON.stringify(r.data));
    if (!EDIT.on){ STATE = r.data; normalize(); }
    await pb.collection('drafts').update(d.id, Object.assign({}, v, {status:'published'}));
    DRAFT_OPEN[d.id] = false;
    toast('Статья опубликована');
    go(articleUrl(art));
  }catch(e){ writeErr(e); btn.disabled = false; btn.textContent = 'Опубликовать'; }
}
/* ---------- profile: a few facts about you; filled in completely — points for growth ---------- */
const ECO_GOALS = ['Меньше мусора и пластика','Научиться сортировать отходы','Покупать осознанно: меньше и лучше','Питаться экологичнее','Экономить воду и энергию','Экологичный гардероб','Здоровье и чистый воздух','Научить детей заботиться о планете','Пока просто интересуюсь'];
const PROFILE = {rec:null, loaded:false};
const profileDone = p => !!(p && p.age > 0 && p.gender && String(p.country||'').trim() && String(p.city||'').trim() && (p.goals||[]).length);
function loadProfile(){
  if (!pb || !COM.uid) return Promise.resolve(null);
  return pb.collection('profiles').getFirstListItem(pb.filter('owner = {:o}',{o:COM.uid}),{requestKey:null})
    .then(r=>{ PROFILE.rec = r; }, ()=>{ PROFILE.rec = null; }).then(()=>{ PROFILE.loaded = true; refresh(); return PROFILE.rec; });
}
function profilePanel(){
  const box = h('div',{class:'card profile-card'});
  function paint(){
    const p = PROFILE.rec || {};
    const age = h('input',{id:'pf-age',type:'number',min:'6',max:'110',inputmode:'numeric',value:p.age||''});
    const gender = h('select',{id:'pf-gender'}, h('option',{value:''},'— выберите —'), ['Женский','Мужской','Не хочу указывать'].map(o=>h('option',{selected:p.gender===o},o)));
    const country = h('input',{id:'pf-country',maxlength:'60',value:p.country||'',placeholder:'Например, Россия',autocomplete:'country-name'});
    const city = h('input',{id:'pf-city',maxlength:'80',value:p.city||'',placeholder:'Например, Новосибирск',autocomplete:'address-level2'});
    const goals = new Set(p.goals||[]);
    const goalBtns = ECO_GOALS.map(g=>{ const b = h('button',{type:'button',class:'chip'+(goals.has(g)?' on':''),'aria-pressed':String(goals.has(g))},g);
      b.addEventListener('click',()=>{ goals.has(g) ? goals.delete(g) : goals.add(g); b.classList.toggle('on',goals.has(g)); b.setAttribute('aria-pressed',String(goals.has(g))); }); return b; });
    const btn = h('button',{type:'submit',class:'btn pf-save'},'Сохранить профиль');
    const left = h('div',{class:'pf-left'});
    const paintLeft = ()=>{
      const miss = [[age.value,'возраст'],[gender.value,'пол'],[country.value.trim(),'страна'],[city.value.trim(),'город'],[goals.size,'эко-цель']].filter(([v])=>!v).map(([,l])=>l);
      left.replaceChildren(miss.length ? h('span',null,'Заполнено ',5-miss.length,' из 5. Осталось: ',miss.join(', '),' — и получите +',pts,' к росту.') : h('span',{class:'ok'},'✓ Всё заполнено — нажмите «Сохранить профиль».'));
    };
    const pts = rulePoints('profile_complete',20), done = profileDone(p);
    const f = h('form',{class:'pf-form'},
      h('div',{class:'fields'}, h('label',{for:'pf-age'},'Возраст',age), h('label',{for:'pf-gender'},'Пол',gender)),
      h('div',{class:'fields'}, h('label',{for:'pf-country'},'Страна',country), h('label',{for:'pf-city'},'Город',city)),
      h('div',null, h('div',{class:'pf-l'},'Моя цель в экологии ', h('span',{class:'hint'},'(можно несколько)')), h('div',{class:'chips pf-goals'}, goalBtns)),
      left,
      h('div',{style:'display:flex;gap:12px;align-items:center;flex-wrap:wrap'}, btn, h('span',{class:'hint'},'Профиль видите только вы и Даша.')));
    f.addEventListener('input', paintLeft); f.addEventListener('change', paintLeft); f.addEventListener('click', ()=>setTimeout(paintLeft)); paintLeft();
    f.addEventListener('submit', async e=>{ e.preventDefault();
      const a = parseInt(age.value,10);
      const data = {age: a>=6 && a<=110 ? a : null, gender:gender.value, country:country.value.trim(), city:city.value.trim(), goals:[...goals]};
      if (age.value && data.age===null){ age.focus(); toast('Возраст — от 6 до 110'); return; }
      const was = profileDone(PROFILE.rec);
      btn.disabled = true;
      try{
        PROFILE.rec = PROFILE.rec ? await pb.collection('profiles').update(PROFILE.rec.id, data) : await pb.collection('profiles').create(Object.assign({owner:COM.uid}, data));
        toast(!was && profileDone(PROFILE.rec) ? 'Профиль заполнен! +'+pts+' к росту персонажа' : 'Профиль сохранён');
        paint();
      }catch(err){ btn.disabled = false; writeErr(err); }
    });
    box.replaceChildren(
      h('div',{class:'pf-head'}, h('h3',null,'Мой профиль'),
        done ? h('span',{class:'status accepted'},'✓ заполнен · +'+pts+' получено') : h('span',{class:'status',style:'background:var(--sun);color:#2A1C05'},'Заполните всё — +'+pts+' к росту')),
      h('p',{class:'hint'},'Расскажите немного о себе — так Даша поймёт, какие статьи и челленджи вам полезнее.'),
      f);
  }
  if (PROFILE.loaded) paint(); else { box.replaceChildren(h('p',{class:'muted'},'Загружаем профиль…')); loadProfile().then(paint); }
  return box;
}
/* ---------- Telegram: the member chooses what the bot sends and when ---------- */
const TG_TOPICS = [
  ['challenge','🌱 Напоминание о челлендже','каждый день в выбранное время, если что-то ещё не отмечено'],
  ['nudge','🏁 Предложение начать новый челлендж','по воскресеньям, если сейчас челленджа нет'],
  ['messages','💬 Новые личные сообщения','сразу, когда вам пишут'],
  ['articles','📖 Новые статьи в журнале','когда Даша публикует статью'],
  ['weekly','🌍 Что нового в «Счастливом мире»','по воскресеньям: новые участники, вещи и статьи']
];
function tgCard(){
  const box = h('div',{class:'card tg-card',id:'tg'}, h('p',{class:'muted'},'Загружаем…'));
  // Telegram opens in a new tab (opened right on the click, so the browser does not block it);
  // the card checks by itself when the member has pressed «Start»
  let waitTimer = null;
  const waitForLink = ()=>{
    clearInterval(waitTimer); let n = 0;
    waitTimer = setInterval(()=>{ if (!box.isConnected || ++n > 100){ clearInterval(waitTimer); return; }
      pb.send('/api/tg/poll',{method:'POST', requestKey:null}).catch(()=>{}).then(()=>pb.collection('tg_subs').getFullList({requestKey:null})).then(l=>{ if (l[0]){ clearInterval(waitTimer); paint(l[0]); toast('Telegram подключён! Выберите, что присылать'); } }).catch(()=>{}); }, 3000);
  };
  const connect = async btn=>{
    const note = box.querySelector('.tg-note');
    const tab = window.open('', '_blank');
    btn.disabled = true; btn.textContent = 'Готовим ссылку…'; if (note) note.hidden = true;
    try{
      const r = await pb.send('/api/tg/link',{method:'POST', requestKey:null});
      if (!r.url) throw {response:r};
      if (tab) tab.location.href = r.url;
      if (note){ note.hidden = false; note.className = 'tg-note hint'; note.replaceChildren('Telegram открылся в новой вкладке — нажмите там «Start». Эта страница сама увидит подключение. Если вкладка не открылась, ', h('a',{href:r.url,target:'_blank',rel:'noopener'},'нажмите сюда'),'.'); }
      btn.disabled = false; btn.textContent = 'Подключить Telegram';
      waitForLink();
    }catch(e){
      if (tab) tab.close();
      btn.disabled = false; btn.textContent = 'Подключить Telegram';
      const msg = (e && e.response && e.response.message) || 'Не получилось связаться с сайтом, попробуйте позже.';
      if (note){ note.hidden = false; note.className = 'tg-note tg-err'; note.textContent = msg; } else toast(msg);
    }
  };
  function paint(sub){
    const head = h('div',{class:'pf-head'}, h('h3',null,'Уведомления в Telegram'), sub ? h('span',{class:'status accepted'},'✓ подключено') : null);
    if (!sub){
      box.replaceChildren(head,
        h('p',null,'Бот напомнит про челлендж и расскажет, что нового в сообществе. Что именно присылать, вы выберете сами.'),
        h('div',{style:'display:flex;gap:8px;flex-wrap:wrap'},
          h('button',{type:'button',class:'btn small',onclick:e=>connect(e.currentTarget)},'Подключить Telegram'),
          h('button',{type:'button',class:'btn ghost small',onclick:load},'Я подключил(а) — обновить')),
        h('p',{class:'hint'},'Откроется Telegram — нажмите «Start» в боте и вернитесь сюда.'),
        h('p',{class:'tg-note',hidden:true,role:'status'}));
      return;
    }
    const want = new Set(sub.topics||[]);
    const boxes = TG_TOPICS.map(([k,t,d])=>{ const c = h('input',{type:'checkbox',checked:want.has(k)?'':null,'data-k':k}); return h('label',{class:'tg-topic'}, c, h('span',null, h('b',null,t), h('span',{class:'hint'},d))); });
    const hour = h('select',{'aria-label':'Время напоминания'}, Array.from({length:17},(_,i)=>i+7).map(x=>h('option',{value:x,selected:x===sub.hour?'':null}, String(x).padStart(2,'0')+':00')));
    const on = h('input',{type:'checkbox',checked:sub.enabled?'':null});
    const save = h('button',{type:'button',class:'btn small',onclick:()=>{
      const topics = boxes.map(l=>l.querySelector('input')).filter(c=>c.checked).map(c=>c.dataset.k);
      pb.collection('tg_subs').update(sub.id,{topics, hour:+hour.value, tz:-new Date().getTimezoneOffset(), enabled:on.checked}).then(r=>{ toast(on.checked && topics.length ? 'Уведомления сохранены' : 'Уведомления выключены'); paint(r); }).catch(writeErr);
    }},'Сохранить');
    box.replaceChildren(head,
      h('label',{class:'tg-topic tg-main'}, on, h('span',null, h('b',null,'Присылать уведомления'))),
      h('div',{class:'hint',style:'font-weight:800'},'Что присылать'), h('div',{class:'tg-topics'}, boxes),
      h('label',{class:'tg-hour'},'Во сколько напоминать о челлендже ', hour, h('span',{class:'hint'},' (ваше местное время)')),
      h('div',{style:'display:flex;gap:8px;flex-wrap:wrap'}, save,
        h('button',{type:'button',class:'btn ghost small',onclick:()=>{ if (confirm('Отключить Telegram-бота?')) pb.collection('tg_subs').delete(sub.id).then(()=>{ toast('Telegram отключён'); paint(null); }).catch(writeErr); }},'Отключить Telegram')));
  }
  function load(){ pb.collection('tg_subs').getFullList({requestKey:null}).then(l=>paint(l[0]||null)).catch(()=>paint(null)); }
  load();
  return box;
}

/* ---------- «Мой эко путь»: badges and a timeline of what you have done ---------- */
// the longest run of days in a row with at least one check, over all challenges
function bestStreak(){
  const days = new Set();
  challenges().forEach(ch=>Object.keys(ch.log||{}).forEach(d=>{ if ((ch.log[d]||[]).length) days.add(d); }));
  Object.keys(HAB.log||{}).forEach(d=>{ if ((HAB.log[d]||[]).length) days.add(d); });
  let best = 0;
  [...days].sort().forEach(d=>{ let n = 1, c = d; while (days.has(addDays(c,-1))){ n++; c = addDays(c,-1); } best = Math.max(best, n); });
  return best;
}
function ecoBadges(){
  const me = COM.me || {}, chs = challenges();
  const mine = (arr, f) => arr.filter(x=>x[f]===COM.uid).length;
  const leaves = Math.max(me.leaves||0, leavesTotal()), streak = bestStreak();
  const done = chs.filter(ch=>chStats(ch).passed).length, reads = Object.keys(COM.reads).length, comments = mine(COM.comments,'author');
  // [icon, title, how to get it, got?, progress text]
  return [
    ['🌱','Первый шаг','Зарегистрироваться и поселиться в мире', true],
    ['📝','Будем знакомы','Заполнить профиль', profileDone(PROFILE.rec)],
    ['🏁','Старт','Начать первый эко-челлендж', chs.length > 0],
    ['🏆','До конца','Пройти челлендж (от 70% отметок)', done > 0],
    ['🔥','Неделя подряд','7 дней подряд отмечать привычки', streak >= 7, Math.min(streak,7)+' / 7'],
    ['🍃','50 листочков','50 отметок в челленджах', leaves >= 50, Math.min(leaves,50)+' / 50'],
    ['🎓','Эко-знаток','Сдать эко-тест на 8 из 10', (STATS.examBest||0) >= 8],
    ['🎮','Чистый парк','Набрать 50 очков в «Эко-уборке»', (STATS.gameBest||0) >= 50, Math.min(STATS.gameBest||0,50)+' / 50'],
    ['📖','Читатель','Прочитать 5 статей журнала', reads >= 5, Math.min(reads,5)+' / 5'],
    ['💬','Голос сообщества','Оставить 5 комментариев', comments >= 5, Math.min(comments,5)+' / 5'],
    ['📦','Вторая жизнь','Выставить вещь на барахолку', COM.listings.some(l=>l.seller===COM.uid && l.moderation==='approved')],
    ['💌','Друг природы','Пригласить друга', COM.refs.some(r=>r.inviter===COM.uid)],
    ['🌳', levelName(3),'Дорасти до третьего уровня', (me.level||1) >= 3]
  ];
}
function ecoPath(){
  const me = COM.me || {};
  const timeline = h('ol',{class:'tl'}, h('li',{class:'hint'},'Собираем историю…'));
  const chs = challenges();
  const stat = (n, l) => h('div',null, h('b',null,n), h('span',null,l));
  // events: joined, levels, finished challenges, what the points were for (from the server history)
  pb.collection('xp_log').getFullList({filter:pb.filter('user = {:u} && initial = false',{u:COM.uid}), sort:'-created', requestKey:null}).catch(()=>[]).then(log=>{
    const ev = [];
    ev.push([me.joined||0, '🌱', 'Вы поселились в «Счастливом мире»', '']);
    (me.history||[]).filter(x=>x.rank > 1).forEach(x=>ev.push([Date.parse(x.at)||0, '🎓', 'Новый уровень: «'+levelName(x.rank)+'»', 'сертификат в кабинете']));
    chs.filter(ch=>chStats(ch).passed).forEach(ch=>ev.push([Date.parse(chStats(ch).end+'T20:00:00')||0, '🏆', 'Челлендж пройден: '+ch.title, Math.round(chStats(ch).ratio*100)+'% отметок']));
    chs.filter(ch=>!chStats(ch).over).forEach(ch=>ev.push([Date.parse(ch.start+'T08:00:00')||0, '🏁', 'Начат челлендж: '+ch.title, 'до '+fmtDay(chStats(ch).end)]));
    const skip = {leaf:1, challenge_done:1, signup:1};
    log.filter(x=>!skip[x.key]).forEach(x=>{ const [ic] = GROW_WAYS[x.key] || ['✨']; ev.push([tsOf(x), ic, x.title, (x.points>0?'+':'')+x.points+' к росту']); });
    ev.sort((a,b)=>b[0]-a[0]);
    timeline.replaceChildren(...ev.slice(0,40).map(([t,ic,title,sub])=>h('li',{class:'tl-i'}, h('span',{class:'tl-ic','aria-hidden':'true'},ic),
      h('div',null, h('b',null,title), h('div',{class:'hint'}, t ? dt(t) : '', sub ? ' · '+sub : '')))));
  });
  const head = h('div',{class:'card path-head'}), badgeBox = h('div',{class:'card'});
  if (!PROFILE.loaded) loadProfile();
  // members, profile and challenges arrive a bit later — keep the head and the badges up to date
  live(()=>{
    const me = COM.me || {}, badges = ecoBadges(), got = badges.filter(b=>b[3]).length;
    head.replaceChildren(...paintHead(me));
    badgeBox.replaceChildren(
      h('div',{class:'pf-head'}, h('h3',null,'Достижения'), h('span',{class:'status accepted'}, got+' из '+badges.length)),
      h('div',{class:'badges'}, badges.map(([ic,t,how,ok,prog])=>h('div',{class:'badge'+(ok?' ok':''),title:how},
        h('span',{class:'badge-ic','aria-hidden':'true'}, ic), h('b',null,t), h('span',{class:'hint'}, ok ? '✓ получено' : (prog || how))))));
  });
  function paintHead(me){ return [
      h('div',{class:'path-ava','aria-hidden':'true'}, emojiOf(COM.uid)),
      h('div',{style:'flex:1;min-width:0'}, h('div',{class:'eyebrow'},'Мой эко путь'), h('h3',null, me.nick||'', ' — ', levelName(me.level||1)),
        h('p',{class:'hint'},'С нами с ', dt(me.joined||Date.now()),'. Каждый маленький шаг здесь — уже вклад в чистую планету.')),
      h('div',{class:'kv path-stats'},
        stat(me.xp||0, 'очков роста'), stat(chs.filter(ch=>chStats(ch).passed).length, 'челленджей пройдено'),
        stat(Math.max(me.leaves||0, leavesTotal()), 'отметок-листочков'), stat(bestStreak(), 'дней подряд — рекорд'))]; }
  return h('div',{class:'eco-path'}, head, badgeBox,
    h('div',{class:'card'}, h('h3',null,'Хронология'), timeline));
}

/* ---------- points history: what the points came for (written by the server) ---------- */
function xpHistory(){
  const box = h('div',{class:'card xp-hist'}, h('p',{class:'muted'},'Загружаем историю…'));
  pb.collection('xp_log').getFullList({filter:pb.filter('user = {:u}',{u:COM.uid}), sort:'-created', requestKey:null}).then(list=>{
    const total = list.reduce((s,x)=>s+(x.points||0),0);
    const row = x=>{ const [ic] = GROW_WAYS[x.key] || ['✨'];
      return h('li',{class:'xp-row'}, h('span',{class:'xp-ic','aria-hidden':'true'},ic),
        h('div',{class:'xp-t'}, h('b',null,x.title), h('span',{class:'hint'}, x.initial ? 'начислено до появления истории' : dt(tsOf(x)), x.count > 1 ? ' · ×'+x.count : '')),
        h('span',{class:'xp-pts'+(x.points<0?' neg':'')}, (x.points>0?'+':'')+x.points)); };
    box.replaceChildren(
      h('div',{class:'pf-head'}, h('h3',null,'История очков роста'), h('span',{class:'status accepted'},'Всего: '+(COM.me ? COM.me.xp : total))),
      h('p',{class:'hint'},'Здесь видно, за что и когда пришли очки. Очки за приглашённого друга приходят, когда он подтвердит почту.'),
      list.length ? h('ul',{class:'xp-list'}, list.map(row)) : h('p',{class:'hint'},'Пока пусто — история появится после первого действия.'));
  }).catch(()=>box.replaceChildren(h('p',{class:'hint'},'Не удалось загрузить историю, попробуйте позже.')));
  return box;
}
/* invitation link: a friend who signs up by it gets a big bonus, you get points when they confirm their email */
function inviteCard(){
  const link = location.origin+'/?ref='+COM.uid;
  const friends = h('div',{class:'hint'});
  Promise.all([
    pb.collection('referrals').getFullList({filter:pb.filter('inviter = {:u}',{u:COM.uid}), requestKey:null}),
    pb.collection('xp_log').getFullList({filter:pb.filter('user = {:u} && key = "invite_friend"',{u:COM.uid}), requestKey:null}).catch(()=>[])
  ]).then(([l, log])=>{
    const counted = log.reduce((s,x)=>s+(x.count||0),0);
    friends.replaceChildren(l.length ? h('span',null,'По вашей ссылке пришли: ', h('b',null,l.map(r=>nameOf(r.invited)).join(', ')), '. Очки начислены за ', h('b',null,counted),' из ',l.length,
      counted < l.length ? ' — остальным нужно подтвердить почту (ссылка в письме, которое пришло при регистрации; его можно отправить ещё раз из кабинета).' : '.')
      : 'По вашей ссылке пока никто не пришёл — отправьте её друзьям!');
  }).catch(()=>{});
  const text = 'Присоединяйся к «Счастливому миру» DashaBotanika — эко-челленджи, тест и персонаж, который растёт вместе с тобой 🌱';
  const copyBtn = h('button',{type:'button',class:'btn small',onclick:()=>{ const done = ()=>{ copyBtn.textContent = 'Скопировано ✓'; setTimeout(()=>copyBtn.textContent='Скопировать',1600); };
    try{ navigator.clipboard.writeText(link).then(done,()=>{ inp.select(); }); }catch(e){ inp.select(); } }},'Скопировать');
  const inp = h('input',{readonly:'',value:link,'aria-label':'Ваша ссылка-приглашение',onfocus:e=>e.target.select()});
  return h('div',{class:'card invite-card',id:'invite'},
    h('div',{class:'pf-head'}, h('h3',null,'🎁 Пригласите друга'), h('span',{class:'status accepted'},'+'+rulePoints('invite_friend',40)+' вам · +'+rulePoints('invited',50)+' другу')),
    h('p',null,'Отправьте другу свою ссылку. Когда он зарегистрируется, его персонаж сразу получит +'+rulePoints('invited',50)+' к росту, а вы — +'+rulePoints('invite_friend',40)+', как только друг подтвердит почту.'),
    h('div',{class:'invite-row'}, inp, copyBtn),
    h('div',{style:'display:flex;gap:8px;flex-wrap:wrap'},
      h('a',{class:'btn ghost small',href:'https://t.me/share/url?url='+encodeURIComponent(link)+'&text='+encodeURIComponent(text),target:'_blank',rel:'noopener'},'Отправить в Telegram'),
      h('a',{class:'btn ghost small',href:'https://wa.me/?text='+encodeURIComponent(text+' '+link),target:'_blank',rel:'noopener'},'WhatsApp'),
      navigator.share ? h('button',{type:'button',class:'btn ghost small',onclick:()=>navigator.share({title:'DashaBotanika',text,url:link}).catch(()=>{})},'Поделиться…') : null),
    friends);
}
function setSuggStatus(id, status){
  return write('suggestions/'+id, ()=>pb.collection('suggestions').update(id,{status})).catch(writeErr);
}
function acceptSugg(s){
  if (!EDIT.can){ toast('Публиковать в журнал может только редактор сайта'); return; }
  const lead = s.text.length > 200 ? s.text.slice(0,197).replace(/\s+\S*$/,'')+'…' : s.text;
  STATE.articles.unshift({id:'a'+uid(), cat:s.kind==='Новость'?'Новость':'Статья', date:iso(new Date()), title:s.title, lead, body:s.text, by:s.author});
  setSuggStatus(s.id, 'accepted');
  markDirty(); setEditing(true); go('/#journal');
  toast('Добавлено в журнал. Нажмите «Сохранить изменения»');
}
function accountButton(){
  const b = h('a',{class:'btn small acc-btn',href:'/kabinet'});
  live(()=>{
    const st = accState();
    if (st==='member'){
      // the number = what waits for you: unread messages and, for admins, listings to check and new feedback
      const parts = [[unreadCount(),'непрочитанные сообщения']].concat(COM.admin ? [[newDrafts().length,'черновики статей'],[pendingListings().length,'объявления на проверке'],[COM.feedback.filter(f=>!f.status).length,'новая обратная связь']] : []).filter(([k])=>k);
      const n = parts.reduce((s,[k])=>s+k,0);
      b.replaceChildren(...[h('span',{class:'dot','aria-hidden':'true'},emojiOf(COM.uid)), 'Кабинет', n ? h('span',{class:'status',style:'background:var(--sun);color:#2A1C05'},n) : null].filter(Boolean));
      if (n){ b.title = 'Ждёт внимания: '+parts.map(([k,t])=>t+' — '+k).join(', '); b.setAttribute('aria-label','Кабинет. '+b.title); }
      else { b.removeAttribute('title'); b.removeAttribute('aria-label'); }
    }
    else { b.replaceChildren('Войти'); b.removeAttribute('title'); b.removeAttribute('aria-label'); }
  });
  return b;
}

/* ---------- game: eco clean-up ---------- */
const BINS = [{k:'plastic',l:'Пластик',c:'#E0AE36'},{k:'paper',l:'Бумага',c:'#3E78B2'},{k:'glass',l:'Стекло',c:'#3B8F55'},{k:'metal',l:'Металл',c:'#858D95'},{k:'battery',l:'Батарейки',c:'#C0533D'}];
const LITTER = [['plastic','Бутылка ПЭТ'],['plastic','Флакон от шампуня'],['paper','Газета'],['paper','Картонная коробка'],['glass','Стеклянная банка'],['glass','Бутылка из стекла'],['metal','Банка из-под газировки'],['metal','Консервная банка'],['battery','Батарейка']];
/* ---------- air quality in any city (Open-Meteo: free, no key; data from Copernicus CAMS) ---------- */
const AQI_LEVELS = [
  [20,'Отличный','#3B8F55','Отличный день для прогулки, пробежки и проветривания.'],
  [40,'Хороший','#86A85C','Можно спокойно гулять и проветривать.'],
  [60,'Умеренный','#E0AE36','Чувствительным людям лучше не заниматься спортом у дорог.'],
  [80,'Плохой','#E07B39','Сократите долгие прогулки, проветривайте ненадолго.'],
  [100,'Очень плохой','#C0533D','Лучше остаться дома, закрыть окна, включить очиститель воздуха.'],
  [Infinity,'Опасный','#7E2E4F','Не выходите без необходимости, окна держите закрытыми.']
];
const aqiLevel = v => AQI_LEVELS.find(l=>v < l[0]) || AQI_LEVELS[AQI_LEVELS.length-1];
const AIR_KEY = 'db-air-city';
// sun over the city; the haze thickens with the index (--smog: 0 clean … 1 very dirty)
const AIR_ART = '<svg viewBox="0 0 400 400" role="img" aria-label="Солнце над городом и дымка смога">'+
  '<defs><clipPath id="air-c"><circle cx="200" cy="200" r="180"/></clipPath>'+
  '<linearGradient id="air-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FD0E6"/><stop offset=".7" stop-color="#E8F2EA"/><stop offset="1" stop-color="#F6EFD9"/></linearGradient>'+
  '<radialGradient id="air-sun" cx="40%" cy="38%" r="70%"><stop offset="0" stop-color="#FFF3B0"/><stop offset=".55" stop-color="#F7C948"/><stop offset="1" stop-color="#E9A23B"/></radialGradient>'+
  '<radialGradient id="air-glow"><stop offset="0" stop-color="#FFE08A" stop-opacity=".75"/><stop offset="1" stop-color="#FFE08A" stop-opacity="0"/></radialGradient>'+
  '<linearGradient id="air-haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A89A86" stop-opacity="0"/><stop offset=".55" stop-color="#9C8E79" stop-opacity=".75"/><stop offset="1" stop-color="#8A7C68" stop-opacity=".9"/></linearGradient>'+
  '<filter id="air-blur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="7"/></filter></defs>'+
  '<circle cx="200" cy="200" r="190" fill="#86A85C" opacity=".14"/>'+
  '<g clip-path="url(#air-c)">'+
    '<rect width="400" height="400" fill="url(#air-sky)"/>'+
    '<rect class="air-dim" width="400" height="400" fill="#B9AE9A"/>'+
    '<circle cx="250" cy="140" r="110" fill="url(#air-glow)"/>'+
    '<g class="air-rays" style="transform-origin:250px 140px">'+Array.from({length:12},(_,i)=>'<rect x="246" y="62" width="8" height="22" rx="4" fill="#F4B740" transform="rotate('+(i*30)+' 250 140)"/>').join('')+'</g>'+
    '<circle class="air-sunball" cx="250" cy="140" r="44" fill="url(#air-sun)"/>'+
    '<path d="M234 146q4 6 10 0M256 146q4 6 10 0" stroke="#9A5B1E" stroke-width="3" fill="none" stroke-linecap="round"/>'+
    '<path class="air-smile" d="M241 162q9 8 18 0" stroke="#9A5B1E" stroke-width="3" fill="none" stroke-linecap="round"/>'+
    '<path class="air-frown" d="M241 166q9 -7 18 0" stroke="#9A5B1E" stroke-width="3" fill="none" stroke-linecap="round"/>'+
    '<circle cx="232" cy="156" r="5" fill="#F29C6B" opacity=".6"/><circle cx="268" cy="156" r="5" fill="#F29C6B" opacity=".6"/>'+
    '<g class="air-cloud"><path d="M70 120c0-14 12-24 26-22 6-12 24-14 33-4 14-2 24 8 22 20 8 4 6 16-4 16H78c-10 0-14-6-8-10z" fill="#fff" opacity=".9"/></g>'+
    '<path d="M20 300h40v-70h30v40h22v-90h36v120h18v-60h34v60h20v-100h40v100h18v-50h30v50h20v-80h34v110H20z" fill="#5E7F55"/>'+
    '<g fill="#F6EFD9" opacity=".75">'+[[100,180],[100,200],[124,180],[124,200],[124,220],[226,220],[226,240],[246,220],[246,240],[350,240],[350,260]].map(([x,y])=>'<rect x="'+x+'" y="'+y+'" width="8" height="10" rx="1.5"/>').join('')+'</g>'+
    '<path d="M0 312c60-14 120-6 200-12s140-12 200-2v102H0z" fill="#86A85C"/>'+
    '<g transform="translate(64 296)"><rect x="-3" y="-4" width="6" height="22" fill="#6B4B2E"/><circle cy="-16" r="18" fill="#3A6234"/><circle cx="12" cy="-6" r="12" fill="#4E7A43"/></g>'+
    '<g class="air-smog">'+
      '<rect y="150" width="400" height="250" fill="url(#air-haze)"/>'+
      '<g class="air-drift" filter="url(#air-blur)" fill="#8F826E">'+
        '<ellipse cx="90" cy="236" rx="120" ry="22"/><ellipse cx="300" cy="226" rx="130" ry="20"/><ellipse cx="510" cy="236" rx="120" ry="22"/>'+
        '<ellipse cx="180" cy="276" rx="150" ry="24" opacity=".8"/><ellipse cx="480" cy="276" rx="150" ry="24" opacity=".8"/></g>'+
      '<g class="air-dots" fill="#6E6252">'+[[60,200],[130,170],[210,190],[290,175],[340,205],[160,240],[250,250],[320,262],[95,262]].map(([x,y],i)=>'<circle cx="'+x+'" cy="'+y+'" r="'+(2+i%3)+'"/>').join('')+'</g>'+
    '</g>'+
  '</g></svg>';
const AIR_PARTS = [['pm2_5','PM2.5','мелкая пыль'],['pm10','PM10','пыль'],['nitrogen_dioxide','NO₂','выхлопы машин'],['ozone','O₃','озон']];
function airSection(){
  const input = h('input',{id:'air-city',type:'search',placeholder:'Например, Новосибирск',autocomplete:'address-level2','aria-label':'Город'});
  const out = h('div',{class:'air-out','aria-live':'polite'});
  const sec = h('section',{class:'band alt',id:'air'});
  let seq = 0;
  async function show(name){
    name = String(name||'').trim(); if (!name) return;
    input.value = name;
    const my = ++seq;
    out.replaceChildren(h('p',{class:'muted'},'Смотрим, чем дышит ',name,'…'));
    try{
      const g = await (await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=ru&format=json&name='+encodeURIComponent(name))).json();
      const place = g.results && g.results[0];
      if (my !== seq) return;
      if (!place){ out.replaceChildren(h('p',{class:'empty'},'Не нашли такой город. Проверьте название — например, «Казань» или «Kazan».')); return; }
      const q = 'latitude='+place.latitude+'&longitude='+place.longitude+'&timezone=auto&forecast_days=2&current=european_aqi,'+AIR_PARTS.map(x=>x[0]).join(',')+'&hourly=european_aqi';
      const a = await (await fetch('https://air-quality-api.open-meteo.com/v1/air-quality?'+q)).json();
      if (my !== seq) return;
      const cur = a.current || {};
      if (cur.european_aqi == null) throw new Error('no data');
      try{ localStorage.setItem(AIR_KEY, place.name); }catch(e){}
      const v = Math.round(cur.european_aqi), [,label,color,tip] = aqiLevel(v);
      // next 24 hours from now
      const times = (a.hourly && a.hourly.time) || [], vals = (a.hourly && a.hourly.european_aqi) || [];
      const start = Math.max(0, times.findIndex(t=>t >= (cur.time||'')));
      const next = vals.slice(start, start+24).map((x,i)=>[times[start+i], x]).filter(([,x])=>x != null);
      const max = Math.max(60, ...next.map(([,x])=>x));
      sec.style.setProperty('--smog', Math.min(1, v/100).toFixed(2)); sec.dataset.air = v >= 60 ? 'bad' : 'ok';
      out.replaceChildren(h('div',{class:'air-card',style:'--aq:'+color},
        h('button',{type:'button',class:'air-x',title:'Закрыть','aria-label':'Закрыть результат',onclick:close},'×'),
        h('div',{class:'air-main'},
          h('div',{class:'air-num'}, h('b',null,v), h('span',null,'индекс')),
          h('div',null,
            h('div',{class:'air-place'}, place.name, place.admin1 && place.admin1 !== place.name ? ', '+place.admin1 : '', place.country ? ' · '+place.country : ''),
            h('div',{class:'air-label'},'Воздух: ',label),
            h('p',null,tip))),
        h('div',{class:'air-parts'}, AIR_PARTS.map(([k,n,d])=>cur[k]==null ? null : h('div',null, h('b',null,Math.round(cur[k])), ' мкг/м³', h('span',null,n+' — '+d)))),
        next.length ? h('div',{class:'air-day'}, h('div',{class:'air-day-t'},'Прогноз на сутки'),
          h('div',{class:'air-bars',role:'img','aria-label':'Прогноз индекса на 24 часа: от '+Math.round(Math.min(...next.map(([,x])=>x)))+' до '+Math.round(Math.max(...next.map(([,x])=>x)))},
            next.map(([t,x])=>h('i',{title:t.slice(11,16)+' — '+Math.round(x)+' ('+aqiLevel(x)[1].toLowerCase()+')',style:'height:'+Math.max(6,Math.round(x/max*100))+'%;background:'+aqiLevel(x)[2]}))),
          h('div',{class:'air-day-x'}, h('span',null,'сейчас'), h('span',null,'+12 ч'), h('span',null,'+24 ч'))) : null
      ));
    }catch(e){
      if (my === seq) out.replaceChildren(h('p',{class:'empty'},'Не удалось получить данные о воздухе. Попробуйте чуть позже.'));
    }
  }
  function close(){ seq++; out.replaceChildren(); input.value = ''; sec.style.removeProperty('--smog'); delete sec.dataset.air; try{ localStorage.removeItem(AIR_KEY); }catch(e){} }
  const form = h('form',{class:'air-form',onsubmit:e=>{ e.preventDefault(); show(input.value); }}, input, h('button',{class:'btn',type:'submit'},'Узнать'));
  let saved = null; try{ saved = localStorage.getItem(AIR_KEY); }catch(e){}
  if (saved) setTimeout(()=>show(saved), 0);
  sec.append(h('div',{class:'wrap air-grid'},
    h('div',{class:'air-main-col'},
      sectionHead('Чистота воздуха','Чем дышит ваш город?','Введите город — покажем, насколько чистый воздух прямо сейчас, и прогноз на сутки.'),
      form,
      h('div',{class:'chips air-chips'}, ['Москва','Санкт-Петербург','Новосибирск','Екатеринбург','Казань'].map(c=>h('button',{type:'button',class:'chip',onclick:()=>show(c)},c))),
      out,
      h('p',{class:'hint air-src'},'Европейский индекс качества воздуха (0–20 отлично, больше 100 опасно). Данные: ', h('a',{href:'https://open-meteo.com/',target:'_blank',rel:'noopener'},'Open-Meteo'),' и служба мониторинга атмосферы Copernicus (CAMS).')),
    h('div',{class:'air-art',html:AIR_ART})
  ));
  return sec;
}

function gameSection(){
  // on phones the park is portrait: the start screen fits and items are bigger under the finger
  const narrow = window.innerWidth < 640;
  const W = narrow ? 480 : 760, H = narrow ? 640 : 440;
  const cv = h('canvas',{width:W,height:H,tabindex:'0','aria-label':'Игровое поле: собирайте мусор и относите в контейнеры'});
  const ctx = cv.getContext('2d');
  const over = h('div',{class:'g-over'});
  const hud = h('div',{class:'stats',style:'margin-bottom:12px'});
  let G = null, raf = 0, last = 0, keys = {}, C = null;
  const bw = narrow ? 84 : 124, gap = (W - bw*5)/6;
  const bins = BINS.map((b,i)=>Object.assign({}, b, {x:gap+i*(bw+gap), y:12, w:bw, h:74}));
  function tok(){ const cs = getComputedStyle(document.documentElement); const g = (n,f)=>cs.getPropertyValue(n).trim()||f;
    return {sand:g('--sand-deep','#D9CBAE'), soft:g('--soft','#E3DAC5'), ink:g('--ink','#232A1E'), moss:g('--moss','#3A6234'), leaf:g('--leaf','#86A85C'), stone:g('--stone','#8D9187'), stoneHi:g('--stone-hi','#C9CCC2'), paper:g('--paper','#EDE6D6'), clay:g('--clay','#AD5E39'), sun:g('--sun','#C9932E')}; }
  function deco(){ const a=[]; for(let i=0;i<14;i++) a.push({x:Math.random()*W, y:120+Math.random()*(H-130), r:6+Math.random()*14, t:Math.random()<.45?'grass':'stone'}); return a; }
  function spawn(){ if (G.items.length >= 8) return; const [k,n] = LITTER[Math.random()*LITTER.length|0];
    G.items.push({k, n, x:40+Math.random()*(W-80), y:140+Math.random()*(H-180), r:(Math.random()-.5)*1.4}); }
  function start(){
    C = tok();
    G = {t:60, score:0, ok:0, bad:0, items:[], fx:[], p:{x:W/2, y:H-50, carry:null, face:1, walk:0}, target:null, spawnT:0, cool:0, msg:null, msgT:0, deco:deco()};
    for (let i=0;i<5;i++) spawn();
    over.hidden = true; cv.focus(); last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  function finish(){
    const best = Math.max(STATS.gameBest||0, G.score), rec = G.score > (STATS.gameBest||0) && G.score > 0;
    if (rec){ STATS.gameBest = G.score; saveStats(); }
    G.over = true; paintOver(rec);
  }
  function loop(t){
    if (!cv.isConnected){ G = null; return; }
    const dtm = Math.min(0.05, (t-last)/1000); last = t;
    update(dtm); draw();
    if (G && !G.over) raf = requestAnimationFrame(loop);
  }
  function update(d){
    G.t -= d; if (G.t <= 0){ G.t = 0; finish(); return; }
    const p = G.p, sp = 230; let vx = 0, vy = 0;
    if (keys.ArrowLeft||keys.KeyA) vx -= 1; if (keys.ArrowRight||keys.KeyD) vx += 1;
    if (keys.ArrowUp||keys.KeyW) vy -= 1; if (keys.ArrowDown||keys.KeyS) vy += 1;
    if (vx||vy){ G.target = null; } else if (G.target){ const dx = G.target.x-p.x, dy = G.target.y-p.y, L = Math.hypot(dx,dy); if (L < 4) G.target = null; else { vx = dx/L; vy = dy/L; } }
    const L = Math.hypot(vx,vy) || 1;
    if (vx||vy){ p.x += vx/L*sp*d; p.y += vy/L*sp*d; p.walk += d*10; if (vx) p.face = vx>0?1:-1; }
    p.x = Math.max(16, Math.min(W-16, p.x)); p.y = Math.max(118, Math.min(H-14, p.y));
    if (!p.carry){
      for (let i=0;i<G.items.length;i++){ const it = G.items[i]; if (Math.hypot(it.x-p.x, it.y-(p.y-10)) < 30){ p.carry = it; G.items.splice(i,1); break; } }
    }
    G.cool = Math.max(0, G.cool-d);
    if (p.carry && G.cool === 0){
      const b = bins.find(b=>p.x > b.x-6 && p.x < b.x+b.w+6 && p.y-44 < b.y+b.h);
      if (b){
        if (b.k === p.carry.k){ G.score += 10; G.ok++; G.fx.push({x:p.x, y:p.y-70, txt:'+10', c:C.moss, life:1}); p.carry = null; G.msg = null; }
        else { G.score = Math.max(0, G.score-5); G.bad++; G.cool = 1; const right = BINS.find(x=>x.k===p.carry.k).l;
          G.fx.push({x:p.x, y:p.y-70, txt:'−5', c:C.clay, life:1}); G.msg = '«'+p.carry.n+'» — это '+right.toLowerCase(); G.msgT = 3; }
      }
    }
    G.spawnT -= d; if (G.spawnT <= 0){ spawn(); G.spawnT = 1.5; }
    G.fx.forEach(f=>{ f.y -= 40*d; f.life -= d; }); G.fx = G.fx.filter(f=>f.life>0);
    if (G.msgT > 0){ G.msgT -= d; if (G.msgT <= 0) G.msg = null; }
    paintHud();
  }
  function rr(x,y,w,h_,r){ ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x,y,w,h_,r) : ctx.rect(x,y,w,h_); }
  function drawItem(it, x, y, rot){
    ctx.save(); ctx.translate(x,y); ctx.rotate(rot||0);
    if (it.k==='plastic'){ ctx.fillStyle='#9FD3E6'; rr(-7,-14,14,26,5); ctx.fill(); ctx.fillStyle='#2F7FB0'; ctx.fillRect(-4,-19,8,6); ctx.fillStyle='rgba(255,255,255,.6)'; ctx.fillRect(-4,-9,3,14); }
    else if (it.k==='paper'){ ctx.fillStyle='#EFE6CF'; ctx.fillRect(-13,-10,26,20); ctx.strokeStyle='#8A7B5C'; ctx.lineWidth=1.5; for(let i=-5;i<=5;i+=5){ ctx.beginPath(); ctx.moveTo(-9,i); ctx.lineTo(9,i); ctx.stroke(); } if (it.n.includes('Картон')){ ctx.fillStyle='#C89B62'; ctx.fillRect(-13,-10,26,20); ctx.strokeStyle='#8E6A3D'; ctx.strokeRect(-13,-10,26,20); ctx.beginPath(); ctx.moveTo(-13,-3); ctx.lineTo(13,-3); ctx.stroke(); } }
    else if (it.k==='glass'){ ctx.fillStyle='rgba(98,166,120,.85)'; rr(-9,-12,18,24,6); ctx.fill(); ctx.fillStyle='#4C5A50'; ctx.fillRect(-7,-16,14,5); ctx.fillStyle='rgba(255,255,255,.5)'; ctx.fillRect(-5,-7,3,12); }
    else if (it.k==='metal'){ ctx.fillStyle='#B9C0C6'; rr(-8,-12,16,24,3); ctx.fill(); ctx.fillStyle= it.n.includes('газир') ? '#D2483A' : '#6E7A84'; ctx.fillRect(-8,-5,16,10); ctx.fillStyle='#8D959C'; ctx.fillRect(-8,-13,16,3); }
    else { ctx.fillStyle='#2B2B2B'; ctx.fillRect(-6,-12,12,24); ctx.fillStyle='#D9A933'; ctx.fillRect(-6,-12,12,8); ctx.fillStyle='#bbb'; ctx.fillRect(-2,-15,4,3); }
    ctx.restore();
  }
  function draw(){
    if (!C) C = tok();
    ctx.fillStyle = C.sand; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = C.soft; ctx.fillRect(0,0,W,100);
    if (G) G.deco.forEach(o=>{ if (o.t==='stone'){ ctx.fillStyle=C.stone; ctx.globalAlpha=.55; ctx.beginPath(); ctx.ellipse(o.x,o.y,o.r,o.r*.62,0,0,Math.PI*2); ctx.fill(); ctx.fillStyle=C.stoneHi; ctx.beginPath(); ctx.ellipse(o.x-o.r*.25,o.y-o.r*.2,o.r*.35,o.r*.18,0,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1; }
      else { ctx.strokeStyle=C.leaf; ctx.lineWidth=2; for(let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(o.x+i*4,o.y); ctx.quadraticCurveTo(o.x+i*6,o.y-o.r*.6,o.x+i*9,o.y-o.r); ctx.stroke(); } } });
    const p = G && G.p;
    bins.forEach(b=>{
      const hot = p && p.carry && p.x > b.x-6 && p.x < b.x+b.w+6 && p.y-44 < b.y+b.h+30;
      ctx.fillStyle = 'rgba(0,0,0,.12)'; rr(b.x+4,b.y+8,b.w,b.h,12); ctx.fill();
      ctx.fillStyle = b.c; rr(b.x,b.y,b.w,b.h,12); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.18)'; rr(b.x,b.y,b.w,16,[12,12,0,0]); ctx.fill();
      if (hot){ ctx.strokeStyle = C.ink; ctx.lineWidth = 3; rr(b.x-2,b.y-2,b.w+4,b.h+4,14); ctx.stroke(); }
      ctx.fillStyle = '#fff'; ctx.font = (narrow ? '800 13px' : '800 15px')+' Nunito, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.l, b.x+b.w/2, b.y+b.h/2+6);
    });
    if (!G) return;
    G.items.forEach(it=>{ ctx.fillStyle='rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(it.x,it.y+12,12,4,0,0,Math.PI*2); ctx.fill(); drawItem(it,it.x,it.y,it.r); });
    // player
    const sw = Math.sin(p.walk)*5;
    ctx.fillStyle='rgba(0,0,0,.16)'; ctx.beginPath(); ctx.ellipse(p.x,p.y+2,15,5,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#3B3A36'; ctx.lineWidth=5; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(p.x-5,p.y-16); ctx.lineTo(p.x-5+sw,p.y); ctx.moveTo(p.x+5,p.y-16); ctx.lineTo(p.x+5-sw,p.y); ctx.stroke();
    ctx.fillStyle = C.moss; rr(p.x-12,p.y-42,24,28,9); ctx.fill();
    ctx.strokeStyle='#F0C8A6'; ctx.lineWidth=4;
    ctx.beginPath(); if (p.carry){ ctx.moveTo(p.x-11,p.y-38); ctx.lineTo(p.x-8,p.y-60); ctx.moveTo(p.x+11,p.y-38); ctx.lineTo(p.x+8,p.y-60); } else { ctx.moveTo(p.x-12,p.y-36); ctx.lineTo(p.x-15,p.y-20-sw*.4); ctx.moveTo(p.x+12,p.y-36); ctx.lineTo(p.x+15,p.y-20+sw*.4); } ctx.stroke();
    ctx.fillStyle='#E9C46F'; ctx.beginPath(); ctx.arc(p.x,p.y-52,12,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#F3CFAF'; ctx.beginPath(); ctx.arc(p.x+p.face*1.5,p.y-50,9.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#E9C46F'; ctx.beginPath(); ctx.ellipse(p.x-p.face*2,p.y-58,11,5,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#2C2A27'; ctx.beginPath(); ctx.arc(p.x+p.face*4.5,p.y-50,1.6,0,Math.PI*2); ctx.fill();
    if (p.carry) drawItem(p.carry, p.x, p.y-76, 0);
    G.fx.forEach(f=>{ ctx.globalAlpha=Math.max(0,f.life); ctx.fillStyle=f.c; ctx.font='800 22px Nunito, system-ui, sans-serif'; ctx.textAlign='center'; ctx.fillText(f.txt,f.x,f.y); ctx.globalAlpha=1; });
    if (G.msg){ ctx.font=(narrow ? '700 14px' : '700 16px')+' Nunito, system-ui, sans-serif'; const tw = ctx.measureText(G.msg).width+28; ctx.fillStyle=C.paper; rr(W/2-tw/2,H-46,tw,32,16); ctx.fill(); ctx.fillStyle=C.clay; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(G.msg,W/2,H-30); }
    else if (p.carry){ ctx.font='700 14px Nunito, system-ui, sans-serif'; ctx.fillStyle=C.ink; ctx.globalAlpha=.75; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('Несёте: '+p.carry.n, W/2, H-24); ctx.globalAlpha=1; }
  }
  let hudKey = '';
  function paintHud(){
    const s = G ? Math.ceil(G.t) : 60, key = s+'|'+(G?G.score:0)+'|'+(G?G.ok:0)+'|'+STATS.gameBest;
    if (key === hudKey) return; hudKey = key;
    hud.replaceChildren(
      h('div',null,h('b',null,'0:'+String(s).padStart(2,'0')),h('span',null,'осталось')),
      h('div',null,h('b',null,G?G.score:0),h('span',null,'очков')),
      h('div',null,h('b',null,G?G.ok:0),h('span',null,'рассортировано')),
      h('div',null,h('b',null,STATS.gameBest||0),h('span',null,'ваш рекорд')));
  }
  function paintOver(rec){
    over.hidden = false;
    if (!G || !G.over){
      over.replaceChildren(h('div',null, h('h3',{style:'font-size:30px'},'Эко-уборка'),
        h('p',null,'Соберите мусор в парке и отнесите каждый предмет в правильный контейнер. Верно: +10 очков, ошибка: −5. На всё 60 секунд.'),
        h('p',{class:'hint'},'Компьютер: стрелки или ', h('span',{class:'kbd'},'W'),h('span',{class:'kbd'},'A'),h('span',{class:'kbd'},'S'),h('span',{class:'kbd'},'D'),'. Телефон: нажмите на место, куда идти.'),
        h('button',{type:'button',class:'btn',onclick:start},'Начать игру')));
    } else {
      over.replaceChildren(h('div',null, h('div',{class:'eyebrow'}, rec ? 'Новый рекорд!' : 'Время вышло'), h('div',{class:'big'},G.score),
        h('p',null,'Верно рассортировано: ',G.ok,'. Ошибок: ',G.bad,'.'),
        h('p',{class:'hint'}, G.ok >= 15 ? 'Вы настоящий эко-герой!' : G.bad > G.ok ? 'Подсказка: загляните в схему «Начать путь в экологии — легко».' : 'Неплохо! Попробуйте побить рекорд.'),
        h('button',{type:'button',class:'btn',onclick:start},'Ещё раз')));
    }
  }
  const toCanvas = e => { const r = cv.getBoundingClientRect(); return {x:(e.clientX-r.left)*W/r.width, y:(e.clientY-r.top)*H/r.height}; };
  cv.addEventListener('pointerdown', e=>{ if (!G || G.over) return; G.target = toCanvas(e); try{ cv.setPointerCapture(e.pointerId); }catch(_){} });
  cv.addEventListener('pointermove', e=>{ if (G && !G.over && e.buttons) G.target = toCanvas(e); });
  const KEYS = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS'];
  const kd = e=>{ if (!cv.isConnected){ window.removeEventListener('keydown',kd); window.removeEventListener('keyup',ku); return; }
    if (G && !G.over && KEYS.includes(e.code)){ const tg = e.target; if (tg && /INPUT|TEXTAREA|SELECT/.test(tg.tagName)) return; keys[e.code] = true; e.preventDefault(); } };
  const ku = e=>{ keys[e.code] = false; };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  window.addEventListener('blur', ()=>{ keys = {}; });
  requestAnimationFrame(()=>{ C = tok(); draw(); });
  paintHud(); paintOver(false);
  live(paintHud);
  return h('section',{class:'band alt',id:'game'}, h('div',{class:'wrap'},
    sectionHead('Игра','Эко-уборка','Помогите навести порядок в парке: собирайте мусор и относите его в нужный контейнер. Чем быстрее и точнее, тем больше очков.'),
    h('div',{class:'game'},
      h('div',{style:'min-width:0'}, hud, h('div',{class:'g-stage'}, cv, over)),
      h('div',{class:'card'}, h('h3',{style:'font-size:20px'},'Какой контейнер для чего'),
        h('div',{class:'legend'}, BINS.map(b=>h('div',null, h('i',{style:'background:'+b.c}), h('span',null, h('b',null,b.l),': ', LITTER.filter(x=>x[0]===b.k).map(x=>x[1].toLowerCase()).join(', '))))),
        h('p',{class:'hint'},'В реальной жизни цвета контейнеров зависят от города. Смотрите на надписи на баках.'))
    )
  ));
}

/* ---------- eco exam ---------- */
const QUESTIONS = [
  {q:'Что означает цифра 1 в треугольнике из стрелок на дне бутылки?', o:['ПЭТ, самый ходовой пластик для бутылок','ПВХ','Полистирол','Что бутылку можно использовать один раз'], a:0, ex:'Код 1 (PET, ПЭТ) обозначает полиэтилентерефталат. Его принимают почти во всех пунктах приёма.'},
  {q:'Какой из этих пластиков сдать сложнее всего?', o:['♳ 1 PET','♴ 2 HDPE','♸ 3 PVC','♷ 5 PP'], a:2, ex:'ПВХ содержит хлор, при переработке с ним много сложностей, поэтому его принимают редко.'},
  {q:'Можно ли сдать в макулатуру коробку из-под пиццы с жирными пятнами?', o:['Да, целиком','Нет, жирная часть не перерабатывается','Только если она мокрая','Только вместе с остатками еды'], a:1, ex:'Жир мешает переработке бумаги. Чистую крышку коробки можно оторвать и сдать отдельно.'},
  {q:'Куда правильно деть старые батарейки?', o:['В общий мусор','В контейнер для металла','В специальный бокс для батареек','Закопать в землю'], a:2, ex:'В батарейках есть тяжёлые металлы. Боксы для них стоят во многих супермаркетах и магазинах электроники.'},
  {q:'Сколько раз можно перерабатывать стеклянную банку?', o:['Один раз','Три раза','Около десяти раз','Бесконечно, без потери качества'], a:3, ex:'Стекло переплавляется снова и снова, и качество от этого не страдает.'},
  {q:'Куда отправить кассовый чек?', o:['В макулатуру','В общий мусор: это термобумага','В пластик','В стекло'], a:1, ex:'Чеки печатают на термобумаге со специальным покрытием, поэтому в макулатуру они не подходят.'},
  {q:'Сколько энергии экономит переработка алюминиевой банки по сравнению с производством новой?', o:['Около 10%','Около 30%','Около 50%','До 95%'], a:3, ex:'Чтобы получить алюминий из руды, нужно очень много энергии. Переплавка готового металла обходится намного дешевле.'},
  {q:'Что лучше всего сделать с целой, но ненужной одеждой?', o:['Выбросить','Продать, обменять или отдать','Сжечь на даче','Порезать на тряпки сразу'], a:1, ex:'Повторное использование лучше переработки: вещь служит дальше, а новую не нужно производить.'},
  {q:'Что из этого НЕЛЬЗЯ сдавать вместе со стеклянной тарой?', o:['Банку из-под огурцов','Бутылку из-под сока','Разбитое зеркало','Флакон из-под духов из стекла'], a:2, ex:'Зеркала, оконное стекло, посуда и лампочки отличаются по составу от тары и портят сырьё.'},
  {q:'Как подготовить пластиковую бутылку к сдаче?', o:['Оставить с остатками напитка','Ополоснуть и сплющить','Разрезать на мелкие кусочки','Покрасить'], a:1, ex:'Чистую сплющенную бутылку легче везти и перерабатывать. Крышки обычно собирают отдельно.'},
  {q:'Что означает маркировка PAP 20?', o:['Гофрокартон','Полиэтилен','Алюминий','Стекло'], a:0, ex:'PAP 20 означает гофрированный картон, PAP 21 обычный картон, PAP 22 бумагу.'},
  {q:'У какой еды обычно самый маленький углеродный след?', o:['Говядина','Сезонные местные овощи','Фрукты, привезённые самолётом','Сыр'], a:1, ex:'Овощи растят без больших затрат и не везут издалека. У говядины и сыра след в разы больше.'},
  {q:'Чем полезна стирка при 30 °C?', o:['Ничем','Экономит энергию и бережёт ткань','Убивает всю одежду','Нужна только для шерсти'], a:1, ex:'Большая часть энергии при стирке уходит на нагрев воды. Современные порошки хорошо работают и в прохладной.'},
  {q:'Что делать с перегоревшей энергосберегающей лампой?', o:['Выбросить в общий мусор','Сдать в пункт приёма опасных отходов','Разбить и выбросить','Сдать вместе со стеклом'], a:1, ex:'В таких лампах есть ртуть. Их принимают экоцентры и некоторые магазины.'},
  {q:'Куда сдавать пакет из-под сока (тетрапак)?', o:['В бумагу вместе с газетами','В отдельный приём многослойной упаковки','В стекло','В металл'], a:1, ex:'Тетрапак склеен из картона, пластика и фольги. Его перерабатывают отдельно, и принимают его не везде.'},
  {q:'Что такое микропластик?', o:['Пластик для маленьких деталей','Частицы пластика меньше 5 мм','Пластик, который быстро разлагается','Название переработанного пластика'], a:1, ex:'Микропластик появляется при износе синтетики и упаковки. Он попадает в воду, почву и еду.'}
];
const LESSONS = [
  ['Маркировка упаковки',['Треугольник из стрелок с цифрой: 1 PET и 2 HDPE принимают почти везде, 5 PP часто.','3 PVC и 6 PS принимают редко, 7 OTHER почти не перерабатывается.','PAP 20–22: бумага и картон. GL 70–72: стекло. ALU 41 и FE 40: металл.']],
  ['Что не перерабатывается',['Чеки, бумажные стаканчики, грязная и жирная бумага.','Зеркала, посуда и оконное стекло вместе с тарой.','Сильно загрязнённая упаковка: перед сдачей её стоит ополоснуть.']],
  ['Опасные отходы',['Батарейки и аккумуляторы: в специальные боксы.','Ртутные градусники и энергосберегающие лампы: в экоцентры.','Лекарства, краски и бытовая химия: в пункты приёма опасных отходов.']]
];
function shuffle(a){ a = a.slice(); for (let i=a.length-1;i>0;i--){ const j = Math.random()*(i+1)|0; [a[i],a[j]] = [a[j],a[i]]; } return a; }
function examSection(){
  const box = h('div',{class:'qbox','aria-live':'polite'});
  let S = null;
  function start(){ S = {qs:shuffle(QUESTIONS).slice(0,10).map(q=>Object.assign({}, q, {order:shuffle(q.o.map((_,i)=>i))})), i:0, score:0, picked:null}; paint(); box.scrollIntoView({block:'start'}); }
  function finish(){
    if (S.score > (STATS.examBest||0)) STATS.examBest = S.score;
    if (S.score >= 8 && !STATS.examPassed) STATS.examPassed = Date.now();
    saveStats();
  }
  const examPoints = () => ((COM.growthRules.find(r=>r.key==='exam_passed')||{}).points) || 30;
  function certPreview(score){
    const who = COM.me ? COM.me.nick : 'Ваше имя';
    return h('div',{class:'cert ex-cert'},
      h('div',{class:'seal'}, score ? score+'/10' : '8+'), h('div',{class:'eyebrow'},'Сертификат DashaBotanika'),
      h('h3',{style:'font-size:26px'},'Эко-знаток'),
      h('p',{class:'hand',style:'font-size:30px;line-height:1;color:var(--moss)'}, who),
      h('p',{class:'muted',style:'font-size:14px'}, score ? 'Экзамен сдан '+new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}) : 'выдаётся за 8 верных ответов из 10'));
  }
  function paint(){
    if (!S){
      const passed = Object.values(COM.members).filter(m=>(m.examBest||0) >= 8).length;
      box.replaceChildren(h('div',{class:'ex-start'},
        h('div',{style:'display:grid;gap:14px'},
          h('div',{class:'eyebrow'},'Эко-тест · 3 минуты'),
          h('h3',{class:'ex-title'},'Насколько вы эко? Проверьте себя!'),
          h('p',{class:'muted'},'10 коротких вопросов о переработке, маркировке и экологичном быте. После каждого ответа — объяснение, так что вы точно узнаете что-то новое, даже если ошибётесь.'),
          h('div',{class:'ex-perks'},
            [['⏱','3 минуты'],['❓','10 вопросов'],['🎓','Именной сертификат'],['🌱','+'+examPoints()+' очков роста']].map(([ic,t])=>h('span',{class:'ex-perk'}, h('span',{'aria-hidden':'true'},ic), t))),
          STATS.examBest ? h('p',{class:'ex-best'}, STATS.examPassed ? '🎓 Вы уже эко-знаток: ' : 'Ваш лучший результат: ', STATS.examBest,' из 10', STATS.examPassed ? '. Попробуйте ответить на все 10!' : '. До сертификата совсем немного!') : null,
          passed ? h('p',{class:'hint'},'Уже ', passed,' ', plural(passed,'участник получил','участника получили','участников получили'),' сертификат') : null,
          h('div',null, h('button',{type:'button',class:'btn ex-go',onclick:start}, STATS.examBest ? 'Пройти ещё раз →' : 'Начать тест →'))),
        certPreview(0)));
      return;
    }
    if (S.i >= S.qs.length){
      const pass = S.score >= 8;
      box.replaceChildren(pass
        ? h('div',{class:'ex-result'}, h('div',{class:'ex-confetti','aria-hidden':'true'}, ['🎉','🌿','✨','🌍','🎉','🌱','✨'].map((c,i)=>h('span',{style:'--i:'+i},c))),
            h('div',{class:'eyebrow'},'Поздравляем! Экзамен сдан'), certPreview(S.score),
            h('p',{style:'font-weight:700'}, accState()==='member' ? 'Сертификат и +'+examPoints()+' очков роста — уже в вашем кабинете.' : 'Зарегистрируйтесь, чтобы сохранить сертификат и получить +'+examPoints()+' очков роста.'))
        : h('div',{style:'display:grid;gap:10px'}, h('div',{class:'eyebrow'},'Почти получилось!'), h('h3',{class:'ex-title'},S.score,' из 10'),
            h('p',{class:'muted'},'Для сертификата нужно 8 верных ответов. Загляните в короткие уроки и попробуйте снова — вопросы каждый раз немного другие.')),
        h('div',{style:'display:flex;gap:8px;flex-wrap:wrap'+(pass ? ';justify-content:center' : '')}, h('button',{type:'button',class:'btn',onclick:start},'Пройти ещё раз'),
          accState()==='signedout' ? h('button',{type:'button',class:'btn ghost',onclick:()=>openAccount('register')},'Сохранить результат в кабинете') : h('a',{class:'btn ghost',href:'/kabinet'},'В кабинет')));
      return;
    }
    const q = S.qs[S.i], done = S.picked !== null, right = done && S.picked===q.a;
    box.replaceChildren(
      h('div',{style:'display:flex;justify-content:space-between;gap:12px;font-weight:800;font-size:14px;color:var(--muted)'}, h('span',null,'Вопрос ',S.i+1,' из ',S.qs.length), h('span',null,'Верно: ',S.score)),
      h('div',{class:'prog'}, h('i',{style:'width:'+((S.i+(done?1:0))/S.qs.length*100)+'%'})),
      h('h3',{style:'font-size:22px'},q.q),
      h('div',{class:'opts'}, q.order.map(oi=>h('button',{type:'button',class:'opt'+(done ? (oi===q.a?' right':oi===S.picked?' wrong':'') : ''),disabled:done,onclick:()=>{ S.picked = oi; if (oi===q.a) S.score++; paint(); }}, q.o[oi]))),
      done ? h('p',{class:'explain'}, h('b',null, right ? '🌿 Верно! ' : '🤔 Не совсем. '), q.ex) : null,
      done ? h('div',null,h('button',{type:'button',class:'btn',onclick:()=>{ S.i++; S.picked=null; if (S.i>=S.qs.length) finish(); paint(); }}, S.i+1>=S.qs.length ? 'Узнать результат' : 'Следующий вопрос →')) : null
    );
  }
  paint();
  live(()=>{ if (!S) paint(); });
  return h('section',{class:'band',id:'exam'}, h('div',{class:'wrap'},
    sectionHead('Эко-экзамен','Тест по экологии с сертификатом','Проверьте, как хорошо вы разбираетесь в переработке и экологичном быте, и получите именной сертификат эко-знатока.'),
    box,
    h('div',{class:'ex-lessons'}, h('h3',{style:'font-size:20px'},'Хотите подготовиться? Три коротких урока'), h('p',{class:'hint'},'Необязательно, но так сертификат точно ваш. Каждый урок — полминуты чтения.'),
      h('div',{class:'grid g3'}, LESSONS.map(([t,pts],i)=>h('details',{class:'how'}, h('summary',null,'Урок ',i+1,'. ',t), h('ul',null,pts.map(x=>h('li',null,x)))))))
  ));
}

/* ---------- edit mode: Dasha edits the content record in PocketBase ---------- */
let CONTENT = { id:null, data:null };
function markDirty(){ EDIT.dirty = true; const s=document.getElementById('save-state'); if(s) s.textContent='Есть несохранённые изменения'; }
function editBar(){
  return h('div',{class:'editbar edit-only'}, h('div',{class:'wrap'},
    h('span',{id:'save-state',style:'font-weight:700'}, EDIT.dirty?'Есть несохранённые изменения':'Режим редактирования: добавляйте и удаляйте карточки, меняйте фото'),
    h('div',{style:'display:flex;gap:8px;flex-wrap:wrap'},
      h('button',{type:'button',class:'btn ghost',onclick:()=>{ if(EDIT.dirty){ STATE=JSON.parse(JSON.stringify(CONTENT.data || JSON.parse(DATA_EL.textContent))); normalize(); EDIT.dirty=false; } setEditing(false); render(); }},'Отменить'),
      h('button',{type:'button',class:'btn',id:'save-btn',onclick:saveSite},'Сохранить изменения')
    )
  ));
}
function setEditing(on){ EDIT.on=on; document.body.classList.toggle('editing',on); }
function mountEditButton(){
  const slot = document.getElementById('edit-slot');
  if (!slot || !EDIT.can || EDIT.on) return;
  slot.replaceChildren(h('button',{type:'button',class:'btn ghost small',onclick:()=>{ setEditing(true); render(); }},'Редактировать сайт'));
}
function toast(msg){ const n = document.querySelectorAll('.toast').length; const t=h('div',{class:'toast',role:'status',style:n ? 'margin-bottom:'+(n*54)+'px' : null},msg); document.body.append(t); setTimeout(()=>t.remove(),2600); }
async function saveSite(){
  const btn = document.getElementById('save-btn');
  if (!EDIT.can || !CONTENT.id){ toast('Сохранять может только редактор сайта'); return; }
  for (const k of ['cafes','market']) STATE[k].forEach(it=>{ if (it.example && it._touched) delete it.example; });
  btn.disabled = true; btn.textContent = 'Сохраняю…';
  try{
    const r = await pb.collection('content').update(CONTENT.id, {data:STATE});
    CONTENT.data = JSON.parse(JSON.stringify(r.data));
    EDIT.dirty = false; setEditing(false); render(); toast('Сохранено');
  }catch(e){
    writeErr(e);
    btn.disabled = false; btn.textContent = 'Сохранить изменения';
  }
}

render();

/* ---------- connect to the backend ---------- */
(async ()=>{
  try{ const w = sessionStorage.getItem('db-welcome'); if (w){ sessionStorage.removeItem('db-welcome'); setTimeout(()=>toast(w), 400); } }catch(e){}
  window.addEventListener('hashchange', routeHash);
  if (!pb){ COM.ready = true; refresh(); return; }
  try{
    const c = await pb.collection('content').getFirstListItem('key="site"',{requestKey:null});
    CONTENT = { id:c.id, data:JSON.parse(JSON.stringify(c.data)) };
    if (!EDIT.on){ STATE = c.data; normalize(); render(); }
  }catch(e){}
  watch('characters',{sort:'sort'}, l=>{ COM.characters = l; });
  watch('levels',{sort:'rank'}, l=>{ COM.levels = l; });
  watch('growth_rules',{sort:'sort'}, l=>{ COM.growthRules = l; });
  watch('likes',{fields:'id,user,target'}, l=>{ COM.likes = l; });
  watch('services',{sort:'name'}, l=>{ COM.services = l; });
  const auth = pb.authStore;
  if (auth.isValid && auth.record && auth.record.collectionName==='users'){
    try{ await pb.collection('users').authRefresh({requestKey:null}); }catch(e){ if (e && (e.status===401 || e.status===404)) auth.clear(); }
  }
  const rec = auth.isValid && auth.record && auth.record.collectionName==='users' ? auth.record : null;
  if (rec){
    COM.uid = rec.id; COM.me = memberOf(rec); COM.verified = !!rec.verified; COM.email = rec.email || '';
    COM.admin = MOD_ROLES.includes(rec.role); COM.owner = rec.role==='admin'; EDIT.can = COM.admin;
    STATS.examBest = Math.max(STATS.examBest||0, rec.exam_best||0);
    STATS.gameBest = Math.max(STATS.gameBest||0, rec.game_best||0);
    STATS.examPassed = STATS.examPassed || (rec.exam_passed ? +rec.exam_passed || rec.exam_passed : null);
    if (STATS.examBest > (rec.exam_best||0) || STATS.gameBest > (rec.game_best||0)) saveStats();
  }
  COM.ready = true;
  render();
  let myLevel = COM.me ? COM.me.level : 0, myXp = COM.me ? COM.me.xp : 0;
  watch('users',{fields:'id,collectionId,name,created,character,custom_emoji,custom_name,level,level_history,role,leaves,xp,stage,exam_best,verified'}, l=>{
    const m = {}; l.forEach(r=>{ if (r.role!=='writer' || r.id===COM.uid) m[r.id] = memberOf(r); }); // the article helper is not a dweller
    COM.members = m;
    if (COM.uid && m[COM.uid]){
      COM.me = m[COM.uid];
      if (COM.me.level > myLevel && myLevel){ toast('Ваш персонаж вырос: новый уровень «'+levelName(COM.me.level)+'»! Сертификат — в кабинете'); }
      myLevel = COM.me.level;
      if (COM.me.xp > myXp && myXp) toast('+'+(COM.me.xp-myXp)+' к росту персонажа');
      myXp = COM.me.xp;
    }
  });
  watch('reviews',{sort:'-created'}, l=>{ COM.reviews = l.map(r=>({id:r.id, author:r.author, rating:r.rating, text:r.text, ts:tsOf(r)})); });
  watch('comments',{sort:'created'}, l=>{ COM.comments = l.map(r=>({id:r.id, target:r.target, author:r.author, text:r.text, ts:tsOf(r)})); });
  watch('listings',{sort:'-created'}, l=>{ COM.listings = l.map(listingOf); });
  if (COM.uid){
    watch('chats',{}, l=>{ const m = {}; l.forEach(r=>{ m[r.id] = threadOf(r); }); COM.threads = m; });
    watch('feedback',{sort:'-created'}, l=>{ COM.feedback = l.map(feedbackOf); });
    pb.collection('reads').getFullList({fields:'article',requestKey:null}).then(l=>{ l.forEach(r=>{ COM.reads[r.article] = true; }); COM.readsLoaded = true; refresh(); }).catch(()=>{});
    if (COM.admin) watch('presence',{}, l=>{ const m = {}; l.forEach(r=>{ m[r.user] = Date.parse(String(r.last_seen).replace(' ','T')) || 0; }); COM.presence = m; });
    startPresence();
    if (COM.admin) watch('drafts',{sort:'-created'}, l=>{ COM.drafts = l; });
    watch('referrals',{}, l=>{ COM.refs = l; });
    watch('reports',{sort:'-created'}, l=>{ COM.myReports = l.filter(r=>r.reporter===COM.uid).map(r=>r.comment); COM.reports = l; });
    loadProfile();
    watch('suggestions',{sort:'-created'}, l=>{ COM.sugg = l.map(r=>({id:r.id, author:r.author, kind:r.kind, title:r.title, text:r.text, status:r.status||'', ts:tsOf(r)})); });
    try{
      const hr = await pb.collection('habits').getFirstListItem(pb.filter('owner = {:o}',{o:COM.uid}),{requestKey:null});
      habRec = hr.id;
      const d = hr.data;
      if (d && Array.isArray(d.habits)){ HAB = JSON.parse(JSON.stringify(d)); lsWrite(); challengesSection.repaint && challengesSection.repaint(); }
    }catch(e){ habReady = true; if (e && e.status===404 && stored) saveHabits(); }
    habReady = true;
  }
  refresh();
  routeHash();
  if (location.hash && !/^#(cert|verify|reset|email)\//.test(location.hash)) scrollToHash(location.hash);
})();
})();
