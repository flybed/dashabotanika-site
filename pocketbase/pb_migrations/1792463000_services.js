/// <reference path="../pb_data/types.d.ts" />
// «Полезные сервисы для экологии»: компании и проекты, которые принимают вторсырьё, технику, вещи.
// Участники предлагают новые (status пустой = на проверке), Даша и модераторы одобряют.
// Стартовая подборка проверена в октябре 2026 по открытым источникам — график и адреса уточнять на сайтах.
const MOD = '(@request.auth.role = "moderator" || @request.auth.role = "admin")';

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const col = new Collection({
    type: "base",
    name: "services",
    listRule: 'status = "approved" || suggested_by = @request.auth.id || ' + MOD,
    viewRule: 'status = "approved" || suggested_by = @request.auth.id || ' + MOD,
    createRule: "@request.auth.id != '' && @request.body.suggested_by = @request.auth.id && @request.body.status:isset = false",
    updateRule: MOD,
    deleteRule: MOD,
    fields: [
      { name: "name", type: "text", required: true, max: 120 },
      { name: "city", type: "text", required: true, max: 80 },
      { name: "category", type: "select", values: ["Карты пунктов приёма", "Пункты и вывоз вторсырья", "Батарейки и техника", "Одежда и вещи", "Экоакции и сообщества"], maxSelect: 1, required: true },
      { name: "accepts", type: "text", max: 300 },
      { name: "url", type: "url" },
      { name: "note", type: "text", max: 600 },
      { name: "status", type: "select", values: ["approved", "rejected"], maxSelect: 1 },
      { name: "suggested_by", type: "relation", collectionId: users.id, maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true },
    ],
  });
  app.save(col);
  [
    ["RecycleMap — карта пунктов приёма", "Вся Россия", "Карты пунктов приёма", "Пункты для пластика, бумаги, стекла, металла, батареек, одежды и ещё десятка видов отходов", "https://recyclemap.ru",
      "Волонтёрская карта: фильтр по материалу и адресу. Проверенные пункты видны и в Яндекс Картах по запросу «раздельный сбор отходов»."],
    ["Яндекс Карты — «раздельный сбор отходов»", "Вся Россия", "Карты пунктов приёма", "Пункты приёма по материалам: можно искать «куда сдать батарейки», «приём пластика» и т. п.", "https://yandex.ru/maps",
      "Удобно с телефона: показывает ближайшие пункты и часы работы."],
    ["ВкусВилл — экосервисы", "Вся Россия", "Батарейки и техника", "Батарейки и аккумуляторы; в некоторых магазинах — другие экоакции", "https://vkusvill.ru/ecology/",
      "Контейнеры для батареек стоят в магазинах, за сдачу начисляют бонусы. Точки сбора — на карте экопроектов на сайте сети."],
    ["М.Видео и Эльдорадо — приём техники", "Вся Россия", "Батарейки и техника", "Батарейки и небольшая техника: смартфоны, ноутбуки, планшеты, мышки, клавиатуры, принтеры", "https://www.mvideo.ru",
      "Бесплатно, в сотнях магазинов в крупных городах. Крупную технику могут вывезти при покупке новой — уточняйте в магазине."],
    ["Собиратор", "Москва", "Пункты и вывоз вторсырья", "Вторсырьё разных видов и вещи на благотворительность", "https://sobirator.org",
      "Экоцентр, выросший из движения «РазДельный Сбор». Перед поездкой проверьте график и условия на сайте."],
    ["Движение «РазДельный Сбор»", "Вся Россия", "Экоакции и сообщества", "Акции по сбору вторсырья, просвещение", "https://rsbor.ru",
      "Волонтёрское движение: регулярные акции по приёму вторсырья в разных городах — расписание на сайте."],
  ].forEach(([name, city, category, accepts, url, note]) => {
    const r = new Record(col);
    r.set("name", name); r.set("city", city); r.set("category", category); r.set("accepts", accepts); r.set("url", url); r.set("note", note); r.set("status", "approved");
    app.save(r);
  });
}, (app) => {
  app.delete(app.findCollectionByNameOrId("services"));
});
