// Готовые HTML-страницы для поисковиков и превью ссылок.
// Caddy отдаёт каждую страницу сайта через /api/seo/page: берём site/index.html, подставляем
// title, description, canonical, Open Graph, JSON-LD и полный текст страницы в <div id="app">.
// Скрипт сайта потом рисует страницу поверх — для людей ничего не меняется,
// а поисковик и Telegram/VK сразу видят текст. Данные всегда свежие: читаются из базы при запросе.

const ORIGIN = "https://dashabotanika.ru"
const SITE = `${__hooks}/../../site`

// Тот же адрес статьи, что строит сайт (site/js/app.js, slugify) — меняйте вместе.
const TR = { а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya" }
function slugify(s) {
  const t = String(s || "").toLowerCase().split("").map((c) => (TR[c] !== undefined ? TR[c] : c)).join("")
  return t.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80)
}
// «в Казани»: предложный падеж для крупных городов (тот же список, что в site/js/app.js, CITY_IN), иначе «— Город»
const CITY_IN = {"Москва":"Москве","Санкт-Петербург":"Санкт-Петербурге","Новосибирск":"Новосибирске","Екатеринбург":"Екатеринбурге","Казань":"Казани","Нижний Новгород":"Нижнем Новгороде",
  "Челябинск":"Челябинске","Красноярск":"Красноярске","Самара":"Самаре","Уфа":"Уфе","Ростов-на-Дону":"Ростове-на-Дону","Омск":"Омске","Краснодар":"Краснодаре","Воронеж":"Воронеже",
  "Пермь":"Перми","Волгоград":"Волгограде","Тюмень":"Тюмени","Саратов":"Саратове","Тольятти":"Тольятти","Ижевск":"Ижевске","Барнаул":"Барнауле","Иркутск":"Иркутске","Хабаровск":"Хабаровске",
  "Ярославль":"Ярославле","Владивосток":"Владивостоке","Томск":"Томске","Оренбург":"Оренбурге","Кемерово":"Кемерове","Калининград":"Калининграде","Сочи":"Сочи","Тула":"Туле","Рязань":"Рязани"}
const inCity = (c) => (CITY_IN[c] ? "в " + CITY_IN[c] : "— " + c)
function approvedServices(app) { try { return app.findRecordsByFilter("services", "status = 'approved'", "name", 500, 0) } catch (e) { return [] } }
// города, у которых есть свои сервисы, — для них есть страница /kuda-sdat/<город>
function serviceCities(app) { return [...new Set(approvedServices(app).map((r) => r.getString("city")).filter((c) => c && c !== "Вся Россия"))] }

