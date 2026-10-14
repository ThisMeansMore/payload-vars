import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { PayloadTemplate, PayloadTemplateError } from '../dist/index.js';

describe('template snapshots and reuse', () => {
  test('normalizes nested placeholders without mutating templates and is idempotent', () => {
    const template = Object.freeze({ nested: Object.freeze([
      '{{ x : string[??omit]??throw }}', '{{x:string [ ?? omit ] ?? throw}}',
      Object.freeze({ count: '{{ n : number || null }}' }), '', null, false, 0,
    ]) });
    const expected = { nested: ['{{x:string[ ?? omit ] ?? throw}}', '{{x:string[ ?? omit ] ?? throw}}',
      { count: '{{n:number || null}}' }, '', null, false, 0] };
    const normalized = new PayloadTemplate(template).toJSON();
    assert.deepEqual(normalized, expected);
    assert.deepEqual(new PayloadTemplate(normalized).toJSON(), expected);
    assert.notEqual(normalized, template);
    assert.notEqual(normalized.nested, template.nested);
    assert.notEqual(normalized.nested[2], template.nested[2]);
    assert.equal(template.nested[0], '{{ x : string[??omit]??throw }}');
    assert.deepEqual(new PayloadTemplate(template).variables(), new PayloadTemplate(normalized).variables());
    assert.deepEqual(new PayloadTemplate(template).render({ x: ['a', null], n: 0 }), new PayloadTemplate(normalized).render({ x: ['a', null], n: 0 }));
  });

  test('validates root placeholders and preserves literal roots', () => {
    assert.equal(new PayloadTemplate('{{x : number [ ]??null}}').toJSON(), '{{x:number[] ?? null}}');
    for (const value of [null, false, 0, 'literal', '']) assert.equal(new PayloadTemplate(value).toJSON(), value);
    assert.deepEqual(new PayloadTemplate([]).toJSON(), []);
    assert.deepEqual(new PayloadTemplate({}).toJSON(), {});
  });

  test('preserves special literal object keys without changing the output prototype', () => {
    const template = JSON.parse('{"__proto__":"{{ x : string }}","{{literal:key}}":{"constructor":"constant"}}');
    const normalized = new PayloadTemplate(template).toJSON();
    assert.equal(Object.getPrototypeOf(normalized), Object.prototype);
    assert.equal(Object.getOwnPropertyDescriptor(normalized, '__proto__').value, '{{x:string}}');
    assert.deepEqual(normalized['{{literal:key}}'], { constructor: 'constant' });
    assert.equal(template.__proto__, '{{ x : string }}');
  });

  test('snapshots input and isolates every normalized template and extracted contract', () => {
    const input = { nested: [{ x: '{{x:string[??omit]??throw}}' }] };
    const template = new PayloadTemplate(input);
    input.nested[0].x = '{{broken:unsupported}}';
    input.nested.push('changed');
    const normalized = template.toJSON();
    normalized.nested[0].x = 'changed';
    const variables = template.variables();
    variables[0].name = 'changed';
    variables[0].type = 'number';
    variables[0].memberFallback.action = 'throw';
    variables[0].valueFallback.action = 'null';
    variables.push({ name: 'extra', type: 'string', declaration: '{{extra:string}}' });
    assert.deepEqual(template.toJSON(), { nested: [{ x: '{{x:string[ ?? omit ] ?? throw}}' }] });
    assert.deepEqual(template.variables(), [{ name: 'x', type: 'string[]', paths: ['$.nested[0].x'],
      declaration: '{{x:string[ ?? omit ] ?? throw}}', memberFallback: { operator: '??', action: 'omit' },
      valueFallback: { operator: '??', action: 'throw' } }]);
    assert.deepEqual(template.render({ x: ['a', null] }), { nested: [{ x: ['a'] }] });
    assert.equal(JSON.stringify(template), JSON.stringify(template.toJSON()));
  });

  test('reuses a compiled contract across successful and failed renders without retaining values', () => {
    let reads = 0;
    const input = { get items() { reads++; return '{{x:number[ ?? omit ] ?? throw}}'; } };
    const template = new PayloadTemplate(input);
    assert.equal(reads, 1);
    const first = template.render({ x: [1, null, 2] });
    first.items.push(99);
    assert.throws(() => template.render({}), error => {
      assert.equal(error.issue.code, 'FALLBACK_THROW');
      error.issue.templatePaths.push('corrupted');
      error.issue.declaration = 'corrupted';
      return true;
    });
    assert.throws(() => template.render({}), error => {
      assert.deepEqual(error.issue.templatePaths, ['$.items']);
      assert.equal(error.issue.declaration, '{{x:number[ ?? omit ] ?? throw}}');
      return true;
    });
    assert.deepEqual(template.render({ x: [3, null] }), { items: [3] });
    assert.deepEqual(template.render({ x: [] }), { items: [] });
    template.toJSON();
    template.variables();
    assert.equal(reads, 1);
  });

  test('optionally passes unused JSON variables through an object result', () => {
    const template = new PayloadTemplate({ name: '{{name:string}}', fixed: 'template' });
    const metadata = { nested: { enabled: true } };
    const input = JSON.parse('{"name":"Ada","debugId":"test-123","fixed":"input","__proto__":{"safe":true}}');
    input.metadata = metadata;

    assert.deepEqual(template.render(input), { name: 'Ada', fixed: 'template' });
    const rendered = template.render(input, { passthrough: true });
    const expected = JSON.parse('{"debugId":"test-123","__proto__":{"safe":true},"metadata":{"nested":{"enabled":true}},"name":"Ada","fixed":"template"}');
    assert.deepEqual(rendered, expected);
    assert.equal(Object.getPrototypeOf(rendered), Object.prototype);
    assert.equal(Object.getOwnPropertyDescriptor(rendered, '__proto__').value.safe, true);
    assert.notEqual(rendered.metadata, metadata);
    assert.notEqual(rendered.metadata.nested, metadata.nested);
  });

  test('passthrough reports unsupported roots and non-JSON variables', () => {
    assert.throws(() => new PayloadTemplate(['{{name:string}}']).render({ name: 'Ada', extra: true }, { passthrough: true }), error => {
      assert.equal(error.issue.code, 'PASSTHROUGH_REQUIRES_OBJECT_ROOT');
      assert.equal(error.issue.actualType, 'array');
      return true;
    });
    assert.throws(() => new PayloadTemplate({ name: '{{name:string}}' })
      .render({ name: 'Ada', extra: undefined }, { passthrough: true }), error => {
      assert.equal(error.issue.code, 'INVALID_PASSTHROUGH_VARIABLE');
      assert.equal(error.issue.variableName, 'extra');
      assert.equal(error.issue.actualType, 'undefined');
      return true;
    });
  });

});
