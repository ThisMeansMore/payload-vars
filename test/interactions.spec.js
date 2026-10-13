import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { PayloadTemplate, PayloadTemplateError } from '../dist/index.js';

const issue = code => error => error instanceof PayloadTemplateError && error.issue.code === code;

describe('interaction metadata', () => {
  test('normalizes and extracts opaque consumer-defined hints', () => {
    const template = new PayloadTemplate({
      comment: '{{ comment : string ?? omit @ text.multiline }}',
      period: '{{period:string in [monthly, annual]@choice}}',
      extensions: '{{extensions:string[reporting, audit log] || throw @ custom.picker}}',
      enabled: '{{enabled:boolean@anything}}',
    });
    assert.deepEqual(template.toJSON(), {
      comment: '{{comment:string ?? omit @ text.multiline}}',
      period: '{{period:string in [ monthly, annual ] @ choice}}',
      extensions: '{{extensions:string[ reporting, audit log ] || throw @ custom.picker}}',
      enabled: '{{enabled:boolean @ anything}}',
    });
    assert.deepEqual(template.variables(), [
      { name: 'comment', type: 'string', valueFallback: { operator: '??', action: 'omit' },
        interaction: 'text.multiline', declaration: '{{comment:string ?? omit @ text.multiline}}', paths: ['$.comment'] },
      { name: 'period', type: 'string', allowedValues: ['monthly', 'annual'], interaction: 'choice',
        declaration: '{{period:string in [ monthly, annual ] @ choice}}', paths: ['$.period'] },
      { name: 'extensions', type: 'string[]', allowedValues: ['reporting', 'audit log'],
        valueFallback: { operator: '||', action: 'throw' }, interaction: 'custom.picker',
        declaration: '{{extensions:string[ reporting, audit log ] || throw @ custom.picker}}', paths: ['$.extensions'] },
      { name: 'enabled', type: 'boolean', interaction: 'anything',
        declaration: '{{enabled:boolean @ anything}}', paths: ['$.enabled'] },
    ]);
  });

  test('does not affect rendering, validation, plugins, or static domains', () => {
    const annotated = new PayloadTemplate({
      email: '{{email:string ! email.email @ unexpected}}',
      selection: '{{selection:string @ dynamic.source}}',
      color: '{{color:string in [black, white] @ text.multiline}}',
    });
    assert.deepEqual(annotated.render({ email: 'a@example.com', selection: 'external', color: 'black' }), {
      email: 'a@example.com', selection: 'external', color: 'black',
    });
    assert.throws(() => annotated.render({ email: 'a@example.com', selection: 'external', color: 'green' }),
      issue('VALUE_NOT_ALLOWED'));
    assert.deepEqual(new PayloadTemplate('{{x:string @ does.notexist}}').render({ x: 'value' }), 'value');
  });

  test('supports derived declarations and keeps interaction-specific contracts distinct', () => {
    const derived = new PayloadTemplate({
      start: '{{start:string}}', end: '{{end:string}}',
      duration: '{{duration:number = date.interval(start,end) @ display.duration}}',
    });
    const duration = derived.variables().find(variable => variable.name === 'duration');
    assert.equal(duration.interaction, 'display.duration');
    assert.equal(duration.derived, true);
    assert.equal(derived.render({ start: '2026-01-01T00:00:00.000Z', end: '2026-01-02T00:00:00.000Z' }).duration, 86400000);

    const repeated = new PayloadTemplate([
      '{{x:string @ text.singleline}}', '{{x:string @ text.multiline}}', '{{x:string @ text.singleline}}',
    ]).variables();
    assert.deepEqual(repeated.map(({ interaction, paths }) => ({ interaction, paths })), [
      { interaction: 'text.singleline', paths: ['$[0]', '$[2]'] },
      { interaction: 'text.multiline', paths: ['$[1]'] },
    ]);
  });

  test('accepts at signs inside static strings', () => {
    const template = new PayloadTemplate('{{email:string in ["a@example.com", "b@example.com"] @ contact}}');
    assert.deepEqual(template.variables()[0].allowedValues, ['a@example.com', 'b@example.com']);
    assert.equal(template.render({ email: 'a@example.com' }), 'a@example.com');

    const array = new PayloadTemplate("{{handles:string['@admin', '@editor']}}");
    assert.deepEqual(array.variables()[0].allowedValues, ['@admin', '@editor']);
    assert.deepEqual(array.render({ handles: ['@admin'] }), ['@admin']);
  });

  test('rejects unsafe, misplaced, and repeated annotations', () => {
    for (const expression of [
      'string @', 'string @ Text', 'string @ text_multiline', 'string @ text.multi.line',
      'string @ text.1', 'string @ text multiline', 'string @ text ?? omit',
      'string @ first @ second', '@ choice string',
    ]) {
      assert.throws(() => new PayloadTemplate({ nested: [`{{x:${expression}}}`] }), error => {
        assert.equal(error.issue.code, 'INVALID_INTERACTION_SYNTAX');
        assert.equal(error.issue.path, '$.nested[0]');
        assert.match(error.message, /@ name.*category\.style/);
        return true;
      });
    }
  });
});
