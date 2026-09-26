import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PayloadTemplate, PayloadTemplateError } from '../dist/index.js';

const plugin = (validators = {}, transformers = {}) => ({ name: 'test', validators, transformers });
const issue = code => error => error instanceof PayloadTemplateError && error.issue.code === code;

test('built-ins are always available in both package formats', async () => {
  const esm = await import('../dist/index.js');
  const cjs = createRequire(import.meta.url)('../dist/cjs/index.js');
  for (const api of [esm, cjs]) {
    for (const name of ['builtInPlugins', 'datePlugin', 'emailPlugin', 'collectionPlugin']) {
      assert.equal(Object.hasOwn(api, name), false);
    }
    for (const options of [undefined, { plugins: [] }, { plugins: [plugin({ email: () => false })] }]) {
      assert.equal(new api.PayloadTemplate('{{x:string @ dateonly > isodatetime}}', options)
        .render({ x: '2026-01-01' }), '2026-01-01T00:00:00.000Z');
      assert.equal(new api.PayloadTemplate('{{x:string @ email > domain @ domain}}', options)
        .render({ x: 'user@Example.com' }), 'example.com');
    }
  }
});

test('namespaces isolate callbacks and built-ins with exact lookup', () => {
  const first = plugin({ same: x => x === 'ok', email: () => false }, { same: x => x.toUpperCase(), domain: () => 'custom' });
  const second = { name: 'other', validators: { same: x => x === 'OK' } };
  const options = { plugins: [first, second] };
  const template = new PayloadTemplate('{{x:string @ test.same > test.same @ other.same}}', options);
  first.validators.same = () => false;
  first.transformers.same = () => null;
  first.name = 'changed';
  assert.equal(template.render({ x: 'ok' }), 'OK');
  first.name = 'test';
  assert.equal(new PayloadTemplate('{{x:string > test.domain}}', options).render({ x: 'x' }), 'custom');
  assert.throws(() => new PayloadTemplate('{{x:string @ test.email}}', options).render({ x: 'a@example.com' }),
    e => issue('VALIDATION_FAILED')(e) && e.issue.operation === 'test.email');
  for (const reference of ['same', 'missing.same', 'test.missing', 'toString', 'date.dateonly']) {
    assert.throws(() => new PayloadTemplate(`{{x:string @ ${reference}}}`, options),
      e => issue('UNKNOWN_PLUGIN_OPERATION')(e) && e.issue.operation === reference);
  }
  assert.throws(() => new PayloadTemplate('{{x:string > other.same}}', options), issue('UNKNOWN_PLUGIN_OPERATION'));
  assert.throws(() => new PayloadTemplate('{{x:string > dateonly}}'), issue('UNKNOWN_PLUGIN_OPERATION'));
  assert.throws(() => new PayloadTemplate('{{x:string @ test.same}}'), issue('UNKNOWN_PLUGIN_OPERATION'));
});

test('duplicate namespaces fail even for empty or disjoint plugins', () => {
  const custom = plugin({ same: () => true });
  for (const plugins of [[custom, custom], [plugin(), plugin()], [custom, plugin({}, { other: x => x })]]) {
    assert.throws(() => new PayloadTemplate(null, { plugins }), error => {
      assert.deepEqual(error.issue, { code: 'DUPLICATE_PLUGIN_NAME', plugin: 'test' });
      return true;
    });
  }
});

test('registration validates names and callbacks', () => {
  for (const name of ['', '1test', 'a.b', 'a-b', 'a b', '$test', 'é', null, 123]) {
    assert.throws(() => new PayloadTemplate(null, { plugins: [{ name }] }), issue('INVALID_PLUGIN_NAME'));
  }
  for (const kind of ['validators', 'transformers']) {
    for (const name of ['', 'a.b', '1op', 'a-b', 'a b', '$op']) {
      assert.throws(() => new PayloadTemplate(null, { plugins: [{ name: 'test', [kind]: { [name]: x => x } }] }),
        issue('INVALID_PLUGIN_OPERATION_NAME'));
    }
    for (const fn of [null, undefined, true, 1, 'callback', {}]) {
      assert.throws(() => new PayloadTemplate(null, { plugins: [{ name: 'test', [kind]: { bad: fn } }] }),
        e => issue('INVALID_PLUGIN_OPERATION')(e) && e.issue.operation === 'test.bad');
    }
  }
  assert.equal(new PayloadTemplate('{{x:string @ _test2.do_something}}', {
    plugins: [{ name: '_test2', validators: { do_something: () => true } }],
  }).render({ x: 'ok' }), 'ok');
});

