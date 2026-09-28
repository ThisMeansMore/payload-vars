import test from 'node:test';
import assert from 'node:assert/strict';
import { PayloadTemplate, PayloadTemplateError } from '../dist/index.js';

const issue = code => error => error instanceof PayloadTemplateError && error.issue.code === code;
const dates = { date1: '2026-01-01T01:00:00+01:00', date2: '2026-01-01T01:30:00Z' };
const difference = '{{hoursDifference:number = date.interval($.date1,$.date2) > date.msToHours}}';
const custom = (execute, argumentTypes = ['number[]'], resultType = 'number') => ({
  plugins: [{ name: 'custom', functions: { run: { argumentTypes, resultType, execute } } }],
});

test('date example, argument-only template, reversed order, negative and fractional intervals', () => {
  const source = {
    date1: '{{date1:string ! date.isodatetime > core.omit}}',
    date2: '{{date2:string ! date.isodatetime > core.omit}}',
    hoursDifference: difference,
  };
  for (const template of [source, Object.fromEntries(Object.entries(source).reverse()), { hoursDifference: difference }]) {
    const instance = new PayloadTemplate(template);
    assert.deepEqual(instance.render(dates), { hoursDifference: 1.5 });
    assert.deepEqual(instance.render({ date1: dates.date2, date2: dates.date1 }), { hoursDifference: -1.5 });
    assert.deepEqual(instance.render({ date1: dates.date1, date2: dates.date1 }), { hoursDifference: 0 });
  }
});

test('functions enforce date validity without separate validators', () => {
  const instance = new PayloadTemplate(difference);
  for (const date1 of ['2026-02-30T00:00:00Z', '2026-01-01', '2026-01-01T00:00:00', '2026-01-01T24:00:00Z', '2026-01-01T00:00:00+24:00']) {
    assert.throws(() => instance.render({ ...dates, date1 }), issue('PLUGIN_EXECUTION_FAILED'));
  }
  for (const input of [{}, { ...dates, date1: null }, { ...dates, date2: 0 }, Object.create(dates)]) {
    assert.throws(() => instance.render(input), issue('INVALID_FUNCTION_ARGUMENT'));
  }
});

test('occurrences evaluate independently, including identical declarations and fallbacks', () => {
  let calls = 0;
  const options = { plugins: [{ name: 'custom', transformers: { count: x => `${x}${++calls}` } }] };
  const instance = new PayloadTemplate({ a: '{{x:string > custom.count}}', b: '{{x:string > custom.count}}' }, options);
  assert.deepEqual(instance.render({ x: 'v' }), { a: 'v1', b: 'v2' });
  assert.equal(instance.variables().length, 1);
  const repeated = new PayloadTemplate({
    raw: '{{x:string}}', trimmed: '{{x:string > text.trim}}', omitted: '{{x:string > core.omit}}',
    nullable: '{{y:string ?? null}}', missing: '{{y:string ?? omit}}',
  });
  assert.deepEqual(repeated.render({ x: ' value ' }), { raw: ' value ', trimmed: 'value', nullable: null });
  assert.deepEqual(repeated.variables().map(v => v.paths), [['$.raw'], ['$.trimmed'], ['$.omitted'], ['$.nullable'], ['$.missing']]);
});

test('functions and transformations cannot mutate inputs or another occurrence', () => {
  const options = custom((first, second) => { first.reverse(); assert.deepEqual(second, [1, 2]); second.push(9); return first[0]; }, ['number[]', 'number[]']);
  options.plugins[0].transformers = { reverse: values => values.reverse() };
  const source = {
    reversed: '{{items:number[] > custom.reverse}}',
    derived: '{{answer:number = custom.run($.items,$.items)}}',
    original: '{{items:number[]}}',
    omitted: '{{items:number[] > core.omit}}',
  };
  const input = Object.freeze({ items: Object.freeze([1, 2]) });
  for (const template of [source, Object.fromEntries(Object.entries(source).reverse())]) {
    assert.deepEqual(new PayloadTemplate(template, options).render(input), { reversed: [2, 1], derived: 2, original: [1, 2] });
    assert.deepEqual(input.items, [1, 2]);
  }
});

