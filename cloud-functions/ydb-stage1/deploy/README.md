# Автоматическая публикация skparket-api

Workflow: `.github/workflows/yandex-cloud.yml`.
Изменения в cloud-functions/ydb-stage1/ на main запускают тесты, сборку,
публикацию новой версии и проверку подключения к YDB. Есть ручной workflow_dispatch.
Сайт в docs/ этим workflow не переключается и не изменяется.
Текущий API остаётся тестовым: клиентские заявки, админка, фото и Telegram не включены.

## Без постоянных ключей

- OIDC-аудитория: https://github.com/alekssskorolev/sk-parket-site/ref/refs/heads/main
- Федерация: skparket-github-main, aje5rk538uo19o3ecq09.
- Привязка: только repo:alekssskorolev@262314857/sk-parket-site@1429928685:ref:refs/heads/main.
- Аккаунт публикации: skparket-deployer, aje8ha4eb671m98g7l39.
- Аккаунт выполнения: skparket-backend, ajeo58qnnk9drt1hj0l7.
- В репозитории нет постоянного облачного ключа или пароля администратора.
- Actions закреплены по commit SHA; деплой из pull_request не запускается.
- TEST_WRITES_ENABLED отключён после завершения проверки записи.

## Требования и проверка

Наличие workflow не доказывает успешный деплой: проверьте зелёный результат Actions.
До первого запуска нужно включить федерацию после проверки точного Subject;
дать аккаунту публикации functions.editor и право использовать только skparket-backend;
для smoke check нужна роль functions.functionInvoker на функцию.
Для записи workflow GitHub-подключению требуется право Workflows: write.
Права администратора облака и постоянный ключ сервисного аккаунта не нужны.
Публикация потребляет ресурсы Cloud Functions по действующим тарифам.

Документация: https://yandex.cloud/ru/docs/tutorials/serverless/ci-cd-github-functions
Обмен токена: https://yandex.cloud/ru/docs/iam/operations/wlif/setup-wlif
