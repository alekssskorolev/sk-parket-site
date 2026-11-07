# SK Паркет — руководство следующему ИИ-разработчику

Анализ: **6 ноября 2026, Europe/Moscow**. Репозиторий: https://github.com/alekssskorolev/sk-parket-site; ветка **main**, базовый SHA **b7f39ba093362b5773283c9b487ef7e0ba39c952**. Все пути ниже относительно корня репозитория. Документ описывает этот снимок; состояние облака отмечается отдельно. Приложение, зависимости репозитория, рабочие данные и инфраструктура при исследовании не изменялись.

Точечное обновление документации: **6 ноября 2026, Europe/Moscow**, локальные незакоммиченные изменения, нового SHA нет. После исходного анализа созданы корневой `AGENTS.md` и задания ролям в `agents/`: основной чат координирует разработку, актуализацию руководства и выпуск по разделам «Роли» и «Последовательность» в `AGENTS.md`. Это переносимые инструкции запускаемым субагентам, а не зарегистрированные конфигурации или постоянная память агентов. В текущей рабочей папке только документация, checkout приложения отсутствует; код приложения не менялся, тесты и облачные наблюдения повторно не проверялись. Результаты ниже относятся к исходному анализу.

Частичное исследование **PR #13, 6 ноября 2026**: изучен diff 15 файлов от исходной базы до `main` **8b0e609e98eee1d27bfc16bac169afb3209130c4** (исходники во временном checkout). Дополнения о синхронизации цен ниже относятся к этому SHA; исходный аудит и его облачные наблюдения не перепроверялись. GitHub подтверждает merge, пользователь сообщил о публикации; совпадение работающей функции с этим SHA и сохранённый `priceSync.enabled` независимо не проверены. Правки самого handoff остаются локальными и незакоммиченными; в этой задаче приложение, ручные цены, режим синхронизации и инфраструктура не менялись.

Частичное обновление меню облачной админки: **6 ноября 2026**, код поверх `8b0e609e98eee1d27bfc16bac169afb3209130c4` пока **незакоммичен**, candidate SHA ещё не создан. Изучены `F/admin-public/admin.js`, новый `item-sections.js`, маршрут в `F/admin-app.js` и профильные проверки; live-сайт/БД и выпуск не проверялись. Результаты этого изменения отдельно приведены в разделе проверок.

## Быстрый старт

Сайт услуг по укладке паркета: калькулятор диапазона стоимости, портфолио, обратный звонок; защищённая админка управляет ценами, заявками, галереей и фоном первого экрана (`public/index.html`, `web-cloud/site.js`, `cloud-functions/ydb-stage1/function/admin-public/`).

**Сначала выбери режим.** Не считай `npm start` локальной копией всей облачной системы.

| Режим | Вход и стек | Данные |
| --- | --- | --- |
| Облачный сайт, основной путь | `docs/index.html`, vanilla HTML/CSS и ES modules; `web-cloud/api.js` → API Gateway → Node.js 22 `function/index.js:handler` | YDB через `ydb-sdk`, приватный Object Storage; секреты Lockbox |
| Самостоятельный Node-сервер | `server.mjs`, `public/site.js`, `public/admin.js`; Node ≥24, встроенный `node:sqlite`, без npm runtime-зависимостей в корневом `package.json` | `DATA_DIR/parket.sqlite`, фото BLOB; отдельная реализация auth и Telegram |
| Старое статическое демо | `scripts/build-demo.mjs`, `scripts/demo-api.js` | localStorage; не использовать для действующей публикации |

Обозначение `F/` далее означает `cloud-functions/ydb-stage1/function/`, `CT/` — `cloud-functions/ydb-stage1/test/`.

Проверено в изолированной временной копии исходников на macOS arm64, Node **26.11.1**, npm **11.20.0** (это не целевые CI/runtime версии):

```sh
npm test
npm run build:pages
git diff --exit-code -- docs cloud-functions/ydb-stage1/function/admin-public/hero-preview.html cloud-functions/ydb-stage1/function/admin-public/hero-display.js
```

Результат: **28/28** корневых тестов прошли, сборка воспроизводится без diff. Первый запуск интеграционного теста не смог открыть локальный сервер в ограниченной среде; повтор с разрешением на локальный сервер прошёл. `test/app.test.mjs` запускает сервер с временной SQLite и случайным паролем, проверяет перезапуск и удаляет свои данные.

Предусмотренный локальный запуск SQLite-варианта (`package.json`, `scripts/setup.mjs`, `.env.example`): `npm run setup`, затем `npm start`; адреса `/` и `/admin` на localhost:3000. Интерактивный setup здесь не выполнялся; запуск сервера проверен через тест. Используй отдельный `DATA_DIR`, не подключай рабочую базу. Облачного локального HTTP-эмулятора в scripts package.json нет: обработчики тестируются с подменёнными storage/провайдерами.

Команды облачного CI, требующие подходящей платформы:

```sh
npm ci --prefix cloud-functions/ydb-stage1/function --ignore-scripts --no-audit --no-fund
node --test cloud-functions/ydb-stage1/test/*.test.cjs
```

На этом Mac `npm ci` остановился с **EBADPLATFORM**: прямые зависимости `@img/sharp-linux-x64` и `@img/sharp-libvips-linux-x64` закреплены для Linux x64/glibc (`F/package.json`, lockfile). Облачный suite без зависимостей: 112 успешных проверок, 5 ошибок загрузки test-файлов из-за отсутствующих модулей; **это не полный успешный прогон**. Повторять полный suite в Linux x64 CI, не менять lockfile ради обхода платформы.

Прочитаны `README.md`, `НАЧАТЬ ЗДЕСЬ.md`, `SEO_IMPLEMENTATION_REPORT.md`, все тематические `.md` в `cloud-functions/ydb-stage1/` и deploy/README. На базовом SHA применимых `AGENTS.md` и прежнего `AI_HANDOFF.md` не было; созданный после анализа корневой `AGENTS.md` теперь содержит действующие правила работы. Документация ранних этапов противоречива: фактические приоритеты — текущие обработчики и workflow, затем проверенное облако.

## Карта проекта

