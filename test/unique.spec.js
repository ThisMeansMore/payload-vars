import test from 'node:test';
import assert from 'node:assert/strict';
import { PayloadTemplate, PayloadTemplateError } from '../dist/index.js';

test('unique rejects repeated names across nested objects and arrays, regardless of contract', () => {
  for (const second of [
    '{{name:string}}', '{{ name : string }}', '{{name:number}}',
    '{{name:string ?? omit}}', '{{name:string in [a, b]}}',
    '{{name:string > text.trim}}', '{{name:string @ text.multiline}}',
    '{{name:number = date.interval($.start,$.end)}}',
  ]) {
    assert.throws(() => new PayloadTemplate({ first: '{{name:string}}', nested: [second] }, { unique: true }), {
      issue: { code: 'DUPLICATE_VARIABLE_DECLARATION', variableName: 'name', firstPath: '$.first', path: '$.nested[0]' },
    });
  }
  assert.throws(() => new PayloadTemplate(['{{x:string}}', '{{x:string}}'], { unique: true }), {
    issue: { code: 'DUPLICATE_VARIABLE_DECLARATION', variableName: 'x', firstPath: '$[0]', path: '$[1]' },
  });
});

test('default and explicit false preserve deduplication and distinct contracts', () => {
  for (const options of [undefined, {}, { unique: false }]) {
    const template = new PayloadTemplate(['{{x:string}}', '{{ x : string }}', '{{x:string ?? omit}}'], options);
    assert.deepEqual(template.variables().map(({ name, paths }) => ({ name, paths })), [
      { name: 'x', paths: ['$[0]', '$[1]'] }, { name: 'x', paths: ['$[2]'] },
    ]);
  }
});

test('unique validates and extracts a full template in traversal order without executing plugins', () => {
  const fail = () => assert.fail('compilation must not execute registered functionality');
  const template = new PayloadTemplate({
    _: { Labels: { yes: 'Yes' } },
    last: '{{z:string ! custom.check @ text}}',
    nested: ['constant', { first: '{{a:number in [1, 2] ?? omit}}' }],
    derived: '{{domain:string = custom.domain($.email)}}',
    email: '{{email:string > core.lookup(Labels)}}',
  }, { unique: true, plugins: [{ name: 'custom', validators: { check: fail }, functions: {
    domain: { argumentTypes: ['string'], resultType: 'string', execute: fail },
  } }] });
  assert.deepEqual(template.variables().map(v => v.name), ['z', 'a', 'domain', 'email']);
  assert.equal(template.variables()[0].interaction, 'text');
  assert.deepEqual(template.variables()[1].allowedValues, [1, 2]);
  assert.deepEqual(template.variables()[2].dependencies, [{ source: 'input', name: 'email' }]);
  assert.deepEqual(new PayloadTemplate('{{duration:number = date.interval($.start,$.end)}}', { unique: true })
    .variables().map(v => v.name), ['duration', 'start', 'end']);
});

test('unique preserves full constructor validation', () => {
  for (const [template, code] of [
    [{ valid: '{{x:string}}', nested: ['prefix {{y:string}}'] }, 'INVALID_PLACEHOLDER'],
    ['{{x:string @ Invalid}}', 'INVALID_INTERACTION_SYNTAX'],
    ['{{x:number in [one]}}', 'INVALID_ALLOWED_VALUES_SYNTAX'],
    ['{{x:string > missing.operation}}', 'UNKNOWN_PLUGIN_OPERATION'],
    ['{{x:string = missing.function($.y)}}', 'UNKNOWN_PLUGIN_OPERATION'],
    [{ _: { Bad: { x: [] } }, x: '{{x:string}}' }, 'INVALID_LOOKUP_MAP'],
    ['{{x:string > core.lookup(Missing)}}', 'UNKNOWN_LOOKUP_MAP'],
    ['{{x:number = date.interval(missing,missing)}}', 'UNKNOWN_FUNCTION_REFERENCE'],
  ]) {
    assert.throws(() => new PayloadTemplate(template, { unique: true }), error =>
      error instanceof PayloadTemplateError && error.issue.code === code);
  }
});
