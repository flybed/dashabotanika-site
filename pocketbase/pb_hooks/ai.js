// ИИ-помощник: фото тарелки → как сделать блюдо полезнее и экологичнее; фото упаковки → куда сдать и как использовать.
// Yandex AI Studio, совместимый с OpenAI формат (chat/completions, картинка как data:URL).
// Переменные окружения: YC_API_KEY, YC_FOLDER (или те же ключи в админке, коллекция settings), по желанию YC_MODEL (по умолчанию gemma-3-27b-it), YC_API (только для тестов), AI_DAILY.

// сначала переменная окружения сервера, потом настройка из админки (/_/ → settings)
function setting(k) { try { return String($app.findFirstRecordByData("settings", "key", k).getString("value") || "").trim() } catch (e) { return "" } }
const env = (k) => String($os.getenv(k) || "").trim() || (k === "YC_API_KEY" || k === "YC_FOLDER" || k === "YC_MODEL" ? setting(k) : "")
const daily = () => Math.max(1, parseInt(env("AI_DAILY") || "5", 10) || 5)
const apiUrl = () => env("YC_API") || "https://llm.api.cloud.yandex.net/v1/chat/completions"
const model = () => `gpt://${env("YC_FOLDER")}/${env("YC_MODEL") || "gemma-3-27b-it"}/latest`
const enabled = () => !!(env("YC_API_KEY") && env("YC_FOLDER"))

const PROMPTS = {
  food: "Ты — эко-помощник сайта DashaBotanika. На фото — блюдо или тарелка с едой. Ответь по-русски, дружелюбно, без занудства и чувства вины, коротко (до 900 знаков), " +
    "в таком виде:\nЧто на фото: одно предложение.\nКак сделать полезнее: 2–3 пункта, каждый с новой строки и начинается с «— ».\n" +
    "Как сделать экологичнее: 2–3 пункта (сезонные и местные продукты, меньше мяса, без отходов, что сделать с остатками и очистками), каждый с «— ».\n" +
    "Не выдумывай точные цифры калорий, воды и углеродного следа. Если на фото не еда — вежливо скажи об этом одним предложением.",
  pack: "Ты — эко-помощник сайта DashaBotanika. На фото — упаковка или вещь, которую человек хочет выбросить. Ответь по-русски, дружелюбно и коротко (до 900 знаков), " +
    "в таком виде:\nЧто это: материал и маркировка, если она видна (например ♳ 1 PET, PAP 20).\nКуда сдать: в какой контейнер или пункт приёма, одно-два предложения.\n" +
    "Как подготовить: нужно ли мыть, снять крышку и этикетку, сплющить.\nКак использовать повторно: 2–3 идеи, каждая с новой строки и начинается с «— ».\n" +
    "Если маркировку не видно — так и скажи и подскажи, где её искать. Не выдумывай адреса пунктов приёма. Если на фото не упаковка — вежливо скажи об этом.",
}

function dayStart() { // начало суток по Москве, в UTC — для дневного лимита
  const now = new Date(Date.now() + 3 * 3600 * 1000)
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 3 * 3600 * 1000).toISOString().replace("T", " ")
}
function usedToday(app, userId) {
  try { return app.countRecords("ai_uses", $dbx.exp("user = {:u} AND created >= {:s}", { u: userId, s: dayStart() })) } catch (e) { return 0 }
}
function status(app, userId) { return { enabled: enabled(), limit: daily(), left: Math.max(0, daily() - usedToday(app, userId)) } }

// причину отказа модели видят только админы и модераторы — чтобы чинить без доступа к логам сервера (ключа в ней нет)
function staffDetail(app, userId, why) {
  try { const r = app.findRecordById("users", userId).getString("role"); if (r === "admin" || r === "moderator") return { detail: why } } catch (e) {}
  return {}
}

function analyze(app, userId, kind, image) {
  const st = status(app, userId)
  if (!st.enabled) return Object.assign(st, { ok: false, message: "Помощник скоро заработает — мы подключаем распознавание фото." })
  if (!PROMPTS[kind]) return Object.assign(st, { ok: false, message: "Выберите, что на фото: еда или упаковка." })
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 3000000) return Object.assign(st, { ok: false, message: "Не получилось прочитать фото. Подойдёт JPG или PNG." })
  if (st.left <= 0) return Object.assign(st, { ok: false, message: `На сегодня разборы закончились (${st.limit} в день). Приходите завтра!` })
  let res
  try {
    res = $http.send({
      url: apiUrl(), method: "POST", timeout: 60,
      headers: { "content-type": "application/json", "authorization": "Api-Key " + env("YC_API_KEY"), "x-folder-id": env("YC_FOLDER") },
      body: JSON.stringify({ model: model(), temperature: 0.4, max_tokens: 700, messages: [
        { role: "system", content: PROMPTS[kind] },
        { role: "user", content: [{ type: "text", text: kind === "food" ? "Что скажешь про эту тарелку?" : "Куда сдать эту упаковку?" }, { type: "image_url", image_url: { url: image } }] },
      ] }),
    })
  } catch (e) {
    app.logger().error("ai request failed", "error", String(e))
    return Object.assign(st, { ok: false, message: "Помощник сейчас не отвечает, попробуйте через минуту." }, staffDetail(app, userId, "нет связи с Yandex AI Studio: " + String(e).slice(0, 200)))
  }
  const j = res.json || {}
  const text = String((((j.choices || [])[0] || {}).message || {}).content || "").trim()
  if (res.statusCode !== 200 || !text) {
    const why = "Yandex AI Studio ответил " + res.statusCode + ": " + toString(res.body).slice(0, 400)
    app.logger().error("ai answer failed", "status", res.statusCode, "body", toString(res.body).slice(0, 400))
    return Object.assign(st, { ok: false, message: "Помощник сейчас не отвечает, попробуйте через минуту." }, staffDetail(app, userId, why))
  }
  const rec = new Record(app.findCollectionByNameOrId("ai_uses"))
  rec.set("user", userId); rec.set("kind", kind); rec.set("tokens", ((j.usage || {}).total_tokens) | 0)
  app.save(rec)
  return { ok: true, enabled: true, limit: st.limit, left: st.left - 1, text: text.slice(0, 2000) }
}