| Путь | Назначение | Когда сюда обращаться |
| --- | --- | --- |
| `AGENTS.md` | Оркестратор основного чата, роли, последовательность этапов и полномочия | Начало любой задачи; назначение ролей и проверка результата перед выпуском |
| `agents/material-matcher.md` | Только чтение: сопоставление актуальных published и отличий draft с магазином | До разработки при отсутствии подтверждённых товаров: узкий заданный список, результат компактной таблицей |
| `agents/site-developer.md` | Задание разработчику: код, generated-файлы и проверки без публикации | Реализация изменения и возврат диагностики выпуска на исправление |
| `agents/handoff-editor.md` | Задание редактору, меняющему только `docs/AI_HANDOFF.md` | Точечная актуализация руководства после кода и проверок, до фиксации кандидата |
| `agents/release-manager.md` | Задание агенту выпуска: проверенный candidate SHA, публикация, CI и smoke в режиме чтения | Разрешённый выпуск; подтверждение фактического результата и передача статуса оркестратору |
| `public/index.html`, `public/limestone.css`, `public/assets/` | Общая разметка, inline CSS в HTML и отдельные стили/изображения | Тексты, якоря, responsive-вёрстка; HTML используется также генератором hero-preview |
| `web-cloud/site.js`, `web-cloud/api.js` | Облачный UI: `refreshConfig`, `selection`, `update`, submit, галерея, Метрика; allowlist API и credentials:omit | Изменение действующего поведения посетителя |
| `public/engine.js` | `validateConfig`, `calculate`, `materialData`, `updateMaterialRate` | Формулы, составы, округления, типы цен |
| `public/hero.js`, `public/hero-display.js` | Получение опубликованного фона и общий renderer/валидация фона | Фон, breakpoint, одинаковый preview и сайт |
| `F/index.js`, `F/public-app.js`, `F/admin-app.js` | Composition root; публичные и защищённые маршруты | API, авторизация, интеграции и dispatch |
| `cloud-functions/ydb-stage1/PRICE_SYNC.md`, `F/price-sync.js`, `F/parket-sale.js` | Пилот одной цены; `createPriceSync`, `applyPriceEdit`, `fetchProduct/parseProduct` | Ручной режим, расписание, защита цены и адаптация к изменению карточки магазина |
| `F/admin-public/price-sync-admin.js`, `CT/price-sync.test.cjs`, `scripts/check-price-sync-ui.cjs`, `scripts/check-price-source.cjs` | Панель `createPriceSyncAdmin`, unit/service+API, offline browser и отдельная live-проба источника | Изменение UI/контракта пилота; не путать offline fixtures с ценой магазина |
| `F/admin-storage.js`, `F/ydb-storage.js` | YQL, таблицы, транзакции и адаптация orders | Данные заявок, цен, сессий, очередей |
| `F/gallery.js`, `F/gallery-storage.js`, `F/hero.js` | Image pipeline, Object Storage, refs, draft/publish, cleanup | Галерея и фон; удаление файлов |
| `F/admin-public/admin.{html,js,css}` | Реальная облачная админка | Цены, карточки заявок, опрос, уведомления |
| `F/admin-public/item-sections.js`, `CT/item-sections.test.cjs` | `itemSection/itemSections/newItem`: виртуальные разделы единого config.items | Категории материалов, fallback старых записей и добавление/копирование; asset `/gallery-admin.js?module=item-sections` |
| `F/admin-public/gallery-admin.js`, `hero-admin.js`, `hero-preview.js` | Редакторы медиа и iframe-preview | UI галереи/фона, save/publish/rollback |
| `F/{telegram,max,email}.js`, `F/admin-public/lead-export.js` | Очереди доставки, привязка чата; `leadWorkbook` для XLSX | Уведомления и выгрузки; email использует тот же генератор сметы |
| `scripts/build-cloud.mjs`, `build-hero-preview.mjs` | Генерация Pages и облачного hero-preview | После правок HTML/CSS/клиента; проверять сгенерированный diff |
| `scripts/render-public.mjs`, `seo.mjs`, `refresh-public-content.mjs` | SSR статического портфолио, SEO, получение публичных snapshots и responsive assets | Индексация, свежесть статического портфолио |
| `public/content/*.json`, `web-cloud/image-manifest.js` | Снимки публичных цен/галереи/изображений и карта оптимизированных файлов | Статический fallback; это не dump БД |
| `docs/` | Коммитируемая выдача Pages, включая исторические файлы demo | Проверка результата сборки; исходники менять выше. Этот Markdown хранится рядом с публикацией |
| `.github/workflows/*.yml`, `cloud-functions/ydb-stage1/deploy/` | CI, OIDC, пакет функции; OpenAPI gateway | Выпуск, env, секретные привязки, новые маршруты |
| `server.mjs`, `public/site.js`, `public/admin.*`, `lib/telegram.mjs` | Альтернативный SQLite runtime | Только если задача относится к нему; перенос в облако не автоматический |
| `test/`, `CT/`, `scripts/check-*.{mjs,cjs}` | Unit/integration, security и browser/SEO проверки | Подбирать по карте функций ниже |

## Архитектура и потоки данных

```text
public/index.html + public/content + web-cloud/* + public/engine.js
                  │ scripts/build-cloud.mjs
                  ▼
        docs/ → GitHub Pages → браузер посетителя
                                   │ GET config/gallery; POST leads
                                   ▼
              API Gateway (deploy/admin-gateway.openapi.json)
                                   │ IAM invocation, $latest
                                   ▼
                         F/index.js:handler
                ┌──────────────────┼──────────────────┐
           admin-app.js       public-app.js     private timer event
                │                  │            telegram/max/email.flush
                └──── admin-storage.js ────────────────┘
                             │ YDB
               gallery/hero → gallery-storage.js
                             └→ private Object Storage
```

`F/index.js` лениво собирает зависимости один раз на инстанс, передаёт runtime-токен в `objects.credentials(context)`. Сначала распознаёт timer, затем admin-маршруты, health, публичный API при наличии `ADMIN_ORIGIN`, затем legacy `F/app.js`. Не удаляй legacy, предполагая, что он не достижим: там остаётся закрытый `/api/test-leads` под флагом.

Калькулятор: `web-cloud/site.js:refreshConfig` получает опубликованные `version/config`, `update` вызывает `calculate`; обновление раз в 60 секунд и при возврате вкладки. `calculate` объединяет recipe через Set (одна операция не начисляется дважды), учитывает собственные материалы, запас, целые упаковки, отдельные margins материалов/работ и индивидуальную оценку рисунка. Нельзя заменить формулу только в UI: сервер пересчитывает смету.

Заявка: submit в `web-cloud/site.js` фиксирует selection/version только при приложенном расчёте, создаёт UUID `pendingRequestId`, передаёт согласие и пустые photos. `F/public-app.js:createPublicHandler` проверяет Origin, JSON ≤32 КБ, имя/телефон/комментарий, honeypot, UUID, версию согласия, selection и цену. Сначала ищет успешный requestId (повтор может подтвердиться даже после изменения цены), затем применяет лимиты 8/IP/час и 150 общих/час, считает серверный estimate. `admin-storage.insertLeadOnce` атомарно сохраняет orders, ключ повтора и задания доставки. UI признаёт успех только по успешному ответу с id; ошибки 409 требуют обновления конфигурации. Фото клиента в облаке запрещены, галерея администратора — отдельный поток.

Цены: `admin-app` PUT config меняет draft с проверкой revision; POST publish валидирует draft, повышает опубликованную version и оставляет 20 записей history. Restore копирует историю только в draft. Снимок старой заявки в `orders.estimate` остаётся прежним.

**Исключение PR13 — пилот синхронизации клея.** Первый источник для продолжения функции — `cloud-functions/ydb-stage1/PRICE_SYNC.md`, затем указанные там реализации и проверки. Админка → Настройки → «Цены материалов» (`F/admin-public/admin.js`, `price-sync-admin.js`). Единственная привязка — `items/glue`, Berger Bond M1X 7 кг, артикул 156524; произвольного выбора URL/материалов нет. `initialSync()` в `F/price-sync.js` задаёт `enabled:false`: по умолчанию сохраняется ручной режим. При расширении сохранять default off, возможность выключения и ручного ввода; не включать синхронизацию и не перезаписывать рабочие ручные цены ради разработки. Ручная проверка при выключенном режиме получает результат магазина и обновляет служебный статус, но не draft/published цену. Включение меняет рабочий режим синхронизации; проверка при включённом режиме может немедленно изменить цену. Эти действия не являются read-only smoke.

