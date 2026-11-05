// «✨ Подобрать другое фото» для черновика статьи: свободные фото по теме (Openverse, запасной — Wikimedia Commons),
// выбранное скачиваем к себе в «photos» и отдаём адрес и подпись об авторе (условие лицензий).
// Тему для поиска по-английски составляет Yandex AI Studio из заголовка (ключ тот же, что у помощника, ai.js);
// без ключа — поиск по тому, что ввела Даша. Только для администраторов и модераторов.
// PHOTOPICK_OPENVERSE / PHOTOPICK_COMMONS — подмена сервисов в тестах.
const UA = "DashaBotanikaBot/1.0 (https://dashabotanika.ru; dashabotanika.site@yandex.com)"
const OV = () => String($os.getenv("PHOTOPICK_OPENVERSE") || "https://api.openverse.org").replace(/\/+$/, "")
const WM = () => String($os.getenv("PHOTOPICK_COMMONS") || "https://commons.wikimedia.org").replace(/\/+$/, "")
const LICENSES = { cc0: "CC0", pdm: "Public domain", by: "CC BY", "by-sa": "CC BY-SA" }

function staff(app, id) { try { const r = app.findRecordById("users", id).getString("role"); return r === "admin" || r === "moderator" } catch (e) { return false } }
let LOG = []
function get(url) {
  const t0 = Date.now()
  try { const res = $http.send({ url, method: "GET", timeout: 15, headers: { "user-agent": UA } }); LOG.push(url.replace(/\?.*$/, "") + " → " + res.statusCode + " " + (Date.now() - t0) + "ms"); return res }
  catch (e) { LOG.push(url.replace(/\?.*$/, "") + " → " + String(e).slice(0, 80)); return null }
}
const clean = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()

// тема по-английски: 2–4 слова для фотостока (кэш на час — повторное «ещё варианты» не тратит запрос)
function englishQuery(app, text) {
  text = String(text || "").trim().slice(0, 300)
  if (!text) return ""
  if (!/[а-яё]/i.test(text)) return text
  const key = "photopick_q_" + text, store = app.store(), hit = store.get(key)
  if (hit && Date.now() - hit.at < 3600000) return hit.q
  let ai = null
  try { ai = require(`${__hooks}/ai.js`) } catch (e) {}
  if (!ai || !ai.translateForSearch) return ""
  const q = ai.translateForSearch(text)
  if (q) store.set(key, { q, at: Date.now() })
  return q
}

// миниатюры показываем через наш сервер (/api/photopick/thumb): у Даши в России сервер Openverse не открывается или
// грузится минутами, а наш сервер до него достаёт. Пускаем только эти хосты — это не прокси «для всего».
const THUMB_HOSTS = /^https:\/\/(upload\.wikimedia\.org|api\.openverse\.org|live\.staticflickr\.com|farm\d+\.staticflickr\.com)\//
const thumbVia = (u, fallback) => "/api/photopick/thumb?u=" + encodeURIComponent(u) + (fallback ? "&f=" + encodeURIComponent(fallback) : "")
const okSize = (w, h) => (w || 0) >= 800 && (w || 0) >= (h || 0) * 0.9 // горизонтальные и квадратные, от 800 px