test('operations execute left-to-right in member then collection scope', () => {
  const calls = [];
  const custom = plugin({
    before: x => { calls.push(['before', x]); return true; },
    after: x => { calls.push(['after', x]); return true; },
    collection: xs => { calls.push(['collection', [...xs]]); return true; },
  }, { increment: x => x + 1, reverse: xs => xs.reverse() });
  const template = new PayloadTemplate('{{x:number[@test.before>test.increment@test.after??omit]@test.collection>test.reverse@range}}',
    { plugins: [custom] });
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
  const template = new PayloadTemplate('{{x:number[ @ test.positive ?? omit ] @ unique || null}}', {
    plugins: [plugin({ positive: x => x > 0 })],
  });
  assert.equal(template.render({ x: false }), null);
  assert.deepEqual(template.render({ x: [null, 1, 2] }), [1, 2]);
  assert.throws(() => template.render({ x: [null, -1] }), e => issue('VALIDATION_FAILED')(e) && e.issue.valuePath === '$[1]');
  assert.throws(() => template.render({ x: [1, 1] }), issue('VALIDATION_FAILED'));
  const empty = new PayloadTemplate('{{x:string > test.empty || null}}', { plugins: [plugin({}, { empty: () => '' })] });
  assert.equal(empty.render({ x: 'value' }), '');
  const nulls = new PayloadTemplate('{{x:string[ @ dateonly ?? null ] @ unique}}');
  assert.deepEqual(nulls.render({ x: [null, '2026-01-01'] }), [null, '2026-01-01']);
});

test('invalid transformer outputs and plugin exceptions are owned errors', () => {
  for (const output of [null, undefined, Symbol('omit'), 1, {}, ['x'], Promise.resolve('x')]) {
    const template = new PayloadTemplate('{{x:string > test.bad ?? null}}', { plugins: [plugin({}, { bad: () => output })] });
    assert.throws(() => template.render({ x: 'x' }), issue('INVALID_TRANSFORMER_RESULT'));
  }
  for (const output of [[1], [null], [undefined], Array(1), 'x']) {
    const template = new PayloadTemplate('{{x:string[] > test.bad}}', { plugins: [plugin({}, { bad: () => output })] });
    assert.throws(() => template.render({ x: [] }), issue('INVALID_TRANSFORMER_RESULT'));
  }
  const invalidNumber = new PayloadTemplate('{{x:number > test.bad}}', { plugins: [plugin({}, { bad: () => NaN })] });
  assert.throws(() => invalidNumber.render({ x: 1 }), issue('INVALID_TRANSFORMER_RESULT'));
  const throws = () => { throw new Error('private input'); };
  for (const [operator, p] of [['@', plugin({ bad: throws })], ['>', plugin({}, { bad: throws })]]) {
    assert.throws(() => new PayloadTemplate(`{{x:string ${operator} test.bad}}`, { plugins: [p] }).render({ x: 'x' }),
      e => issue('PLUGIN_EXECUTION_FAILED')(e) && !JSON.stringify(e).includes('private input'));
  }
  const mutate = new PayloadTemplate('{{x:string[] @ test.bad}}', { plugins: [plugin({ bad: xs => { xs.push('bad'); return true; } })] });
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

test('qualified operations normalize, extract, highlight and compare in both scopes', () => {
  const custom = plugin({ check: () => true }, { trim: x => x.trim() });
  const options = { plugins: [custom] };
  const template = new PayloadTemplate('{{ x : string [>test.trim@test.check??omit]@test.check??throw }}', options);
  const canonical = '{{x:string[ > test.trim @ test.check ?? omit ] @ test.check ?? throw}}';
  assert.equal(template.toJSON(), canonical);
  assert.equal(new PayloadTemplate(canonical, options).toJSON(), canonical);
  assert.deepEqual(template.render({ x: [' a ', null] }), ['a']);
  const [variable] = template.extractVariables();
  assert.deepEqual(variable.memberOperations, [
    { kind: 'transformer', name: 'test.trim' }, { kind: 'validator', name: 'test.check' },
  ]);
  assert.deepEqual(variable.valueOperations, [{ kind: 'validator', name: 'test.check' }]);
  const [{ tokens }] = template.tokenizePayloadExpression();
  assert.equal(tokens.map(t => t.text).join(''), canonical);
  assert.equal(tokens.some(t => t.kind === 'unknown'), false);
  assert.deepEqual(tokens.filter(t => ['validator', 'transformer'].includes(t.kind)).map(t => t.text),
    ['test.trim', 'test.check', 'test.check']);
  for (const token of tokens) assert.equal(canonical.slice(token.start, token.end), token.text);
  assert.throws(() => new PayloadTemplate(['{{x:string @ test.check}}', '{{x:string @ other.check}}'], {
    plugins: [custom, { ...custom, name: 'other' }],
  }), issue('VARIABLE_EXPRESSION_CONFLICT'));
  for (const reference of ['test.', '.check', 'test..check', 'test.group.check', 'test .check', 'test. check', '1test.check', 'test.1check']) {
    for (const tail of [`@ ${reference}`, `[ > ${reference} ]`]) {
      assert.throws(() => new PayloadTemplate(`{{x:string ${tail}}}`, options), issue('INVALID_FALLBACK_SYNTAX'));
    }
  }
  assert.throws(() => new PayloadTemplate('{{test.x:string}}'), issue('INVALID_PLACEHOLDER'));
});
