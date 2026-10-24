'use strict';
const {Driver, MetadataAuthService, TypedValues} = require('ydb-sdk');

// INSERT (not UPSERT) ensures an unlikely ID collision cannot overwrite a lead.
const INSERT_ORDER = `
DECLARE $id AS Utf8;
DECLARE $created AS Timestamp;
DECLARE $name AS Utf8;
DECLARE $phone AS Utf8;
DECLARE $comment AS Utf8;
DECLARE $estimate AS JsonDocument;
DECLARE $consent AS Utf8;
INSERT INTO orders (
  id, created_at, updated_at, name, phone, comment,
  status, admin_note, estimate, consent_version
) VALUES (
  $id, $created, $created, $name, $phone, $comment,
  'new', '', $estimate, $consent
);
`;
function insertParams(order) {
  return {
    $id: TypedValues.utf8(order.id),
    $created: TypedValues.timestamp(order.created),
    $name: TypedValues.utf8(order.name),
    $phone: TypedValues.utf8(order.phone),
    $comment: TypedValues.utf8(order.comment),
    $estimate: TypedValues.jsonDocument(JSON.stringify(order.estimate)),
    $consent: TypedValues.utf8(order.consentVersion),
  };
}
function createStorage(env = process.env) {
  let driver;
  async function getDriver() {
    if (!env.YDB_ENDPOINT || !env.YDB_DATABASE) throw new Error('Missing YDB settings');
    if (!driver) driver = new Driver({
      endpoint: env.YDB_ENDPOINT,
      database: env.YDB_DATABASE,
      authService: new MetadataAuthService(),
    });
    if (!await driver.ready(10000)) throw new Error('YDB driver not ready');
    return driver;
  }
  return {
    async check() {
      const d = await getDriver();
      await d.tableClient.withSession(session => session.executeQuery('SELECT 1 AS connection_test;'));
    },
    async insert(order) {
      const d = await getDriver();
      await d.tableClient.withSession(session => session.executeQuery(INSERT_ORDER, insertParams(order)));
    },
  };
}
module.exports = {createStorage, insertParams, INSERT_ORDER};
