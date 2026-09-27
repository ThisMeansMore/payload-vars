import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { PayloadTemplate, PayloadTemplateError } from '../dist/index.js';

const types = ['string', 'number', 'boolean', 'string[]', 'number[]'];
const operators = ['??', '||'];
const actions = ['null', 'omit', 'throw'];

const plugin = (validators = {}, transformers = {}) => ({ name: 'test', validators, transformers });

describe('contract extraction', () => {
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


  test('conditional contracts preserve branch operators and isolate extracted copies', () => {
    const template = new PayloadTemplate('{{ x : string[?date.dateonly>date.isodatetime~date.isodatetime??omit]?collection.unique }}');
    const canonical = '{{x:string[ ? date.dateonly > date.isodatetime ~ date.isodatetime ?? omit ] ? collection.unique}}';
    assert.equal(template.toJSON(), canonical);
    const [variable] = template.extractVariables();
    assert.deepEqual(variable.memberOperations, [
      { kind: 'validator', name: 'date.dateonly', operator: '?' },
      { kind: 'transformer', name: 'date.isodatetime' },
      { kind: 'transformer', name: 'date.isodatetime', operator: '~' },
    ]);
    assert.deepEqual(variable.valueOperations, [{ kind: 'validator', name: 'collection.unique', operator: '?' }]);
    variable.memberOperations[0].operator = '!';
    variable.memberOperations[2].name = 'changed';
    assert.equal(template.extractVariables()[0].memberOperations[0].operator, '?');
    assert.equal(template.extractVariables()[0].memberOperations[2].name, 'date.isodatetime');
    assert.equal(template.toJSON(), canonical);
  });

  test('normalization and extraction retain ordered operations', () => {
    const template = new PayloadTemplate('{{ x : string [!date.dateonly>date.isodatetime??omit]!collection.range??throw }}');
    const canonical = '{{x:string[ ! date.dateonly > date.isodatetime ?? omit ] ! collection.range ?? throw}}';
    assert.equal(template.toJSON(), canonical);
    assert.equal(new PayloadTemplate(canonical).toJSON(), canonical);
    const extracted = template.extractVariables();
    assert.deepEqual(extracted[0].memberOperations, [{ kind: 'validator', name: 'date.dateonly' }, { kind: 'transformer', name: 'date.isodatetime' }]);
    extracted[0].memberOperations[0].name = 'corrupt';
    assert.equal(template.extractVariables()[0].memberOperations[0].name, 'date.dateonly');
  });

  test('qualified operations normalize and extract in both scopes', () => {
    const custom = plugin({ check: () => true }, { trim: x => x.trim() });
    const options = { plugins: [custom] };
    const template = new PayloadTemplate('{{ x : string [>test.trim!test.check??omit]!test.check??throw }}', options);
    const canonical = '{{x:string[ > test.trim ! test.check ?? omit ] ! test.check ?? throw}}';
    assert.equal(template.toJSON(), canonical);
    assert.equal(new PayloadTemplate(canonical, options).toJSON(), canonical);
    assert.deepEqual(template.render({ x: [' a ', null] }), ['a']);
    const [variable] = template.extractVariables();
    assert.deepEqual(variable.memberOperations, [
      { kind: 'transformer', name: 'test.trim' }, { kind: 'validator', name: 'test.check' },
    ]);
    assert.deepEqual(variable.valueOperations, [{ kind: 'validator', name: 'test.check' }]);
  });

});
