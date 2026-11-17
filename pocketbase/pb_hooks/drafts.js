// Черновики помощника: разметку, которую сайт не покажет («|» без «|---|», «####», «~~», HTML-теги…), сервер не
// принимает — помощник получает ответ 400 со списком строк, исправляет и отправляет снова. Правила — одна функция
// mdLeftovers в site/js/app.js (там же предупреждения в редакторах у Даши); здесь она читается оттуда же.
const SITE = `${__hooks}/../../site`

function leftovers(src) {
  const m = toString($os.readFile(`${SITE}/js/app.js`)).match(/function mdLeftovers\(src\)\{[\s\S]*?\n\}\n/)
  if (!m) return []
  return new Function(`${m[0]}; return mdLeftovers`)()(src)
}

// created — новая запись; при изменении проверяем, только когда черновик правит сам автор (помощник),
// автосохранение Даши не останавливаем — ей предупреждение показывает редактор
function check(e, created) {
  if (e.record.getString("status")) return
  if (!created && !(e.auth && e.auth.id === e.record.getString("author"))) return
  const bad = leftovers(e.record.getString("body"))
  if (!bad.length) return
  throw new BadRequestError("В тексте разметка, которую сайт не покажет. Исправьте эти строки и отправьте снова: " +
    bad.slice(0, 10).map((x) => `строка ${x.n} «${x.text}» — ${x.why}`).join("; "))
}

module.exports = { check, leftovers }