// Openverse: свободные лицензии; у Flickr — его собственная маленькая копия (быстрее, чем у Openverse)
function openverse(q, page) {
  const res = get(`${OV()}/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm,by,by-sa&page_size=20&page=${page}&mature=false`)
  if (!res || res.statusCode !== 200) return null
  return ((res.json || {}).results || []).filter((x) => okSize(x.width, x.height)).map((x) => {
    const own = `${OV()}/v1/images/${x.id}/thumb/`
    const flickr = /^https:\/\/(live|farm\d+)\.staticflickr\.com\/.+_[a-z]\.jpg$/.test(x.url || "") ? x.url.replace(/_[a-z]\.jpg$/, "_n.jpg") : ""
    return { source: "ov", id: x.id, title: clean(x.title), author: clean(x.creator) || "автор не указан",
      license: (LICENSES[x.license] || ("CC " + String(x.license || "").toUpperCase())) + (x.license_version && x.license !== "pdm" ? " " + x.license_version : ""),
      thumb: flickr ? thumbVia(flickr, own) : thumbVia(own) }
  })
}
// Wikimedia Commons: отвечает за секунду, ищет и по описаниям и категориям
function commons(q, page) {
  const res = get(`${WM()}/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=30&gsroffset=${(page - 1) * 30}` +
    `&gsrsearch=${encodeURIComponent(q + " filetype:bitmap")}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=480`)
  if (!res || res.statusCode !== 200) return null
  const pages = Object.values(((res.json || {}).query || {}).pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0))
  return pages.map((p) => {
    const ii = (p.imageinfo || [])[0] || {}, m = ii.extmetadata || {}, lic = clean((m.LicenseShortName || {}).value)
    if (!/^(cc0|public domain|cc by(-sa)? \d)/i.test(lic) || !okSize(ii.width, ii.height) || !THUMB_HOSTS.test(ii.thumburl || "")) return null
    return { source: "wm", id: String(p.pageid), title: clean(p.title).replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
      author: clean((m.Artist || {}).value).slice(0, 80) || "автор не указан", license: lic, thumb: thumbVia(ii.thumburl) }
  }).filter(Boolean)
}

// поиск: сначала Commons (быстро), потом Openverse; если по всем словам мало — укорачиваем запрос по словам
function search(app, userId, draftId, q, page, debug) {
  if (!staff(app, userId)) return { ok: false, message: "Только для команды сайта" }
  page = Math.max(1, Math.min(10, page | 0 || 1))
  let topic = String(q || "").trim()
  if (!topic && draftId) try { const d = app.findRecordById("drafts", draftId); topic = d.getString("title") } catch (e) {}
  if (!topic) return { ok: false, message: "Напишите, что должно быть на фото" }
  const en = englishQuery(app, topic) || topic
  const words = en.split(/\s+/).filter(Boolean), tries = [en]
  for (let n = words.length - 1; n >= 2; n--) tries.push(words.slice(0, n).join(" "))
  const out = [], seen = {}, from = {}, started = Date.now()
  let answered = false
  LOG = []
  // the same picture often comes twice (two uploads, two sizes): one per author and title
  const add = (list, name) => { if (!list) return; answered = true; for (const x of list) { const k = (x.author + "|" + x.title).toLowerCase(); if (!seen[x.source + x.id] && !seen[k]) { seen[x.source + x.id] = seen[k] = 1; out.push(x); from[name] = 1 } } }
  for (const t of tries) { if (out.length >= 9 || Date.now() - started > 8000) break; add(commons(t, page), "Wikimedia Commons") }
  // Openverse отвечает медленно (до 10 с) и находит только фото, где есть все слова, — спрашиваем его 3 и 2 первыми словами
  const short = words.length <= 2 ? [en] : [...new Set([words.slice(0, 3).join(" "), words.slice(0, 2).join(" ")])]
  for (const t of short) { if (out.length >= 9 || Date.now() - started > 25000) break; add(openverse(t, page), "Openverse") }
  if (!answered) return { ok: false, query: en, message: "Сервисы фото сейчас не отвечают — попробуйте через минуту", log: debug ? LOG : undefined }
  return { ok: true, query: en, from: Object.keys(from).join(" и ") || "—", items: out.slice(0, 9), log: debug ? LOG : undefined }
}

