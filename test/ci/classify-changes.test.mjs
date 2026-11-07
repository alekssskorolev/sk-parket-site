import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyChanges} from '../../scripts/ci/classify-changes.mjs';

test('public CSS skips browser/root/SEO but preserves preview deploy and cloud checks', () => {
  assert.deepEqual(classifyChanges(['public/limestone.css', 'docs/limestone.css']), {build:true, root:false, cloud:true, seo:false, browser:false, images:false, deploy:true});
});
test('API changes test cloud and browser without unrelated root suite', () => {
  const c = classifyChanges(['cloud-functions/ydb-stage1/function/public-app.js']);
  assert.ok(c.cloud && c.browser && c.deploy && c.build); assert.equal(c.root, false);
});
test('engine changes test both implementations and browser consumers', () => {
  const c = classifyChanges(['public/engine.js', 'cloud-functions/ydb-stage1/function/engine.mjs']);
  assert.ok(c.root && c.cloud && c.browser && c.deploy);
});
test('SEO crawl files run SEO without browser or backend deploy', () => {
  const c = classifyChanges(['web-cloud/robots.txt', 'docs/sitemap.xml', 'docs/CNAME']);
  assert.ok(c.seo && c.build); assert.equal(c.browser, false); assert.equal(c.deploy, false);
});
test('Markdown, instructions and role documents are docs-only even in cloud folders', () => {
  assert.ok(Object.values(classifyChanges(['docs/AI_HANDOFF.md','AGENTS.md','agents/site-developer.md','cloud-functions/ydb-stage1/README.md'])).every(v => !v));
});
test('unknown paths fail closed, also when mixed with docs', () => {
  assert.ok(Object.values(classifyChanges(['docs/AI_HANDOFF.md', 'new-runtime.conf'])).every(Boolean));
});
test('workflow and classifier edits exercise the complete pipeline', () => {
  for (const file of ['.github/workflows/seo-checks.yml','scripts/ci/classify-changes.mjs','test/ci/classify-changes.test.mjs']) assert.ok(Object.values(classifyChanges([file])).every(Boolean));
});
test('generated admin preview changes cannot silently miss backend deployment', () => {
  for (const file of ['cloud-functions/ydb-stage1/function/admin-public/hero-preview.html','cloud-functions/ydb-stage1/function/admin-public/hero-display.js']) {
    const c = classifyChanges([file]); assert.ok(c.deploy && c.cloud && c.browser);
  }
});
test('assets have image checks while HTML keeps functional browser coverage', () => {
  assert.equal(classifyChanges(['public/assets/seo/photo.webp']).browser, false);
  assert.ok(classifyChanges(['docs/assets/seo/photo.webp']).images);
  assert.ok(classifyChanges(['public/index.html']).browser);
});

test('CSS plus its generated preview stays cosmetic; generated-only edits fail closed', () => {
  const preview = 'cloud-functions/ydb-stage1/function/admin-public/hero-preview.html';
  const c = classifyChanges(['public/limestone.css','docs/limestone.css',preview,'docs/AI_HANDOFF.md']);
  assert.ok(c.build && c.cloud && c.deploy); assert.equal(c.browser, false);
  assert.ok(Object.values(classifyChanges([preview])).every(Boolean));
  assert.ok(classifyChanges(['public/index.html','public/limestone.css',preview]).browser);
});

test('frontend contracts retain cloud suite',()=>{ for(const p of ['web-cloud/api.js','web-cloud/site.js','docs/site.js','public/index.html']) assert.ok(classifyChanges([p]).cloud); });
