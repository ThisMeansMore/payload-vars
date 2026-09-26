import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PayloadTemplate, PayloadTemplateError, builtInPlugins, datePlugin, emailPlugin, collectionPlugin } from '../dist/index.js';

const plugin = (validators = {}, transformers = {}) => ({ name: 'test', validators, transformers });
const issue = code => error => error instanceof PayloadTemplateError && error.issue.code === code;

test('built-in capability buckets work in both package formats', () => {
  assert.deepEqual(builtInPlugins, [datePlugin, emailPlugin, collectionPlugin]);
  const cjs = createRequire(import.meta.url)('../dist/cjs/index.js');
  for (const api of [{ PayloadTemplate, builtInPlugins }, cjs]) {
    const template = new api.PayloadTemplate('{{x:string @ dateonly > isodatetime}}', { plugins: api.builtInPlugins });
    assert.equal(template.render({ x: '2026-01-01' }), '2026-01-01T00:00:00.000Z');
  }
  assert.throws(() => new PayloadTemplate(null, { plugins: [...builtInPlugins, ...cjs.builtInPlugins] }),
    issue('DUPLICATE_PLUGIN_OPERATION'));
  assert.equal(new PayloadTemplate('{{x:string @ email > domain @ domain}}').render({ x: 'user@Example.com' }), 'example.com');
});

test('explicit configuration replaces defaults and isolates registries', () => {
  for (const plugins of [[], [emailPlugin]]) {
    assert.throws(() => new PayloadTemplate('{{x:string @ dateonly}}', { plugins }), issue('UNKNOWN_PLUGIN_OPERATION'));
  }
  const first = plugin({ same: x => x === 'ok' }, { same: x => x.toUpperCase() });
  const template = new PayloadTemplate('{{x:string @ same > same}}', { plugins: [first] });
  first.validators.same = () => false;
  first.transformers.same = () => null;
  assert.equal(template.render({ x: 'ok' }), 'OK');
  for (const plugins of [[plugin({ x: () => true }), plugin({ x: () => true })],
    [plugin({}, { x: x => x }), plugin({}, { x: x => x })]]) {
    assert.throws(() => new PayloadTemplate(null, { plugins }), issue('DUPLICATE_PLUGIN_OPERATION'));
  }
  assert.throws(() => new PayloadTemplate('{{x:string @ toString}}'), issue('UNKNOWN_PLUGIN_OPERATION'));
  assert.throws(() => new PayloadTemplate('{{x:string > dateonly}}'), issue('UNKNOWN_PLUGIN_OPERATION'));
});

test('repeated registration rejects duplicate aliases for either operation kind', () => {
  for (const [kind, custom] of [
    ['validator', plugin({ same: () => true })],
    ['transformer', plugin({}, { same: x => x })],
  ]) {
    assert.throws(() => new PayloadTemplate(null, { plugins: [custom, custom] }), error => {
      assert.ok(error instanceof PayloadTemplateError);
      assert.deepEqual(error.issue, {
        code: 'DUPLICATE_PLUGIN_OPERATION', kind, operation: 'same', plugin: 'test',
      });
      return true;
    });
  }
});

test('operations execute left-to-right in member then collection scope', () => {
  const calls = [];
  const custom = plugin({
    before: x => { calls.push(['before', x]); return true; },
    after: x => { calls.push(['after', x]); return true; },
    collection: xs => { calls.push(['collection', [...xs]]); return true; },
  }, { increment: x => x + 1, reverse: xs => xs.reverse() });
  const template = new PayloadTemplate('{{x:number[@before>increment@after??omit]@collection>reverse@range}}',
    { plugins: [...builtInPlugins, custom] });
  const input = [2, null, 1];
  assert.deepEqual(template.render({ x: input }), [2, 3]);
  assert.deepEqual(input, [2, null, 1]);
  assert.deepEqual(calls, [['before', 2], ['after', 3], ['before', 1], ['after', 2], ['collection', [3, 2]]]);
  const dates = new PayloadTemplate('{{x:string[ @ dateonly > isodatetime ] @ range}}');
  assert.deepEqual(dates.render({ x: ['2026-01-01', '2026-12-31'] }), ['2026-01-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z']);
});

test('fallbacks are evaluated before plugins and never handle validation failures', () => {
  for (const operator of ['??', '||']) {
    const template = new PayloadTemplate({ x: `{{x:string @ dateonly ${operator} omit}}` });
    assert.deepEqual(template.render({}), {});
    assert.throws(() => template.render({ x: 'bad' }), issue('VALIDATION_FAILED'));
  }
  const template = new PayloadTemplate('{{x:number[ @ positive ?? omit ] @ unique || null}}', {
    plugins: [...builtInPlugins, plugin({ positive: x => x > 0 })],
  });
  assert.equal(template.render({ x: false }), null);
  assert.deepEqual(template.render({ x: [null, 1, 2] }), [1, 2]);
  assert.throws(() => template.render({ x: [null, -1] }), e => issue('VALIDATION_FAILED')(e) && e.issue.valuePath === '$[1]');
  assert.throws(() => template.render({ x: [1, 1] }), issue('VALIDATION_FAILED'));
  const empty = new PayloadTemplate('{{x:string > empty || null}}', { plugins: [plugin({}, { empty: () => '' })] });
  assert.equal(empty.render({ x: 'value' }), '');
  const nulls = new PayloadTemplate('{{x:string[ @ dateonly ?? null ] @ unique}}');
  assert.deepEqual(nulls.render({ x: [null, '2026-01-01'] }), [null, '2026-01-01']);
});

