/// <reference path="../pb_data/types.d.ts" />
// Схема базы DashaBotanika: участники, отзывы, комментарии, барахолка, чаты,
// предложения, контент сайта, фото, персонажи «Счастливого мира» и уровни.
const MOD = '(@request.auth.role = "moderator" || @request.auth.role = "admin")';

migrate((app) => {
  // ---------- настройки: имя сайта, адрес, защита от спама ----------
  const settings = app.settings();
  settings.meta.appName = "DashaBotanika";
  settings.meta.appURL = "https://dashabotanika.ru";
  settings.meta.senderName = "DashaBotanika";
  settings.meta.hideControls = true; // схема меняется только миграциями из репозитория
  // PocketBase стоит за Caddy: реальный IP посетителя берём из X-Forwarded-For.
  settings.trustedProxy.headers = ["X-Forwarded-For"];
  settings.rateLimits.enabled = true;
  app.save(settings);

  // ---------- участники (встроенная коллекция users) ----------
  const users = app.findCollectionByNameOrId("users");

  const characters = new Collection({
    type: "base",
    name: "characters",
    listRule: "",
    viewRule: "",
    fields: [
      { name: "name", type: "text", required: true, max: 40 },
      { name: "emoji", type: "text", required: true, max: 16 },
      { name: "kind", type: "select", values: ["animal", "plant", "thing"], maxSelect: 1 },
      { name: "sort", type: "number" },
    ],
  });
  app.save(characters);

  users.fields.add(new TextField({ name: "name", required: true, min: 2, max: 30 }));
  users.fields.add(new RelationField({ name: "character", collectionId: characters.id, maxSelect: 1 }));
  users.fields.add(new SelectField({ name: "role", values: ["member", "moderator", "admin"], maxSelect: 1 }));
  users.fields.add(new NumberField({ name: "level", onlyInt: true }));
  users.fields.add(new JSONField({ name: "level_history" }));
  users.fields.add(new NumberField({ name: "exam_best", onlyInt: true }));
  users.fields.add(new TextField({ name: "exam_passed", max: 30 }));
  users.fields.add(new NumberField({ name: "game_best", onlyInt: true }));
  users.fields.add(new NumberField({ name: "leaves", onlyInt: true }));
  // Профили (имя, персонаж, уровень) публичные; почта скрыта настройкой emailVisibility.
  users.listRule = "";
  users.viewRule = "";
  const PROTECTED = '@request.body.role:isset = false && @request.body.level:isset = false && @request.body.level_history:isset = false && @request.body.leaves:isset = false';
  users.createRule = PROTECTED + ' && @request.body.character != ""';
  users.updateRule = '(id = @request.auth.id && ' + PROTECTED + ') || @request.auth.role = "admin"';
  users.deleteRule = "id = @request.auth.id";
  app.save(users);

  // ---------- привычки (личные) ----------
  app.save(new Collection({
    type: "base",
    name: "habits",
    listRule: "owner = @request.auth.id",
    viewRule: "owner = @request.auth.id",
    createRule: "@request.auth.id != '' && @request.body.owner = @request.auth.id",
    updateRule: "owner = @request.auth.id && @request.body.owner:isset = false",
    deleteRule: "owner = @request.auth.id",
    fields: [
      { name: "owner", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "data", type: "json", maxSize: 200000 },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_habits_owner ON habits (owner)"],
  }));

  // ---------- отзывы и комментарии ----------
  const authored = (name, extra) => new Collection({
    type: "base",
    name,
    listRule: "",
    viewRule: "",
    createRule: "@request.auth.id != '' && @request.body.author = @request.auth.id",
    deleteRule: "author = @request.auth.id || " + MOD,
    fields: [
      { name: "author", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      ...extra,
      { name: "created", type: "autodate", onCreate: true },
    ],
  });
  app.save(authored("reviews", [
    { name: "rating", type: "number", min: 1, max: 5, onlyInt: true },
    { name: "text", type: "text", required: true, max: 1500 },
  ]));
  app.save(authored("comments", [
    { name: "target", type: "text", required: true, max: 200 },
    { name: "text", type: "text", required: true, max: 1000 },
  ]));

  // ---------- барахолка ----------
  const listings = new Collection({
    type: "base",
    name: "listings",
    listRule: '(moderation = "approved" && status != "gone") || seller = @request.auth.id || ' + MOD,
    viewRule: '(moderation = "approved" && status != "gone") || seller = @request.auth.id || ' + MOD,
    createRule: "@request.auth.id != '' && @request.body.seller = @request.auth.id && @request.body.moderation:isset = false && @request.body.reason:isset = false",
    // Автор меняет только статус (забронировано / отдано); проверку ставит модератор.
    updateRule: "(seller = @request.auth.id && @request.body.moderation:isset = false && @request.body.reason:isset = false && @request.body.seller:isset = false && @request.body.title:isset = false && @request.body.kind:isset = false && @request.body.price:isset = false && @request.body.condition:isset = false && @request.body.city:isset = false && @request.body.note:isset = false && @request.body.photo:isset = false) || " + MOD,
    deleteRule: "seller = @request.auth.id || " + MOD,
    fields: [
      { name: "seller", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "title", type: "text", required: true, max: 100 },
      { name: "kind", type: "select", values: ["Продам", "Обмен", "Отдам даром"], maxSelect: 1, required: true },
      { name: "price", type: "text", max: 30 },
      { name: "condition", type: "text", max: 60 },
      { name: "city", type: "text", max: 80 },
      { name: "note", type: "text", max: 1500 },
      { name: "photo", type: "file", maxSelect: 1, maxSize: 15728640, mimeTypes: ["image/jpeg", "image/png", "image/webp"], thumbs: ["600x450"] },
      { name: "status", type: "select", values: ["active", "reserved", "gone"], maxSelect: 1 },
      { name: "moderation", type: "select", values: ["approved", "rejected"], maxSelect: 1 },
      { name: "reason", type: "text", max: 200 },
      { name: "created", type: "autodate", onCreate: true },
    ],
  });
  app.save(listings);

  // ---------- переписка по сделкам ----------
  // seller пустой — вещь «От Даши», её чаты видят модераторы.
  const CHAT_MEMBER = 'buyer = @request.auth.id || seller = @request.auth.id || (seller = "" && ' + MOD + ')';
  const chats = new Collection({
    type: "base",
    name: "chats",
    listRule: CHAT_MEMBER,
    viewRule: CHAT_MEMBER,
    createRule: "@request.auth.id != '' && @request.body.buyer = @request.auth.id && @request.body.seller != @request.auth.id",
    updateRule: CHAT_MEMBER + " && @request.body.buyer:isset = false && @request.body.seller:isset = false && @request.body.listing:isset = false",
    fields: [
      { name: "key", type: "text", required: true, max: 120 },
      { name: "title", type: "text", max: 120 },
      { name: "listing", type: "relation", collectionId: listings.id, maxSelect: 1, cascadeDelete: true },
      { name: "seller", type: "relation", collectionId: users.id, maxSelect: 1 },
      { name: "buyer", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "last_from", type: "relation", collectionId: users.id, maxSelect: 1 },
      { name: "last_at", type: "number" },
      { name: "read_by", type: "json", maxSize: 20000 },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_chats_key ON chats (`key`)"],
  });
  app.save(chats);

  const MSG_MEMBER = 'chat.buyer = @request.auth.id || chat.seller = @request.auth.id || (chat.seller = "" && ' + MOD + ')';
  app.save(new Collection({
    type: "base",
    name: "messages",
    listRule: MSG_MEMBER,
    viewRule: MSG_MEMBER,
    createRule: "@request.body.from = @request.auth.id && (" + MSG_MEMBER + ")",
    fields: [
      { name: "chat", type: "relation", collectionId: chats.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "from", type: "relation", collectionId: users.id, required: true, maxSelect: 1 },
      { name: "text", type: "text", required: true, max: 2000 },
      { name: "created", type: "autodate", onCreate: true },
    ],
  }));

  // ---------- предложения новостей и статей ----------
  app.save(new Collection({
    type: "base",
    name: "suggestions",
    listRule: "author = @request.auth.id || " + MOD,
    viewRule: "author = @request.auth.id || " + MOD,
    createRule: "@request.auth.id != '' && @request.body.author = @request.auth.id && @request.body.status:isset = false",
    updateRule: MOD,
    fields: [
      { name: "author", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "kind", type: "select", values: ["Новость", "Статья", "Идея для сайта"], maxSelect: 1 },
      { name: "title", type: "text", required: true, max: 120 },
      { name: "text", type: "text", required: true, max: 4000 },
      { name: "status", type: "select", values: ["accepted", "declined"], maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true },
    ],
  }));

  // ---------- контент сайта и фото ----------
  const content = new Collection({
    type: "base",
    name: "content",
    listRule: "",
    viewRule: "",
    updateRule: MOD,
    fields: [
      { name: "key", type: "text", required: true, max: 40 },
      { name: "data", type: "json", maxSize: 2000000 },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_content_key ON content (`key`)"],
  });
  app.save(content);
  const site = new Record(content);
  site.set("key", "site");
  site.set("data", {
    "about": {
      "name": "Даша",
      "text": "Привет! Я верю, что забота о планете начинается с маленьких ежедневных решений: что положить в тарелку, во что одеться, куда отнести пустую бутылку.\n\nЗдесь я собираю то, что пробую сама: полезные вещи, вкусные сезонные рецепты, любимые кафе и честные советы без занудства.\n\n(Этот текст можно заменить в режиме редактирования.)"
    },
    "contacts": {
      "email": "",
      "telegram": "dashabotanikarecipes",
      "instagram": "@dashabotanika",
      "note": "Пишите, если хотите что-то предложить для барахолки, посоветовать кафе или просто поболтать об эко-привычках."
    },
    "products": [
      {
        "id": "p1",
        "title": "Шопер из плотного хлопка",
        "cat": "Покупки",
        "replaces": "Пластиковые пакеты",
        "why": "Один шопер за год заменяет сотни пакетов. Выбирайте плотный и складной, чтобы всегда был в сумке."
      },
      {
        "id": "p2",
        "title": "Сетчатые мешочки для овощей",
        "cat": "Покупки",
        "replaces": "Фасовочные пакеты",
        "why": "Лёгкие, их можно взвешивать на весах в магазине и стирать вместе с бельём."
      },
      {
        "id": "p3",
        "title": "Бамбуковая зубная щётка",
        "cat": "Ванная",
        "replaces": "Пластиковая щётка",
        "why": "Ручка из бамбука разлагается. Щетинку перед утилизацией выдерните щипцами."
      },
      {
        "id": "p4",
        "title": "Твёрдый шампунь",
        "cat": "Ванная",
        "replaces": "Шампунь во флаконе",
        "why": "Без пластиковой упаковки, кусочек на 50–80 мытьёв, удобно в поездках."
      },
      {
        "id": "p5",
        "title": "Восковые салфетки",
        "cat": "Кухня",
        "replaces": "Пищевая плёнка",
        "why": "Ткань с пчелиным воском обнимает миску или сыр, моется прохладной водой и служит около года."
      },
      {
        "id": "p6",
        "title": "Термокружка",
        "cat": "В дороге",
        "replaces": "Одноразовые стаканы",
        "why": "Многие кофейни наливают в свою кружку и даже дают скидку."
      },
      {
        "id": "p7",
        "title": "Стеклянные контейнеры",
        "cat": "Кухня",
        "replaces": "Пластиковые ланчбоксы",
        "why": "Не впитывают запахи, подходят для духовки и микроволновки, служат годами."
      },
      {
        "id": "p8",
        "title": "Многоразовые диски для снятия макияжа",
        "cat": "Ванная",
        "replaces": "Ватные диски",
        "why": "Набор из 10 дисков заменяет тысячи ватных. Стираются в мешочке для белья."
      }
    ],
    "cafes": [
      {
        "id": "c1",
        "name": "Название кафе",
        "city": "Город",
        "address": "Улица, дом",
        "kind": "Веган-кафе",
        "note": "Что здесь особенного: своя кружка со скидкой, сезонное меню, без одноразовой посуды.",
        "example": true
      },
      {
        "id": "c2",
        "name": "Название кофейни",
        "city": "Город",
        "address": "Улица, дом",
        "kind": "Кофейня",
        "note": "Например: овощи от местных фермеров, кофейная гуща идёт на удобрение.",
        "example": true
      },
      {
        "id": "c3",
        "name": "Название бистро",
        "city": "Город",
        "address": "Улица, дом",
        "kind": "Бистро",
        "note": "Например: можно забрать остатки еды в свой контейнер.",
        "example": true
      }
    ],
    "market": [
      {
        "id": "m1",
        "title": "Льняное платье, размер M",
        "kind": "Продам",
        "price": "1500 ₽",
        "condition": "Отличное",
        "note": "Пример объявления: замените своим.",
        "example": true
      },
      {
        "id": "m2",
        "title": "Стеклянные банки 0,5 л, 12 шт.",
        "kind": "Отдам даром",
        "price": "",
        "condition": "Чистые",
        "note": "Пример объявления: для заготовок или хранения круп.",
        "example": true
      },
      {
        "id": "m3",
        "title": "Книги о садоводстве",
        "kind": "Обмен",
        "price": "",
        "condition": "Хорошее",
        "note": "Пример объявления: меняю на комнатные растения.",
        "example": true
      }
    ],
    "photos": {
      "hero": "/img/hero.webp",
      "about": "/img/globe.webp",
      "cafes": "/img/coffee.webp",
      "fashion": "/img/fashion.webp",
      "gallery": [
        "/img/owl.webp"
      ]
    },
    "articles": [
      {
        "id": "a1",
        "cat": "Статья",
        "date": "2026-10-19",
        "title": "Сортировка дома за один вечер",
        "lead": "Чтобы начать сортировать, не нужны пять вёдер и идеальная кухня. Хватит двух контейнеров и пары привычек.",
        "body": "1. Поставьте рядом с обычным ведром второе, для «сухого» вторсырья: пластик, бумага, металл, стекло. Разобрать их можно позже, уже перед походом к контейнерам.\n\n2. Ополаскивайте упаковку сразу после того, как она опустела. Сухая и чистая упаковка не пахнет и не портит остальное вторсырьё.\n\n3. Сплющивайте бутылки и коробки: так в контейнер помещается в три раза больше.\n\n4. Узнайте, что принимают рядом с домом. Карты пунктов приёма есть почти в каждом городе. Начните с того, что сдать проще всего, например бумаги и бутылок ПЭТ.\n\n5. Батарейки и лампочки складывайте в отдельную банку и раз в пару месяцев относите в бокс в супермаркете.\n\nГлавное правило: лучше сортировать два вида отходов каждый день, чем все семь один раз в жизни."
      },
      {
        "id": "a2",
        "cat": "Статья",
        "date": "2026-10-19",
        "title": "Капсульный гардероб без жертв",
        "lead": "Меньше вещей, но больше образов. Как собрать гардероб, который сочетается сам с собой.",
        "body": "Капсула — это 30–40 вещей в одной цветовой гамме, которые легко комбинировать между собой.\n\nС чего начать:\n— Достаньте всё из шкафа и отложите то, что не носили больше года.\n— Выберите 2–3 базовых цвета и 1–2 акцентных.\n— Посчитайте, сколько образов даёт каждая вещь. Если меньше трёх, это кандидат на барахолку.\n— Новые покупки проверяйте правилом 30 носок.\n\nВещи, которые не вошли в капсулу, можно продать, обменять или отдать. Так у них начнётся вторая жизнь, а у вас освободится место."
      },
      {
        "id": "a3",
        "cat": "Новость",
        "date": "2026-10-19",
        "title": "DashaBotanika открылась!",
        "lead": "Здесь будут эко-рецепты, полезные находки, любимые кафе и барахолка. Регистрируйтесь, чтобы оставлять отзывы и предлагать свои темы.",
        "body": "Привет! Этот сайт про то, как жить бережнее и при этом вкусно, красиво и с удовольствием.\n\nЧто уже можно сделать:\n— посчитать пользу от переработки в калькуляторе;\n— сыграть в игру и рассортировать мусор на скорость;\n— сдать эко-экзамен и получить сертификат;\n— отмечать эко-привычки в личном трекере.\n\nЗарегистрируйтесь, чтобы писать комментарии, оставлять отзывы и предлагать новости и статьи. Самые интересные предложения появятся в журнале."
      }
    ]
  });
  app.save(site);

  app.save(new Collection({
    type: "base",
    name: "photos",
    listRule: "",
    viewRule: "",
    createRule: MOD + " && @request.body.uploaded_by = @request.auth.id",
    deleteRule: MOD,
    fields: [
      { name: "file", type: "file", required: true, maxSelect: 1, maxSize: 15728640, mimeTypes: ["image/jpeg", "image/png", "image/webp"] },
      { name: "uploaded_by", type: "relation", collectionId: users.id, maxSelect: 1 },
    ],
  }));

  // ---------- персонажи «Счастливого мира» ----------
  [
    ["Слон", "🐘", "animal"], ["Лиса", "🦊", "animal"], ["Ёж", "🦔", "animal"], ["Сова", "🦉", "animal"],
    ["Кит", "🐋", "animal"], ["Пчела", "🐝", "animal"], ["Дуб", "🌳", "plant"], ["Берёза", "🌿", "plant"],
    ["Подсолнух", "🌻", "plant"], ["Папоротник", "🪴", "plant"],
  ].forEach(([name, emoji, kind], i) => {
    const r = new Record(characters);
    r.set("name", name); r.set("emoji", emoji); r.set("kind", kind); r.set("sort", (i + 1) * 10);
    app.save(r);
  });

  // ---------- уровни: условия задаёт Даша в админке ----------
  const levels = new Collection({
    type: "base",
    name: "levels",
    listRule: "",
    viewRule: "",
    fields: [
      { name: "rank", type: "number", required: true, onlyInt: true, min: 1 },
      { name: "name", type: "text", required: true, max: 40 },
      { name: "description", type: "text", max: 500, help: "Что открывает уровень, видно участникам" },
      { name: "min_leaves", type: "number", onlyInt: true, help: "Сколько всего эко-листочков в трекере привычек" },
      { name: "min_exam", type: "number", onlyInt: true, max: 10, help: "Лучший результат эко-экзамена, из 10" },
      { name: "min_game", type: "number", onlyInt: true, help: "Рекорд в игре «Эко-уборка»" },
      { name: "min_reviews", type: "number", onlyInt: true, help: "Отзывов и комментариев на сайте" },
      { name: "certificate_text", type: "text", max: 300, help: "Текст на онлайн-сертификате" },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_levels_rank ON levels (rank)"],
  });
  app.save(levels);
  [
    [1, "Эко малыш", "Первые шаги: вы с нами!", 0, 0, 0, 0, "сделал(а) первый шаг к экологичной жизни"],
    [2, "Эко Чайник", "Пробуете эко-привычки и уже кое-что знаете.", 10, 5, 0, 0, "освоил(а) первые эко-привычки"],
    [3, "Эко Друг", "Привычки стали регулярными, экзамен сдан.", 40, 7, 20, 0, "стал(а) настоящим другом планеты"],
    [4, "Эко Продвинутый", "Помогаете другим и делитесь опытом.", 100, 9, 40, 1, "уверенно живёт в ритме эко"],
    [5, "Эко Эксперт", "Эко — ваш образ жизни.", 250, 10, 60, 3, "стал(а) эко-экспертом DashaBotanika"],
  ].forEach(([rank, name, description, leaves, exam, game, reviews, cert]) => {
    const r = new Record(levels);
    r.set("rank", rank); r.set("name", name); r.set("description", description);
    r.set("min_leaves", leaves); r.set("min_exam", exam); r.set("min_game", game); r.set("min_reviews", reviews);
    r.set("certificate_text", cert);
    app.save(r);
  });
}, (app) => {
  for (const name of ["levels", "photos", "content", "suggestions", "messages", "chats", "listings", "comments", "reviews", "habits"]) {
    app.delete(app.findCollectionByNameOrId(name));
  }
  const users = app.findCollectionByNameOrId("users");
  for (const f of ["character", "role", "level", "level_history", "exam_best", "exam_passed", "game_best", "leaves"]) users.fields.removeByName(f);
  app.save(users);
  app.delete(app.findCollectionByNameOrId("characters"));
});
