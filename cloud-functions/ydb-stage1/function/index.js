'use strict';
const {createHandler} = require('./app');
const {createStorage} = require('./ydb-storage');
let handlerPromise;
module.exports.handler = async function (event, context) {
  handlerPromise ||= import('./engine.mjs').then(engine => createHandler({
    storage: createStorage(),
    calculate: engine.calculate,
    validateConfig: engine.validateConfig,
  }));
  return (await handlerPromise)(event, context);
};
