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
function get(url) {
  try { const res = $http.send({ url, method: "GET", timeout: 15, headers: { "user-agent": UA } }); return res } catch (e) { return null }
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

// Openverse: свободные лицензии, горизонтальные, не меньше 900 px в ширину
function openverse(q, page) {
  const res = get(`${OV()}/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm,by,by-sa&page_size=20&page=${page}&mature=false&aspect_ratio=wide`)
  if (!res || res.statusCode !== 200) return null
  return ((res.json || {}).results || []).filter((x) => (x.width || 0) >= 900).map((x) => ({
    source: "ov", id: x.id, title: clean(x.title), author: clean(x.creator) || "автор не указан", authorUrl: x.creator_url || "",
    page: x.foreign_landing_url || "", license: (LICENSES[x.license] || ("CC " + String(x.license || "").toUpperCase())) + (x.license_version && x.license !== "pdm" ? " " + x.license_version : ""),
    licenseUrl: x.license_url || "", thumb: x.thumbnail || `${OV()}/v1/images/${x.id}/thumb/`, url: x.url, provider: x.provider || "", width: x.width,
  }))
}
// Wikimedia Commons: запасной путь, если Openverse молчит
function commons(q, page) {
  const res = get(`${WM()}/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=20&gsroffset=${(page - 1) * 20}` +
    `&gsrsearch=${encodeURIComponent(q + " filetype:bitmap")}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1600`)
  if (!res || res.statusCode !== 200) return null
  const pages = Object.values(((res.json || {}).query || {}).pages || {})
  return pages.map((p) => {
    const ii = (p.imageinfo || [])[0] || {}, m = ii.extmetadata || {}, lic = clean((m.LicenseShortName || {}).value)
    if (!/^(cc0|public domain|cc by(-sa)? \d)/i.test(lic) || (ii.width || 0) < 900 || ii.width < ii.height) return null
    return { source: "wm", id: String(p.pageid), title: clean(p.title).replace(/^File:/, "").replace(/\.[a-z]+$/i, ""), author: clean((m.Artist || {}).value).slice(0, 80) || "автор не указан",
      authorUrl: "", page: ii.descriptionurl || "", license: lic, licenseUrl: clean((m.LicenseUrl || {}).value), thumb: ii.thumburl ? ii.thumburl.replace(/\/\d+px-/, "/480px-") : ii.url, url: ii.thumburl || ii.url, width: ii.width }
  }).filter(Boolean)
}

function search(app, userId, draftId, q, page) {
  if (!staff(app, userId)) return { ok: false, message: "Только для команды сайта" }
  page = Math.max(1, Math.min(10, page | 0 || 1))
  let topic = String(q || "").trim()
  if (!topic && draftId) try { const d = app.findRecordById("drafts", draftId); topic = d.getString("title") } catch (e) {}
  if (!topic) return { ok: false, message: "Напишите, что должно быть на фото" }
  const en = englishQuery(app, topic) || topic
  let list = openverse(en, page), from = "Openverse"
  if (!list || !list.length) { const w = commons(en, page); if (w && w.length) { list = w; from = "Wikimedia Commons" } }
  if (!list) return { ok: false, query: en, message: "Сервис фото сейчас не отвечает — попробуйте через минуту" }
  return { ok: true, query: en, from, items: list.slice(0, 9) }
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

module.exports = { search, take }
