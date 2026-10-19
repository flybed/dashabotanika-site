
(function(){
"use strict";
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
const NAV = [['/#world','Мир'],['/#calc','Переработка'],['/eko-test','Эко-тест'],['/tovary','Товары'],['/#fashion','Мода'],['/#food','Еда'],['/#cafes','Кафе'],['/baraholka','Барахолка'],['/#journal','Журнал'],['/#feedback','Обратная связь']];

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
  ['Бульон из очистков','30 минут',['Складывайте в пакет в морозилке луковую шелуху, морковные хвостики, стебли петрушки и укропа.','Когда наберётся полный пакет, залейте 2 л воды, добавьте лавровый лист и перец горошком.','Варите 40 минут на слабом огне и процедите. Бульон хранится в холодильнике до 4 дней.']],
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
  const path = currentPath(), page = PAGES[path];
  document.title = page.title;
  SEC_H1 = false;
  app.replaceChildren(
    h('header',{class:'top'}, h('div',{class:'wrap'},
      h('a',{class:'logo',href:'/',html:LOGO+'<span>DashaBotanika</span>'}),
      h('span',{style:'flex:1'}),
      accountButton(),
      siteMenu(path)
    )),
    h('main',null, ...page.render()),
    h('footer',null, h('div',{class:'wrap'},
      h('span',null,'© ', new Date().getFullYear(), ' · ', 'DashaBotanika', ' · Разумный человек — счастливая планета'),
      h('span',{id:'edit-slot'})
    )),
    editBar()
  );
  mountEditButton();
}

/* burger menu: all sections in a drop-down list, plus cabinet and sign-out */
function siteMenu(path){
  const btn = h('button',{type:'button',class:'burger','aria-label':'Меню','aria-expanded':'false','aria-controls':'site-menu'}, h('span'),h('span'),h('span'));
  const tail = h('div',{class:'menu-tail'});
  const panel = h('nav',{class:'menu',id:'site-menu','aria-label':'Разделы сайта',hidden:true},
    NAV.map(([href,t])=>h('a',{href,'aria-current':href===path?'page':null},t)), tail);
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
      h('p',{class:'hero-intro'},'Без занудства и чувства вины, о простых шагах, которые делают жизнь вкуснее, красивее и чище. Посчитайте пользу от переработки, сыграйте в эко-уборку, сдайте эко-экзамен и загляните на барахолку.'),
      h('div',{class:'chips'}, [['/#game','Сыграть в эко-уборку'],['/eko-test','Сдать эко-экзамен'],['/#calc','Посчитать пользу'],['/kabinet','Мой эко-челлендж']].map(([href,t])=>h('a',{class:'chip',href},t)))
    ),
    heroArt()
  ));
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
function photoImg(id, alt, fallbackHTML){
  const img = h('img',{src:photoURL(id), alt, loading:'lazy'});
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
      const fd = new FormData(); fd.append('file', f); fd.append('uploaded_by', COM.uid);
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
    h('div',{class:'pebble'}, id ? photoImg(id, STATE.about.name||'Фото', CAIRN_SCENE) : h('div',{html:CAIRN_SCENE,style:'width:100%;height:100%'})),
    h('div',{html:STONES,style:'display:contents'}),
    h('div',{html:SPRIG,style:'display:contents'}),
    id && STATE.about.name ? h('span',{class:'caption'},STATE.about.name) : null,
    uploadBtn(id ? 'Заменить фото' : 'Загрузить фото Даши', nid=>{ STATE.photos.hero = nid; }, 'upl')
  );
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
    h('div',{class:'howto'},
      h('h3',{style:'margin-bottom:14px'},'Как это делать'),
      MATERIALS.map(m=>h('details',{class:'how'}, h('summary',null, h('span',null,m.name, h('span',{class:'mark'},m.mark))), h('ul',null,m.tips.map(t=>h('li',null,t)))))
    ),
    h('p',{class:'note'},'Цифры ориентировочные: усреднённые оценки экономии выбросов и энергии при переработке по сравнению с производством из первичного сырья. Реальная польза зависит от региона и того, как устроена переработка. Маркировку ищите на упаковке: треугольник из стрелок с цифрой или буквенный код.')
  ));
}

