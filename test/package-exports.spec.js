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
    assert.equal(template.compile()[0].name, 'name');
    assert.deepEqual(template.render({ name: 'Ada' }), { name: 'Ada' });
    assert.ok(template.tokenizePayloadExpression()[0].tokens.length);
    const conditional = new api.PayloadTemplate('{{x:string ? date.dateonly > date.isodatetime}}');
    assert.equal(conditional.render({ x: '2026-01-01' }), '2026-01-01T00:00:00.000Z');
    assert.equal(conditional.render({ x: 'unchanged' }), 'unchanged');
    assert.equal(conditional.render({ x: '2026-01-02' }), '2026-01-02T00:00:00.000Z');
    assert.equal(api.isJsonValue({ name: 'Ada' }), true);
    assert.throws(() => template.render({}), api.PayloadTemplateError);
  });
}