// проверка для админов: на каком шаге Яндекс отказывает — базовая текстовая модель, наша модель текстом, наша модель с картинкой
function check(app, userId, extra) {
  if (!staffDetail(app, userId, "x").detail) return { ok: false, message: "Только для админов" }
  if (!enabled()) return { ok: false, message: "Нет YC_FOLDER или YC_API_KEY" }
  // красный круг на белом: модель, которая правда видит картинки, назовёт цвет
  const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAAB6ElEQVR4nO3cS07DQBAA0QRxjyy4/5FY5CRmMRsrQGo+PT+rao2UnkfbgSjy/TiOm/3fx+wBVk8gSCBIIEggSCBIIEggSCBIIEgg6HP2ALfvx+P9D3w9n2Mm+bP7+H9WUeR9g73GATW6/G6M1AigcJpzvZn6AnWlOdePqRfQMJpzPZi6vM1P0en0uvFAs3Q6vXrkJTaX5qWoyy1sg5bSucXNEwO0mk4qZKoAoDV1Uu2ztQKtrJNqnLAJaH2dVMucftwB1QPtsj6p6mkrgfbSSdXNXAO0o06qYnLvQVAx0L7rkyqd3w2CyoB2X59U0SncIKgA6Brrk8o/ixsECQTlAl3p+kplnsgNggSCBIIEgrKArneHTuWcyw2CBIIEggSCBIIEggSCBIIEggSCsoDmfte9XznncoMggSCBIIGgXKDr3aczT+QGQQJBBUBXusryz+IGQWVA11iiolO4QVAx0O5LVDq/GwTVAO27RBWTV27QjkZ1M9dfYnsZVU/rPQhqAtpliVrmbN2g9Y0aJwy4xFY2ap8t5h60plHIVGE36dWMouaJf3bH9K+jxf6q4t/m565S+Kt3+TtollGP1/X5QZBPoIJ8hhnkU/CgCUAv+RzFvfPjDkggSCBIIEggSCBIIEggSCBIIOgHQA6ri620rXQAAAAASUVORK5CYII="
  const tryModel = (uri, content) => {
    try {
      const res = $http.send({ url: apiUrl(), method: "POST", timeout: 40,
        headers: { "content-type": "application/json", "authorization": "Api-Key " + env("YC_API_KEY"), "x-folder-id": env("YC_FOLDER") },
        body: JSON.stringify({ model: uri, max_tokens: 600, messages: [{ role: "user", content }] }) })
      const msg = ((((res.json || {}).choices || [])[0] || {}).message || {}), used = ((res.json || {}).usage || {}).total_tokens
      const said = String(msg.content || "").slice(0, 120) + (msg.reasoning_content ? " (размышлял)" : "") + (used ? " · токенов: " + used : "")
      return res.statusCode + (res.statusCode === 200 ? " ✓ «" + said + "»" : ": " + toString(res.body).slice(0, 300))
    } catch (e) { return "нет связи: " + String(e).slice(0, 200) }
  }
  const folder = env("YC_FOLDER")
  return {
    ok: true, folder: folder.slice(0, 4) + "…" + folder.slice(-4), model: model(),
    yandexgpt_lite_text: tryModel(`gpt://${folder}/yandexgpt-lite/latest`, "Скажи «привет»"),
    our_model_text: tryModel(model(), "Скажи «привет»"),
    our_model_image: tryModel(model(), [{ type: "text", text: "Какого цвета круг на картинке? Ответь одним словом." }, { type: "image_url", image_url: { url: pixel } }]),
    // ?models=a,b — другие модели с картинкой, чтобы найти доступную (не больше 8)
    others: String(extra || "").split(",").map((x) => x.trim()).filter((x) => /^[\w.\-\/]{2,60}$/.test(x)).slice(0, 8).map((m) =>
      [m, tryModel(`gpt://${folder}/${m}${m.indexOf("/") < 0 ? "/latest" : ""}`, [{ type: "text", text: "Какого цвета круг на картинке? Ответь одним словом." }, { type: "image_url", image_url: { url: pixel } }])]),
  }
}

module.exports = { status, analyze, check }
