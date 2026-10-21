// Персонажа с хозяйкой (characters.reserved_for — например, Слон у Даши) другие выбрать не могут.
function checkReserved(e) {
  const charId = e.record.getString("character")
  if (!charId) return
  let owner = ""
  try { owner = e.app.findRecordById("characters", charId).getString("reserved_for") } catch (err) { return }
  if (owner && owner !== e.record.id) throw new BadRequestError("Этот персонаж уже занят — выберите другого.")
}
module.exports = { checkReserved }