function articleSlug(a) { return a.slug || slugify(a.title) || String(a.id) }

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const cut = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s }
const paras = (s) => String(s || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("\n")

// Текст статьи с разметкой (## заголовки, **жирный**, > совет, --- разделитель, списки, ![подпись](фото)) — в HTML для поисковиков.
const okUrl = (u) => /^(https?:\/\/|\/)[^\s()"<>]+$/.test(u)
function mdInline(t) {
  return esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[\s(«])_([^_]+)_/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, x, u) => okUrl(u) ? `<a href="${u}">${x}</a>` : all).replace(/\n/g, "<br>")
}
function mdHtml(src) {
  const out = []
  let para = [], list = null, quote = null
  const flush = () => {
    if (para.length) { out.push(`<p>${mdInline(para.join("\n"))}</p>`); para = [] }
    if (list) { out.push(`<${list.t}>${list.items.map((x) => `<li>${mdInline(x)}</li>`).join("")}</${list.t}>`); list = null }
    if (quote) { out.push(`<aside>${quote.map((x) => `<p>${mdInline(x)}</p>`).join("")}</aside>`); quote = null }
  }
  for (const raw of String(src || "").replace(/\r/g, "").split("\n")) {
    const l = raw.trim()
    let m
    if (!l) { if (para.length || quote) flush(); continue }
    if ((m = l.match(/^(#{1,3})\s+(.+)$/))) { flush(); const t = m[1].length === 3 ? "h3" : "h2"; out.push(`<${t}>${mdInline(m[2])}</${t}>`); continue }
    if (/^(-{3,}|\*{3,}|_{3,}|❦+)$/.test(l)) { flush(); out.push("<hr>"); continue }
    if (/^\[\[darom\]\]$/i.test(l)) { flush(); out.push('<aside><p><b>Вещи даром на DashaBotanika.</b> Отдайте ненужное бесплатно тем, кому оно пригодится, и заберите нужное рядом с домом: <a href="/darom">смотреть вещи даром</a>.</p></aside>'); continue }
    if ((m = l.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/)) && okUrl(m[2])) { flush(); out.push(`<figure><img src="${m[2]}" alt="${esc(m[1].replace(/\s*Фото:.*$/s, "").trim() || m[1])}" loading="lazy">${m[1] ? `<figcaption>${esc(m[1])}</figcaption>` : ""}</figure>`); continue }
    if ((m = l.match(/^>\s?(.*)$/))) { if (para.length || list) { const q = quote; quote = null; flush(); quote = q } (quote = quote || []).push(m[1]); continue }
    const li = l.match(/^\d+[.)]\s+(.+)$/) ? ["ol", l.replace(/^\d+[.)]\s+/, "")] : l.match(/^[-—–•*]\s+(.+)$/) ? ["ul", l.replace(/^[-—–•*]\s+/, "")] : null
    if (li) { if (para.length || quote || (list && list.t !== li[0])) flush(); (list = list || { t: li[0], items: [] }).items.push(li[1]); continue }
    if (list || quote) flush()
    para.push(l)
  }
  flush()
  return out.join("\n")
}
const mdPlain = (s) => String(s || "").replace(/^\s*\[\[darom\]\]\s*$/gim, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*/g, "")
  .replace(/^\s*(#{1,3}|>|[-—–•*]|\d+[.)])\s+/gm, "").replace(/^\s*(-{3,}|❦+)\s*$/gm, "").trim()

// «## Частые вопросы» → «### вопрос» + ответ: то же, что articleFaq в site/js/app.js — для FAQ-разметки
function articleFaq(text) {
  const out = []
  let on = false, q = null, a = []
  const push = () => { if (q && a.length) out.push([q, a.join(" ")]); q = null; a = [] }
  for (const raw of String(text || "").split("\n")) {
    const l = raw.trim(), m = l.match(/^(#{2,3})\s+(.+)$/)
    if (m && m[1] === "##") { push(); on = /частые вопросы|вопросы и ответы/i.test(m[2]); continue }
    if (!on) continue
    if (m) { push(); q = mdPlain(m[2]); continue }
    if (q && l && !/^!\[/.test(l)) a.push(mdPlain(l))
  }
  push()
  return out
}

function read(path) { return toString($os.readFile(path)) }

// Постоянные тексты (советы, ткани, рецепты, вопросы теста) живут в скрипте сайта — берём оттуда.
function constants() {
  const src = read(`${SITE}/js/app.js`)
  const out = {}
  ;["FASHION_TIPS", "FABRICS", "RECIPES", "QUESTIONS", "ECO_LADDER", "NAV_GROUPS", "DISHES", "RECYCLE_PAGES", "MYTHS"].forEach((name) => {
    // DISHES — массив, который дальше превращается в объекты через .map
    const m = src.match(new RegExp(name === "DISHES" ? `const DISHES = (\\[[\\s\\S]*?\\n\\])\\.map` : `const ${name} = (\\[[\\s\\S]*?\\n?\\]);`))
    try { out[name] = m ? new Function(`return ${m[1]}`)() : [] } catch (err) { out[name] = [] }
  })
  out.NAV = out.NAV_GROUPS.reduce((all, g) => all.concat(g[1] || []), [])
  return out
}

function content(app, tpl) {
  try {
    const rec = app.findFirstRecordByFilter("content", "key = 'site'")
    const d = JSON.parse(rec.getString("data") || "null")
    if (d && typeof d === "object") return d
  } catch (err) {}
  const m = tpl.match(/<script type="application\/json" id="site-data">([\s\S]*?)<\/script>/)
  return m ? JSON.parse(m[1]) : {}
}

// Только публичные поля объявления: без дарителя, его почты, переписки, заявок и служебных полей модерации.
function listingOf(r) {
  const file = (f) => `/api/files/${r.collection().id}/${r.id}/${f}`
  return {
    id: r.id, title: r.getString("title").trim(), kind: r.getString("kind"), category: r.getString("category"),
    condition: r.getString("condition").trim(), city: r.getString("city").trim(), district: r.getString("district").trim(),
    pickup: r.getString("pickup").trim(), note: r.getString("note").trim(), status: r.getString("status") || "active",
    lend_days: r.getInt("lend_days"), return_by: r.getString("return_by"), lot: r.getBool("lot"), items: r.getString("items"),
    created: r.getString("created"), updated: r.getString("updated"), gone_at: r.getString("gone_at"),
    // только для правил индексации (дубли одного дарителя) — на страницу не выводится
    _seller: r.getString("seller"),
    photo: r.getString("photo") ? file(r.getString("photo")) : "",
    more: (r.getStringSlice("more_photos") || []).map((f) => file(f)),
  }
}
function listings(app) {
  try {
    return app.findRecordsByFilter("listings", "moderation = 'approved' && status != 'gone' && status != 'archived'", "-created", 300, 0).map(listingOf)
  } catch (err) { return [] }
}
function approvedListing(app, id) {
  try { const r = app.findRecordById("listings", id); return r.getString("moderation") === "approved" ? listingOf(r) : null } catch (err) { return null }
}

// ---------- что попадает в поиск ----------
// Вещь индексируется, только если на её странице есть польза: настоящее название, категория, город и хотя бы одно из
// фото / описание от 40 знаков / состояние. Остальные одобренные вещи видны в каталоге, но с noindex и без карты сайта.
const norm = (s) => String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, " ").trim()
const EMPTY_TITLES = ["вещь", "вещи", "отдам", "отдаю", "отдам даром", "даром", "бесплатно", "разное", "разные вещи", "все", "мелочи", "хлам", "тест", "test", "проверка", "объявление"]
const DAY = 86400000
const ts = (s) => Date.parse(String(s || "").replace(" ", "T")) || 0
// дубли: у одного дарителя одно и то же название за 30 дней — в поиске только последнее;
// одинаковые название и описание с разных аккаунтов за 7 дней — только первое (остальные видят модераторы)
function dupOf(it, pool) {
  const t = norm(it.title), n = norm(it.note)
  return pool.find((x) => x.id !== it.id && norm(x.title) === t && (
    (x._seller === it._seller && ts(x.created) > ts(it.created) && ts(x.created) - ts(it.created) <= 30 * DAY) ||
    (x._seller !== it._seller && n.length >= 20 && norm(x.note) === n && ts(x.created) < ts(it.created) && ts(it.created) - ts(x.created) <= 7 * DAY))) || null
}
function indexable(it, pool) {
  const t = norm(it.title)
  return ["active", "reserved", "lent"].indexOf(it.status) >= 0 &&
    it.title.length >= 8 && /[a-zа-яё]/i.test(it.title) && EMPTY_TITLES.indexOf(t) < 0 &&
    !!it.category && !!it.city && (!!it.photo || it.note.length >= 40 || !!it.condition) && !dupOf(it, pool)
}
const indexableListings = (app) => { const all = listings(app); return all.filter((l) => indexable(l, all)) }
// город — своя страница в поиске, когда в нём от 5 индексируемых вещей и он не повторяет весь каталог
const MIN_PAGE = 5
function cityIndexable(app, city) {
  const idx = indexableListings(app), here = idx.filter((l) => l.city === city).length
  return here >= MIN_PAGE && here < idx.length
}
// для модераторов: возможные дубли с разных аккаунтов (они не попадают в поиск, но в каталоге остаются)
function suspectedDupes(app) {
  const all = listings(app)
  return all.map((l) => { const d = dupOf(l, all); return d && d._seller !== l._seller ? { id: l.id, title: l.title, first: d.id } : null }).filter(Boolean)
}
// Отданная или неактуальная вещь: честный статус и похожие свободные вещи вместо пустоты.
// Отдана меньше 30 дней назад — 200 и noindex; дольше — 410 с той же страницей, без кнопки «Хочу забрать».
// Не одобрена или удалена — 404 (как раньше).
function closedItem(app, id, path, all) {
  const it = approvedListing(app, id)
  if (!it || (it.status !== "gone" && it.status !== "archived")) return null
  const gone = it.status === "gone", since = ts(it.gone_at || it.created)
  const old = gone && Date.now() - since > 30 * DAY
  const pool = all.filter((x) => indexable(x, all))
  const score = (x) => (x.category && x.category === it.category ? 2 : 0) + (x.city && x.city === it.city ? 1 : 0)
  const similar = pool.filter((x) => score(x) > 0).sort((a, b) => score(b) - score(a)).concat(pool.filter((x) => !score(x))).slice(0, 6)
  const label = gone ? "уже отдана" : "объявление неактуально"
  const text = gone ? `Эту вещь уже отдали${since ? " " + ruDate(new Date(since).toISOString()) : ""}.` : "Срок объявления закончился, даритель его пока не продлил."
  return Object.assign({ title: "", description: null, image: null, type: "website", crumbs: null, ld: [] }, {
    status: old ? 410 : 200, noindex: true, robots: "noindex, follow", canonical: path,
    title: `${it.title} — ${label} | DashaBotanika`,
    description: `${text} Посмотрите похожие вещи даром${it.city ? " " + inCity(it.city) : ""} на DashaBotanika.`,
    crumbs: [["Вещи даром", "/darom"], [it.title, path]],
    state: { id: it.id, status: it.status, title: it.title, category: it.category, city: it.city },
    body: `<article class="band"><div class="wrap"><p><a href="/darom">Вещи даром</a></p><h1>${esc(it.title)} — ${label}</h1><p>${esc(text)} ${similar.length ? "Посмотрите похожие — они ещё свободны." : "Загляните в каталог — там есть другие вещи."}</p>` +
      `<dl>${[["Категория", it.category], ["Где", it.city]].filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` +
      (similar.length ? `<h2>Похожие вещи</h2><ul>${similar.map((x) => `<li><a href="/darom/v/${x.id}">${esc(x.title)}</a>${x.city ? " — " + esc(x.city) : ""}</li>`).join("")}</ul>` : "") +
      `<p><a href="/darom">Все вещи даром</a></p></div></article>`,
  })
}
// Страница вещи: заголовок, H1 и описание собираются только из заполненных полей — ничего не додумываем.
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
const ruDate = (s) => { const m = String(s || "").match(/^(\d{4})-(\d\d)-(\d\d)/); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : "" }
const lend = (it) => it.kind === "Одолжу"
// «в Москве» для городов из списка, иначе «, Тула»: склонять любые названия автоматически не возьмёмся
const cityTail = (c) => (c ? (CITY_IN[c] ? " в " + CITY_IN[c] : ", " + c) : "")
function itemTitle(it) {
  const t = `${it.title} ${lend(it) ? "на время" : "бесплатно"}${cityTail(it.city)} — Вещи даром | DashaBotanika`
  return t.length <= 75 ? t : `${it.title} ${lend(it) ? "на время" : "бесплатно"}${cityTail(it.city)} | DashaBotanika`
}
const itemH1 = (it) => `${it.title} — ${lend(it) ? "на время" : "даром"}${it.city ? ", " + it.city : ""}`
// честный статус: забронированная и одолженная вещь не выдаётся за свободную
function itemStatus(it) {
  if (it.status === "reserved") return ["Забронирована", "Даритель уже выбрал получателя. Если вещь не заберут, она перейдёт следующему — можно встать в очередь."]
  if (it.status === "lent") return ["На руках", `Вещь сейчас у другого участника${it.return_by ? ", вернуть должны до " + ruDate(it.return_by) : ""}. Можно встать в очередь.`]
  return lend(it) ? ["Можно взять на время", `Даритель одалживает вещь${it.lend_days ? " на " + it.lend_days + " дн." : ""}. Нажмите «Хочу взять на время» и напишите пару слов о себе.`]
    : ["Свободна", "Нажмите «Хочу забрать» и напишите пару слов о себе. Кому отдать, решает даритель — кто написал первым, не важно."]
}
function itemDescription(it) {
  const parts = [it.title + (it.condition ? ", состояние: " + it.condition.replace(/[.\s]+$/, "").toLowerCase() : "") + "."]
  const place = [it.city, it.district].filter(Boolean).join(", ")
  parts.push((lend(it) ? "Можно взять на время" : "Бесплатно") + (place ? " — " + place : "") + ".")
  if (it.status === "reserved") parts.push("Сейчас забронирована.")
  if (it.note) parts.push(cut(it.note, 90))
  parts.push((it.photo ? "Фото и связь" : "Связь") + " с дарителем на DashaBotanika.")
  return cut(parts.join(" "), 200)
}
function itemHtml(it, similar, cityLink) {
  const [st, how] = itemStatus(it)
  const facts = [["Статус", st], ["Категория", it.category], ["Состояние", it.condition], ["Где", [it.city, it.district].filter(Boolean).join(", ")],
    ["Передача", it.pickup], ["Опубликовано", ruDate(it.created)]].filter(([, v]) => v)
  const items = it.lot ? String(it.items || "").split("\n").map((x) => x.replace(/^([-—–•*]|\d+[.)])\s+/, "").trim()).filter(Boolean) : []
  return `<article class="band"><div class="wrap"><p><a href="/darom">Вещи даром</a>${cityLink ? ` · <a href="${cityLink[1]}">${esc(cityLink[0])}</a>` : ""}</p>` +
    `<h1>${esc(itemH1(it))}</h1>` +
    (it.photo ? `<img src="${esc(it.photo)}?thumb=600x450" alt="${esc(it.title)}" width="600" height="450">` : "") +
    `<dl>${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` +
    (items.length ? `<h2>Что в лоте</h2><ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "") +
    (it.note ? `<h2>Описание</h2>${paras(it.note)}` : "") +
    `<h2>Как забрать</h2><p>${esc(how)} Вещь бесплатная: здесь ничего не продают.</p>` +
    (similar.length ? `<h2>Похожие вещи</h2><ul>${similar.map((x) => `<li><a href="/darom/v/${x.id}">${esc(x.title)}</a>${x.city ? " — " + esc(x.city) : ""}</li>`).join("")}</ul>` : "") +
    `<p><a href="/darom">Все вещи даром</a>${cityLink ? ` · <a href="${cityLink[1]}">${esc(cityLink[0])}</a>` : ""}</p></div></article>`
}
// города, где сейчас есть вещи даром, — у каждого своя страница /darom/<город>
const daromCities = (app) => [...new Set(listings(app).map((l) => l.city).filter(Boolean))]
const daromCard = (it) => `<article><h3><a href="/darom/v/${it.id}">${esc(it.title)}</a></h3><p>Даром${it.category ? " · " + esc(it.category) : ""}${it.city ? " · " + esc(it.city) : ""}${it.district ? ", " + esc(it.district) : ""}</p>${it.note ? `<p>${esc(it.note)}</p>` : ""}</article>`

const priceLabel = () => "Бесплатно"

function sec(id, eyebrow, title, lead, body, h1) {
  const t = h1 ? "h1" : "h2"
  return `<section id="${id}"><div class="wrap"><p class="eyebrow">${esc(eyebrow)}</p><${t}>${esc(title)}</${t}>${lead ? `<p class="lead">${esc(lead)}</p>` : ""}\n${body || ""}</div></section>\n`
}
const productsHtml = (list) => list.map((p) => `<article><h3>${esc(p.title)}</h3>${p.replaces ? `<p>Вместо: ${esc(p.replaces)}</p>` : ""}<p>${esc(p.why)}</p></article>`).join("\n")
const articleLink = (a) => `<article><h3><a href="/zhurnal/${esc(articleSlug(a))}">${esc(a.title)}</a></h3><p>${esc(a.lead)}</p></article>`

// Разделы, которые раньше были блоками главной, теперь — отдельные страницы со своим текстом для поиска.
const ladderHtml = (k) => `<ol>${k.ECO_LADDER.map((r) => `<li><h3>${esc(r.t)}</h3><p>${esc(r.d)}</p><p>${esc((r.ex || []).join(", "))}</p></li>`).join("")}</ol>`
const SECTION_PAGES = {
  "/eda": {
    title: "Эко-еда: сезонные продукты, рецепты без отходов и меню на неделю — DashaBotanika",
    description: "Сезонные продукты, рецепты без отходов, конструктор меню на неделю со списком покупок и подборка кафе, где вкусно и бережно.",
    name: "Еда",
    body: (d, k) => sec("food", "Еда", "Вкусная польза!", "Сезонные продукты вкуснее, дешевле и не летят к нам через полмира. А очистки и хвостики могут стать ещё одним блюдом.",
      `<h3>Рецепты без отходов</h3>` + k.RECIPES.map(([t, time, steps]) => `<article><h3>${esc(t)}</h3><p>${esc(time)}</p><ol>${steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></article>`).join("\n"), true) +
      sec("menu", "Конструктор меню", "Меню на неделю за минуту", "Выберите цель и тип питания — соберём простое меню из сезонных продуктов и список покупок. Любое блюдо можно заменить.",
        `<ul>${k.DISHES.slice(0, 30).map((x) => `<li>${esc(x[0])}</li>`).join("")}</ul>`) +
      sec("cafes", "Куда пойти", "Моя подборка кафе", "Места, где вкусно и бережно: сезонное меню, своя кружка, минимум одноразового.",
        (d.cafes || []).filter((c) => !c.example).map((c) => `<article><h3>${esc(c.name)}</h3><p>${esc([c.kind, c.city, c.address].filter(Boolean).join(", "))}</p><p>${esc(c.note)}</p>${c.cuisine ? `<p>Кухня: ${esc(c.cuisine)}</p>` : ""}${c.dishes ? `<p>Что попробовать: ${esc(String(c.dishes).split("\n").map((x) => x.replace(/^\s*[-—–•*]\s*/, "").trim()).filter(Boolean).slice(0, 3).join(", "))}</p>` : ""}</article>`).join("\n")),
  },
  "/sortirovka": {
    title: "Как сортировать мусор дома: что куда сдавать и калькулятор пользы — DashaBotanika",
    description: "Простая схема сортировки отходов дома: что куда сдавать, как готовить пластик, бумагу, стекло и батарейки, и калькулятор пользы от переработки.",
    name: "Сортировка и переработка",
    body: (d, k) => sec("sort", "Эко-путь", "Начать путь в экологии — легко", "Лучший мусор тот, которого не было.", ladderHtml(k), true) +
      sec("calc", "Калькулятор переработки", "Сколько пользы в вашем мусорном ведре?", "Укажите, сколько отходов вы сдаёте на переработку, и посмотрите, сколько деревьев, воды и энергии это сберегает.",
        `<p><a href="/servisy">Куда сдать вторсырьё в вашем городе</a></p>`),
  },
  "/moda": {
    title: "Эко-мода: капсульный гардероб, ткани и вторая жизнь вещей — DashaBotanika",
    description: "Как одеваться осознанно: капсульный гардероб, шпаргалка по тканям с эко-оценкой, уход за вещами и «Вещи даром», где вещи получают вторую жизнь.",
    name: "Мода",
    body: (d, k) => sec("fashion", "Модная экология", "Одежда и аксессуары", "Самая экологичная вещь та, что уже висит в вашем шкафу.",
      k.FASHION_TIPS.map(([t, x]) => `<h3>${esc(t)}</h3><p>${esc(x)}</p>`).join("\n") +
      `<h3>Шпаргалка по тканям</h3><table><tr><th>Ткань</th><th>Плюсы</th><th>Минусы</th><th>Эко-оценка</th></tr>${k.FABRICS.map(([n, p, m, x]) => `<tr><td>${esc(n)}</td><td>${esc(p)}</td><td>${esc(m)}</td><td>${x} из 5</td></tr>`).join("")}</table>` +
      `<p><a href="/darom">Вещи даром</a> · <a href="/tovary">Эко-товары</a></p>`, true),
  },
  "/vozduh": {
    title: "Чистота воздуха в вашем городе сейчас и прогноз — DashaBotanika",
    description: "Индекс качества воздуха в вашем городе прямо сейчас и прогноз на сутки: когда лучше гулять и проветривать.",
    name: "Чистота воздуха",
    body: () => sec("air", "Чистота воздуха", "Чем дышит ваш город?", "Введите город — покажем, насколько чистый воздух прямо сейчас, и прогноз на сутки.", "", true),
  },
  "/igra": {
    title: "Игра «Эко-уборка»: сортируй мусор на скорость — DashaBotanika",
    description: "Бесплатная онлайн-игра про сортировку отходов: собирайте мусор в парке и относите в нужный контейнер. Подходит детям и взрослым.",
    name: "Игра «Эко-уборка»",
    body: () => sec("game", "Игра", "Эко-уборка", "Помогите навести порядок в парке: собирайте мусор и относите его в нужный контейнер. Чем быстрее и точнее, тем больше очков.", `<p><a href="/eko-test">Пройти эко-тест</a></p>`, true),
  },
  "/mify": {
    title: "Мифы о переработке и экологии: что правда, а что нет — DashaBotanika",
    description: "Правда ли, что жить экологично дорого, один человек ничего не изменит, раздельный мусор всё равно смешивают, бумажный пакет экологичнее пластикового, а пластик перерабатывается бесконечно? Разбираем 15 мифов с фактами и ссылками на источники.",
    name: "Мифы об экологии",
    body: (d, k) => sec("myths", "Разрушаем мифы", "Мифы о переработке и экологии", "Что из того, что «все знают», правда, а что нет. Коротко, с фактами и тем, что с этим делать.",
      k.MYTHS.map((x) => Array.isArray(x) ? { m: x[0], verdict: "myth", short: x[1], facts: [], todo: x[2] } : x).map((x) => `<article><h3>${x.verdict === "half" ? "Отчасти правда" : "Миф (fake)"}: «${esc(x.m)}»</h3><p>Коротко. ${esc(x.short)}</p>${x.facts.length ? `<ul>${x.facts.map(([t, u, src]) => `<li>${esc(t)} <a href="${esc(u)}" rel="noopener">${esc(src)}</a></li>`).join("")}</ul>` : ""}<p>Что делать. ${esc(x.todo)}</p></article>`).join("\n") + `<p><a href="/eko-test">Пройти эко-тест</a></p>`, true),
  },
  "/mir": {
    title: "Счастливый мир участников DashaBotanika",
    description: "Сообщество DashaBotanika: каждый участник — животное или растение, которое растёт вместе с его эко-привычками.",
    name: "Счастливый мир",
    body: () => sec("world", "Счастливый мир", "Наш эко-мир", "Каждый участник — животное или растение. Чем больше нас, тем живее мир.", `<p><a href="/kabinet?tab=register">Поселиться в мире</a></p>`, true),
  },
  "/zhurnal": {
    title: "Журнал: статьи и новости об экологичной жизни — DashaBotanika",
    description: "Статьи Даши об экологичной жизни: сортировка, еда, мода и быт — практично и без занудства.",
    name: "Журнал",
    body: (d) => sec("journal", "Журнал", "Новости и статьи", "Заметки об экологичной жизни.", (d.articles || []).map(articleLink).join("\n"), true),
  },
  "/o-proekte": {
    title: "О проекте DashaBotanika: Даша, контакты и обратная связь — DashaBotanika",
    description: "Кто делает DashaBotanika, как связаться с Дашей и как предложить идею или сообщить о замечании.",
    name: "О проекте",
    body: (d) => `<section id="about"><div class="wrap"><h1>${esc((d.about || {}).name || "Даша")}</h1>${paras((d.about || {}).text)}</div></section>\n` +
      sec("feedback", "Обратная связь", "Помогите сделать сайт лучше", "Напишите свои замечания и предложения — Даша читает каждое сообщение.") +
      sec("contacts", "Контакты", "Давайте дружить", (d.contacts || {}).note || ""),
  },
}

// Справочник «куда сдать» (RECYCLE_PAGES из app.js): страница на каждый вид вторсырья и код пластика.
const guideUrl = (g) => (g.kind === "mark" ? "/markirovka/" + g.s.replace("markirovka-", "") : "/sortirovka/" + g.s)
const ul = (list) => `<ul>${(list || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
function guideHtml(g, all) {
  const mark = g.kind === "mark"
  const rel = (g.rel || []).map((r) => (r === "markirovka" ? ["/markirovka", "Маркировка пластика"] : (x => x && [guideUrl(x), x.name])(all.find((x) => x.s === r)))).filter(Boolean)
  return `<section id="guide"><div class="wrap"><p><a href="${mark ? "/markirovka" : "/sortirovka"}">${mark ? "Маркировка пластика" : "Сортировка"}</a></p><h1>${esc(g.h1)}</h1><p class="lead">${esc(g.intro)}</p>\n` +
    (mark ? `<h2>Где встречается</h2>${ul(g.where_found)}<h2>Принимают ли в переработку</h2><p>${esc(g.accept)}. Зависит от пункта приёма — уточняйте на месте.</p>`
      : `<h2>Что принимают</h2>${ul(g.yes)}<h2>Что не принимают</h2>${ul(g.no)}`) +
    `<h2>Как подготовить</h2><ol>${g.prep.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` +
    (g.where ? `<h2>Где сдать</h2>${ul(g.where)}` : "") + `<p><a href="/servisy">Пункты приёма в вашем городе</a></p>` +
    (g.faq && g.faq.length ? `<h2>Частые вопросы</h2>${g.faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("")}` : "") +
    (rel.length ? `<p>Ещё по теме: ${rel.map(([u, n]) => `<a href="${u}">${esc(n)}</a>`).join(" · ")}</p>` : "") + `</div></section>`
}
const faqLd = (g) => (g.faq && g.faq.length ? [{ "@type": "FAQPage", mainEntity: g.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }] : [])

function homeHtml(d, k) {
  const arts = d.articles || []
  return [
    `<section id="top"><div class="wrap"><h1>Меньше лишнего. Больше жизни.</h1><p>Вещи даром, разумные покупки, простые экопривычки и полезные идеи для жизни. Без фанатизма и лишних затрат.</p><p><a href="/#start">Я здесь впервые</a> · <a href="/#interests">Все разделы</a></p></div></section>`,
    sec("darom-strip", "Вещи даром", "Вещи даром", "Отдавайте хорошие вещи бесплатно и находите нужное рядом с собой.", `<p><a href="/darom">Найти вещь</a> · <a href="/kabinet?tab=register&amp;next=things">Отдать вещь</a></p>`),
    sec("interests", "Что есть на сайте", "Что тебе интересно", "",
      `<ul>${Object.keys(SECTION_PAGES).map((u) => `<li><a href="${u}">${esc(SECTION_PAGES[u].name)}</a> — ${esc(SECTION_PAGES[u].description)}</li>`).join("")}<li><a href="/servisy">Полезные сервисы</a></li><li><a href="/tovary">Товары</a></li><li><a href="/darom">Вещи даром</a></li><li><a href="/eko-test">Эко-тест</a></li></ul>`),
    sec("myths-teaser", "Мифы и факты", "Экология — дорого, сложно и бессмысленно?", "Так думают многие. Разбираем популярные мифы с фактами, цифрами и без нравоучений.", `<p><a href="/mify">Развеять мифы</a></p>`),
    sec("start", "Для новичка", "Ничего не знаешь про экологию? Отлично. Начнём вместе", "Не нужно сразу всё менять. Выбери один маленький шаг.",
      `<ol><li><a href="/darom">Отдай одну ненужную вещь</a></li><li><a href="/sortirovka">Начни сортировать с двух вёдер</a></li><li><a href="/eda#menu">Приготовь ужин из того, что есть</a></li></ol>`),
    sec("about", "Кто стоит за DashaBotanika", "Привет, я " + ((d.about || {}).name || "Даша"), "", paras((d.about || {}).text)),
    sec("journal", "Журнал", "Свежее в журнале", "", arts.slice(0, 3).map(articleLink).join("\n") + `<p><a href="/zhurnal">Все статьи</a></p>`),
  ].join("\n")
}

// Описание каждой страницы: заголовок, описание, текст, хлебные крошки. null — такой страницы нет.
function page(path, d, k, app) {
  const arts = d.articles || []
  const base = { title: "DashaBotanika — меньше лишнего, больше жизни", description: null, image: null, type: "website", crumbs: null, ld: [] }
  if (path === "/") return Object.assign(base, { body: homeHtml(d, k) })
  if (path === "/tovary") {
    return Object.assign(base, {
      title: "Товары, которые делают мир чище — DashaBotanika",
      description: "Многоразовые вещи, которые один раз покупаешь и годами не производишь мусор: " + (d.products || []).slice(0, 5).map((p) => p.title).join(", ") + ".",
      crumbs: [["Товары", "/tovary"]],
      body: sec("goods", "Быт", "Товары, которые делают мир чище", "Главное правило — сначала доносить то, что уже есть дома.", "<p><b>Скоро эти товары можно будет купить</b></p>" + productsHtml(d.products || []), true),
    })
  }
  if (path === "/darom") {
    const items = (d.market || []).concat(listings(app))
    return Object.assign(base, {
      title: "Вещи даром: отдать ненужное тем, кому пригодится — DashaBotanika",
      description: "Вещи даром на DashaBotanika: отдавайте бесплатно то, что ещё послужит другим, и забирайте нужное рядом с домом. Без продажи — каждое объявление проверяет модератор.",
      crumbs: [["Вещи даром", "/darom"]],
      body: sec("market", "Вторая жизнь вещей", "Вещи даром", "Отдавайте бесплатно то, что ещё послужит другим. Без продажи и обмена — так честно и безопасно.",
        items.map((it) => it.id ? daromCard(it) : `<article><h3>${esc(it.title)}</h3><p>Даром · ${esc(priceLabel(it))}${it.city ? " · " + esc(it.city) : ""}</p>${it.note ? `<p>${esc(it.note)}</p>` : ""}</article>`).join("\n") +
        (daromCities(app).length ? `<h2>Вещи даром по городам</h2><p>${daromCities(app).map((c) => `<a href="/darom/${slugify(c)}">Отдам даром ${esc(inCity(c))}</a>`).join(" · ")}</p>` : ""), true),
    })
  }
  // одна вещь: своя страница, чтобы ею можно было поделиться (превью с фото) и найти в поиске
  const mv = path.match(/^\/darom\/v\/([a-z0-9]{15})$/)
  if (mv) {
    const all = listings(app), it = all.find((l) => l.id === mv[1])
    if (!it) return closedItem(app, mv[1], path, all)
    // похожие: та же категория или тот же город, сначала совпадение по обоим
    const score = (x) => (x.category && x.category === it.category ? 2 : 0) + (x.city && x.city === it.city ? 1 : 0)
    const similar = all.filter((x) => x.id !== it.id && score(x) > 0 && indexable(x, all)).sort((a, b) => score(b) - score(a)).slice(0, 6)
    const cityLink = it.city && cityIndexable(app, it.city) ? [`Вещи даром ${inCity(it.city)}`, `/darom/${slugify(it.city)}`] : null
    return Object.assign(base, {
      title: itemTitle(it), description: itemDescription(it), noindex: !indexable(it, all), robots: "noindex, follow",
      image: it.photo ? ORIGIN + it.photo : null, canonical: path,
      crumbs: [["Вещи даром", "/darom"]].concat(cityLink ? [[it.city, cityLink[1]]] : []).concat([[it.title, path]]),
      body: itemHtml(it, similar, cityLink),
    })
  }
  // город: «Отдам даром Новосибирск» — живые вещи этого города
  const mdc = path.match(/^\/darom\/([a-z0-9-]+)$/)
  if (mdc) {
    const city = daromCities(app).find((c) => slugify(c) === mdc[1])
    if (!city) return null
    const items = listings(app).filter((l) => l.city === city)
    return Object.assign(base, { noindex: !cityIndexable(app, city), robots: "noindex, follow",
      title: `Отдам даром ${inCity(city)}: вещи бесплатно — DashaBotanika`,
      description: cut(`Вещи даром ${inCity(city)}: ${items.slice(0, 4).map((l) => l.title).join(", ")}. Отдавайте ненужное и забирайте нужное бесплатно, рядом с домом.`, 200),
      crumbs: [["Вещи даром", "/darom"], [city, path]],
      body: sec("market", "Вещи даром", `Отдам даром ${inCity(city)}`, `Соседи ${inCity(city)} отдают бесплатно то, что им больше не нужно. Без продажи и обмена — даритель сам выбирает, кому отдать.`,
        items.map(daromCard).join("\n") + `<p><a href="/darom">Все вещи даром</a></p>`, true),
    })
  }
  if (path === "/eko-test") {
    return Object.assign(base, {
      title: "Эко-экзамен с сертификатом — DashaBotanika",
      description: "Тест по экологии: 10 вопросов о переработке, еде и быте. Ответьте верно на 8 — и получите именной сертификат «Эко-знаток».",
      crumbs: [["Эко-тест", "/eko-test"]],
      body: sec("exam", "Эко-экзамен", "Тест по экологии с сертификатом", "Проверьте, как хорошо вы разбираетесь в переработке и экологичном быте, и получите сертификат.",
        `<h2>Примеры вопросов</h2><ul>${k.QUESTIONS.map((q) => `<li>${esc(q.q)}</li>`).join("")}</ul>`, true),
    })
  }
  if (path === "/servisy") {
    let items = []
    try { items = app.findRecordsByFilter("services", "status = 'approved'", "city,name", 300, 0) } catch (e) {}
    const cities = [...new Set(items.map((r) => r.getString("city")).filter((c) => c && c !== "Вся Россия"))]
    return Object.assign(base, {
      title: "Полезные сервисы для экологии: куда сдать вторсырьё, батарейки и технику — DashaBotanika",
      description: "Подборка компаний и проектов, которые принимают вторсырьё, батарейки, технику и вещи" + (cities.length ? ": " + cities.slice(0, 6).join(", ") + " и вся Россия." : " по всей России."),
      crumbs: [["Полезные сервисы", "/servisy"]],
      body: sec("services", "Куда сдать", "Полезные сервисы для экологии", "Компании и проекты, которые принимают вторсырьё, батарейки, технику и вещи.",
        (cities.length ? `<p>Города: ${cities.map((c) => `<a href="/kuda-sdat/${slugify(c)}">${esc(c)}</a>`).join(", ")}</p>` : "") +
        items.map((r) => `<article><h3>${esc(r.getString("name"))}</h3><p>${esc(r.getString("category"))} · ${esc(r.getString("city"))}</p>${r.getString("accepts") ? `<p>Принимают: ${esc(r.getString("accepts"))}</p>` : ""}${r.getString("note") ? `<p>${esc(r.getString("note"))}</p>` : ""}</article>`).join("\n"), true),
    })
  }
  const mc = path.match(/^\/kuda-sdat\/([a-z0-9-]+)$/)
  if (mc) {
    const city = serviceCities(app).find((c) => slugify(c) === mc[1])
    if (!city) return null
    const items = approvedServices(app).filter((r) => r.getString("city") === city || r.getString("city") === "Вся Россия")
      .sort((a, b) => (a.getString("city") === "Вся Россия") - (b.getString("city") === "Вся Россия"))
    const local = items.filter((r) => r.getString("city") === city).map((r) => r.getString("name"))
    return Object.assign(base, {
      title: `Куда сдать вторсырьё, батарейки и технику ${inCity(city)} — DashaBotanika`,
      description: `Куда сдать вторсырьё, батарейки, технику и вещи ${inCity(city)}: ${local.slice(0, 3).join(", ")} и сервисы, которые работают по всей России.`,
      crumbs: [["Полезные сервисы", "/servisy"], [city, path]],
      body: sec("services", "Куда сдать", `Куда сдать вторсырьё, батарейки и технику ${inCity(city)}`, "Сервисы и пункты приёма в городе и те, что работают по всей России.",
        items.map((r) => `<article><h3>${esc(r.getString("name"))}</h3><p>${esc(r.getString("category"))} · ${esc(r.getString("city"))}</p>${r.getString("accepts") ? `<p>Принимают: ${esc(r.getString("accepts"))}</p>` : ""}${r.getString("note") ? `<p>${esc(r.getString("note"))}</p>` : ""}</article>`).join("\n") +
        `<h2>Как подготовить вторсырьё</h2><ul><li>Пластик и стекло — ополосните и снимите крышки.</li><li>Бумагу и картон — сухими, без скотча.</li><li>Батарейки и лампы — только в специальные боксы.</li></ul><p><a href="/servisy">Сервисы в других городах</a></p>`, true),
    })
  }
  if (path === "/politika") {
    return Object.assign(base, {
      title: "Политика конфиденциальности — DashaBotanika",
      description: "Какие данные собирает сайт DashaBotanika, зачем, где хранятся и как их изменить или удалить.",
      crumbs: [["Политика конфиденциальности", "/politika"]],
      body: `<section class="band"><div class="wrap"><h1>Политика конфиденциальности</h1><p>Какие данные собирает сайт dashabotanika.ru, зачем и как мы их защищаем — в соответствии с Федеральным законом № 152-ФЗ «О персональных данных».</p></div></section>`,
    })
  }
  const sp = SECTION_PAGES[path]
  if (sp) return Object.assign(base, { title: sp.title, description: sp.description, crumbs: [[sp.name, path]],
    body: sp.body(d, k) + (path === "/sortirovka" ? `<section id="kuda-sdat"><div class="wrap"><h2>Куда сдать: по видам отходов</h2><ul>${k.RECYCLE_PAGES.filter((g) => g.kind === "mat").map((g) => `<li><a href="${guideUrl(g)}">${esc(g.h1)}</a></li>`).join("")}<li><a href="/markirovka">Маркировка пластика 1–7</a></li></ul></div></section>` : "") })
  if (path === "/markirovka") {
    const marks = k.RECYCLE_PAGES.filter((g) => g.kind === "mark")
    return Object.assign(base, {
      title: "Маркировка пластика 1–7 в треугольнике: расшифровка и что сдаётся — DashaBotanika",
      description: "Что значат цифры 1–7 в треугольнике на упаковке: PET, HDPE, PVC, LDPE, PP, PS, OTHER. Где встречается каждый пластик и принимают ли его в переработку.",
      crumbs: [["Сортировка", "/sortirovka"], ["Маркировка пластика", "/markirovka"]],
      body: `<section><div class="wrap"><h1>Маркировка пластика: что значат цифры 1–7 в треугольнике</h1><p class="lead">Цифра в треугольнике — это код материала, а не обещание, что упаковку переработают.</p>
<table><tr><th>Код</th><th>Материал</th><th>Где встречается</th><th>Принимают</th></tr>${marks.map((g) => `<tr><td><a href="${guideUrl(g)}">${g.code}</a></td><td>${esc(g.ab)}</td><td>${esc(g.where_found.slice(0, 2).join(", "))}</td><td>${esc(g.accept)}</td></tr>`).join("")}</table></div></section>`,
    })
  }
  const gm = path.match(/^\/(sortirovka|markirovka)\/([a-z0-9-]+)$/)
  if (gm) {
    const g = k.RECYCLE_PAGES.find((x) => guideUrl(x) === path)
    if (!g) return null
    return Object.assign(base, { title: g.title, description: g.desc, ld: faqLd(g),
      crumbs: g.kind === "mark" ? [["Сортировка", "/sortirovka"], ["Маркировка пластика", "/markirovka"], [g.name, path]] : [["Сортировка", "/sortirovka"], [g.name, path]],
      body: guideHtml(g, k.RECYCLE_PAGES) })
  }
  if (path === "/kabinet") return Object.assign(base, { title: "Личный кабинет — DashaBotanika", noindex: true, crumbs: [["Личный кабинет", "/kabinet"]], body: "<h1>Личный кабинет</h1>" })
  const m = path.match(/^\/zhurnal\/([^/]+)$/)
  if (m) {
    // старые адреса (old_slugs) тоже открывают статью, canonical — на новый
    const a = arts.find((x) => articleSlug(x) === m[1] || String(x.id) === m[1] || (x.old_slugs || []).indexOf(m[1]) >= 0)
    if (!a) return null
    const url = `/zhurnal/${articleSlug(a)}`
    // свои заголовок и описание для поиска (поля SEO в редакторе статьи), иначе — из статьи
    const desc = cut(a.seo_desc || a.lead || mdPlain(a.body), 200)
    const image = a.image ? (/^https?:/.test(a.image) ? a.image : ORIGIN + a.image) : null
    const faq = articleFaq(a.body)
    const about = d.about || {}, bio = String(about.text || "").split(/\n{2,}/)[0].replace(/\s*\(Этот текст.*$/, "").trim()
    return Object.assign(base, {
      title: a.seo_title || `${a.title} — DashaBotanika`, description: desc, type: "article", canonical: url, image,
      crumbs: [["Журнал", "/zhurnal"], [a.title, url]],
      ld: [{ "@type": "Article", headline: a.seo_title || a.title, description: desc, abstract: a.answer || undefined, datePublished: a.date || undefined,
        dateModified: a.updated || a.date || undefined, inLanguage: "ru", image: image || undefined,
        author: { "@type": "Person", name: about.name || "Даша", url: ORIGIN + "/o-proekte", description: bio || undefined }, publisher: { "@id": ORIGIN + "/#org" }, mainEntityOfPage: ORIGIN + url }]
        .concat(faq.length ? [{ "@type": "FAQPage", mainEntity: faq.map(([q, x]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: x } })) }] : []),
      body: `<article class="band"><div class="wrap"><p><a href="/zhurnal">Журнал</a></p><h1>${esc(a.title)}</h1>${a.date ? `<p><time datetime="${esc(a.date)}">${esc(a.date)}</time></p>` : ""}${a.image ? `<img src="${esc(a.image)}" alt="${esc((a.image_alt || "").trim() || a.title)}">` : ""}<p class="lead">${esc(a.lead)}</p>\n${a.answer ? `<section class="answer"><h2>Коротко</h2><p>${mdInline(a.answer)}</p></section>\n` : ""}${mdHtml(a.body)}\n<aside class="author"><p>Автор — <a href="/o-proekte">${esc(about.name || "Даша")}</a>, DashaBotanika.${bio ? " " + esc(cut(bio, 220)) : ""}</p>${a.updated && a.updated > (a.date || "") ? `<p>Обновлено: <time datetime="${esc(a.updated)}">${esc(a.updated)}</time></p>` : ""}</aside></div></article>`,
    })
  }
  return null
}

function nav(k) {
  return `<header class="top"><div class="wrap"><a class="logo" href="/">DashaBotanika</a><nav>${k.NAV.map(([href, t]) => `<a href="${esc(href)}">${esc(t)}</a>`).join(" ")}</nav></div></header>`
}

function setMeta(html, attr, key, value) {
  const re = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(">)`)
  return re.test(html) ? html.replace(re, `$1${esc(value)}$2`) : html.replace("</head>", `<meta ${attr}="${key}" content="${esc(value)}">\n</head>`)
}

// Подтверждение прав в Яндекс.Вебмастере и Google Search Console и счётчик Яндекс.Метрики.
// Коды Даша вписывает на сайте в режиме редактирования (блок «Контакты» → «Поиск и счётчики»).
// Коды DashaBotanika по умолчанию; то, что вписано на сайте в «Поиск и счётчики», важнее.
const SEO_DEFAULTS = { metrika: "113698267", yandex: "ef883b413e657642", google: "KxORCH26NU9GhHVw-usOPKJZQInhI4STy9_pEc33Wk0" }
function counters(seo, tpl) {
  const own = seo || {}
  seo = Object.assign({}, SEO_DEFAULTS)
  for (const k in own) if (String(own[k] || "").trim()) seo[k] = own[k]
  const code = (v) => String(v || "").trim().replace(/[^A-Za-z0-9_-]/g, "")
  let out = ""
  tpl = tpl || ""
  if (code(seo.yandex) && tpl.indexOf(`content="${code(seo.yandex)}"`) < 0) out += `<meta name="yandex-verification" content="${code(seo.yandex)}">\n`
  if (code(seo.google) && tpl.indexOf(`content="${code(seo.google)}"`) < 0) out += `<meta name="google-site-verification" content="${code(seo.google)}">\n`
  const id = String(seo.metrika || "").replace(/\D/g, "")
  if (id && tpl.indexOf(`ym(${id},"init"`) < 0) {
    out += `<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();` +
      `for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}` +
      `k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})` +
      `(window,document,"script","https://mc.yandex.ru/metrika/tag.js?id=${id}","ym");` +
      // defer: просмотры считает сайт сам (и при переходах внутри сайта, см. go() в app.js)
      `ym(${id},"init",{ssr:true,webvisor:true,clickmap:true,trackLinks:true,accurateTrackBounce:true,defer:true});ym(${id},"hit",location.href,{title:document.title});window.METRIKA_ID=${id};</script>\n` +
      `<noscript><div><img src="https://mc.yandex.ru/watch/${id}" style="position:absolute;left:-9999px" alt=""></div></noscript>\n`
  }
  return out
}

function render(app, path) {
  const tpl = read(`${SITE}/index.html`)
  const d = content(app, tpl), k = constants()
  let p = page(path, d, k, app), status = 200
  if (p && p.status) status = p.status
  if (!p) { p = page("/", d, k, app); status = 404; p.noindex = true; p.title = "Страница не найдена — DashaBotanika" }
  const url = ORIGIN + (p.canonical || path)
  let html = tpl.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(p.title)}</title>`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${esc(url)}">`)
  if (p.description) { html = setMeta(html, "name", "description", p.description); html = setMeta(html, "property", "og:description", p.description) }
  if (p.image) html = setMeta(html, "property", "og:image", p.image)
  html = setMeta(html, "property", "og:url", url)
  html = setMeta(html, "property", "og:title", p.title)
  html = setMeta(html, "property", "og:type", p.type)
  // коды по умолчанию уже есть в site/index.html; добавляем только другие, вписанные на сайте
  html = html.replace("</head>", () => counters(d.seo, html) + "</head>")
  if (p.noindex) html = html.replace("</head>", `<meta name="robots" content="${p.robots || "noindex"}">\n</head>`)
  // закрытая вещь: скрипт сайта покажет тот же честный статус (сама запись публично больше не читается)
  if (p.state) html = html.replace("</head>", `<script type="application/json" id="item-state">${JSON.stringify(p.state).replace(/</g, "\\u003c")}</script>\n</head>`)
  const ld = p.ld.slice()
  if (p.crumbs) ld.push({ "@type": "BreadcrumbList", itemListElement: [["Главная", "/"]].concat(p.crumbs).map(([name, u], i) => ({ "@type": "ListItem", position: i + 1, name, item: ORIGIN + u })) })
  if (ld.length) html = html.replace("</head>", `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": ld }).replace(/</g, "\\u003c")}</script>\n</head>`)
  html = html.replace(/<div id="app">[\s\S]*?<\/div>\s*(?=<script type="application\/json")/, () => `<div id="app">\n${nav(k)}\n<main>\n${p.body}\n</main>\n</div>\n`)
  html = html.replace(/(<script type="application\/json" id="site-data">)[\s\S]*?(<\/script>)/, (all, a, b) => a + JSON.stringify(d).replace(/</g, "\\u003c") + b)
  return { status, html }
}

function sitemap(app) {
  const tpl = read(`${SITE}/index.html`)
  const d = content(app, tpl)
  const urls = [["/", "weekly", "1.0"], ["/zhurnal", "daily", "0.9"], ["/eda", "monthly", "0.8"], ["/sortirovka", "monthly", "0.8"], ["/servisy", "weekly", "0.8"], ["/moda", "monthly", "0.7"],
    ["/tovary", "monthly", "0.8"], ["/darom", "daily", "0.8"], ["/eko-test", "monthly", "0.7"], ["/igra", "monthly", "0.6"], ["/mify", "monthly", "0.7"], ["/vozduh", "monthly", "0.6"], ["/mir", "weekly", "0.5"], ["/o-proekte", "monthly", "0.5"]]
    .map(([u, f, p]) => `  <url><loc>${ORIGIN}${u}</loc><changefreq>${f}</changefreq><priority>${p}</priority></url>`)
  urls.push(`  <url><loc>${ORIGIN}/markirovka</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>`)
  constants().RECYCLE_PAGES.forEach((g) => urls.push(`  <url><loc>${ORIGIN}${guideUrl(g)}</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>`))
  // «Вещи даром»: только то, что можно индексировать (см. indexable и cityIndexable).
  // lastmod: у вещи — день публикации (даты изменения у объявлений нет), у города — самая свежая его вещь
  const idx = indexableListings(app), day = (s) => String(s || "").slice(0, 10), lm = (d) => (/^\d{4}-\d\d-\d\d$/.test(d) ? `<lastmod>${d}</lastmod>` : "")
  daromCities(app).filter((c) => cityIndexable(app, c)).forEach((c) => {
    const last = idx.filter((l) => l.city === c).map((l) => day(l.created)).sort().pop()
    urls.push(`  <url><loc>${ORIGIN}/darom/${slugify(c)}</loc>${lm(last)}<changefreq>daily</changefreq><priority>0.7</priority></url>`)
  })
  idx.slice(0, 1000).forEach((l) => urls.push(`  <url><loc>${ORIGIN}/darom/v/${l.id}</loc>${lm(day(l.created))}<changefreq>weekly</changefreq><priority>0.5</priority></url>`))
  serviceCities(app).forEach((c) => urls.push(`  <url><loc>${ORIGIN}/kuda-sdat/${slugify(c)}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`))
  ;(d.articles || []).forEach((a) => {
    // lastmod — когда статью последний раз меняли (updated ставит сайт при правке текста), иначе дата публикации
    const mod = [a.updated, a.date].find((x) => /^\d{4}-\d\d-\d\d$/.test(x || ""))
    urls.push(`  <url><loc>${ORIGIN}/zhurnal/${esc(articleSlug(a))}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ""}<changefreq>monthly</changefreq><priority>0.6</priority></url>`)
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`
}

module.exports = { render, sitemap, slugify, articleSlug, itemTitle, suspectedDupes }