test('invalid transformer outputs and plugin exceptions are owned errors', () => {
  for (const output of [null, undefined, Symbol('omit'), 1, {}, ['x'], Promise.resolve('x')]) {
    const template = new PayloadTemplate('{{x:string > bad ?? null}}', { plugins: [plugin({}, { bad: () => output })] });
    assert.throws(() => template.render({ x: 'x' }), issue('INVALID_TRANSFORMER_RESULT'));
  }
  for (const output of [[1], [null], [undefined], Array(1), 'x']) {
    const template = new PayloadTemplate('{{x:string[] > bad}}', { plugins: [plugin({}, { bad: () => output })] });
    assert.throws(() => template.render({ x: [] }), issue('INVALID_TRANSFORMER_RESULT'));
  }
  const invalidNumber = new PayloadTemplate('{{x:number > bad}}', { plugins: [plugin({}, { bad: () => NaN })] });
  assert.throws(() => invalidNumber.render({ x: 1 }), issue('INVALID_TRANSFORMER_RESULT'));
  const throws = () => { throw new Error('private input'); };
  for (const [operator, p] of [['@', plugin({ bad: throws })], ['>', plugin({}, { bad: throws })]]) {
    assert.throws(() => new PayloadTemplate(`{{x:string ${operator} bad}}`, { plugins: [p] }).render({ x: 'x' }),
      e => issue('PLUGIN_EXECUTION_FAILED')(e) && !JSON.stringify(e).includes('private input'));
  }
  const mutate = new PayloadTemplate('{{x:string[] @ bad}}', { plugins: [plugin({ bad: xs => { xs.push('bad'); return true; } })] });
  const input = ['a'];
  assert.throws(() => mutate.render({ x: input }), issue('PLUGIN_EXECUTION_FAILED'));
  assert.deepEqual(input, ['a']);
});

test('built-ins reject invalid calendars, timestamps, email addresses, and collections', () => {
  for (const [name, values] of [
    ['dateonly', ['2026-02-29', '2024-02-30', '2026-13-01', '2026-1-1', '']],
    ['isodatetime', ['2026-01-01', '2026-02-30T00:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T00:00:00']],
    ['email', ['a@@example.com', '.a@example.com', 'a..b@example.com', 'a@-example.com', 'a b@example.com']],
    ['domain', ['localhost', '-example.com', 'example..com', 'example.com/']],
  ]) for (const x of values) {
    assert.throws(() => new PayloadTemplate(`{{x:string @ ${name}}}`).render({ x }), issue('VALIDATION_FAILED'));
  }
  assert.equal(new PayloadTemplate('{{x:string @ dateonly}}').render({ x: '2024-02-29' }), '2024-02-29');
  assert.equal(new PayloadTemplate('{{x:string @ isodatetime > isodatetime}}').render({ x: '2026-01-01T01:00:00+01:00' }), '2026-01-01T00:00:00.000Z');
  for (const x of [[], [1], [1, 1], [2, 1], [1, 2, 3]]) {
    assert.throws(() => new PayloadTemplate('{{x:number[] @ range}}').render({ x }), issue('VALIDATION_FAILED'));
  }
});

test('normalization, extraction, conflicts and highlighting retain ordered operations', () => {
  const template = new PayloadTemplate('{{ x : string [@dateonly>isodatetime??omit]@range??throw }}');
  const canonical = '{{x:string[ @ dateonly > isodatetime ?? omit ] @ range ?? throw}}';
  assert.equal(template.toJSON(), canonical);
  assert.equal(new PayloadTemplate(canonical).toJSON(), canonical);
  const extracted = template.extractVariables();
  assert.deepEqual(extracted[0].memberOperations, [{ kind: 'validator', name: 'dateonly' }, { kind: 'transformer', name: 'isodatetime' }]);
  extracted[0].memberOperations[0].name = 'corrupt';
  assert.equal(template.extractVariables()[0].memberOperations[0].name, 'dateonly');
  const [{ tokens }] = template.tokenizePayloadExpression();
  assert.equal(tokens.map(t => t.text).join(''), canonical);
  assert.equal(tokens.some(t => t.kind === 'unknown'), false);
  assert.deepEqual(tokens.filter(t => ['validator', 'transformer'].includes(t.kind)).map(t => [t.kind, t.text]),
    [['validator', 'dateonly'], ['transformer', 'isodatetime'], ['validator', 'range']]);
  for (const token of tokens) assert.equal(canonical.slice(token.start, token.end), token.text);
  assert.throws(() => new PayloadTemplate(['{{x:string @ dateonly > isodatetime}}', '{{x:string > isodatetime @ dateonly}}']), issue('VARIABLE_EXPRESSION_CONFLICT'));
  for (const tail of ['@', '>', '@ date only', '?? null @ dateonly', '@ dateonly[]', '[@ dateonly] >', '@@ dateonly']) {
    assert.throws(() => new PayloadTemplate(`{{x:string ${tail}}}`), issue('INVALID_FALLBACK_SYNTAX'));
  }
});