test('function result validation precedes fallback; fallback still precedes operations', () => {
  for (const result of [undefined, null, NaN, Infinity, '1', {}, Promise.resolve(1), Promise.reject(new Error('private async failure'))]) {
    assert.throws(() => new PayloadTemplate('{{out:number = custom.run() ?? null}}', custom(() => result, [])).render({}), issue('INVALID_FUNCTION_RESULT'));
  }
  const options = custom(() => 0, []);
  options.plugins[0].transformers = { fail: () => { throw new Error('must not run'); } };
  assert.equal(new PayloadTemplate('{{out:number = custom.run() > custom.fail || null}}', options).render({}), null);
  assert.throws(() => new PayloadTemplate('{{out:number = custom.run() || throw}}', options).render({}), issue('FALLBACK_THROW'));
  assert.deepEqual(new PayloadTemplate({ out: '{{out:number = custom.run() > core.omit || null}}' }, options).render({}), {});
  assert.throws(() => new PayloadTemplate('{{out:number = custom.run()}}', custom(() => { throw new Error('secret'); }, [])).render({}), error => {
    assert.equal(error.issue.code, 'PLUGIN_EXECUTION_FAILED');
    assert.equal(error.issue.kind, 'function');
    assert.ok(!JSON.stringify(error).includes('secret'));
    assert.equal(error.cause, undefined);
    return true;
  });
});

test('omission is unconditional, terminal and whole-value, with root and validation errors preserved', () => {
  for (const expression of ['string[ > core.omit ]', 'string > core.omit > text.trim',
    'string ? date.dateonly > core.omit', 'string ? date.dateonly ~ core.omit', 'string > core.omit ! date.dateonly']) {
    assert.throws(() => new PayloadTemplate(`{{x:${expression}}}`), issue('INVALID_OMIT_OPERATION'));
  }
  assert.deepEqual(new PayloadTemplate(['{{x:number > core.omit}}', '{{x:number}}']).render({ x: 2 }), [2]);
  assert.throws(() => new PayloadTemplate('{{x:number > core.omit}}').render({ x: 2 }), issue('CANNOT_OMIT_ROOT'));
  assert.throws(() => new PayloadTemplate('{{x:string ! date.isodatetime > core.omit}}').render({ x: 'bad' }), issue('VALIDATION_FAILED'));
  assert.throws(() => new PayloadTemplate('{{x:number > core.omit}}').render({ x: 'bad' }), issue('INVALID_VARIABLE_TYPE'));
  assert.deepEqual(new PayloadTemplate({ x: '{{x:string ? date.dateonly > date.isodatetime > core.omit}}' }).render({ x: 'bad' }), {});
});

test('construction resolves signatures and rejects incompatible source types in either order', () => {
  for (const [expression, code] of [
    ['number = missing.run(a,b)', 'UNKNOWN_PLUGIN_OPERATION'],
    ['number = date.interval($.a)', 'INVALID_FUNCTION_ARGUMENTS'],
    ['number = date.interval($.a,$.b,$.c)', 'INVALID_FUNCTION_ARGUMENTS'],
    ['number = date.interval($.a,)', 'INVALID_FUNCTION_ARGUMENTS'],
    ['number = date.interval(a.b,$.c)', 'UNKNOWN_FUNCTION_REFERENCE'],
    ['string = date.interval($.a,$.b)', 'FUNCTION_RESULT_TYPE_MISMATCH'],
    ['number = date.interval(date.interval($.a,$.b),c)', 'INVALID_PLACEHOLDER'],
    ['number > date.msToHours = date.interval($.a,$.b)', 'INVALID_PLACEHOLDER'],
  ]) assert.throws(() => new PayloadTemplate(`{{out:${expression}}}`), issue(code));
  for (const entries of [ ['{{a:number}}', difference.replace('date1', 'a')], ['{{a:string}}', '{{a:number}}'] ]) {
    for (const template of [entries, [...entries].reverse()]) assert.throws(() => new PayloadTemplate(template), issue('VARIABLE_TYPE_CONFLICT'));
  }
  // The name of another output remains an original input name, never a dependency.
  const template = new PayloadTemplate({ a: '{{a:number = custom.run()}}', b: '{{b:number = custom.run()}}' }, custom(() => 1, []));
  assert.deepEqual(template.render({}), { a: 1, b: 1 });
  const original = new PayloadTemplate({ a: '{{a:string = custom.run()}}', b: '{{b:number = date.interval($.a,$.date2)}}' }, custom(() => dates.date1, [], 'string'));
  assert.throws(() => original.render({ date2: dates.date2 }), issue('INVALID_FUNCTION_ARGUMENT'));
});