// миниатюра через наш сервер: только разрешённые хосты, только картинки, запоминаем последние 120
function thumb(app, u, f) {
  const store = app.store(), cache = store.get("photopick_thumbs") || { keys: [], map: {} }
  for (const url of [u, f]) {
    if (!url || !THUMB_HOSTS.test(url) && url.indexOf(OV() + "/") !== 0) continue
    if (cache.map[url]) return cache.map[url]
    const res = get(url)
    const type = res && res.headers ? String(((res.headers["Content-Type"] || res.headers["content-type"] || [])[0]) || "") : ""
    if (res && res.statusCode === 200 && res.body && res.body.length > 500 && res.body.length < 3000000 && /^image\//.test(type || "image/jpeg")) {
      const hit = { type: type || "image/jpeg", body: res.body }
      cache.map[url] = hit; cache.keys.push(url)
      while (cache.keys.length > 120) delete cache.map[cache.keys.shift()]
      store.set("photopick_thumbs", cache)
      return hit
    }
  }
  return null
}

// скачать выбранное к себе: адрес файла берём у самого сервиса по номеру фото (не из браузера), большая копия до 1600 px
function resolve(it) {
  if (it.source === "ov" && /^[0-9a-f-]{36}$/.test(it.id)) {
    const res = get(`${OV()}/v1/images/${it.id}/`)
    if (!res || res.statusCode !== 200 || !res.json) return null
    const x = res.json, lic = (LICENSES[x.license] || "") 
    if (!lic) return null
    const tries = [], m = String(x.url || "").match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)$/)
    if (m && (x.width || 0) > 1600) tries.push(`https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${m[3]}/1600px-${m[3]}`)
    else if (/^https:\/\//.test(x.url || "")) tries.push(x.url)
    tries.push(`${OV()}/v1/images/${x.id}/thumb/?full_size=true`)
    return { tries, credit: { author: clean(x.creator) || "автор не указан", authorUrl: x.creator_url || "", page: x.foreign_landing_url || "",
      license: lic + (x.license_version && x.license !== "pdm" ? " " + x.license_version : ""), licenseUrl: x.license_url || "" } }
  }
  if (it.source === "wm" && /^\d+$/.test(it.id)) {
    const res = get(`${WM()}/w/api.php?action=query&format=json&pageids=${it.id}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1600`)
    const p = res && res.statusCode === 200 ? Object.values(((res.json || {}).query || {}).pages || {})[0] : null
    const ii = p && (p.imageinfo || [])[0], m = (ii && ii.extmetadata) || {}, lic = clean((m.LicenseShortName || {}).value)
    if (!ii || !/^(cc0|public domain|cc by(-sa)? \d)/i.test(lic)) return null
    return { tries: [ii.thumburl || ii.url], credit: { author: clean((m.Artist || {}).value).slice(0, 80) || "автор не указан", authorUrl: "", page: ii.descriptionurl || "", license: lic, licenseUrl: clean((m.LicenseUrl || {}).value) } }
  }
  return null
}
function take(app, userId, item) {
  if (!staff(app, userId)) return { ok: false, message: "Только для команды сайта" }
  const r = resolve({ source: String((item || {}).source || ""), id: String((item || {}).id || "") })
  if (!r) return { ok: false, message: "Не нашли это фото — выберите другое" }
  let bytes = null
  for (const u of r.tries) {
    const res = get(u)
    if (res && res.statusCode === 200 && res.body && res.body.length > 5000 && res.body.length < 15000000) { bytes = res.body; break }
  }
  if (!bytes) return { ok: false, message: "Не получилось скачать это фото — выберите другое" }
  const rec = new Record(app.findCollectionByNameOrId("photos"))
  rec.set("file", $filesystem.fileFromBytes(bytes, "cover.jpg"))
  rec.set("uploaded_by", userId)
  try { app.save(rec) } catch (e) { return { ok: false, message: "Этот файл не подошёл (нужен JPG, PNG или WebP) — выберите другое фото" } }
  return { ok: true, url: `/api/files/photos/${rec.id}/${rec.getString("file")}`, credit: r.credit }
}

module.exports = { search, take, thumb }
