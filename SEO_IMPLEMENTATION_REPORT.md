# SEO skparket.ru — этап 0 и выпуск P0

Дата: 30 октября 2026, время проверок HTTP 14:31–14:32 МСК.
ТЗ: приложенный AI_IMPLEMENTATION_BRIEF.md. Его исходные показатели повторно проверялись, а не принимались за текущее состояние.

## Источник и публикация

- Репозиторий: https://github.com/alekssskorolev/sk-parket-site
- Исходный production-коммит: 7785cdefb6d04f8ba5a28e22a6bbdc03e6df85b1.
- GitHub Pages API подтвердил legacy build, source main:/docs, cname skparket.ru, HTTPS enforced.
- Команда: npm run build:pages, скрипт scripts/build-cloud.mjs.
- Источники: public/index.html, web-cloud/site.js, web-cloud/api.js.
- API/YDB публикуется существующим .github/workflows/yandex-cloud.yml.
- Применимых AGENTS.md в проекте и корне workspace при поиске не обнаружено.
- README частично описывает старую серверную/демоархитектуру и не является доказательством текущего хостинга.

## Повторная исходная HTTP-проверка

Все запросы — GET. Реальные заявки не отправлялись.

| URL | HTTP | Факт |
| --- | --- | --- |
| https://skparket.ru/ | 200 | noindex,nofollow, описание прототипа, canonical отсутствует |
| https://skparket.ru/index.html | 200 | SHA256 совпал с главной |
| https://skparket.ru/?utm_source=seo_audit | 200 | SHA256 совпал с главной |
| https://skparket.ru/?seo_audit=1 | 200 | SHA256 совпал с главной |
| http://skparket.ru/ | 301 | Заголовки сохранены; точная цепочка повторно проверяется перед приёмкой выпуска |
| https://www.skparket.ru/ | 301 | То же |
| http://www.skparket.ru/ | 301 | То же |
| https://skparket.ru/robots.txt | 404 | Файл отсутствует |
| https://skparket.ru/sitemap.xml | 404 | Файл отсутствует |
| https://skparket.ru/sitemap_index.xml | 404 | Файл отсутствует; неизвестные адреса карт не исследовались |
| https://skparket.ru/seo-audit-nonexistent-20261030/ | 404 | Настоящий 404 |
| https://skparket.ru/privacy.html | 200 | 12 077 байт |
| https://skparket.ru/consent.html | 200 | 5 284 байта |
| публичный API /api/config | 200 | version=1; updated=2026-10-25T08:58:47.661Z; leadsEnabled=true; consentVersion=skparket-pd-v3 |
| публичный API /api/gallery | 200 | configured=true; 21 карточка, 34 изображения, 8 пустых description |

Главная: **517 587 байт**, SHA256 **dd481f8fcabdc4b24a494ba36b1be24f6da5a8335533bb099afb07411e3dc578**.
Она байтово совпала с docs/index.html исходного коммита.
Это отличается от размера 379 716 байт в ТЗ: в свежем коммите уже добавлены Метрика и новый портрет. Они сохранены.
В просмотренных заголовках главной X-Robots-Tag отсутствовал.

Сырые тела и заголовки сохранены локально в /workspace/seo-evidence/before/.
Облачная среда затем стала недоступна. Локальная браузерная проверка не завершилась из-за ERR_CERT_AUTHORITY_INVALID при работе через прокси; TLS-проверка не отключалась.
Для браузерного baseline и приёмки после публикации добавлен GitHub Actions.

## Подготовленный выпуск P0

| Проблема | Исправление | URL | Проверка | Состояние |
| --- | --- | --- | --- | --- |
| Production noindex,nofollow | Удаление только production-трансформацией head | / | Тест исходного HTML; затем HTTP и DOM | В PR |
| Описание прототипа | Description из ТЗ, без вымышленных цен | / | Точное сравнение | В PR |
| Редакционное улучшение Title | Укладка штучного паркета в СПб под ключ &#124; SK паркет | / | Точное сравнение | В PR |
| Неоднозначность index/query | Один абсолютный canonical https://skparket.ru/ | /, /index.html, query | HTML всех вариантов | В PR |
| Нет robots | User-agent *, Allow /, Sitemap | /robots.txt | Сравнение файла, затем HTTP/MIME | В PR |
| Нет sitemap | Только каноническая коммерческая главная | /sitemap.xml | Тест структуры, затем HTTP/MIME | В PR |
| Сохранность функций | Body не меняется; production JS/API/engine/CSS/документы не меняются | / | Сравнение body; существующие тесты; браузер | Body и тесты прошли; браузер отдельно |