Поток: существующий private timer → `F/index.js` → `priceSync.scheduled()` → `check(false)` → транзакционный `admin-storage.syncMutate` claim lease → `parket-sale.fetchProduct()` вне транзакции → повторный `syncMutate` с проверкой lease/generation/revision → обновление только glue в draft и published, затем обычный GET `/api/config` отдаёт новую published. В отличие от обычного POST publish, **синхронизация сразу меняет опубликованную цену одного материала и его draft**, сохраняя остальные неопубликованные правки только в draft. При изменении создаются version+1, revision+1 и запись history (до 20); та же цена не создаёт новую версию. Режим `pricingMode:'area'` сохраняется, новая ставка `areaPrice = packPrice * consumption`; расход, размер упаковки, engine, SQLite/demo и старые snapshots заявок PR13 не меняет.

Расписание `scheduled/nextSchedule`: окно UTC hour=3, minutes=0…10 включительно (06:00–06:10 МСК); сохранённый nextAt сдвигается на следующий день при claim, в том числе перед неуспешной загрузкой. Пропуск всего окна переносит проверку на следующий день. Ручные попытки не чаще 60 секунд, lease 60 секунд; локальный skipUntil уменьшает чтения, межинстансную защиту обеспечивает строка YDB. При выключении автоматического HTTP к магазину нет, служебные чтения БД возможны. Начатый HTTPS после выключения может завершиться, но lease/generation не дадут применить его результат. Несовпадение revision после запроса также пропускает применение.

`F/parket-sale.js` разрешает только фиксированный HTTPS host/path карточки (до двух редиректов на этот же товар у parket-sale.ru/www.parket-sale.ru), обычную TLS-проверку, IPv4, общий deadline 9 секунд и ответ до 2 200 000 байт. `parseProduct` проверяет H1, артикул, 7 кг, наличие и однозначную цену за упаковку, исключает script/recommendations; `check` повторно валидирует товар и цену 1000…100000 ₽. Изменение относительно текущей эффективной цены упаковки более 30% или ошибка сохраняют прежнюю цену и lastError. Изменение HTML магазина должно приводить к отказу, не к угадыванию цены. Числа fixtures и историческая цена из PRICE_SYNC.md не являются проверенной текущей ценой.

Доставка: `F/index.js` выбирает MAX, если `max.ready()` возвращает `'max'`, иначе Telegram; email ставится параллельно. До привязки получателя задания могут ожидать. Сразу после новой записи пробуется один messenger-job; SMTP выполняется только таймером. Timer запускает по одному `telegram.flush(1)`, `max.flush(1)`, `email.flush(1)`, `gallery.cleanup()` и, с PR13, `priceSync.scheduled()`. Lease 60 секунд, backoff, TTL 7 дней; at-least-once, возможны повторы после потерянного подтверждения (`F/{telegram,max,email}.js`). Telegram/MAX отправляют общее уведомление без контактов; почта содержит контакты, сохранённую смету и XLSX. Не переносить поведение SQLite Telegram, который отправляет данные клиента, в облачную интеграцию без отдельного решения.

Авторизация: одна роль администратора; сущностей пользователя/сотрудников/RBAC нет (`F/admin-app.js`). Lockbox → `ADMIN_PASSWORD` (14–256 символов); runtime scrypt + timingSafeEqual. В cookie `__Secure-sk_admin` — случайный токен, в YDB — SHA-256; HttpOnly/Secure/SameSite=Strict, 8 часов. Credential digest сессии делает смену пароля отзывом старых сессий. Host должен соответствовать отдельному HTTPS `ADMIN_ORIGIN`; запись требует точного Origin и X-CSRF-Token. Login limits в YDB: 8/IP и 80 глобально за 15 минут. Публичный клиент cookie не отправляет. CORS — фильтр источника, не средство авторизации внешнего клиента. HTML/JS админки доступны без сессии, сами данные закрыты; CSP anti-frame имеет исключение SAMEORIGIN только для hero-preview.

## Карта функций

| Функция сайта | Страница/компонент | Обработчик/API | Модель/таблица | Связанные проверки |
| --- | --- | --- | --- | --- |
| Расчёт | `public/index.html#calculator`, `web-cloud/site.js:selection/update` | GET `/api/config`; `engine.calculate` | `sk_admin_state['prices'].published` | `test/app.test.mjs`, `materials.test.mjs`, `CT/public.test.cjs` |
| Обратный звонок / заявка со сметой | `#contact-form`, `openCallback`, submit | POST `/api/leads`, `createPublicHandler` | orders, sk_public_requests, outbox | `CT/public.test.cjs`, `admin-storage.test.cjs`, `test/lead-analytics.test.mjs` |
| Вход / выход | `F/admin-public/admin.js`, login UI | `/api/login`, `/api/session`, `/api/logout` | sk_admin_sessions, sk_admin_limits | `CT/admin.test.cjs` |
| Цены / составы / история | облачный `admin.js`: редакторы, rules, history | GET/PUT `/api/admin/config`, POST publish/restore | sk_admin_state prices: draft/revision/published/history | `CT/admin.test.cjs`, `test/materials.test.mjs` |
| Разделы материалов/работ (незакоммичённое обновление) | `F/admin-public/admin.js:render/edit`, `item-sections.js:itemSection/newItem` | Прежний GET/PUT config и publish; отдельного API категорий нет | config.items[].adminCategory — optional UI metadata; массивы/таблицы не разделяются | `CT/item-sections.test.cjs`, `scripts/check-price-sync-ui.cjs` |
| Синхронизация цены glue / ручной fallback (PR13) | `F/admin-public/admin.js:renderSettings`, `price-sync-admin.js:createPriceSyncAdmin` | GET/PUT `/api/admin/config?view=price-sync` (`{revision,enabled}`); POST `/api/admin/publish?view=price-sync` (`{action:'check'}`); asset `/gallery-admin.js?module=price-sync` → price-sync-admin.js | `sk_admin_state['prices'].priceSync`, draft/published/history; новых таблиц нет | `CT/price-sync.test.cjs`, `scripts/check-price-sync-ui.cjs`, отдельный `scripts/check-price-source.cjs` |
| Список / статус / заметка / удаление заявки | облачный `admin.js:refreshCount`, раздел leads | GET `/api/admin/leads?before=…`, GET/PATCH/DELETE `/api/admin/leads/{id}` | orders, при удалении три outbox | `CT/admin.test.cjs`, `admin-storage.test.cjs` |
| Excel / CSV | `F/admin-public/lead-export.js:leadWorkbook` | Генерация в браузере из сохранённой заявки; email импортирует модуль | orders.estimate, текущий прайс не применяется | `CT/email.test.cjs`; дополнительные `test/pages.cjs`, `test/notifications.cjs` не входят в npm test |
| Портфолио | `web-cloud/site.js:loadGallery/galleryCard`, `#works`, `#real-works-grid` | GET `/api/gallery`, `/api/gallery/images/{id}` | sk_gallery_state, sk_gallery_media, bucket | `CT/gallery.test.cjs`, `gallery-polish.test.cjs`, `geometric-carousel.test.cjs`, `test/seo.test.mjs` |
| Редактирование портфолио | `F/admin-public/gallery-admin.js` | `/api/admin/gallery`, `/publish`, `/media`, `/media/{id}` | draft/published с общей gallery revision; media refs | `CT/gallery.test.cjs`, `admin.test.cjs` |
| Фон desktop/mobile | `public/hero.js`, `hero-display.js`; облачные hero-admin/preview | gallery-маршруты с `?view=hero`, upload с heroDevice | sk_gallery_state.payload.hero; media | `CT/hero.test.cjs`, `scripts/check-hero-editor.cjs` |
| Уведомления | облачный admin.js и notifications-sw.js | `/api/admin/telegram`: provider=email/max; private timer | sk_admin_state telegram/max, outbox | `CT/telegram.test.cjs`, `max.test.cjs`, `email.test.cjs` |
| SEO / аналитика | `scripts/seo.mjs`, `render-public.mjs`, `web-cloud/site.js:trackSavedLead` | build; Метрика `ym(113925373,'reachGoal',…)` после подтверждения | localStorage для дедупликации целей; публичные snapshots | `test/seo.test.mjs`, `lead-analytics.test.mjs`, SEO workflow |