test('registration validates function metadata and snapshots signatures', () => {
  for (const fn of [null, {}, { argumentTypes: ['object'], resultType: 'number', execute: () => 1 },
    { argumentTypes: [], resultType: 'object', execute: () => 1 }, { argumentTypes: [], resultType: 'number', execute: 1 }]) {
    assert.throws(() => new PayloadTemplate({}, { plugins: [{ name: 'custom', functions: { run: fn } }] }), issue('INVALID_PLUGIN_OPERATION'));
  }
  assert.throws(() => new PayloadTemplate({}, { plugins: [{ name: 'custom', functions: { 'bad.name': {} } }] }), issue('INVALID_PLUGIN_OPERATION_NAME'));
  const options = custom(values => values.length);
  const template = new PayloadTemplate('{{out:number = custom.run($.items)}}', options);
  options.plugins[0].functions.run.argumentTypes[0] = 'string';
  options.plugins[0].functions.run.execute = () => 'bad';
  assert.equal(template.render({ items: [1, 2] }), 2);
});

test('canonicalization, extraction and tokens expose derived calls and argument-only sources', () => {
  const template = new PayloadTemplate({ out: '{{ out : number = date.interval( $.date1 , $.date2 ) > date.msToHours }}' });
  const canonical = '{{out:number = date.interval($.date1,$.date2) > date.msToHours}}';
  assert.deepEqual(template.toJSON(), { out: canonical });
  assert.deepEqual(new PayloadTemplate(template.toJSON()).toJSON(), template.toJSON());
  const variables = template.variables();
  assert.deepEqual(variables.map(v => [v.name, v.type, v.derived, v.functionArgument]), [
    ['out', 'number', true, undefined], ['date1', 'string', undefined, true], ['date2', 'string', undefined, true],
  ]);
  assert.deepEqual(variables[0].function, { name: 'date.interval', arguments: ['$.date1', '$.date2'] });
  variables[0].function.arguments.reverse(); variables[1].paths.push('bad');
  assert.deepEqual(template.variables()[0].function.arguments, ['$.date1', '$.date2']);
  assert.deepEqual(template.variables()[1].paths, ['$.out']);
  const [{ tokens }] = template.tokenizePayloadExpression();
  assert.equal(tokens.map(t => t.text).join(''), canonical);
  assert.ok(tokens.every(t => t.kind !== 'unknown' && canonical.slice(t.start, t.end) === t.text));
  assert.equal(tokens.find(t => t.text === 'date.interval').kind, 'function');
  assert.equal(tokens.find(t => t.text === '$.date1').kind, 'variable');
});

