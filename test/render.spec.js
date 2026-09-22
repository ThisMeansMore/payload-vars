import test from 'node:test';
import assert from 'node:assert/strict';
import { PayloadTemplate, PayloadTemplateError } from '../dist/index.js';

const operators = ['??', '||'];
const actions = ['null', 'omit', 'throw'];
const triggers = (operator, value) => operator === '??' ? value == null : !value;

function expectIssue(fn, expected) {
  assert.throws(fn, error => {
    assert.ok(error instanceof PayloadTemplateError);
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(error.issue[key], value);
    return true;
  });
}

test('scalar fallback matrix follows JavaScript semantics before validation', () => {
  for (const [type, valid, falsy] of [['string', 'a', ''], ['number', 2, 0], ['boolean', true, false]]) {
    for (const operator of operators) for (const action of actions) {
      const template = { x: `{{x:${type} ${operator} ${action}}}` };
      for (const value of [undefined, null, '', 0, 0n, false, NaN, valid]) {
        const run = () => new PayloadTemplate(template).render({ x: value });
        if (triggers(operator, value)) {
          if (action === 'throw') expectIssue(run, { code: 'FALLBACK_THROW', operator });
          else assert.deepEqual(run(), action === 'omit' ? {} : { x: null });
        } else if (value === valid || value === falsy) assert.deepEqual(run(), { x: value });
        else expectIssue(run, { code: 'INVALID_VARIABLE_TYPE' });
      }
      if (action === 'throw') expectIssue(() => new PayloadTemplate(template).render({}), { code: 'FALLBACK_THROW' });
      else assert.deepEqual(new PayloadTemplate(template).render({}), action === 'omit' ? {} : { x: null });
    }
  }
});

test('whole-array fallbacks preserve empty arrays and validate truthy non-arrays', () => {
  for (const type of ['string[]', 'number[]']) for (const operator of operators) for (const action of actions) {
    const template = { x: `{{x:${type} ${operator} ${action}}}` };
    assert.deepEqual(new PayloadTemplate(template).render({ x: [] }), { x: [] });
    for (const variables of [{}, { x: undefined }, { x: null }, ...(operator === '||' ? [{ x: false }, { x: 0 }, { x: '' }] : [])]) {
      if (action === 'throw') expectIssue(() => new PayloadTemplate(template).render(variables), { code: 'FALLBACK_THROW' });
      else assert.deepEqual(new PayloadTemplate(template).render(variables), action === 'omit' ? {} : { x: null });
    }
    expectIssue(() => new PayloadTemplate(template).render({ x: {} }), { code: 'INVALID_VARIABLE_TYPE' });
  }
});

test('member fallback matrix preserves order and processes sparse slots as undefined', () => {
  for (const [type, input] of [['string', ['a', '', null, undefined, 'b']], ['number', [1, undefined, null, 0, 2]]]) {
    for (const operator of operators) for (const action of actions) {
      const template = `{{x:${type}[ ${operator} ${action} ]}}`;
      if (action === 'throw') {
        const index = input.findIndex(value => triggers(operator, value));
        expectIssue(() => new PayloadTemplate(template).render({ x: input }), { code: 'FALLBACK_THROW', valuePath: `$[${index}]` });
      } else {
        const expected = input.flatMap(value => triggers(operator, value) ? action === 'omit' ? [] : [null] : [value]);
        assert.deepEqual(new PayloadTemplate(template).render({ x: input }), expected);
      }
    }
  }
  assert.deepEqual(new PayloadTemplate('{{x:number[ ?? null ]}}').render({ x: [1, , 2] }), [1, null, 2]);
  assert.deepEqual(new PayloadTemplate('{{x:number[ ?? omit ]}}').render({ x: [1, , 2] }), [1, 2]);
});

test('combines independent member and value fallbacks', () => {
  for (const memberOperator of operators) for (const memberAction of actions)
    for (const valueOperator of operators) for (const valueAction of actions) {
      const template = { x: `{{x:number[ ${memberOperator} ${memberAction} ] ${valueOperator} ${valueAction}}}` };
      if (valueAction === 'throw') expectIssue(() => new PayloadTemplate(template).render({}), { code: 'FALLBACK_THROW', operator: valueOperator });
      else assert.deepEqual(new PayloadTemplate(template).render({}), valueAction === 'omit' ? {} : { x: null });
      if (memberAction === 'throw') expectIssue(() => new PayloadTemplate(template).render({ x: [1, null, 2] }), { code: 'FALLBACK_THROW', valuePath: '$[1]' });
      else assert.deepEqual(new PayloadTemplate(template).render({ x: [1, null, 2] }), { x: memberAction === 'omit' ? [1, 2] : [1, null, 2] });
    }
});

