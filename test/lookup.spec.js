import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { PayloadTemplate, PayloadTemplateError } from '../dist/index.js';

const issue = code => error => error instanceof PayloadTemplateError && error.issue.code === code;

describe('template-local lookup maps', () => {
  const source = {
    _: {
      Users: { 'john@example.com': 113, nobody: 0 },
      Categories: { Vacation: 1234, Disabled: false, Empty: '', Nothing: null },
    },
    user_id: '{{email:string > lookup(Users) ?? throw}}',
    category_event_id: '{{category:string > lookup(Categories) ?? throw}}',
    nested: { _: { remains: true } },
  };

  test('looks up values, preserves scalar types, and excludes only the root registry', () => {
    const template = new PayloadTemplate(source);
    assert.deepEqual(template.render({ email: 'john@example.com', category: 'Vacation' }), {
      user_id: 113, category_event_id: 1234, nested: { _: { remains: true } },
    });
    assert.deepEqual(template.toJSON()._, source._);
    assert.deepEqual(template.variables().map(({ name, type }) => ({ name, type })), [
      { name: 'email', type: 'string' }, { name: 'category', type: 'string' },
    ]);
    for (const [key, expected] of [['Disabled', false], ['Empty', ''], ['Nothing', null]]) {
      assert.equal(template.render({ email: 'nobody', category: key }).category_event_id, expected);
    }
    assert.equal(template.render({ email: 'nobody', category: 'Vacation' }).user_id, 0);
  });

  test('uses existing fallbacks for missing keys and reports unhandled misses', () => {
    assert.equal(new PayloadTemplate({ _: { M: {} }, value: '{{x:string > lookup(M) ?? null}}' }).render({ x: 'x' }).value, null);
    assert.deepEqual(new PayloadTemplate({ _: { M: {} }, value: '{{x:string > lookup(M) ?? omit}}' }).render({ x: 'x' }), {});
    assert.throws(() => new PayloadTemplate({ _: { M: {} }, value: '{{x:string > lookup(M) ?? throw}}' }).render({ x: 'x' }), issue('FALLBACK_THROW'));
    assert.throws(() => new PayloadTemplate({ _: { M: {} }, value: '{{x:string > lookup(M)}}' }).render({ x: 'x' }), issue('MISSING_LOOKUP_KEY'));
  });

  test('rejects invalid maps and references at compilation', () => {
    for (const registry of [null, [], { M: null }, { M: [] }, { M: { x: {} } }, { M: { x: NaN } },
      { M: { x: undefined } }, { M: { x: '{{value:string}}' } }]) {
      assert.throws(() => new PayloadTemplate({ _: registry }), issue('INVALID_LOOKUP_MAP'));
    }
    assert.throws(() => new PayloadTemplate({ value: '{{x:string > lookup(M)}}' }), issue('UNKNOWN_LOOKUP_MAP'));
  });

  test('keeps repeated and concurrent renders isolated', async () => {
    const template = new PayloadTemplate({ _: { M: { a: 1, b: 2 } }, value: '{{x:string > lookup(M)}}' });
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) => Promise.resolve().then(() =>
      template.render({ x: index % 2 ? 'a' : 'b' }))));
    assert.deepEqual(results.map(result => result.value), Array.from({ length: 20 }, (_, index) => index % 2 ? 1 : 2));
    assert.deepEqual(template.toJSON()._, { M: { a: 1, b: 2 } });
  });

  test('preserves templates without a registry', () => {
    assert.deepEqual(new PayloadTemplate({ value: '{{x:string}}' }).render({ x: 'ok' }), { value: 'ok' });
  });

  test('normalizes and tokenizes lookup calls', () => {
    const template = new PayloadTemplate({ _: { Values: { x: 1 } }, value: '{{x:string>lookup ( Values )}}' });
    assert.equal(template.toJSON().value, '{{x:string > lookup(Values)}}');
    assert.deepEqual(template.tokenizePayloadExpression()[0].tokens
      .filter(token => token.text.trim()).map(token => [token.kind, token.text]), [
      ['delimiter', '{{'], ['variable', 'x'], ['punctuation', ':'], ['type', 'string'],
      ['operator', '>'], ['transformer', 'lookup'], ['punctuation', '('], ['value', 'Values'],
      ['punctuation', ')'], ['delimiter', '}}'],
    ]);
  });
});