/* ---------- habits ---------- */
function habitsSection(){
  const box = h('div',{class:'habits'});
  function paint(){
    const days = [...Array(7)].map((_,i)=>{ const d=new Date(weekStart); d.setDate(d.getDate()+i); return d; });
    const today = iso(new Date());
    let weekTotal = 0;
    days.forEach(d=>{ weekTotal += (HAB.log[iso(d)]||[]).length; });
    let streak = 0; const c = new Date(); c.setHours(0,0,0,0);
    if (!(HAB.log[iso(c)]||[]).length) c.setDate(c.getDate()-1);
    while ((HAB.log[iso(c)]||[]).length){ streak++; c.setDate(c.getDate()-1); }
    const max = HAB.habits.length*7 || 1;
    const fmtD = d => d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
    const nameInput = h('input',{id:'habit-new',placeholder:'Своя привычка, например «Без доставки на этой неделе»',maxlength:'60'});
    const add = ()=>{ const v=nameInput.value.trim(); if(!v) return; HAB.habits.push({id:'u'+uid(),name:v,custom:true}); saveHabits(); paint(); };
    nameInput.addEventListener('keydown',e=>{ if(e.key==='Enter') add(); });
    box.replaceChildren(
      h('div',{class:'hbar'},
        h('div',{class:'stats'},
          h('div',null,h('b',null,weekTotal),h('span',null,'листочков за неделю')),
          h('div',null,h('b',null,Math.round(weekTotal/max*100),'%'),h('span',null,'от максимума')),
          h('div',null,h('b',null,streak),h('span',null,'дней подряд'))
        ),
        h('div',{class:'weeknav'},
          h('button',{type:'button',class:'btn ghost small','aria-label':'Предыдущая неделя',onclick:()=>{weekStart.setDate(weekStart.getDate()-7);paint();}},'←'),
          h('span',{style:'font-variant-numeric:tabular-nums'},fmtD(days[0]),' — ',fmtD(days[6])),
          h('button',{type:'button',class:'btn ghost small','aria-label':'Следующая неделя',onclick:()=>{weekStart.setDate(weekStart.getDate()+7);paint();}},'→')
        )
      ),
      h('table',{class:'hgrid'},
        h('thead',null,h('tr',null,h('th',{style:'text-align:left'},'Привычка'), days.map((d,i)=>h('th',{class:iso(d)===today?'today':null},DOW[i],h('br'),d.getDate())))),
        h('tbody',null, HAB.habits.map(hb=>h('tr',null,
          h('td',null, hb.name, hb.custom ? h('button',{type:'button',class:'x',title:'Удалить привычку','aria-label':'Удалить «'+hb.name+'»',onclick:()=>{ HAB.habits=HAB.habits.filter(x=>x.id!==hb.id); saveHabits(); paint(); }},'×') : null),
          days.map(d=>{ const k=iso(d), on=(HAB.log[k]||[]).includes(hb.id);
            return h('td',null,h('button',{type:'button',class:'cell'+(on?' on':''),'aria-pressed':on?'true':'false','aria-label':hb.name+', '+DOW[(d.getDay()+6)%7]+' '+d.getDate(),html:on?LEAF:'',style:on?'color:var(--moss)':null,onclick:()=>{
              const arr = new Set(HAB.log[k]||[]); arr.has(hb.id)?arr.delete(hb.id):arr.add(hb.id);
              if (arr.size) HAB.log[k]=[...arr]; else delete HAB.log[k];
              saveHabits(); paint();
            }})); })
        )))
      ),
      h('div',{class:'addrow'}, nameInput, h('button',{type:'button',class:'btn',onclick:add},'Добавить привычку'))
    );
  }
  paint();
  habitsSection.repaint = paint;
  return h('section',{class:'band alt',id:'habits'}, h('div',{class:'wrap'},
    sectionHead('Образ жизни','Эко-челлендж недели','Отмечайте листочком каждый день, когда получилось. Отметки видите только вы, они сохраняются в этом браузере, а после входа — в личном кабинете и считаются для вашего эко-уровня.'),
    box
  ));
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
  if (!pb || !COM.uid || COM.reads[articleId]) return;
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
function journalSection(){
  const items = STATE.articles;
  const fmtDate = s => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}); };
  return h('section',{class:'band alt',id:'journal'}, h('div',{class:'wrap'},
    sectionHead('Журнал','Новости и статьи','Заметки об экологичной жизни. Есть тема или новость? Предложите её в личном кабинете, лучшие появятся здесь.'),
    h('div',{style:'margin:-12px 0 24px'}, h('button',{type:'button',class:'btn ghost small',onclick:()=>openAccount('suggest')},'Предложить новость или статью')),
    items.length ? h('div',{class:'grid g3'}, items.map(it=>{
      let open = false;
      const body = h('div',{class:'art-body',hidden:true}, it.body);
      const more = h('button',{type:'button',class:'linkish',style:'justify-self:start','aria-expanded':'false'},'Читать полностью');
      more.addEventListener('click',()=>{ open=!open; body.hidden=!open; more.textContent=open?'Свернуть':'Читать полностью'; more.setAttribute('aria-expanded',String(open)); if (open) markRead(it.id); });
      return h('article',{class:'card'},
        delBtn('articles',it.id),
        h('div',{style:'display:flex;gap:10px;align-items:center;flex-wrap:wrap'}, h('span',{class:'tag'},it.cat||'Статья'), h('span',{class:'date'},fmtDate(it.date))),
        h('h3',{style:'font-size:22px'},it.title),
        h('p',{class:'muted',style:'font-size:15px'},it.lead),
        it.by ? h('p',{class:'hint'},'Идею предложил участник: ', nameSpan(it.by)) : null,
        body, h('div',{style:'display:flex;gap:12px;align-items:center;flex-wrap:wrap'}, more, likeBtn('articles:'+it.id)),
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
        STATE.photos.gallery.length ? h('div',{class:'gallery'}, STATE.photos.gallery.map(gid=>h('figure',null, photoImg(gid,'Фото из жизни '+(a.name||'')),
          h('button',{type:'button',class:'x edit-only',title:'Убрать фото','aria-label':'Убрать фото',onclick:()=>{ STATE.photos.gallery = STATE.photos.gallery.filter(x=>x!==gid); markDirty(); render(); }},'×')))) : null,
        uploadBtn('Добавить фото в галерею', nid=>{ STATE.photos.gallery.push(nid); }),
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
    h('div',{class:'form edit-only'}, h('div',{class:'fields'},editInputs), h('label',{for:'contact-note'},'Подпись над контактами',note))
  ));
}

/* ---------- pages: real addresses for every page, no reloads between them ---------- */
const PAGES = {
  '/': {title:'DashaBotanika — эко: еда, быт, мода, образ жизни', render:()=>homePage()},
  '/kabinet': {title:'Личный кабинет — DashaBotanika', render:()=>cabinetPage()},
  '/tovary': {title:'Товары, которые делают мир чище — DashaBotanika', render:()=>{ SEC_H1 = true; return [goodsSection(false)]; }},
  '/baraholka': {title:'Барахолка: отдать, обменять, продать — DashaBotanika', render:()=>{ SEC_H1 = true; return [marketSection()]; }},
  '/eko-test': {title:'Эко-экзамен с сертификатом — DashaBotanika', render:()=>{ SEC_H1 = true; return [examSection()]; }},
};
let SEC_H1 = false, PAGE_UNSUBS = [];
function currentPath(){ const p = location.pathname.replace(/\/+$/,'') || '/'; return PAGES[p] ? p : '/'; }
function scrollToHash(hash){
  const el = hash && hash.length > 1 && !/^#(cert|verify|reset|email)\//.test(hash) ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
  if (el) el.scrollIntoView(); else window.scrollTo(0,0);
}
function go(url){
  const u = new URL(url, location.origin);
  const changed = (u.pathname.replace(/\/+$/,'') || '/') !== currentPath() || u.search !== location.search;
  closeModal();
  history.pushState(null,'',u.pathname+u.search+u.hash);
  if (changed) render();
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
window.addEventListener('popstate', ()=>{ closeModal(); render(); scrollToHash(location.hash); });

function homePage(){
  return [hero(), calcSection(), examTeaser(), worldSection(), goodsSection(true), gameSection(), fashionSection(), foodSection(), cafesSection(), marketTeaser(), helperSection(), journalSection(), feedbackSection(), aboutSection(), contactsSection()];
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
const COM = { uid:null, admin:false, owner:false, ready:false, me:null, members:{}, presence:{}, growthRules:[], likes:[], reads:{}, reviews:[], comments:[], feedback:[], listings:[], threads:{}, sugg:[], levels:[], characters:[] };
let LIVE = [], MODAL_LIVE = [];
function live(fn){ LIVE.push(fn); fn(); return fn; }
function mlive(fn){ MODAL_LIVE.push(fn); fn(); return fn; }
function refresh(){ for (const f of LIVE.concat(MODAL_LIVE)){ try{ f(); }catch(e){} } }
function accState(){
  if (!COM.ready) return 'loading';
  return COM.uid && COM.me ? 'member' : 'signedout';
}
function memberOf(r){ return {nick:r.name||'Участник', joined:tsOf(r), character:r.character||'', level:r.level||1, role:r.role||'member', history:Array.isArray(r.level_history) ? r.level_history : [], leaves:r.leaves||0, xp:r.xp||0, stage:r.stage||1}; }
function nameOf(id){ const m = COM.members[id]; return (m && m.nick) || 'Участник'; }
function charOf(id){ return COM.characters.find(c=>c.id===id) || null; }
function emojiOf(memberId){ const m = COM.members[memberId]; const c = m && charOf(m.character); return c ? c.emoji : '🌱'; }
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
        canDelete(c.author) ? h('button',{type:'button',class:'x',title:'Удалить комментарий','aria-label':'Удалить комментарий',onclick:()=>delDoc('comments',c.id)},'×') : null),
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
        fl.forEach(x=>fd.append('photos', x));
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
      h('div',{style:'white-space:pre-line'},m.text))) : [h('p',{class:'hint'},'Напишите, когда и где удобно встретиться, задайте вопросы о вещи.')]));
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
      h('div',{style:'min-width:0'}, h('b',null,t.title), h('div',{class:'hint'}, iAmSeller ? 'Покупатель: ' : 'Продавец: ', partnerName(t)))),
    actions, msgs, f,
    h('p',{class:'hint'},'Сайт не принимает оплату. Договоритесь о передаче и способе оплаты напрямую. Не отправляйте здесь паспортные и банковские данные: переписку видят модераторы.')
  ];
}
let MODAL_UNSUBS = [];

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
      if (fl) fd.append('photo', fl);
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
      h('div',{class:'meta'}, isUnread(t) ? h('span',{class:'status accepted'},'Новое') : null, h('span',null, t.buyer===COM.uid ? 'Вы покупаете' : 'Вас спрашивают'), h('span',null,dt(t.last_at))),
      h('b',null,t.title), h('span',{class:'hint'},'Собеседник: ',partnerName(t)))
  ) : [h('p',{class:'hint'},'Сообщений пока нет. Нажмите «Хочу купить» или «Хочу забрать» на любой вещи в барахолке.')]));
}
function paintModeration(el){
  const pend = pendingListings();
  el.replaceChildren(...(pend.length ? pend.map(it=>{
    const reason = h('input',{maxlength:'200',placeholder:'Причина отказа (увидит автор)','aria-label':'Причина отказа'});
    const set = data => write('listings/'+it.id, ()=>pb.collection('listings').update(it.id, data));
    return h('div',{class:'li'},
      it.photo ? h('img',{src:it.photo,alt:'',style:'width:120px;aspect-ratio:4/3;object-fit:cover;border-radius:8px'}) : null,
      h('div',{class:'meta'}, h('span',{class:'status'},it.kind), h('b',null,nameOf(it.seller)), h('span',null,dt(it.ts)), h('span',null,priceLabel(it))),
      h('b',null,it.title),
      h('div',{style:'font-size:14px;white-space:pre-line'}, [it.condition && 'Состояние: '+it.condition, it.city && 'Где: '+it.city, it.note].filter(Boolean).join('\n')),
      h('div',{class:'cm-form',style:'flex-wrap:wrap'},
        h('button',{type:'button',class:'btn small',onclick:()=>set({moderation:'approved', reason:''}).then(()=>toast('Опубликовано')).catch(writeErr)},'Опубликовать'),
        reason,
        h('button',{type:'button',class:'btn ghost small',onclick:()=>set({moderation:'rejected', reason:reason.value.trim().slice(0,200)}).then(()=>toast('Отклонено')).catch(writeErr)},'Отклонить')));
  }) : [h('p',{class:'hint'},'Новых объявлений на проверку нет.')]));
}
function paintPeople(el){
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
        h('div',{class:'hint'}, seenLabel(seen(id)), ' · с нами с ', dt(m.joined)),
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
const leavesTotal = () => Object.values(HAB.log||{}).reduce((a,v)=>a+(v?v.length:0),0);
const postsCount = () => COM.reviews.filter(r=>r.author===COM.uid).length + COM.comments.filter(c=>c.author===COM.uid).length + COM.feedback.filter(f=>f.author===COM.uid).length;

/* ---------- character growth ("tamagotchi") ---------- */
/* one progress line: growth points lead the character through the levels; every level gives a certificate */
function growthBlock(){
  const me = COM.me; if (!me) return null;
  const cur = levelOf(me.level), next = levelOf(me.level+1);
  const from = cur ? cur.min_xp||0 : 0, to = next ? next.min_xp||0 : from;
  const pct = next ? Math.max(0, Math.min(100, Math.round((me.xp-from)/((to-from)||1)*100))) : 100;
  const ch = charOf(me.character), em = ch ? ch.emoji : '🌱';
  const have = {min_leaves:Math.max(me.leaves||0, leavesTotal()), min_exam:STATS.examBest||0, min_game:STATS.gameBest||0, min_reviews:postsCount()};
  const extra = next ? [['min_leaves','эко-листочков в трекере'],['min_exam','баллов на эко-экзамене (из 10)'],['min_game','очков в игре «Эко-уборка»'],['min_reviews','комментариев и сообщений Даше']]
    .filter(([k])=>(next[k]||0) > 0).map(([k,l])=>h('div',{class:'lvl-row'+(have[k]>=next[k]?' ok':'')}, h('span',null, have[k]>=next[k] ? '✓ ' : '', l), h('b',null, Math.min(have[k],next[k]),' / ',next[k]))) : [];
  const certs = me.history.filter(x=>x.rank<=me.level).sort((a,b)=>a.rank-b.rank);
  return h('div',{class:'grow'},
    h('div',{class:'grow-pet st-'+me.level},
      h('div',{class:'grow-aura','aria-hidden':'true'}),
      h('span',{class:'grow-em',role:'img','aria-label':(ch ? ch.name : 'Персонаж')+', уровень «'+levelName(me.level)+'»'}, em),
      h('div',{class:'grow-deco','aria-hidden':'true'}, ['','','🌱','🌿','🌳','✨'][me.level] || '')),
    h('div',{class:'grow-info'},
      h('div',{class:'eyebrow'},'Развивайте своего персонажа'),
      h('h2',{style:'font-size:clamp(26px,4vw,36px)'}, (ch ? ch.name : 'Персонаж'),' — ', levelName(me.level)),
      cur && cur.description ? h('p',{class:'muted'}, cur.description) : null,
      h('div',{class:'grow-steps'}, COM.levels.map(l=>h('div',{class:'grow-step'+(l.rank<=me.level?' on':'')+(l.rank===me.level?' now':''),title:l.name+(l.min_xp ? ' — от '+l.min_xp+' очков роста' : '')},
        h('span',{style:'font-size:'+(14+l.rank*4)+'px','aria-hidden':'true'}, em), h('small',null,l.name)))),
      h('div',{class:'grow-bar'}, h('i',{style:'width:'+pct+'%'})),
      h('p',{class:'hint',style:'font-weight:800'}, next ? 'Очки роста: '+me.xp+' из '+to+' до уровня «'+next.name+'»' : 'Очки роста: '+me.xp+'. Это высший уровень — вы эко-эксперт!'),
      extra.length ? h('div',{class:'lvl-next'}, h('div',{class:'hint',style:'font-weight:800'},'Ещё для уровня «',next.name,'»:'), extra) : null,
      certs.length ? h('div',null, h('div',{class:'hint',style:'font-weight:800;margin-bottom:6px'},'Мои сертификаты'),
        h('div',{style:'display:flex;gap:8px;flex-wrap:wrap'}, certs.map(x=>h('a',{class:'chip',href:'#cert/'+COM.uid+'/'+x.rank},'🎓 ',levelName(x.rank))))) : null,
      h('details',{class:'grow-how',open:true},
        h('summary',null,'Как растёт ваш персонаж'),
        h('ul',null, COM.growthRules.filter(r=>r.points>0).map(r=>h('li',null, h('b',null,'+',r.points), ' ', r.title, r.per ? h('span',{class:'hint'},' — ',r.per) : null))),
        h('p',{class:'hint'},'За каждый новый уровень — именной сертификат. Скоро добавим новые способы расти; чем выше уровень, тем крупнее ваш персонаж в «Счастливом мире».'))));
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
      h('div',{class:'seal',style:'font-size:30px'}, ch ? ch.emoji : '🌱'),
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
const WORLD_BG = '<svg viewBox="0 0 1000 420" preserveAspectRatio="none" aria-hidden="true">'+
  '<defs><linearGradient id="wsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:color-mix(in srgb,var(--sun) 22%,var(--surface))"/><stop offset="1" style="stop-color:var(--surface)"/></linearGradient></defs>'+
  '<rect width="1000" height="420" fill="url(#wsky)"/>'+
  '<circle cx="860" cy="70" r="38" style="fill:var(--sun)" opacity=".75"/>'+
  '<path d="M0 170 Q160 110 320 160 T640 150 T1000 140 V420 H0Z" style="fill:var(--leaf)" opacity=".35"/>'+
  '<path d="M0 210 Q220 160 460 205 T1000 190 V420 H0Z" style="fill:var(--leaf)" opacity=".55"/>'+
  '<path d="M0 260 Q250 230 520 262 T1000 250 V420 H0Z" style="fill:var(--moss)" opacity=".35"/>'+
  '<path d="M640 420 C600 360 700 330 650 290 S700 250 760 262" style="stroke:color-mix(in srgb,#3E78B2 55%,var(--surface));fill:none;stroke-width:26;stroke-linecap:round" opacity=".7"/>'+
  '<g style="fill:var(--moss)" opacity=".55"><path d="M80 210 l18-48 18 48z"/><path d="M110 216 l14-38 14 38z"/><path d="M905 200 l18-50 18 50z"/><path d="M935 206 l13-34 13 34z"/></g>'+
  '</svg>';
function worldSection(){
  const box = h('div',{class:'world'});
  const count = h('p',{class:'muted',style:'margin-top:12px'});
  const cta = h('div',{style:'margin-top:14px'});
  let lastKey = null;
  live(()=>{
    const ids = Object.keys(COM.members).filter(id=>COM.members[id].character)
      .sort((a,b)=>(COM.members[a].role==='admin')===(COM.members[b].role==='admin') ? COM.members[a].joined-COM.members[b].joined : COM.members[a].role==='admin' ? -1 : 1);
    const key = ids.map(id=>id+COM.members[id].character+COM.members[id].nick+COM.members[id].level).join()+COM.characters.length+COM.levels.map(l=>l.name).join()+'|'+COM.uid;
    if (key === lastKey) return; lastKey = key;
    const n = ids.length;
    box.replaceChildren(h('div',{html:WORLD_BG,style:'position:absolute;inset:0'}), ...ids.map((id,i)=>{
      const m = COM.members[id];
      const r = Math.sqrt(i/(n+1)), a = i*2.39996;
      const x = 50 + Math.cos(a)*r*44, y = 68 + Math.sin(a)*r*24;
      const label = m.nick+' · '+levelName(m.level);
      return h('div',{class:'dweller st-'+(m.level||1)+(i===0?' first':'')+(id===COM.uid?' me':''),style:'left:'+x.toFixed(1)+'%;top:'+y.toFixed(1)+'%',title:label,'aria-label':label,tabindex:'0'},
        h('span',{class:'em'}, emojiOf(id)), n <= 40 || i===0 || id===COM.uid ? h('span',{class:'nm'}, m.nick) : null);
    }));
    count.textContent = n ? 'Жителей в мире: '+n+'. Первой поселилась Даша — слон. Каждый новый участник выбирает себе животное или растение и появляется здесь.' : 'Мир скоро оживёт: первой поселится Даша — слон.';
    cta.replaceChildren(accState()==='member' ? h('p',{class:'hint'},'Вы здесь: ', emojiOf(COM.uid),' ',COM.me.nick,'. Растите в уровнях — и мир будет расти вместе с вами.') : h('button',{type:'button',class:'btn',onclick:()=>openAccount('register')},'Поселиться в мире'));
  });
  return h('section',{class:'band alt',id:'world'}, h('div',{class:'wrap'},
    sectionHead('Счастливый мир','Наш эко-мир','Каждый участник — животное или растение. Чем больше нас, тем живее мир.'),
    box, count, cta
  ));
}

/* ---------- smart helper (AI) — in development ---------- */
function helperSection(){
  const cards = [
    ['🥗','Фото еды','Загрузите фото тарелки — помощник подскажет, как сделать блюдо полезнее, и посчитает, сколько воды и углеродного следа вы сэкономили.'],
    ['♻️','Фото упаковки','Сфотографируйте упаковку — узнаете, куда её сдать, нужно ли мыть, и получите идеи, как использовать её дома повторно.'],
    ['🍽️','Рецепты под диету','Конструктор питания соберёт рацион под вашу цель — экология, похудение, здоровье — и предложит рецепты.']
  ];
  return h('section',{class:'band',id:'helper'}, h('div',{class:'wrap'},
    sectionHead('Умный помощник','Эко-помощник на основе ИИ','Скоро здесь можно будет загрузить фото и получить совет. Раздел в разработке.'),
    h('div',{class:'grid g3'}, cards.map(([ic,t,d])=>h('article',{class:'card'},
      h('div',{style:'display:flex;justify-content:space-between;align-items:center'}, h('span',{style:'font-size:34px','aria-hidden':'true'},ic), h('span',{class:'tag',style:'background:var(--sun);color:#2A1C05'},'В разработке')),
      h('h3',{style:'font-size:20px'},t), h('p',{class:'muted',style:'font-size:15px;flex:1'},d),
      h('button',{type:'button',class:'btn ghost small',disabled:'',style:'align-self:flex-start;opacity:.6;cursor:not-allowed'},'Скоро')
    )))
  ));
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

function characterPicker(name, selected){
  const box = h('div',{class:'chars',role:'radiogroup','aria-label':'Ваш персонаж'});
  const paint = ()=>box.replaceChildren(...COM.characters.map(c=>h('label',{class:'char'+(c.id===box.value?' on':'')},
    h('input',{type:'radio',name,value:c.id,checked:c.id===box.value?'':null,onchange:()=>{ box.value = c.id; paint(); }}),
    h('span',{class:'em','aria-hidden':'true'},c.emoji), h('span',null,c.name))));
  box.value = selected || '';
  paint();
  return box;
}
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
    const pass = h('input',{id:'rg-pass',type:'password',autocomplete:'new-password',minlength:'8',required:''});
    const nick = h('input',{id:'rg-nick',maxlength:'30',placeholder:'Например, Лиза из Москвы',autocomplete:'nickname',required:''});
    const pick = characterPicker('rg-char');
    const btn = h('button',{type:'submit',class:'btn'},'Зарегистрироваться');
    const f = h('form',{class:'form',style:'margin:0;border-style:solid;border-color:var(--line)'},
      h('div',{class:'fields'}, h('label',{for:'rg-email'},'Почта',email), h('label',{for:'rg-pass'},'Пароль (от 8 символов)',pass)),
      h('label',{for:'rg-nick'},'Как вас подписывать',nick),
      h('div',null, h('div',{style:'font-weight:700;margin-bottom:6px'},'Кем вы будете в «Счастливом мире»?'), pick),
      h('p',{class:'hint'},'Имя и персонажа видят все посетители сайта. Почту не видит никто.'),
      h('div',null,btn));
    f.addEventListener('submit', async e=>{ e.preventDefault();
      const v = nick.value.trim();
      if (v.length < 2){ nick.focus(); toast('Имя должно быть не короче двух букв'); return; }
      if (pass.value.length < 8){ pass.focus(); toast('Пароль — минимум 8 символов'); return; }
      if (!pick.value){ toast('Выберите животное или растение'); return; }
      btn.disabled = true;
      try{
        await pb.collection('users').create({email:email.value.trim(), password:pass.value, passwordConfirm:pass.value, name:v.slice(0,30), character:pick.value, emailVisibility:false});
        await pb.collection('users').authWithPassword(email.value.trim(), pass.value);
        pb.collection('users').requestVerification(email.value.trim()).catch(()=>{});
        done('Добро пожаловать, '+v+'! Вы появились в «Счастливом мире»');
      }catch(err){
        btn.disabled = false;
        const d = err && err.response && err.response.data || {};
        toast(d.email ? 'Эта почта уже зарегистрирована или указана неверно' : d.password ? 'Пароль слишком простой или короткий' : 'Не получилось зарегистрироваться, проверьте поля');
      }
    });
    return [h('p',null,'В личном кабинете хранятся ваши эко-привычки, уровень и сертификаты, результаты экзамена и игры. Ещё можно оставлять отзывы, комментировать, выставлять вещи на барахолку и предлагать статьи.'), f];
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
    h('h1',{class:'cab-name'}, tab==='register' ? 'Регистрация' : 'Вход'),
    h('p',{class:'lead'},'В кабинете — ваш эко-челлендж недели, уровень и сертификаты, вещи на барахолке и переписка. А ещё вы появитесь в «Счастливом мире».'),
    authForms(tab),
    h('p',{class:'hint'},'Без входа можно пользоваться калькулятором, играть и сдавать экзамен — результаты сохранятся в этом браузере.')))];
  return [cabinetHead(), habitsSection(), cabinetTabs(tab, tid)];
}
function cabinetHead(){
  const head = h('div',{class:'cab-head'}), grow = h('div'), stats = h('div');
  live(()=>{
    const me = COM.me; if (!me) return;
    head.replaceChildren(h('div',{class:'mono cab-ava','aria-hidden':'true'}, emojiOf(COM.uid)),
      h('div',{style:'flex:1;min-width:0'}, h('div',{class:'eyebrow'},'Личный кабинет'), h('h1',{class:'cab-name'},me.nick), h('div',{class:'hint'}, levelName(me.level),' · с нами с ', dt(me.joined))),
      h('button',{type:'button',class:'btn ghost small cab-logout',onclick:logout},'Выйти'));
    grow.replaceChildren(growthBlock() || '');
    stats.replaceChildren(statsRow());
  });
  const verify = !COM.verified && COM.email ? h('div',{class:'card',style:'padding:12px 14px;gap:6px'},
    h('b',null,'Подтвердите почту'),
    h('p',{class:'hint'},'Мы отправили письмо на ',COM.email,'. Подтверждённая почта нужна, чтобы восстановить пароль, если вы его забудете.'),
    h('div',null, h('button',{type:'button',class:'btn ghost small',onclick:e=>{ const b = e.currentTarget; b.disabled = true; b.textContent = 'Отправляю…';
      pb.collection('users').requestVerification(COM.email).then(()=>{ b.textContent = 'Письмо отправлено ✓'; toast('Письмо отправлено, проверьте почту и папку «Спам»'); },()=>{ b.disabled = false; b.textContent = 'Отправить письмо ещё раз'; toast('Не получилось отправить письмо, попробуйте позже'); }); }},'Отправить письмо ещё раз'))) : null;
  return h('section',{class:'band',id:'cabinet'}, h('div',{class:'wrap',style:'display:grid;gap:18px'}, head, verify, grow, stats));
}
function cabinetTabs(tab, tid){
  let cur = tab || (unreadCount() ? 'chats' : 'things'), lastKey = null, openTid = tid || null, tabBtns = {};
  const openThread = id=>{ openTid = id; paint(true); };
  const body = h('div',{style:'display:grid;gap:16px'});
  const lists = {};
  function build(){
    const me = COM.me;
    const tabs = [['things','Мои вещи'],['chats','Сообщения'],['suggest','Предложить'],['mine','Мои комментарии'],['settings','Настройки']]
      .concat(COM.admin ? [['moder','Модерация'],['fb','Обратная связь'],['inbox','Предложения']] : []).concat(COM.owner ? [['people','Участники'],['levels','Уровни и рост']] : []);
    if (!tabs.some(([k])=>k===cur)) cur = 'things';
    tabBtns = {};
    const out = [
      h('div',{class:'tabs',role:'tablist'}, tabs.map(([k,l])=>{ const b = h('button',{type:'button',role:'tab','aria-selected':String(k===cur),'data-l':l,onclick:()=>{ cur=k; openTid=null; history.replaceState(null,'','/kabinet?tab='+k); paint(true); }},l); tabBtns[k]=b; return b; }))
    ];
    if (cur==='things') out.push(...thingsPanel(lists));
    if (cur==='chats'){ if (openTid && COM.threads[openTid]) out.push(...threadView(openTid, ()=>{ openTid=null; paint(true); })); else { lists.chats = h('div',{class:'list'}); out.push(lists.chats); } }
    if (cur==='moder'){ lists.moder = h('div',{class:'list'}); out.push(h('p',{class:'muted'},'Объявления участников появляются в барахолке только после вашего одобрения.'), lists.moder); }
    if (cur==='people'){ lists.people = h('div',{class:'list'}); out.push(h('p',{class:'muted'},'Модераторы проверяют объявления, видят предложения и обратную связь и могут редактировать сайт.'), lists.people); }
    if (cur==='settings'){
      const nick = h('input',{id:'acc-nick',maxlength:'30',value:me.nick});
      const f = h('form',{class:'cm-form'}, nick, h('button',{type:'submit',class:'btn small'},'Сохранить имя'));
      f.addEventListener('submit',e=>{ e.preventDefault(); const v=nick.value.trim(); if(v.length<2) return;
        pb.collection('users').update(COM.uid,{name:v.slice(0,30)}).then(()=>toast('Имя обновлено')).catch(writeErr); });
      const pick = characterPicker('acc-char', me.character);
      const cf = h('form',{style:'display:grid;gap:8px'}, pick, h('div',null,h('button',{type:'submit',class:'btn ghost small'},'Сменить персонажа')));
      cf.addEventListener('submit',e=>{ e.preventDefault(); if (!pick.value || pick.value===me.character) return;
        pb.collection('users').update(COM.uid,{character:pick.value}).then(()=>toast('Персонаж обновлён')).catch(writeErr); });
      out.push(
        h('label',{for:'acc-nick',class:'hint',style:'font-weight:800'},'Имя на сайте'), f,
        h('div',{class:'hint',style:'font-weight:800'},'Мой персонаж в «Счастливом мире»'), cf,
        h('div',null, h('button',{type:'button',class:'btn ghost small',onclick:logout},'Выйти из аккаунта')));
    }
    if (cur==='suggest'){
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
      out.push(h('p',{class:'muted'},'Даша читает все предложения. Лучшие появятся в журнале с подписью автора.'), f, h('h3',{style:'font-size:18px'},'Мои предложения'), lists.mySugg);
    }
    if (cur==='mine'){ lists.mine = h('div',{class:'list'}); out.push(lists.mine); }
    if (cur==='levels') out.push(...levelsAdminPanel());
    if (cur==='fb'){ lists.fb = h('div',{class:'list'}); out.push(h('p',{class:'muted'},'Замечания и предложения участников. Видите только вы и модераторы; ваш ответ автор увидит в разделе «Обратная связь».'), lists.fb); }
    if (cur==='inbox'){ lists.inbox = h('div',{class:'list'}); out.push(h('p',{class:'muted'},'Предложения участников видите только вы и модераторы.'), lists.inbox); }
    return out;
  }
  const statusLabel = s => s==='accepted' ? 'В журнале' : s==='declined' ? 'Не подошло' : 'На рассмотрении';
  function paintLists(){
    if (lists.things && lists.things.isConnected) paintThings(lists.things);
    if (lists.chats && lists.chats.isConnected) paintChats(lists.chats, openThread);
    if (lists.moder && lists.moder.isConnected) paintModeration(lists.moder);
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
    badge('chats', unreadCount()); badge('moder', COM.admin ? pendingListings().length : 0); badge('inbox', COM.admin ? COM.sugg.filter(s=>!s.status).length : 0); badge('fb', COM.admin ? COM.feedback.filter(f=>!f.status).length : 0);
  }
  live(()=>paint(false));
  return h('section',{class:'band',id:'cabinet-tabs'}, h('div',{class:'wrap'}, body));
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
    if (st==='member'){ const n = unreadCount() + (COM.admin ? pendingListings().length + COM.feedback.filter(f=>!f.status).length : 0); b.replaceChildren(...[h('span',{class:'dot','aria-hidden':'true'},emojiOf(COM.uid)), 'Кабинет', n ? h('span',{class:'status',style:'background:var(--sun);color:#2A1C05'},n) : null].filter(Boolean)); }
    else b.replaceChildren('Войти');
  });
  return b;
}

