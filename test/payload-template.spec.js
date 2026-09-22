import test from 'node:test';
import assert from 'node:assert/strict';
import { PayloadTemplate, PayloadTemplateError } from '../dist/index.js';

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
  assert.deepEqual(new PayloadTemplate(template).extractVariables(), new PayloadTemplate(normalized).extractVariables());
  assert.deepEqual(new PayloadTemplate(template).render({ x: ['a', null], n: 0 }), new PayloadTemplate(normalized).render({ x: ['a', null], n: 0 }));
});

test('validates root placeholders and preserves literal roots', () => {
  assert.equal(new PayloadTemplate('{{x : number [ ]??null}}').toJSON(), '{{x:number[] ?? null}}');
  for (const value of [null, false, 0, 'literal', '']) assert.equal(new PayloadTemplate(value).toJSON(), value);
  assert.deepEqual(new PayloadTemplate([]).toJSON(), []);
  assert.deepEqual(new PayloadTemplate({}).toJSON(), {});
});

test('validation and extraction reject the same invalid contracts with original paths', () => {
  for (const [template, code, path] of [
    [{ nested: ['{{x:string ?? invalid}}'] }, 'INVALID_FALLBACK_SYNTAX', '$.nested[0]'],
    [{ nested: ['prefix {{x:string}}'] }, 'INVALID_PLACEHOLDER', '$.nested[0]'],
    [{ nested: ['{{x:object}}'] }, 'UNSUPPORTED_TYPE', '$.nested[0]'],
    [{ a: '{{x:string??null}}', nested: ['{{x:string??omit}}'] }, 'VARIABLE_EXPRESSION_CONFLICT', '$.nested[0]'],
  ]) {
    let issue;
    assert.throws(() => new PayloadTemplate(template).toJSON(), error => {
      assert.ok(error instanceof PayloadTemplateError);
      assert.equal(error.issue.code, code);
      assert.equal(error.issue.path ?? error.issue.conflictingAt, path);
      issue = error.issue;
      return true;
    });
    assert.throws(() => new PayloadTemplate(template).extractVariables(), error => {
      assert.deepEqual(error.issue, issue);
      return true;
    });
  }
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
  const variables = template.extractVariables();
  variables[0].name = 'changed';
  variables[0].type = 'number';
  variables[0].memberFallback.action = 'throw';
  variables[0].valueFallback.action = 'null';
  variables.push({ name: 'extra', type: 'string', declaration: '{{extra:string}}' });
  assert.deepEqual(template.toJSON(), { nested: [{ x: '{{x:string[ ?? omit ] ?? throw}}' }] });
  assert.deepEqual(template.extractVariables(), [{ name: 'x', type: 'string[]',
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
  template.extractVariables();
  assert.equal(reads, 1);
});