## Данные и миграции

### Схема из кода

ORM нет: YQL с typed parameters (`ydb-sdk`), SQLite prepared statements. Для YDB `F/admin-storage.js:ensure` и `gallery-storage.js:ensure` создают недостающие таблицы, но **не обновляют схему существующих**: успешного describeTable достаточно для пропуска. Каталога версионированных миграций нет.

| Хранилище | Поля/содержимое и связи из кода |
| --- | --- |
| YDB orders | `F/ydb-storage.js:INSERT_ORDER/insertParams` ожидает id/name/phone/comment/status/admin_note/consent_version как Utf8, created_at/updated_at как Timestamp, estimate как JsonDocument. DDL orders отсутствует: PK, nullable, индексы и реальные ограничения нельзя вывести из INSERT |
| sk_admin_state | PK id Utf8, payload JsonDocument. `prices`: draft/revision/published/history; с PR13 также priceSync; отдельные записи telegram/max для pairing и получателя |
| sk_admin_sessions | PK id Utf8 (digest токена), payload JsonDocument, expires Timestamp с TTL=0; payload csrf/expires/credential |
| sk_public_requests | Те же типы и TTL; id=request UUID; payload id заказа/fingerprint/expires, окно повторов 7 дней |
| sk_admin_limits | Те же типы и TTL; payload count/expires, ключи лимитов |
| sk_telegram_outbox, sk_max_outbox, sk_email_outbox | Те же типы и TTL; PK=id заявки; payload attempts/next/leaseUntil/expires и provider для messenger. Контакты читаются из orders перед доставкой |
| sk_gallery_state | PK id Utf8, payload JsonDocument; запись gallery: draft, published, revision, gcCursor, hero с собственной revision/draft/published/previous |
| sk_gallery_media | PK id Utf8, payload JsonDocument, created Timestamp; metadata/status uploading→ready/deleting, размеры и heroDevice; bytes только в bucket |
| SQLite | `server.mjs` создаёт versions, draft (id=1 CHECK), sessions, leads, photos, telegram_outbox. INTEGER AUTOINCREMENT ids; FK photos.lead_id и telegram_outbox.lead_id → leads с ON DELETE CASCADE. WAL, foreign_keys=ON; при отсутствии leads.name добавляется ALTER TABLE |

Для YDB связи orders↔outbox, media↔gallery/hero соблюдает код, не объявленные FK. `deleteLead` удаляет orders и три outbox, но не sk_public_requests: недавний повтор может вернуть id уже удалённой заявки. При миграции сохранить эту семантику либо менять контракт осознанно.

Seed: корневой `config.seed.json` и `F/config.seed.json` на базовом SHA побайтово совпадают; SQLite использует seed только при пустых versions, YDB — при отсутствии prices. Изменение seed не обновляет существующий прайс. Схема config: schema/demo/note/exclusions/margins/defaults/woods/finishes/patterns/bases/foundations/items/common; связи по строковым id, проверки активных defaults и recipe в `public/engine.js:validateConfig`. Автоматической миграции localStorage в YDB нет (`scripts/demo-api.js`, `admin-storage.js`).

PR13 не требует DDL/backfill, новых env/секретов или триггера: `priceSync` добавляется в payload существующей prices. Поля `initialSync`: enabled, generation, nextAt, lastAttemptAt/lastCheckedAt/lastAppliedAt, lastPrice/lastError, lease/leaseUntil; отсутствие поля читается как выключенный режим. Все изменения через `syncRead/syncMutate` и существующий serializable `mutate` (`F/admin-storage.js`). Обычный `changeState` теперь вызывает `applyPriceEdit`: сохранение изменения подписи glue в draft атомарно вызывает `pauseForManual`, выключает sync, повышает generation и снимает lease. **Подпись отслеживает только** name, spec, active, kind, unit, price, pricingMode, areaPrice, consumption, packSize, packUnit; нельзя обещать отключение при изменении любого поля. Для включения `configure` требует актуальную revision, `validateTarget` обеих конфигураций и равенство targetSignature draft/published.

Хранение медиа: `F/gallery.js:createObjectStore` использует runtime context token, ключ `gallery/{uuid}.webp` в `GALLERY_BUCKET`. Sharp валидирует/перекодирует, удаляет metadata; media+object upload — не единая DB-транзакция. `claimDelete/refs/cleanup` сохраняют draft, published и предыдущий hero, удаляют неиспользуемые загрузки старше 24 часов по одной за запуск. Public image handler проверяет принадлежность опубликованной галерее либо текущему/предыдущему hero; кэш 300 секунд. Поле visible=false не делает объект кандидатом на удаление, пока он referenced. История всей галереи не хранится, у hero одна предыдущая публикация (`F/hero.js:heroRefs/rollback`).

**Виртуальные разделы админки:** `admin.js` показывает «Паркет / Лак / Клей / Шпаклёвка / Грунтовка / Работы / Расходники»; bases/foundations/patterns перенесены в «Параметры пола». `item-sections.js:itemSection` сначала выделяет `kind=work`, затем учитывает optional adminCategory (`glues/putties/primers/items`), затем известные id и название, иначе items. `glue` и `ply-glue` попадают в «Клей». Поле «Раздел в админке» сохраняет metadata при редактировании материала; новые строки/копии закрепляют категорию, поэтому переименование не переносит их случайно. Миграции и изменения engine нет; price-sync.targetSignature не учитывает adminCategory, одна смена раздела не выключает sync. Старые запреты добавления/копирования работ и защиты recipe/defaults сохранены; SQLite/demo не затронуты (`F/admin-public/admin.js`, `CT/item-sections.test.cjs`).

### Как менять и восстанавливать

