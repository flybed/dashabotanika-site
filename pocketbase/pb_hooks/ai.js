// ИИ-помощник: фото тарелки → как сделать блюдо полезнее и экологичнее; фото упаковки → куда сдать и как использовать.
// Yandex AI Studio, совместимый с OpenAI формат (chat/completions, картинка как data:URL).
// Переменные окружения: YC_API_KEY, YC_FOLDER, по желанию YC_MODEL (по умолчанию gemma-3-27b-it), YC_API (только для тестов), AI_DAILY.

const env = (k) => String($os.getenv(k) || "").trim()
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
  } catch (e) { return Object.assign(st, { ok: false, message: "Помощник сейчас не отвечает, попробуйте через минуту." }) }
  const j = res.json || {}
  const text = String((((j.choices || [])[0] || {}).message || {}).content || "").trim()
  if (res.statusCode !== 200 || !text) return Object.assign(st, { ok: false, message: "Помощник сейчас не отвечает, попробуйте через минуту." })
  const rec = new Record(app.findCollectionByNameOrId("ai_uses"))
  rec.set("user", userId); rec.set("kind", kind); rec.set("tokens", ((j.usage || {}).total_tokens) | 0)
  app.save(rec)
  return { ok: true, enabled: true, limit: st.limit, left: st.left - 1, text: text.slice(0, 2000) }
}

module.exports = { status, analyze }
