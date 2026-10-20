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
function articleSlug(a) { return a.slug || slugify(a.title) || String(a.id) }

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const cut = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s }
const paras = (s) => String(s || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("\n")

function read(path) { return toString($os.readFile(path)) }

// Постоянные тексты (советы, ткани, рецепты, вопросы теста) живут в скрипте сайта — берём оттуда.
function constants() {
  const src = read(`${SITE}/js/app.js`)
  const out = {}
  ;["FASHION_TIPS", "FABRICS", "RECIPES", "QUESTIONS", "ECO_LADDER", "NAV_GROUPS"].forEach((name) => {
    const m = src.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n?\\]);`))
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

function listings(app) {
  try {
    return app.findRecordsByFilter("listings", "moderation = 'approved' && status != 'gone'", "-created", 200, 0).map((r) => ({
      title: r.getString("title"), kind: r.getString("kind"), price: r.getString("price"),
      condition: r.getString("condition"), city: r.getString("city"), note: r.getString("note"),
    }))
  } catch (err) { return [] }
}

const priceLabel = (it) => (it.kind === "Продам" && it.price ? it.price : it.kind === "Отдам даром" ? "Бесплатно" : "Обмен")

function sec(id, eyebrow, title, lead, body, h1) {
  const t = h1 ? "h1" : "h2"
  return `<section id="${id}"><div class="wrap"><p class="eyebrow">${esc(eyebrow)}</p><${t}>${esc(title)}</${t}>${lead ? `<p class="lead">${esc(lead)}</p>` : ""}\n${body || ""}</div></section>\n`
}
const productsHtml = (list) => list.map((p) => `<article><h3>${esc(p.title)}</h3>${p.replaces ? `<p>Вместо: ${esc(p.replaces)}</p>` : ""}<p>${esc(p.why)}</p></article>`).join("\n")
const articleLink = (a) => `<article><h3><a href="/zhurnal/${esc(articleSlug(a))}">${esc(a.title)}</a></h3><p>${esc(a.lead)}</p></article>`

function homeHtml(d, k) {
  const arts = d.articles || []
  return [
    `<section id="top"><div class="wrap"><h1>Эко: еда, быт, мода, образ жизни!</h1><p>Разумный человек — счастливая планета</p><p>Без занудства и чувства вины, о простых шагах, которые делают жизнь вкуснее, красивее и чище.</p></div></section>`,
    sec("calc", "Калькулятор переработки", "Сколько пользы в вашем мусорном ведре?", "Укажите, сколько отходов вы сдаёте на переработку, и посмотрите, сколько деревьев, воды и энергии это сберегает."),
    sec("sort", "Эко-путь", "Начать путь в экологии — ЛЕГКО", "Лучший мусор тот, которого не было.",
      `<ol>${k.ECO_LADDER.map((r) => `<li><h3>${esc(r.t)}</h3><p>${esc(r.d)}</p><p>${esc((r.ex || []).join(", "))}</p></li>`).join("")}</ol><h3>Сортировка за 3 шага</h3>`),
    sec("exam", "Эко-экзамен", "Пройдите тест по экологии и получите сертификат", "10 вопросов о переработке, еде и быте.", `<p><a href="/eko-test">Пройти тест</a></p>`),
    sec("world", "Счастливый мир", "Наш эко-мир", "Каждый участник — животное или растение. Чем больше нас, тем живее мир."),
    sec("goods", "Быт", "Товары, которые делают мир чище", "Вещи, которые один раз покупаешь и годами не производишь мусор.",
      productsHtml((d.products || []).slice(0, 4)) + `<p><a href="/tovary">Смотреть больше</a></p>`),
    sec("air", "Чистота воздуха", "Чем дышит ваш город?", "Введите город — покажем, насколько чистый воздух прямо сейчас, и прогноз на сутки."),
    sec("game", "Игра", "Эко-уборка", "Помогите навести порядок в парке: собирайте мусор и относите его в нужный контейнер."),
    sec("fashion", "Модная экология", "Одежда и аксессуары", "Самая экологичная вещь та, что уже висит в вашем шкафу.",
      k.FASHION_TIPS.map(([t, x]) => `<h3>${esc(t)}</h3><p>${esc(x)}</p>`).join("\n") +
      `<h3>Шпаргалка по тканям</h3><table><tr><th>Ткань</th><th>Плюсы</th><th>Минусы</th><th>Эко-оценка</th></tr>${k.FABRICS.map(([n, p, m, s]) => `<tr><td>${esc(n)}</td><td>${esc(p)}</td><td>${esc(m)}</td><td>${s} из 5</td></tr>`).join("")}</table>`),
    sec("food", "Еда", "Вкусная польза!", "Сезонные продукты вкуснее, дешевле и не летят к нам через полмира.",
      `<h3>Рецепты без отходов</h3>` + k.RECIPES.map(([t, time, steps]) => `<article><h3>${esc(t)}</h3><p>${esc(time)}</p><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></article>`).join("\n")),
    sec("cafes", "Куда пойти", "Моя подборка кафе", "Места, где вкусно и бережно: сезонное меню, своя кружка, минимум одноразового.",
      (d.cafes || []).filter((c) => !c.example).map((c) => `<article><h3>${esc(c.name)}</h3><p>${esc([c.kind, c.city, c.address].filter(Boolean).join(", "))}</p><p>${esc(c.note)}</p></article>`).join("\n")),
    sec("market", "Вторая жизнь вещей", "Барахолка", "Отдавайте, меняйте и продавайте то, что ещё послужит другим.", `<p><a href="/baraholka">Перейти в барахолку</a></p>`),
    sec("journal", "Журнал", "Новости и статьи", "Заметки об экологичной жизни.", arts.map(articleLink).join("\n")),
    sec("about", "Про меня", (d.about || {}).name || "Даша", "", paras((d.about || {}).text)),
  ].join("\n")
}

// Описание каждой страницы: заголовок, описание, текст, хлебные крошки. null — такой страницы нет.
function page(path, d, k, app) {
  const arts = d.articles || []
  const base = { title: "DashaBotanika — эко: еда, быт, мода, образ жизни", description: null, image: null, type: "website", crumbs: null, ld: [] }
  if (path === "/") return Object.assign(base, { body: homeHtml(d, k) })
  if (path === "/tovary") {
    return Object.assign(base, {
      title: "Товары, которые делают мир чище — DashaBotanika",
      description: "Многоразовые вещи, которые один раз покупаешь и годами не производишь мусор: " + (d.products || []).slice(0, 5).map((p) => p.title).join(", ") + ".",
      crumbs: [["Товары", "/tovary"]],
      body: sec("goods", "Быт", "Товары, которые делают мир чище", "Главное правило — сначала доносить то, что уже есть дома.", "<p><b>Скоро эти товары можно будет купить</b></p>" + productsHtml(d.products || []), true),
    })
  }
  if (path === "/baraholka") {
    const items = (d.market || []).concat(listings(app))
    return Object.assign(base, {
      title: "Барахолка: отдать, обменять, продать — DashaBotanika",
      description: "Эко-барахолка DashaBotanika: отдавайте, меняйте и продавайте вещи, которые ещё послужат другим. Объявления проверяет модератор.",
      crumbs: [["Барахолка", "/baraholka"]],
      body: sec("market", "Вторая жизнь вещей", "Барахолка", "Отдавайте, меняйте и продавайте то, что ещё послужит другим.",
        items.map((it) => `<article><h3>${esc(it.title)}</h3><p>${esc(it.kind || "Продам")} · ${esc(priceLabel(it))}${it.city ? " · " + esc(it.city) : ""}</p>${it.note ? `<p>${esc(it.note)}</p>` : ""}</article>`).join("\n"), true),
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
  if (path === "/kabinet") return Object.assign(base, { title: "Личный кабинет — DashaBotanika", noindex: true, crumbs: [["Личный кабинет", "/kabinet"]], body: "<h1>Личный кабинет</h1>" })
  const m = path.match(/^\/zhurnal\/([^/]+)$/)
  if (m) {
    const a = arts.find((x) => articleSlug(x) === m[1] || String(x.id) === m[1])
    if (!a) return null
    const url = `/zhurnal/${articleSlug(a)}`
    const desc = cut(a.lead || a.body, 200)
    return Object.assign(base, {
      title: `${a.title} — DashaBotanika`, description: desc, type: "article", canonical: url,
      crumbs: [["Журнал", "/#journal"], [a.title, url]],
      ld: [{ "@type": "Article", headline: a.title, description: desc, datePublished: a.date || undefined, inLanguage: "ru",
        author: { "@type": "Person", name: (d.about || {}).name || "Даша" }, publisher: { "@id": ORIGIN + "/#org" }, mainEntityOfPage: ORIGIN + url }],
      body: `<article class="band"><div class="wrap"><p><a href="/#journal">Журнал</a></p><h1>${esc(a.title)}</h1>${a.date ? `<p><time datetime="${esc(a.date)}">${esc(a.date)}</time></p>` : ""}<p class="lead">${esc(a.lead)}</p>\n${paras(a.body)}</div></article>`,
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
function counters(seo) {
  seo = seo || {}
  const code = (v) => String(v || "").trim().replace(/[^A-Za-z0-9_-]/g, "")
  let out = ""
  if (code(seo.yandex)) out += `<meta name="yandex-verification" content="${code(seo.yandex)}">\n`
  if (code(seo.google)) out += `<meta name="google-site-verification" content="${code(seo.google)}">\n`
  const id = String(seo.metrika || "").replace(/\D/g, "")
  if (id) {
    out += `<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();` +
      `for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}` +
      `k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})` +
      `(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");` +
      `ym(${id},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,defer:true});window.METRIKA_ID=${id};</script>\n` +
      `<noscript><div><img src="https://mc.yandex.ru/watch/${id}" style="position:absolute;left:-9999px" alt=""></div></noscript>\n`
  }
  return out
}