1. До изменения снять фактический describe схемы/TTL/индексов и согласованный backup YDB вместе с bucket и его refs. Не запускать повторный CREATE orders по догадке. Инвентаризировать exporters/readers: `ydb-storage`, `admin-storage`, `gallery-storage`, API, UI и `leadWorkbook`.
2. Для нового поля спроектировать чтение старых payload без поля; обновлять writer, validation, JSON adapters и mock fixtures. Для реальной табличной колонки нужен отдельный проверенный план DDL/backfill: `ensure()` не является мигратором. Предпочитать добавление и двойную совместимость чтения перед удалением старого поля.
3. Прогнать на изолированной БД старые снимки заявок/цен, nullable и отсутствующие поля, конкурентные publish/requestId, rollback транзакции, TTL, пагинацию с одинаковым created_at, удаление и очереди. Сейчас storage-тесты не заменяют проверку реального YDB.
4. До выпуска проверить восстановление backup в отдельное окружение и ссылки на файлы. При сбое остановить согласованным способом записи/worker, вернуть совместимый код, восстановить данные из проверенной копии и сверить новые заявки, revisions и задания. Автоматического YDB restore/runbook или гарантированного backup в репозитории нет; точные команды должны появиться после выбора и проверки механизма. Откат кода не откатывает данные.

SQLite: README предписывает остановить сервер и скопировать весь DATA_DIR, включая возможные WAL/SHM, либо применять SQLite online backup. Восстанавливать в отдельный каталог, проверять целостность и FK перед переключением; не копировать один sqlite-файл во время записи. Автоматической команды backup/restore в package.json нет.

**При замене БД/провайдера** проверить весь контракт `createAdminStorage/createGalleryStorage`, а не только driver: serializable транзакция orders+requestId+outbox; повторы ABORTED; revision compare; TTL и проверка expires до физического удаления; JsonDocument↔JSON/null; UTC Timestamp; строковые UUID против числовых SQLite id; INSERT без перезаписи; сортировка/курсор 50 строк и newCount; rate limits между инстансами; lease/at-least-once; права и отзыв сессий. Перенести draft, published, history, gallery/hero refs и bucket согласованно; не переносить рабочие сессии по умолчанию. Сверить количество и контрольные суммы на защищённой стороне без выгрузки контактов в Git. Endpoint/metadata auth/Lockbox/runtime-token Object Storage/HTTP binary base64 и Gateway — отдельные адаптеры. При смене origin обновить `web-cloud/api.js`, `PUBLIC_ORIGINS`, ADMIN_ORIGIN, OpenAPI, cookie/CSP, hero default image origin, CNAME, SEO, consent и уведомления. Переключение/обратный ход и записи во время переноса требуют отдельного плана; готовой процедуры нет.

## Выполненные заявки и фактический доход

Актуализация **7 ноября 2026**, рабочий diff поверх `0583afa67f229e0886e6c69b9cdf69fda5103144`, до фиксации кандидата; старые результаты аудита не переносятся на новый код. Облачный путь: `web-cloud/site.js` отправляет введённый телефон, `F/public-app.js` сохраняет канонический numeric phone/fingerprint и отдельный rawPhone. `F/admin-storage.js` записывает rawPhone/revenueKopecks/revision в существующий `sk_admin_state.payload` с ключом UUID заявки; запись `prices` не меняется, новых таблиц/колонок и миграции нет. Метаданные новой заявки создаются в той же транзакции, что orders/request/outbox; list/detail используют LEFT JOIN по id. Старый orders.estimate остаётся снимком сметы, admin_note не используется для финансовых данных. Точное прежнее форматирование старых телефонов недоступно, UI использует стандартный fallback.

`PATCH /api/admin/leads/:id` принимает статус `completed` и `revenueKopecks` (неотрицательное безопасное целое, в копейках; 0 допустим). Для записи суммы обязательны `expectedRevision` и `expectedUpdated`; supplied expectations проверяются и для других обновлений. Для финансовых заявок legacy PATCH без expectations получает409. Обновление orders/status/note и metadata атомарно в serializable transaction; конфликт409, ошибка откатывает обе записи. Удаление заявки удаляет metadata и outbox в одной транзакции.

`F/admin-public/admin.js`: все страницы списка загружаются до расчёта общего дохода; сумма BigInt только по completed, независимо от поиска и фильтра. Верхние плитки — Все/Новые/В работе/Выполнено/Закрытые; нижние дубли удалены. Выбор completed открывает окно оплаты, отмена не сохраняет статус. Кнопка общего дохода открывает список выполненных заявок с исправлением каждой суммы. Возврат в другой статус сохраняет прежнюю оплату, но исключает её из итога. Auth/Origin/CSRF остаются прежними.

Проверки: `CT/completed-income.test.cjs`, дополнения `CT/admin.test.cjs`/`CT/public.test.cjs`; offline `scripts/check-completed-income-ui.cjs` на fixtures с Playwright/Chrome. Транзакционные mocks проверяют rollback/revisions, но не компиляцию YQL и фактическую изоляцию работающего YDB; production SQL и записи не выполнять ради smoke. После выпуска допустимо читать ресурсы админки без клиентских данных.

## Рецепты изменений

| Задача | Порядок действий и связанные места |
| --- | --- |
| Текст/контакты/SEO | `public/index.html` → `scripts/seo.mjs` и structured data → тексты ошибок `web-cloud/site.js`, `F/public-app.js` при необходимости → build:pages. Для юридических текстов `public/privacy.html/consent.html` + CONSENT_VERSION workflow + соответствующие тесты; не менять версию задним числом в orders |
| Дизайн | Inline стили index.html + limestone.css; проверить DOM id, mobile 390/desktop 1440 и минимум 320, клавиатуру и dialogs. Пересобрать Pages и hero-preview: последний извлекает header/hero regex-ами и зависит от структуры HTML |
| Новая страница | Создать исходник; явно добавить выдачу в build-cloud и при необходимости static allowlist server.mjs. Проверить относительные ссылки, SEO/canonical/sitemap; файлы автоматически не публикуются сборщиком |
| Форма | Облачный submit `web-cloud/site.js` → public-app validation/normalization/fingerprint → insertParams и orders schema → админский lead mapper/UI → Excel/email → тесты public/admin/email/analytics. Проверять повтор после timeout и 409; поле, влияющее на заявку, должно быть учтено в fingerprint |
| Бизнес-логика расчёта | `public/engine.js` и тесты материалов/сценариев → синхронизировать `F/engine.mjs` и `F/admin-public/engine.js` → проверить preview, server validation и snapshots. Build-cloud копирует engine только в docs, не эти две cloud-копии |
| Прайс | Для ручной правки draft→preview→publish; seed — только инициализация. Для glue сначала проверить режим в Настройки → Цены материалов. «Ввести цену вручную» выключает sync и открывает редактор glue в разделе «Клей» (section glues); сохранить draft и опубликовать обычной кнопкой. Проверить id/defaults/active/recipes, упаковки и updateMaterialRate; не пересчитывать старые orders |
| Расширение синхронизации (PR13) | Начать с `PRICE_SYNC.md`, `F/price-sync.js:target/targetSignature/validateTarget`, `F/parket-sale.js`, storage и панели. Mapping нескольких материалов/источников не реализован: нельзя только заменить URL. Проверить значимые поля вне нынешней подписи (waste/owner/note/group и другие), ручной fallback, отдельные lease/schedule/limits, identity/pack validation, 30% guard и непубликацию прочего draft; повторить concurrency/disable-in-flight и area-тесты |
| Разделы материалов | Менять `item-sections.js` и UI `admin.js`, сохраняя единый config.items и id связей. Для явной категории использовать «Раздел в админке»; проверить старые записи без metadata, kind=work priority, копию/переименование/newItem пустого раздела, draft/published и manual glue flow. Не создавать отдельные массивы glues/putties/primers |
| API | Сначала контракт и тест обработчика → storage → клиент → OpenAPI gateway path/method; сохранить query `route/view/module` и format 1.0. Workflow деплоит функцию, не применяет gateway-файл автоматически |
| Права доступа | `F/admin-app.js` Host/Origin/session/CSRF и все новые маршруты → OpenAPI invocation SA → фактические IAM bindings. Новая роль требует отдельной модели identities/authorization: готового RBAC нет |
| Галерея/фон | Редакторы в F/admin-public → gallery/hero validation → refs/media storage → public loader/renderer → build-preview/Pages. Обязательно проверить, что draft URL закрыт, used media не удаляется, герой откатывается обеими версиями экрана |
| Уведомления/экспорт | Править нужный F/provider; проверить outbox в insertLeadOnce/deleteLead, timer и limits. Маршрут статуса всех каналов называется `/api/admin/telegram`, выбор через provider; `email.js` импортирует `leadWorkbook` из admin-public. Не отправлять проверочные сообщения в рамках простого анализа |

