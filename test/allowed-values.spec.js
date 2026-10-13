import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { PayloadTemplate, PayloadTemplateError } from '../dist/index.js';

function expectIssue(fn, expected) {
  assert.throws(fn, error => {
    assert.ok(error instanceof PayloadTemplateError);
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(error.issue[key], value);
    return true;
  });
}

describe('allowed values', () => {
  test('declares required scalar and optional array domains', () => {
    const template = new PayloadTemplate({
      color: '{{ color : string in [ black, white, green ] }}',
      colors: '{{ colors : string[ black, white, green ] ?? omit }}',
    });
    assert.deepEqual(template.toJSON(), {
      color: '{{color:string in [ black, white, green ]}}',
      colors: '{{colors:string[ black, white, green ] ?? omit}}',
    });
    assert.deepEqual(template.variables(), [
      { name: 'color', type: 'string', allowedValues: ['black', 'white', 'green'],
        declaration: '{{color:string in [ black, white, green ]}}', paths: ['$.color'] },
      { name: 'colors', type: 'string[]', allowedValues: ['black', 'white', 'green'],
        valueFallback: { operator: '??', action: 'omit' },
        declaration: '{{colors:string[ black, white, green ] ?? omit}}', paths: ['$.colors'] },
    ]);
    assert.deepEqual(template.render({ color: 'black', colors: ['green', 'white'] }),
      { color: 'black', colors: ['green', 'white'] });
    assert.deepEqual(template.render({ color: 'white' }), { color: 'white' });
  });

  test('supports optional and required scalar and array literal domains', () => {
    const template = new PayloadTemplate({
      singleRequired: '{{singleRequired:string in [ black, green, white ]}}',
      singleOptional: '{{singleOptional:string in [ black, green, white ] ?? omit}}',
      multiRequired: '{{multiRequired:string[ black, green, white ] || throw}}',
      multiOptional: '{{multiOptional:string[ black, green, white ] ?? omit}}',
    });
    assert.deepEqual(template.render({ singleRequired: 'black', multiRequired: ['green'] }), {
      singleRequired: 'black', multiRequired: ['green'],
    });
    assert.deepEqual(template.render({ singleRequired: 'white', multiRequired: ['black'], multiOptional: [] }), {
      singleRequired: 'white', multiRequired: ['black'], multiOptional: [],
    });
    expectIssue(() => template.render({ singleRequired: 'black', multiRequired: [] }), {
      code: 'FALLBACK_THROW', operator: '||', variableName: 'multiRequired',
    });
  });

  test('validates scalar values and every array member without exposing runtime values', () => {
    expectIssue(() => new PayloadTemplate('{{color:string in [ black, white ]}}').render({ color: 'secret' }), {
      code: 'VALUE_NOT_ALLOWED', variableName: 'color', expectedType: 'string',
      declaration: '{{color:string in [ black, white ]}}', templatePaths: ['$'],
    });
    assert.throws(() => new PayloadTemplate('{{colors:string[ black, white ]}}').render({ colors: ['black', 'secret'] }), error => {
      assert.equal(error.issue.code, 'VALUE_NOT_ALLOWED');
      assert.equal(error.issue.valuePath, '$[1]');
      assert.ok(!JSON.stringify(error).includes('secret'));
      return true;
    });
    expectIssue(() => new PayloadTemplate('{{colors:string[ black, white ]}}').render({ colors: 'black' }),
      { code: 'INVALID_VARIABLE_TYPE' });
  });

  test('supports number, boolean, spaces, commas and empty strings', () => {
    const template = new PayloadTemplate({
      rating: '{{rating:number in [ 1, 2.5, -3, 4e2 ]}}',
      enabled: '{{enabled:boolean in [ true, false ]}}',
      label: `{{label:string in [ plain value, "comma,value", '' ]}}`,
      action: '{{action:string[ omit ]}}',
      ratings: '{{ratings:number[ 1, 2, 3 ]}}',
    });
    assert.deepEqual(template.variables().map(variable => variable.allowedValues), [
      [1, 2.5, -3, 400], [true, false], ['plain value', 'comma,value', ''], ['omit'], [1, 2, 3],
    ]);
    assert.deepEqual(template.render({ rating: 400, enabled: false, label: 'comma,value', action: ['omit'], ratings: [3, 1] }),
      { rating: 400, enabled: false, label: 'comma,value', action: ['omit'], ratings: [3, 1] });
  });

  test('rejects empty, duplicate, malformed and type-mismatched domains during construction', () => {
    for (const expression of [
      '{{x:string in []}}', '{{x:string in [black,]}}', '{{x:string in [black, black]}}',
      '{{x:number in [1, two]}}', '{{x:boolean in [true, 0]}}', '{{x:number[1, 1]}}',
      '{{x:string in ["unfinished]}}',
    ]) expectIssue(() => new PayloadTemplate(expression), { code: 'INVALID_ALLOWED_VALUES_SYNTAX' });
  });

  test('keeps allowed-value contracts isolated from caller mutation', () => {
    const template = new PayloadTemplate('{{color:string in [ black, white ]}}');
    const first = template.variables();
    first[0].allowedValues[0] = 'changed';
    first[0].allowedValues.push('green');
    assert.deepEqual(template.variables()[0].allowedValues, ['black', 'white']);
    assert.equal(template.render({ color: 'black' }), 'black');
  });

  test('checks the domain before subsequent operations', () => {
    const scalar = new PayloadTemplate('{{color:string in [ black ] > style.upperCase}}');
    assert.equal(scalar.render({ color: 'black' }), 'BLACK');
    expectIssue(() => scalar.render({ color: 'BLACK' }), { code: 'VALUE_NOT_ALLOWED' });

    const array = new PayloadTemplate('{{colors:string[ black, white ] ! collection.unique}}');
    assert.deepEqual(array.render({ colors: ['black', 'white'] }), ['black', 'white']);
    expectIssue(() => array.render({ colors: ['black', 'black'] }), { code: 'VALIDATION_FAILED' });
  });
});
