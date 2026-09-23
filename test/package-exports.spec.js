import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as esm from 'payload-vars';

const require = createRequire(import.meta.url);
const cjs = require('payload-vars');

for (const [format, api] of [['ESM', esm], ['CommonJS', cjs]]) {
  test(`${format} package exports support template operations`, () => {
    const template = new api.PayloadTemplate({ name: '{{ name : string }}' });
    assert.deepEqual(template.toJSON(), { name: '{{name:string}}' });
    assert.equal(template.extractVariables()[0].name, 'name');
    assert.deepEqual(template.render({ name: 'Ada' }), { name: 'Ada' });
    assert.ok(template.tokenizePayloadExpression()[0].tokens.length);
    assert.equal(api.isJsonValue({ name: 'Ada' }), true);
    assert.throws(() => template.render({}), api.PayloadTemplateError);
  });
}
