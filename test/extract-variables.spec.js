import test from 'node:test';
import assert from 'node:assert/strict';
import { PayloadTemplate, PayloadTemplateError } from '../dist/index.js';

const types = ['string', 'number', 'boolean', 'string[]', 'number[]'];
const operators = ['??', '||'];
const actions = ['null', 'omit', 'throw'];

test('extracts structured contracts in first occurrence order and skips constants', () => {
  const template = { nested: types.map((type, i) => ({ value: `{{v${i}:${type}}}` })),
    repeated: '{{v0:string}}', constants: ['ordinary', null, 0, false] };
  assert.deepEqual(new PayloadTemplate(template).extractVariables(), types.map((type, i) => ({
    name: `v${i}`, type, declaration: `{{v${i}:${type}}}`,
  })));
});

test('canonicalizes every value/member fallback combination and whitespace between tokens', () => {
  for (const type of types) for (const operator of operators) for (const action of actions) {
    const declaration = `{{x:${type} ${operator} ${action}}}`;
    assert.deepEqual(new PayloadTemplate([`{{ \nx\t : ${type.replace('[]', ' [ \t ]')} ${operator}${action}\n}}`, declaration]).extractVariables(),
      [{ name: 'x', type, valueFallback: { operator, action }, declaration }]);
  }
  for (const type of ['string', 'number']) for (const operator of operators) for (const action of actions) {
    for (const wholeOperator of operators) for (const wholeAction of actions) {
      const declaration = `{{x:${type}[ ${operator} ${action} ] ${wholeOperator} ${wholeAction}}}`;
      const variants = [declaration, `{{x:${type}[${operator}${action}]${wholeOperator}${wholeAction}}}`,
        `{{ x : ${type} \n[\t${operator}  ${action}\n] \t${wholeOperator} ${wholeAction} }}`];
      assert.deepEqual(new PayloadTemplate(variants).extractVariables(), [{ name: 'x', type: `${type}[]`,
        memberFallback: { operator, action }, valueFallback: { operator: wholeOperator, action: wholeAction }, declaration }]);
    }
    const declaration = `{{x:${type}[ ${operator} ${action} ]}}`;
    assert.deepEqual(new PayloadTemplate(`{{x:${type}[${operator}${action}]}}`).extractVariables(),
      [{ name: 'x', type: `${type}[]`, memberFallback: { operator, action }, declaration }]);
  }
});

test('conflicts compare complete normalized expressions and expose both paths', () => {
  const pairs = [['string', 'string ?? null'], ['string ?? null', 'string ?? omit'],
    ['string ?? throw', 'string || throw'], ['string[]', 'string[ ?? omit ]'],
    ['string[ ?? omit ]', 'string[ || omit ]'],
    ['string[ ?? omit ] ?? throw', 'string[ ?? omit ] ?? null'], ['number', 'string']];
  for (const [first, second] of pairs) {
    assert.throws(() => new PayloadTemplate({ a: `{{x:${first}}}`, nested: [`{{x:${second}}}`] }).extractVariables(), error => {
      assert.ok(error instanceof PayloadTemplateError);
      assert.deepEqual(error.issue, { code: 'VARIABLE_EXPRESSION_CONFLICT', variableName: 'x',
        declaration: `{{x:${first}}}`, declaredAt: '$.a', conflictingDeclaration: `{{x:${second}}}`, conflictingAt: '$.nested[0]' });
      return true;
    });
  }
});

test('rejects unsupported types, old suffixes, and malformed fallback syntax', () => {
  for (const type of ['integer', 'date', 'datetime', 'object', 'boolean[]', 'boolean[ ?? omit ]']) {
    assert.throws(() => new PayloadTemplate(`{{x:${type}}}`).extractVariables(), error => {
      assert.ok(error instanceof PayloadTemplateError);
      assert.equal(error.issue.code, 'UNSUPPORTED_TYPE');
      return true;
    });
  }
  for (const expression of ['string?', 'string!', 'string_', 'string[]?', 'string?[]',
    'string ? null', 'string ??', 'string ?? undefined', 'string && throw', 'string[ ?? ]',
    'string[ ?? omit', 'string[ omit ]', 'string[ ?? omit ] ??', 'string ?? null ?? throw',
    'string[ ?? omit ][ ?? null ]', 'string | | null', 'string ?? n ull']) {
    assert.throws(() => new PayloadTemplate(`{{x:${expression}}}`).extractVariables(), error => {
      assert.ok(error instanceof PayloadTemplateError);
      assert.ok(['INVALID_FALLBACK_SYNTAX', 'UNSUPPORTED_TYPE'].includes(error.issue.code));
      return true;
    });
  }
});

test('rejects invalid names, markers and interpolation', () => {
  for (const placeholder of ['{{1x:string}}', '{{x-y:string}}', '{{x.y:string}}',
    'prefix {{x:string}} suffix', '{{', '}}', '{{x:string}} extra', '{{x:}}oops']) {
    assert.throws(() => new PayloadTemplate([placeholder]).extractVariables(), { issue: { code: 'INVALID_PLACEHOLDER', path: '$[0]', placeholder } });
  }
});