## Проверка и выпуск

Минимум для любой правки: посмотреть diff, прогнать релевантные тесты карты функций; для изменения общих файлов — `npm test`, полный CT-suite на Linux x64, `npm run build:pages` и проверить ожидаемый diff. Корневой npm test не включает `.cjs` и cloud-suite. Browser harness `scripts/check-hero-editor.cjs` требует PLAYWRIGHT_MODULE/CHROMIUM_PATH; `scripts/check-browser.mjs` — Playwright по PLAYWRIGHT_MODULE. Они здесь не запускались. Перед запуском старых `test/ui.cjs/pages.cjs/notifications.cjs` прочитать их зависимости, пути Chromium и выходные каталоги.

**Отдельная проверка PR13 на SHA 8b0e609…:** оркестратор выполнил `node --test cloud-functions/ydb-stage1/test/price-sync.test.cjs` (macOS arm64, Node 26.11.1): **22/22 pass**. Это mock storage/source, включая parser identity, off/check без смены цены, pack/area, сохранение прочего draft, manual edits/disable in-flight, revision conflict, две scheduled worker instances, суточное окно, rate limit и CSRF; не проверка реального YDB или текущего магазина. Полные suite, build и browser в этой частичной проверке не повторялись. `scripts/check-price-sync-ui.cjs` — offline Playwright с fixtures, desktop/mobile и ручным fallback (PLAYWRIGHT_MODULE/CHROMIUM_PATH, output PRICE_SYNC_EVIDENCE_DIR); `scripts/check-price-source.cjs` — отдельный реальный GET fixed product без БД/смены цен, не запускать под видом offline-теста.

**Проверки незакоммичённого обновления меню (отчёт разработчика, проверен оркестратором):** `npm test` 28/28; admin+cloud-pages 44/44; item-sections+price-sync 24/24; build:pages без diff Pages. Offline browser fixtures desktop/mobile прошли новое меню и фильтры, копирование/переименование, добавление грунтовки, сохранение draft без изменения published, sync/manual сценарии. Полный cloud-suite на Linux и live smoke не повторялись. Это результаты рабочего diff поверх 8b0e609…, а не нового commit или фактического выпуска.

CI/CD:

Частичная актуализация **7 ноября 2026**: только схема CI и release-триггеры, незакоммиченный diff поверх `f7cb998f1d9813fbbf007620841dd91241d890dd`. Исходный аудит, прежние результаты и облачные наблюдения не перепроверены. Новые workflow требуют подтверждения GitHub Actions на финальном candidate SHA.

- `.github/workflows/yandex-cloud.yml`: main push, кроме Markdown/AGENTS/agents, либо workflow_dispatch; общий классификатор `scripts/ci/classify-changes.mjs` допускает deploy только при runtime/generated-admin изменениях или неизвестных путях. `public/index.html`, `public/limestone.css`, `public/hero-display.js` и build scripts учитываются как источники generated admin hero-preview/hero-display; обычные Pages-файлы сами по себе backend не выпускают. Ручной запуск включает полный набор. Node 22.15.0, npm ci, CT-suite и воспроизводимость сохраняются перед каждым deploy, явный список runtime-файлов → `.deploy/function`. OIDC `deploy/oidc-auth.cjs` даёт краткоживущий IAM token; публикуется приватная `skparket-api`, entry `index.handler`, 256 МБ/30 секунд. Lockbox bindings закреплены по версиям. Сертификат MAX скачивается с gu-st.ru, проверяется openssl; trust применяется только MAX HTTPS agent.
- `.github/workflows/seo-checks.yml`: PR/main, Node 24. Постоянный job `verify` сохраняет имя для branch protection; тест классификатора запускается всегда. Изменения только Markdown/AGENTS/agents не требуют сборки и runtime-тестов. Для остальных известных групп выполняются штатная `build:pages` и diff всех generated outputs (Pages и admin preview/display), чтобы обнаружить невоспроизводимую генерацию.
- Группы проверок: root suite — Node/общий frontend/engine; cloud suite — backend/admin, HTML/JS public/docs/web-cloud и источники generated preview; SEO — HTML, публичный контент, crawl/domain/assets и SEO/build scripts. `npm test` уже включает `test/seo.test.mjs`: отдельный SEO-suite запускается только когда root suite не выбран. Проверки опубликованных изображений входят в main HTTP SEO после ожидания точного HTML, а не запускаются параллельно с публикацией. Неизвестный путь, workflow или сам классификатор включают полный набор; diff читает обе стороны rename и весь диапазон push/PR, при недоступной базе также полный набор.
- Browser baseline/candidate на PR и public browser на main — для HTML/JS/API/engine/поведения; CSS и image-only не требуют browser. Исключение generated `hero-preview.html` допускается только при наличии исходного `public/limestone.css`, когда остальные изменения — CSS/документация; generated-only preview включает полный набор. Изменение HTML консервативно считается поведением. Browser jobs закреплены на `ubuntu-24.04` для имеющегося Playwright 1.56.1; зависимости не обновлялись. Main HTTP SEO проверяет точный HTML после propagation только по релевантной группе. Артефакты сохраняются в seo-evidence. Проверки публичного сайта не являются шагом публикации Pages.
- `.github/workflows/lighthouse.yml`: только `workflow_dispatch`, отдельный публичный mobile/desktop аудит с прежними Lighthouse 12.8.2 и профилями; Chromium явно берётся из Playwright. Производительность измеряется по запросу, без обязательного Lighthouse для косметических выпусков.
- `.github/workflows/seo-prepare.yml`: только ветка seo/p1-static; refresh публичного контента, build/test, commit generated files обратно в эту ветку. Не ежедневный sync основного сайта.
- PR13: yandex-cloud.yml добавляет `price-sync.js`/`parket-sale.js` в runtime package и read-only smoke ожидаемого 401 для config?view=price-sync / 200 для module asset. `.github/workflows/price-source-check.yml` (`Verify pilot supplier price source`) запускает одну live-пробу магазина на manual dispatch и PR по путям parser/probe/workflow, Node 22.15.0; это не ежедневный синхронизатор и не новый Cloud trigger.
- Pages main:/docs описаны как фактически проверенные **30.10** в `SEO_IMPLEMENTATION_REPORT.md`; сегодняшняя настройка Pages отдельно не перепроверена. В yandex workflow нет шага развёртывания gateway, IAM, trigger, bucket или БД. Это не полная Infrastructure as Code.

