'use strict';
const { randomUUID } = require('node:crypto');
const seed = require('./config.seed.json');
const PRICE_VERSION = 1;
const MAX_BODY_BYTES = 32768;
const TEST_PHONE = '70000000000';
const TEST_NAME = 'Тестовая заявка';
const ALLOWED_ORIGIN = 'https://alekssskorolev.github.io';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

function readBody(event, headers) {
  if (!/^application\/json(?:\s*;|$)/i.test(headers['content-type'] || '')) {
    fail(415, 'Нужен Content-Type: application/json');
  }
  if (typeof event.body !== 'string') fail(400, 'Тело запроса должно быть JSON-строкой');
  // Bound the encoded input before decoding, as well as the decoded JSON.
  if (event.body.length > MAX_BODY_BYTES * 2) fail(413, 'Слишком большой запрос');
  const bytes = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body);
  if (bytes.length > MAX_BODY_BYTES) fail(413, 'Слишком большой запрос. Фото пока не принимаются.');
  let body;
  try { body = JSON.parse(bytes.toString('utf8')); }
  catch { fail(400, 'Неверный JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Нужен JSON-объект');
  return body;
}

function checkedSelection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(422, 'Неверные параметры расчёта');
  if (typeof value.area !== 'number' || !Number.isFinite(value.area) || value.area < 1 || value.area > 10000) {
    fail(422, 'Площадь от 1 до 10 000 м²');
  }
  const result = {area: value.area};
  for (const key of ['wood', 'finish', 'pattern', 'base', 'foundation']) {
    if (typeof value[key] !== 'string' || !/^[-a-z0-9]{1,50}$/.test(value[key])) fail(422, 'Проверьте вариант: ' + key);
    result[key] = value[key];
  }
  for (const key of ['ownParquet', 'ownSupplies']) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') fail(422, 'Проверьте параметр: ' + key);
    result[key] = value[key] || false;
  }
  return result;
}

// Intentionally no public intake, admin API, Telegram or photo handling yet.
// A public website must NOT be switched to this staging package.
function createHandler({storage, env = process.env, calculate, validateConfig,
  now = () => new Date(), makeId = () => 'test-' + randomUUID()}) {
  validateConfig(seed);
  return async function handler(event = {}) {
    const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const origin = headers.origin;
    const replyHeaders = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Origin',
    };
    if (origin === ALLOWED_ORIGIN) replyHeaders['Access-Control-Allow-Origin'] = origin;
    const reply = (statusCode, result) => ({statusCode, headers: replyHeaders, body: JSON.stringify(result)});
    try {
      if (origin && origin !== ALLOWED_ORIGIN) fail(403, 'Запрос с другого сайта запрещён');
      const method = String(event.httpMethod || 'GET').toUpperCase();
      const route = event.queryStringParameters?.route || '/health';
      if (method === 'OPTIONS') {
        if (origin !== ALLOWED_ORIGIN) fail(403, 'Источник не разрешён');
        replyHeaders['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
        replyHeaders['Access-Control-Allow-Headers'] = 'Content-Type';
        return reply(204, null);
      }
      if (route === '/health' && method === 'GET') {
        await storage.check();
        return reply(200, {ok: true, database: 'connected', stage: 'private-test', leadsEnabled: false});
      }
      if (route === '/api/config' && method === 'GET') {
        return reply(200, {version: PRICE_VERSION, config: seed, leadsEnabled: false, photosEnabled: false, testOnly: true});
      }
      if (route === '/api/leads') {
        fail(503, 'Реальный приём заявок ещё не включён. Сейчас доступна только закрытая проверка.');
      }
      if (route !== '/api/test-leads') fail(404, 'Не найдено');
      if (method !== 'POST') fail(405, 'Для тестовой записи нужен POST');
      if (env.TEST_WRITES_ENABLED !== 'true') fail(503, 'Тестовая запись выключена');
      const body = readBody(event, headers);
      // Test writes cannot be used to submit arbitrary customer contact data.
      if (body.name !== TEST_NAME || body.phone !== TEST_PHONE) {
        fail(422, 'Для проверки используйте имя «Тестовая заявка» и телефон 70000000000. Реальные контакты пока не принимаются.');
      }
      if (body.consent !== true) fail(422, 'Для теста передайте consent: true');
      if (body.website) fail(400, 'Не удалось принять заявку');
      if (typeof body.comment !== 'string' || body.comment.length > 2000 || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(body.comment)) {
        fail(422, 'Комментарий — до 2000 символов');
      }
      if (body.photos !== undefined && (!Array.isArray(body.photos) || body.photos.length)) {
        fail(422, 'Фотографии пока не подключены. Тест не сохранён.');
      }
      let estimate = null;
      if (body.selection !== undefined) {
        if (body.version !== PRICE_VERSION) fail(409, 'Версия цен изменилась. Запросите /api/config и повторите расчёт.');
        estimate = {...calculate(seed, checkedSelection(body.selection)), priceVersion: PRICE_VERSION};
      }
      const order = {
        id: makeId(), created: now(), name: TEST_NAME, phone: TEST_PHONE,
        comment: body.comment, status: 'new', note: '', estimate,
        consentVersion: 'test-only-not-a-real-consent',
      };
      await storage.insert(order);
      return reply(201, {ok: true, id: order.id, testOnly: true, message: 'Тестовая заявка сохранена. Сайт и админка ещё не подключены.'});
    } catch (error) {
      // Do not return database errors, tokens, addresses or customer data.
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 499 ? error.status : 503;
      if (error instanceof HttpError) return reply(error.status, {ok: false, error: error.message});
      return reply(status, {ok: false, error: status < 500 ? error.message : 'База временно недоступна. Повторите проверку позже.'});
    }
  };
}
module.exports = {createHandler, checkedSelection};