test('all function base types, array results, and multiline expressions', () => {
  for (const [type, value] of [['string', 'x'], ['boolean', true], ['number', 2], ['string[]', ['x']], ['number[]', [1, 2]]]) {
    const options = custom(input => input, [type], type);
    const template = new PayloadTemplate(`{{out:${type} = custom.run( $.input )\n > core.omit}}`, options);
    assert.throws(() => template.render({ input: value }), issue('CANNOT_OMIT_ROOT'));
    const identity = new PayloadTemplate(`{{out:${type} = custom.run($.input)}}`, options);
    assert.deepEqual(identity.render({ input: value }), value);
    assert.equal(new PayloadTemplate(identity.toJSON(), options).toJSON(), identity.toJSON());
    assert.ok(identity.tokenizePayloadExpression()[0].tokens.every(t => t.kind !== 'unknown'));
  }
  for (const result of [[null], [Infinity], ['x'], Array(1)]) {
    assert.throws(() => new PayloadTemplate('{{out:number[] = custom.run()}}', custom(() => result, [], 'number[]')).render({}), issue('INVALID_FUNCTION_RESULT'));
  }
  const detached = custom(function () { assert.equal(this, undefined); return 1; }, []);
  assert.equal(new PayloadTemplate('{{out:number = custom.run()}}', detached).render({}), 1);
});

test('functions see raw strings even when another property transforms them', () => {
  const source = { domain: '{{email:string ! email.email > email.domain}}', raw: '{{copy:string = custom.run($.email)}}' };
  const options = custom(value => value, ['string'], 'string');
  for (const template of [source, Object.fromEntries(Object.entries(source).reverse())]) {
    assert.deepEqual(new PayloadTemplate(template, options).render({ email: 'User@Example.com' }), { domain: 'example.com', raw: 'User@Example.com' });
  }
});

test('evaluated and mixed date arguments use transformed omitted values in either order', () => {
  const source = {
    date1: '{{start:string > date.isodatetime > core.omit}}',
    date2: '{{end:string > date.isodatetime > core.omit}}',
    hours: '{{hours:number = date.interval(date1,date2) > date.msToHours}}',
  };
  for (const definition of [source, Object.fromEntries(Object.entries(source).reverse())]) {
    const template = new PayloadTemplate(definition);
    assert.deepEqual(template.render({ start: '2026-01-01', end: '2026-01-02' }), { hours: 24 });
    assert.deepEqual(template.render({ start: '2026-01-01', end: '2026-01-03' }), { hours: 48 });
  }
  assert.deepEqual(new PayloadTemplate({ ...source, hours: source.hours.replace('date1,date2', 'date1,$.end') })
    .render({ start: '2026-01-01', end: '2026-01-02T00:00:00Z' }), { hours: 24 });
  assert.throws(() => new PayloadTemplate({ ...source, hours: source.hours.replace('date1,date2', '$.start,$.end') })
    .render({ start: '2026-01-01', end: '2026-01-02' }), issue('PLUGIN_EXECUTION_FAILED'));
});

test('property paths, chains and repeated inputs evaluate each location once per render', () => {
  let calls = 0;
  const options = custom((...args) => args.join('|'), ['string', 'string'], 'string');
  options.plugins[0].transformers = { count: value => { calls++; return value.trim(); }, upper: value => value.toUpperCase() };
  const template = new PayloadTemplate({
    result: '{{out:string = custom.run(chain,$.x)}}',
    chain: '{{out:string = custom.run(items[1].value,other)}}',
    other: '{{x:string > custom.upper > core.omit}}',
    items: ['{{unused:string ?? omit}}', { value: '{{x:string > custom.count > core.omit}}' }],
  }, options);
  const input = Object.freeze({ x: ' a ' });
  assert.deepEqual(template.render(input), { result: 'a| A | a ', chain: 'a| A ', items: [{}] });
  assert.equal(calls, 1);
  template.render(input);
  assert.equal(calls, 2);
  assert.ok(template.tokenizePayloadExpression().every(({ tokens }) => tokens.every(t => t.kind !== 'unknown')));
  const metadata = template.variables();
  assert.deepEqual(metadata[0].dependencies, [{ source: 'property', path: '$.chain' }, { source: 'input', name: 'x' }]);
  metadata[0].dependencies[0].path = 'bad';
  assert.equal(template.variables()[0].dependencies[0].path, '$.chain');
  const rootArray = new PayloadTemplate(['{{x:string > core.omit}}', '{{out:string = custom.run([0],[0])}}'], options);
  assert.deepEqual(rootArray.render({ x: 'a' }), ['a|a']);
  assert.ok(rootArray.tokenizePayloadExpression()[1].tokens.every(t => t.kind !== 'unknown'));
});