**Особенность этого документа после изменения CI:** push только `docs/AI_HANDOFF.md` больше не запускает backend deploy; публикация Pages из main:/docs управляется отдельно настройками GitHub Pages. Markdown не является runtime-ресурсом. Сам анализ ничего не публиковал. Не добавлять в этот публичный документ секреты/контакты заявок.

Откаты: цены — restore в draft, затем отдельная publish (`admin-app`); hero — rollback в `F/hero.js`, переключает две последние версии; gallery — встроенной истории/rollback нет. Для кода — согласованный revert и повторный CI/Pages build либо управление существующей версией функции, после проверки совместимости схемы и secrets. Gateway и таймер используют `$latest`: не считать публикацию новой версии изолированным canary. Реальный предыдущий код/конфигурацию нужно зафиксировать до выпуска; автоматического rollback в workflow нет. SQLite восстановление — выше.

При ручном исправлении/откате glue сначала явно выключить sync через его панель, затем восстановить/сохранить и опубликовать ручную цену; не рассчитывать, что откат любого несвязанного поля автоматически выключит пилот. Перенос БД должен сохранить priceSync вместе с prices и атомарность claim/apply; не переносить живой lease как подтверждение выполненной проверки. Нынешние ручные цены и сохранённый режим в рамках исследования не менялись.

### Переменные окружения (только имена и назначение)

| Режим/источник | Переменные | Назначение |
| --- | --- | --- |
| Облако: F/ydb-storage.js | YDB_ENDPOINT, YDB_DATABASE | Подключение; credentials через MetadataAuthService runtime SA |
| Облако: F/admin-app.js | ADMIN_ORIGIN, ADMIN_PASSWORD | Изолированный HTTPS host и пароль из Lockbox |
| Облако: F/public-app.js | LEADS_ENABLED, PRIVACY_OPERATOR_CONFIRMED, CONSENT_VERSION | Тройной gate приёма и версия согласия |
| Legacy F/app.js | TEST_WRITES_ENABLED | Только закрытая запись фиксированных тестовых контактов; workflow выключает |
| F/gallery.js | GALLERY_BUCKET | Приватный bucket, runtime context.token для доступа |
| F/telegram.js, max.js | TELEGRAM_BOT_TOKEN, MAX_BOT_TOKEN | Lockbox tokens; получатели/связывание хранятся в YDB |
| F/email.js | EMAIL_ENABLED, EMAIL_TO, SMTP_USER, SMTP_PASSWORD | Gate/получатель/отправитель, пароль приложения Mail.ru из Lockbox; SMTP host/465 заданы кодом |
| F/telegram.js | HTTPS_PROXY, https_proxy | Только диагностический proxyConfigured в status; текущий https transport не реализует proxy по этому флагу |
| SQLite: .env.example/server.mjs | HOST, PORT, PUBLIC_ORIGIN, NODE_ENV, DATA_DIR, ADMIN_PASSWORD_HASH, TRUST_PROXY | Bind, origin/HTTPS, persistent path, scrypt hash, доверие к proxy IP |
| SQLite | LEADS_ENABLED, PRIVACY_OPERATOR_CONFIRMED, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID | Приём/подтверждение и отдельная Telegram-интеграция |
| CI: yandex workflow/oidc-auth.cjs | YC_DEPLOY_SA_ID, FUNCTION_DIR, ACTIONS_ID_TOKEN_REQUEST_URL, ACTIONS_ID_TOKEN_REQUEST_TOKEN, GITHUB_OUTPUT, GITHUB_REPOSITORY, GITHUB_REF, YC_IAM_TOKEN | SA/package path, GitHub OIDC и передача временного IAM для health; не frontend-настройки |
| Browser checks | PLAYWRIGHT_MODULE, CHROMIUM_PATH, HERO_EVIDENCE_DIR, PRICE_SYNC_EVIDENCE_DIR | Пути тестового tooling и каталогов screenshots; подробности в scripts/check-*. Не нужны runtime; PR13 не добавляет runtime env |

## Риски и пробелы

**Подтверждено кодом и локально:** структура выше, совпадение трёх копий engine и двух seeds, успешные 28 корневых тестов, воспроизводимость Pages и hero-preview. `public/admin.js` и облачный `admin-public/admin.js` различаются: не копировать один поверх другого. Build-cloud не чистит docs целиком: старые `docs/demo-api.js`, admin assets и seed остаются в дереве; действующий site.js их не импортирует (`CT/cloud-pages.test.cjs`).

**Подтверждено публичными GET 06.11.2026:** gateway `/api/config` → 200, version=1, leadsEnabled=true, photosEnabled=false, consentVersion=skparket-pd-v3; `/api/gallery?view=hero` → 200, revision=7, оба device; `/api/session` и `/api/admin/leads` без cookie → 401; прямой Functions URL → 403. Контакты заявок не читались; POST не выполнялись. Это подтверждает доступность маршрутов, не точный commit развёрнутого кода.

**Устаревшая документация:** README и «НАЧАТЬ ЗДЕСЬ» смешивают demo/SQLite и облако, отсутствие аналитики/реального приёма уже неверно для облачного кода; ранние README/ADMIN/deploy README stage1 заявляют отсутствие работающих API/админки. FORM.md содержит одновременно старый запрет и поздний раздел «Запуск формы». Текущее состояние gate проверять через public-app/workflow и GET config. SEO_IMPLEMENTATION_REPORT — датированный отчёт, не источник текущей схемы.

**Ограничения PR13:** default off подтверждён кодом, но сохранённый рабочий enabled и фактическая опубликованная ручная цена сегодня не читались. `PRICE_SYNC.md` описывает тарифы и историческую пробу источника; актуальные тарифы и текущее значение цены этим исследованием не подтверждены. Успешный GET/parser не доказывает надёжность будущего HTML магазина; source failure сохраняет цену, но scheduled retry только на следующий день. Для новой автоматизации проверять весь контракт и перечисленные ограничения targetSignature, а не предполагать универсальный импорт прайсов.