test('omits object properties and template array entries without losing original paths', () => {
  assert.deepEqual(new PayloadTemplate({ nested: ['{{x:string ?? omit}}', 'constant', { x: '{{x:string ?? omit}}' }] }).render({}),
    { nested: ['constant', {}] });
  expectIssue(() => new PayloadTemplate(['{{x:string ?? omit}}', '{{y:number || throw}}']).render({ y: 0 }),
    { code: 'FALLBACK_THROW', templatePaths: ['$[1]'] });
  expectIssue(() => new PayloadTemplate('{{x:string ?? omit}}').render({}), { code: 'CANNOT_OMIT_ROOT', templatePaths: ['$'] });
  assert.equal(new PayloadTemplate('{{x:string ?? omit}}').render({ x: 'ok' }), 'ok');
});

test('strict types reject missing, undefined, null, wrong types and non-finite numbers', () => {
  expectIssue(() => new PayloadTemplate({ a: '{{x:string}}', b: ['{{x:string}}'] }).render({}), {
    code: 'MISSING_VARIABLE', variableName: 'x', declaration: '{{x:string}}', expectedType: 'string', templatePaths: ['$.a', '$.b[0]'],
  });
  for (const [type, values] of [['string', [undefined, null, 2]], ['number', ['2', NaN, Infinity, -Infinity]],
    ['boolean', [0, 'false']], ['string[]', [null, 'text']], ['number[]', [false, {}]]]) {
    for (const value of values) expectIssue(() => new PayloadTemplate(`{{x:${type}}}`).render({ x: value }), { code: 'INVALID_VARIABLE_TYPE' });
  }
  for (const [type, bad] of [['string', 2], ['number', '2'], ['number', Infinity], ['number', -Infinity]]) {
    for (const operator of operators) for (const action of actions) {
      expectIssue(() => new PayloadTemplate(`{{x:${type}[ ${operator} ${action} ]}}`).render({ x: [null, bad] }),
        action === 'throw' ? { code: 'FALLBACK_THROW', valuePath: '$[0]' } : { code: 'INVALID_VARIABLE_TYPE', valuePath: '$[1]' });
    }
  }
  expectIssue(() => new PayloadTemplate('{{x:number[]}}').render({ x: [1, , 2] }), { code: 'INVALID_VARIABLE_TYPE', valuePath: '$[1]' });
  expectIssue(() => new PayloadTemplate('{{x:number[ ?? omit ]}}').render({}), { code: 'MISSING_VARIABLE' });
  expectIssue(() => new PayloadTemplate('{{x:number[ ?? omit ]}}').render({ x: null }), { code: 'INVALID_VARIABLE_TYPE' });
});

test('protects special keys and treats inherited variables as missing', () => {
  const template = JSON.parse('{"__proto__":"{{x:string}}","order-id":"{{x:string}}"}');
  const result = new PayloadTemplate(template).render({ x: 'safe' });
  assert.equal(Object.getOwnPropertyDescriptor(result, '__proto__').value, 'safe');
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  expectIssue(() => new PayloadTemplate(template).render({}), { templatePaths: ['$.__proto__', '$["order-id"]'] });
  assert.deepEqual(new PayloadTemplate({ x: '{{x:string ?? null}}' }).render(Object.create({ x: 'inherited' })), { x: null });
});

test('errors use canonical declarations and never expose runtime values', () => {
  const secret = 'private-runtime-value';
  assert.throws(() => new PayloadTemplate(['{{x:number??null}}', '{{ x : number ?? null }}']).render({ x: secret }), error => {
    assert.deepEqual(error.issue, { code: 'INVALID_VARIABLE_TYPE', variableName: 'x', declaration: '{{x:number ?? null}}',
      expectedType: 'number', actualType: 'string', templatePaths: ['$[0]', '$[1]'] });
    assert.ok(!JSON.stringify(error).includes(secret));
    assert.ok(!error.message.includes(secret));
    return true;
  });
});

test('renders constants and strict values, and leaves frozen inputs unchanged', () => {
  const strings = Object.freeze(['a', null, '', undefined, 'b']);
  const template = Object.freeze({ nested: Object.freeze(['{{s:string[ ?? omit ]}}', '{{n:number}}',
    '{{b:boolean}}', '', 0, false, null, Object.freeze({ repeated: '{{n:number}}' })]) });
  const variables = Object.freeze({ s: strings, n: 0, b: false, extra: 'ignored' });
  const result = new PayloadTemplate(template).render(variables);
  assert.deepEqual(result, { nested: [['a', '', 'b'], 0, false, '', 0, false, null, { repeated: 0 }] });
  result.nested[0].push('changed');
  assert.deepEqual(strings, ['a', null, '', undefined, 'b']);
  assert.equal(template.nested[0], '{{s:string[ ?? omit ]}}');
});