/* ---------- game: eco clean-up ---------- */
const BINS = [{k:'plastic',l:'Пластик',c:'#E0AE36'},{k:'paper',l:'Бумага',c:'#3E78B2'},{k:'glass',l:'Стекло',c:'#3B8F55'},{k:'metal',l:'Металл',c:'#858D95'},{k:'battery',l:'Батарейки',c:'#C0533D'}];
const LITTER = [['plastic','Бутылка ПЭТ'],['plastic','Флакон от шампуня'],['paper','Газета'],['paper','Картонная коробка'],['glass','Стеклянная банка'],['glass','Бутылка из стекла'],['metal','Банка из-под газировки'],['metal','Консервная банка'],['battery','Батарейка']];
function gameSection(){
  const W = 760, H = 440;
  const cv = h('canvas',{width:W,height:H,tabindex:'0','aria-label':'Игровое поле: собирайте мусор и относите в контейнеры'});
  const ctx = cv.getContext('2d');
  const over = h('div',{class:'g-over'});
  const hud = h('div',{class:'stats',style:'margin-bottom:12px'});
  let G = null, raf = 0, last = 0, keys = {}, C = null;
  const bw = 124, gap = (W - bw*5)/6;
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
      ctx.fillStyle = '#fff'; ctx.font = '800 15px Nunito, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.l, b.x+b.w/2, b.y+b.h/2+6);
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
    if (G.msg){ ctx.font='700 16px Nunito, system-ui, sans-serif'; const tw = ctx.measureText(G.msg).width+28; ctx.fillStyle=C.paper; rr(W/2-tw/2,H-46,tw,32,16); ctx.fill(); ctx.fillStyle=C.clay; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(G.msg,W/2,H-30); }
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
        h('p',{class:'hint'}, G.ok >= 15 ? 'Вы настоящий эко-герой!' : G.bad > G.ok ? 'Подсказка: загляните в памятку «Как это делать» в калькуляторе.' : 'Неплохо! Попробуйте побить рекорд.'),
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
  function start(){ S = {qs:shuffle(QUESTIONS).slice(0,10).map(q=>Object.assign({}, q, {order:shuffle(q.o.map((_,i)=>i))})), i:0, score:0, picked:null}; paint(); }
  function finish(){
    if (S.score > (STATS.examBest||0)) STATS.examBest = S.score;
    if (S.score >= 8 && !STATS.examPassed) STATS.examPassed = Date.now();
    saveStats();
  }
  function paint(){
    if (!S){
      box.replaceChildren(h('div',{class:'eyebrow'},'10 вопросов'), h('h3',{style:'font-size:28px'},'Проверьте себя'),
        h('p',{class:'muted'},'Вопросы о переработке, маркировке и экологичном быте. Экзамен сдан, если верных ответов 8 и больше. После каждого ответа будет короткое объяснение, так что это ещё и обучение.'),
        STATS.examBest ? h('p',{style:'font-weight:700'},'Ваш лучший результат: ',STATS.examBest,' из 10', STATS.examPassed ? ', экзамен сдан' : '') : null,
        h('div',null,h('button',{type:'button',class:'btn',onclick:start}, STATS.examBest ? 'Пройти ещё раз' : 'Начать экзамен')));
      return;
    }
    if (S.i >= S.qs.length){
      const pass = S.score >= 8;
      const who = COM.me ? COM.me.nick : '';
      box.replaceChildren(pass ? h('div',{class:'cert'},
          h('div',{class:'seal'},S.score+'/10'), h('div',{class:'eyebrow'},'Сертификат DashaBotanika'),
          h('h3',{style:'font-size:28px'},'Эко-знаток'),
          who ? h('p',{style:'font-weight:800;font-size:18px'},who) : null,
          h('p',{class:'muted'},'Экзамен по экологии и переработке сдан ', new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}),'.'))
        : h('div',{style:'display:grid;gap:10px'}, h('div',{class:'eyebrow'},'Почти получилось'), h('h3',{style:'font-size:28px'},S.score,' из 10'),
          h('p',{class:'muted'},'Для сертификата нужно 8 верных ответов. Загляните в уроки справа и попробуйте снова: вопросы каждый раз немного другие.')),
        h('div',{style:'display:flex;gap:8px;flex-wrap:wrap'}, h('button',{type:'button',class:'btn',onclick:start},'Пройти ещё раз'),
          accState()==='signedout' ? h('button',{type:'button',class:'btn ghost',onclick:()=>openAccount('register')},'Сохранить результат в кабинете') : null));
      return;
    }
    const q = S.qs[S.i], done = S.picked !== null;
    box.replaceChildren(
      h('div',{style:'display:flex;justify-content:space-between;gap:12px;font-weight:800;font-size:14px;color:var(--muted)'}, h('span',null,'Вопрос ',S.i+1,' из ',S.qs.length), h('span',null,'Верно: ',S.score)),
      h('div',{class:'prog'}, h('i',{style:'width:'+((S.i+(done?1:0))/S.qs.length*100)+'%'})),
      h('h3',{style:'font-size:22px'},q.q),
      h('div',{class:'opts'}, q.order.map(oi=>h('button',{type:'button',class:'opt'+(done ? (oi===q.a?' right':oi===S.picked?' wrong':'') : ''),disabled:done,onclick:()=>{ S.picked = oi; if (oi===q.a) S.score++; paint(); }}, q.o[oi]))),
      done ? h('p',{class:'explain'}, h('b',null, S.picked===q.a ? 'Верно! ' : 'Не совсем. '), q.ex) : null,
      done ? h('div',null,h('button',{type:'button',class:'btn',onclick:()=>{ S.i++; S.picked=null; if (S.i>=S.qs.length) finish(); paint(); }}, S.i+1>=S.qs.length ? 'Узнать результат' : 'Следующий вопрос')) : null
    );
  }
  paint();
  live(()=>{ if (!S) paint(); });
  return h('section',{class:'band',id:'exam'}, h('div',{class:'wrap'},
    sectionHead('Эко-экзамен','Обучение и тест по экологии','Сначала пробегитесь по коротким урокам, потом сдайте экзамен и получите сертификат эко-знатока.'),
    h('div',{class:'exam'}, box,
      h('div',{style:'display:grid;gap:8px'}, h('h3',{style:'font-size:20px;margin-bottom:6px'},'Уроки'),
        LESSONS.map(([t,pts],i)=>h('details',{class:'how',open:i===0}, h('summary',null,'Урок ',i+1,'. ',t), h('ul',null,pts.map(x=>h('li',null,x)))))))
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
function toast(msg){ const t=h('div',{class:'toast',role:'status'},msg); document.body.append(t); setTimeout(()=>t.remove(),2600); }
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
  watch('users',{fields:'id,collectionId,name,created,character,level,level_history,role,leaves,xp,stage'}, l=>{
    const m = {}; l.forEach(r=>{ m[r.id] = memberOf(r); });
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
    pb.collection('reads').getFullList({fields:'article',requestKey:null}).then(l=>{ l.forEach(r=>{ COM.reads[r.article] = true; }); }).catch(()=>{});
    if (COM.admin) watch('presence',{}, l=>{ const m = {}; l.forEach(r=>{ m[r.user] = Date.parse(String(r.last_seen).replace(' ','T')) || 0; }); COM.presence = m; });
    startPresence();
    watch('suggestions',{sort:'-created'}, l=>{ COM.sugg = l.map(r=>({id:r.id, author:r.author, kind:r.kind, title:r.title, text:r.text, status:r.status||'', ts:tsOf(r)})); });
    try{
      const hr = await pb.collection('habits').getFirstListItem(pb.filter('owner = {:o}',{o:COM.uid}),{requestKey:null});
      habRec = hr.id;
      const d = hr.data;
      if (d && Array.isArray(d.habits)){ HAB = JSON.parse(JSON.stringify(d)); lsWrite(); habitsSection.repaint && habitsSection.repaint(); }
    }catch(e){ habReady = true; if (e && e.status===404 && stored) saveHabits(); }
    habReady = true;
  }
  refresh();
  routeHash();
  if (location.hash && !/^#(cert|verify|reset|email)\//.test(location.hash)) scrollToHash(location.hash);
})();
})();