GitHub CI для **PR head f5c6b105794ce1645d585d970a2a0f400df7935c** (не merge SHA): [source probe run 42215638033](https://github.com/alekssskorolev/sk-parket-site/actions/runs/42215638033) — success; [SEO checks run 42215638099](https://github.com/alekssskorolev/sk-parket-site/actions/runs/42215638099) — overall failure при успешном job verify (rebuild reproducibility и корневые/cloud regressions). Baseline упал на установке browser tooling, дальнейшие browser/Lighthouse skipped; причина установки глубже не исследована. Это не зелёный весь CI и не подтверждение runtime выпуска main. Сегодняшние локальные 22/22 не заменяют этот пробел.

**Риски реализации:** нет автоматического удаления orders по сроку (TTL относится к служебным таблицам), нет multi-user/MFA/audit trail; email/экспорт создают отдельные копии персональных данных. Заявки list/count и pending scans не имеют объявленных в репозитории дополнительных индексов; оценить планы и объёмы до масштабирования (`admin-storage.list/*Pending`). Лимиты приложения не заменяют защиту внешнего периметра. Общий `$latest`, независимые выпуски Pages/API и минута/5 минут кэша требуют обратной совместимости. Статические публичные snapshots и живое портфолио могут расходиться до refresh/build; не считать SEO snapshots действующим прайсом. Dockerfile не копирует `lib/telegram.mjs`, хотя server.mjs импортирует его: контейнерный запуск вероятно сломан, образ не собирался в этом анализе.

Оставшиеся инфраструктурные проверки и фактическая схема перечислены в приложении ниже. Тесты с mock storage доказывают контракт обработчика, но не реальную изоляцию YDB, IAM, TTL, доставку SMTP/MAX/Telegram или восстановление backup. Значения секретов не требуются для этого руководства и не должны сюда попадать.

### Проверка действующего облака 06.11.2026

Через авторизованную консоль пользователя выполнено только чтение metadata/схем; SQL и тестовые события не запускались, Lockbox payload не раскрывался.

| Объект и источник наблюдения | Фактически проверено |
| --- | --- |
| [Cloud Function overview](https://console.yandex.cloud/folders/b1g5jvictf4s63dq76k4/functions/functions/d4e98jo86kn9o7f75fia/overview) | skparket-api Active, публичный доступ off; `$latest` **d4e7qhs06ffkkhvhpqcc**, создана 06.11.2026 14:01 МСК; nodejs22, index.handler, 256 МБ, 30 секунд; runtime SA skparket-backend; логирование отключено. Имена обычных env совпадают с workflow; значения скрыты и не раскрывались. Четыре Lockbox-привязки ADMIN_PASSWORD/TELEGRAM_BOT_TOKEN/MAX_BOT_TOKEN/SMTP_PASSWORD и их версии совпали с workflow. Точный SHA source пакета по UI не установлен |
| [Timer overview](https://console.yandex.cloud/folders/b1g5jvictf4s63dq76k4/functions/triggers/a1shlfpaoet38p2lemv5/overview) | skparket-telegram-retry Active; cron в UI `* * ? * * *`; target skparket-api/$latest, invoker skparket-deployer. Реальные результаты доставок не проверялись |
| [YDB overview](https://console.yandex.cloud/folders/b1g5jvictf4s63dq76k4/ydb/databases/etndibb9bo594a8l1qp5/overview) | skparket-orders, Serverless, Running; database path совпал с workflow; предел 10 RU/с, 1 ГБ, deletion protection «Нет» |
| [YDB ACL](https://console.yandex.cloud/folders/b1g5jvictf4s63dq76k4/ydb/databases/etndibb9bo594a8l1qp5/resource-acl) | skparket-backend имеет ydb.editor непосредственно на БД; у deployer показана унаследованная functions.editor. Это не полный аудит IAM всех ресурсов |
| YDB Enterprise Manager → SQL Editor → Navigation → orders → **Schema** | Присутствуют все 10 таблиц из раздела схемы. Для orders подтверждены PK id, id Utf8 NOT NULL; остальные поля допускают NULL: created_at/updated_at Timestamp; name/phone/comment/status/admin_note/consent_version Utf8; estimate JsonDocument. Defaults не заданы. Строки данных не открывались. Индексы/TTL orders и физическая схема остальных таблиц отдельно не проверены: для них выше приведена схема из кода |
| YDB Enterprise Manager → Database → Backups → History | Есть System/Full only копии Ready (например daily etn6m21ha4k0819ukbo0), а также Creating; есть отдельные Ready с меткой Disaster recovery. Наличие Ready не доказывает возможность полного восстановления приложения вместе с bucket. Restore, расписание, полнота и консистентность файлов не проверены |
| [Object Storage buckets](https://console.yandex.cloud/folders/b1g5jvictf4s63dq76k4/storage/buckets) | skparket-gallery-b1g5jvictf4s63dq76k4: доступ «С авторизацией», лимит 1 ГБ, 46 объектов / 5.41 МБ на момент просмотра. Содержимое файлов, versioning, lifecycle, backup и детальная bucket policy не проверялись |

Дополнительно не проверены: полная действующая спецификация Gateway против JSON в deploy/, все IAM bindings/федерация и bucket-scoped storage.editor, физические типы/индексы/TTL девяти служебных таблиц, реальная доставка сообщений/писем, browser QA и настройка Pages на сегодняшнюю дату. Это границы исследования, а не утверждение, что перечисленное отсутствует. Рабочие записи не изменялись и не читались.

GitHub connector вернул пустые workflow_runs/statuses для базового SHA; это **не доказательство отсутствия запусков или успешности CI**. В UI репозитория у SHA показан failure, причина не исследована. До выпуска проверить конкретные Actions jobs; сегодняшние локальные тесты не отменяют статус CI.

## Инструкция следующему ИИ

1. Прочитай актуальные AGENTS.md (включая родительские каталоги) и этот файл. Выполни `git status --short`, `git branch --show-current`, `git rev-parse HEAD`; не стирай чужие изменения. Определи облачный/SQLite/demo режим задачи.
2. Сравни с базой: `git diff --name-status b7f39ba093362b5773283c9b487ef7e0ba39c952..HEAD` и `git log --oneline b7f39ba093362b5773283c9b487ef7e0ba39c952..HEAD`. Отдельно посмотри незакоммиченный diff: сравнение HEAD его не включает. Если SHA не доступен — fetch через разрешённое подключение; при расхождении истории использовать merge-base, не выдавать старую карту за текущую.
3. По таблице функций открой entry/component → handler → storage → тест. Через `rg` найди импорты, вызовы и строковые API/DOM id. Для каждого изменённого файла после базового SHA проверь соседей по потоку: engine→preview/server/export; форма→fingerprint/consent/queue; gallery→refs/GC/hero; API→gateway. Полное исследование заново нужно только при смене архитектуры или неподтверждённом режиме.
4. Не исследуй production-записи ради изменения интерфейса. Тестируй на fixtures/временной БД; не включай flags, не публикуй draft и не отправляй уведомления без соответствующей задачи. Получай доступ через подключения/авторизованную консоль, не проси секреты в чат.
5. Основной чат действует как оркестратор по `AGENTS.md`: при отсутствии актуальных подтверждённых соответствий товаров сначала запускает `agents/material-matcher.md` для нужного списка; затем разработчик (`agents/site-developer.md`) завершает код и проверки; если изменились описанные здесь пути, связи, функции, API/данные, права, env, команды или выпуск, редактор (`agents/handoff-editor.md`) точечно актуализирует руководство. Оркестратор проверяет результаты, фиксирует candidate SHA с необходимой документацией и передаёт разрешённый выпуск агенту `agents/release-manager.md`; тот ждёт CI/развёртывания и выполняет smoke в режиме чтения. Итог пользователю даёт оркестратор. Незакоммиченный кандидат к выпуску не готов; новый diff возвращается на необходимые проверки и актуализацию. Косметические правки без изменения описанных связей не требуют редактора; назначенные роли не делегируют дальше. При недоступности субагентов оркестратор сообщает об этом и выполняет этапы последовательно сам. Отдельно фиксируй дату/SHA частичного обновления (либо незакоммиченный статус), сохраняя исходную базу анализа; не переноси прошлые успешные проверки на новый коммит автоматически.
