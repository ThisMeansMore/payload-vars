import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { PayloadTemplate, PayloadTemplateError } from '../dist/index.js';

const issue = code => error => error instanceof PayloadTemplateError && error.issue.code === code;

describe('constant fallbacks', () => {
  test('substitutes typed constants before validation and transformation', () => {
    const template = new PayloadTemplate({
      from_date: "{{fromDate:string ?? '2026-01-01' ! date.dateonly > date.isodatetime}}",
      hours: '{{hours:number ?? 8 }}',
    });
    assert.deepEqual(template.toJSON(), {
      from_date: '{{fromDate:string ?? "2026-01-01" ! date.dateonly > date.isodatetime}}',
      hours: '{{hours:number ?? 8}}',
    });
    assert.deepEqual(template.render({}), { from_date: '2026-01-01T00:00:00.000Z', hours: 8 });
    assert.deepEqual(template.render({ fromDate: '2025-02-03', hours: 0 }),
      { from_date: '2025-02-03T00:00:00.000Z', hours: 0 });
    assert.deepEqual(template.render({ fromDate: null, hours: undefined }),
      { from_date: '2026-01-01T00:00:00.000Z', hours: 8 });
  });

  test('exposes constants and tokenizes them as values', () => {
    const template = new PayloadTemplate(["{{label:string ?? '1.5'}}", '{{count:number ?? 150}}']);
    assert.deepEqual(template.variables().map(variable => variable.valueFallback), [
      { operator: '??', value: '1.5' },
      { operator: '??', value: 150 },
    ]);
    for (const expression of template.tokenizePayloadExpression()) {
      assert.ok(expression.tokens.some(token => token.kind === 'value'));
      assert.ok(expression.tokens.every(token => token.kind !== 'unknown'));
    }
  });

  test('rejects untyped, mismatched, non-safe-integer, and competing fallbacks', () => {
    for (const expression of [
      'string ?? default', 'string ?? 8', 'number ?? "8"', 'boolean ?? true',
      'number || 8', 'number ?? -1', 'number ?? 1.5', 'number ?? 1e2',
      'number ?? 9007199254740992', 'number ?? Infinity', 'number ?? 8 ?? omit', 'string ?? "x" || throw',
    ]) assert.throws(() => new PayloadTemplate(`{{x:${expression}}}`), issue('INVALID_FALLBACK_SYNTAX'));
  });
});