Production-трансформация применяется только при сборке для docs/CNAME=skparket.ru.
public/ и build:demo сохраняют noindex; админская страница тоже сохраняет noindex.
H1, калькулятор, телефон +79117982306, email skparket@bk.ru, согласие skparket-pd-v3, Метрика и портрет сохранены.

## Файлы выпуска

- scripts/seo.mjs — production SEO-трансформация.
- scripts/build-cloud.mjs — применение SEO и копирование crawl-файлов.
- docs/index.html — собранный production HTML.
- web-cloud/robots.txt и docs/robots.txt.
- web-cloud/sitemap.xml и docs/sitemap.xml.
- test/seo.test.mjs — воспроизводимость, canonical, изоляция тестовых сред, сохранность body.
- scripts/check-public-seo.mjs — фактические HTTP-проверки после Pages.
- scripts/check-browser.mjs — Chromium 320/390/768/1440, калькулятор, меню, фото, контакты, согласие; без отправки реальных заявок.
- .github/workflows/seo-checks.yml — сборка, регрессия, baseline и production-проверки, артефакты.
- cloud-functions/ydb-stage1/test/limestone-design.test.cjs — уточнён только счётчик module-скрипта: до SEO в main уже два script из-за добавленной Метрики, поэтому старый assert общего числа script=1 устарел. Production-код этим изменением не затронут.
- SEO_IMPLEMENTATION_REPORT.md — этот отчёт.

## Фактическая верификация

Первый прогон: https://github.com/alekssskorolev/sk-parket-site/actions/runs/41049403798

- npm run build:pages — успешно.
- git diff --exit-code -- docs после сборки — успешно.
- SEO-тесты — 2/2.
- npm test — 8/8 (включает два SEO-теста).
- cloud-functions/ydb-stage1/test/*.test.cjs — 172/172.
- Body production-главной совпадает с исходным body после стандартной замены пути site.js.
- Повторный прогон с браузерным baseline — см. текущие проверки PR.

## Локально / репозиторий / публикация / публичная проверка

**Локально:** найдены исходники и хостинг, получен свежий main, сохранены 16 исходных HTTP-ответов; production-файлы локально не изменялись.
**В репозитории:** P0 подготовлен через GitHub-коннектор в ветке seo/p0-indexing, PR https://github.com/alekssskorolev/sk-parket-site/pull/3. Сборка и тесты фактически выполнены на GitHub runner.
**Опубликовано:** пока ничего из SEO-выпуска.
**Проверено публично:** исходные GET выше. Проверки результата публикации пока не выполнены.
**Блокировка:** автоматическая проверка отклонила merge в main, сославшись на production-публикацию, изменение существующего теста и незавершённую публичную проверку. Merge не обходился прямым push или альтернативным способом. В PR добавлена проверка публичного baseline до публикации.

## Следующие этапы и ограничения

- P1: статические опубликованные данные портфолио/цены, устойчивость при сбое API, удаление заглушек, внешние изображения и responsive-варианты. Сейчас не выполнены.
- GitHub Pages не исполняет .htaccess/nginx; серверный 301 /index.html не добавлен. Он остаётся 200 с canonical. Миграция и JS-редирект не выполняются.
- P2: Organization+Service после сверки видимых контактов; отдельные кейсы — только по подтверждённым материалам.
- Восемь геометрических карточек без описания требуют проверки владельцем: работа или визуализация. Их свойства не сочинялись.
- Для 3–5 кейсов нужны подтверждённые задача, основание, материалы, этапы, фото и право публикации; площадь/срок/стоимость только при наличии.
- Нет доступов к Search Console/Вебмастеру/отчётам Метрики: карта не отправлялась, переобход и фактическая индексация не заявляются.
- PSI/Lighthouse и CrUX не измерены. Рост трафика, позиции, CWV и rich results не обещаются.