function render(app, path) {
  const tpl = read(`${SITE}/index.html`)
  const d = content(app, tpl), k = constants()
  let p = page(path, d, k, app), status = 200
  if (!p) { p = page("/", d, k, app); status = 404; p.noindex = true; p.title = "Страница не найдена — DashaBotanika" }
  const url = ORIGIN + (p.canonical || path)
  let html = tpl.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(p.title)}</title>`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${esc(url)}">`)
  if (p.description) { html = setMeta(html, "name", "description", p.description); html = setMeta(html, "property", "og:description", p.description) }
  html = setMeta(html, "property", "og:url", url)
  html = setMeta(html, "property", "og:title", p.title)
  html = setMeta(html, "property", "og:type", p.type)
  html = html.replace("</head>", () => counters(d.seo) + "</head>")
  if (p.noindex) html = html.replace("</head>", `<meta name="robots" content="noindex">\n</head>`)
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
  const urls = [["/", "weekly", "1.0"], ["/tovary", "monthly", "0.8"], ["/baraholka", "daily", "0.8"], ["/eko-test", "monthly", "0.7"]]
    .map(([u, f, p]) => `  <url><loc>${ORIGIN}${u}</loc><changefreq>${f}</changefreq><priority>${p}</priority></url>`)
  ;(d.articles || []).forEach((a) => {
    urls.push(`  <url><loc>${ORIGIN}/zhurnal/${esc(articleSlug(a))}</loc>${/^\d{4}-\d\d-\d\d$/.test(a.date || "") ? `<lastmod>${a.date}</lastmod>` : ""}<changefreq>monthly</changefreq><priority>0.6</priority></url>`)
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`
}

module.exports = { render, sitemap, slugify }