test('fallback omission and null are structured argument failures', () => {
  for (const action of ['omit', 'null']) {
    const template = new PayloadTemplate({ result: '{{out:number = date.interval(a,$.end)}}', a: `{{start:string ?? ${action}}}` });
    assert.throws(() => template.render({ end: dates.date2 }), error => {
      assert.equal(error.issue.code, 'INVALID_FUNCTION_ARGUMENT');
      assert.equal(error.issue.referencePath, '$.a');
      assert.equal(error.issue.source, 'property');
      assert.equal(error.issue.reason, action === 'omit' ? 'omitted' : 'null');
      return true;
    });
  }
});

test('construction rejects unknown, unsupported, incompatible and cyclic references', () => {
  const options = custom(value => value, ['string'], 'string');
  for (const reference of ['missing', 'x', 'nested', 'literal']) {
    assert.throws(() => new PayloadTemplate({ a: '{{x:string}}', nested: { x: '{{x:string}}' }, literal: 'text',
      out: `{{out:string = custom.run(${reference})}}` }, options), issue('UNKNOWN_FUNCTION_REFERENCE'));
  }
  for (const reference of ['a[01]', 'a[-1]', 'a["x"]', '$.a.x', 'a..x']) {
    assert.throws(() => new PayloadTemplate(`{{out:string = custom.run(${reference})}}`, options), issue('INVALID_FUNCTION_ARGUMENTS'));
  }
  assert.throws(() => new PayloadTemplate({ a: '{{x:number}}', out: '{{out:string = custom.run(a)}}' }, options), issue('FUNCTION_ARGUMENT_TYPE_MISMATCH'));
  for (const definition of [
    { a: '{{a:string = custom.run(a)}}' },
    { a: '{{a:string = custom.run(b)}}', b: '{{b:string = custom.run(c)}}', c: '{{c:string = custom.run(a)}}' },
  ]) assert.throws(() => new PayloadTemplate(definition, options), issue('CYCLIC_FUNCTION_REFERENCE'));
  // Full root-relative paths distinguish repeated leaf names without a leaf-name search.
  assert.deepEqual(new PayloadTemplate({ left: { x: '{{a:string}}' }, right: { x: '{{b:string}}' },
    out: '{{out:string = custom.run(right.x)}}' }, options).render({ a: 'a', b: 'b' }),
  { left: { x: 'a' }, right: { x: 'b' }, out: 'b' });
});

test('identical declarations retain separate caches and evaluated arrays are isolated', () => {
  let calls = 0;
  const options = custom((a, b) => { a.push(9); assert.deepEqual(b, [1, 2]); return a.length; }, ['number[]', 'number[]']);
  options.plugins[0].transformers = { count: values => { calls++; return values; } };
  const template = new PayloadTemplate({
    out: '{{out:number = custom.run(a,a)}}',
    a: '{{items:number[] > custom.count}}',
    b: '{{items:number[] > custom.count}}',
  }, options);
  const input = Object.freeze({ items: Object.freeze([1, 2]) });
  assert.deepEqual(template.render(input), { out: 3, a: [1, 2], b: [1, 2] });
  assert.equal(calls, 2);
  assert.deepEqual(template.variables()[1].paths, ['$.a', '$.b']);
});

test('derived fallback omission and unsupported literal-key aliases are rejected', () => {
  const options = custom(() => 0, [], 'number');
  options.plugins[0].functions.identity = { argumentTypes: ['number'], resultType: 'number', execute: x => x };
  assert.throws(() => new PayloadTemplate({
    out: '{{out:number = custom.identity(zero)}}', zero: '{{zero:number = custom.run() || omit}}',
  }, options).render({}), issue('INVALID_FUNCTION_ARGUMENT'));
  assert.throws(() => new PayloadTemplate({ 'a.b': '{{x:string}}', out: '{{out:number = date.interval(a.b,$.end)}}' }),
    issue('UNKNOWN_FUNCTION_REFERENCE'));
});
