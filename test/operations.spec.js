import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { PayloadTemplate, PayloadTemplateError } from '../dist/index.js';

const plugin = (validators = {}, transformers = {}) => ({ name: 'test', validators, transformers });
const issue = code => error => error instanceof PayloadTemplateError && error.issue.code === code;

describe('operation execution', () => {
  test('operations execute left-to-right in member then collection scope', () => {
    const calls = [];
    const custom = plugin({
      before: x => { calls.push(['before', x]); return true; },
      after: x => { calls.push(['after', x]); return true; },
      collection: xs => { calls.push(['collection', [...xs]]); return true; },
    }, { increment: x => x + 1, reverse: xs => xs.reverse() });
    const template = new PayloadTemplate('{{x:number[!test.before>test.increment!test.after??omit]!test.collection>test.reverse!collection.range}}',
      { plugins: [custom] });
    const input = [2, null, 1];
    assert.deepEqual(template.render({ x: input }), [2, 3]);
    assert.deepEqual(input, [2, null, 1]);
    assert.deepEqual(calls, [['before', 2], ['after', 3], ['before', 1], ['after', 2], ['collection', [3, 2]]]);
    const dates = new PayloadTemplate('{{x:string[ ! date.dateonly > date.isodatetime ] ! collection.range}}');
    assert.deepEqual(dates.render({ x: ['2026-01-01', '2026-12-31'] }), ['2026-01-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z']);
  });

  test('fallbacks are evaluated before plugins and never handle validation failures', () => {
    for (const operator of ['??', '||']) {
      const template = new PayloadTemplate({ x: `{{x:string ! date.dateonly ${operator} omit}}` });
      assert.deepEqual(template.render({}), {});
      assert.throws(() => template.render({ x: 'bad' }), issue('VALIDATION_FAILED'));
    }
    const template = new PayloadTemplate('{{x:number[ ! test.positive ?? omit ] ! collection.unique || null}}', {
      plugins: [plugin({ positive: x => x > 0 })],
    });
    assert.equal(template.render({ x: false }), null);
    assert.deepEqual(template.render({ x: [null, 1, 2] }), [1, 2]);
    assert.throws(() => template.render({ x: [null, -1] }), e => issue('VALIDATION_FAILED')(e) && e.issue.valuePath === '$[1]');
    assert.throws(() => template.render({ x: [1, 1] }), issue('VALIDATION_FAILED'));
    const empty = new PayloadTemplate('{{x:string > test.empty || null}}', { plugins: [plugin({}, { empty: () => '' })] });
    assert.equal(empty.render({ x: 'value' }), '');
    const nulls = new PayloadTemplate('{{x:string[ ! date.dateonly ?? null ] ! collection.unique}}');
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
    for (const [operator, p] of [['!', plugin({ bad: throws })], ['>', plugin({}, { bad: throws })]]) {
      assert.throws(() => new PayloadTemplate(`{{x:string ${operator} test.bad}}`, { plugins: [p] }).render({ x: 'x' }),
        e => issue('PLUGIN_EXECUTION_FAILED')(e) && !JSON.stringify(e).includes('private input'));
    }
    const mutate = new PayloadTemplate('{{x:string[] ! test.bad}}', { plugins: [plugin({ bad: xs => { xs.push('bad'); return true; } })] });
    const input = ['a'];
    assert.throws(() => mutate.render({ x: input }), issue('PLUGIN_EXECUTION_FAILED'));
    assert.deepEqual(input, ['a']);
  });


  test('conditional branches select exactly one transformation and preserve the unhandled value', () => {
    const calls = [];
    const options = { plugins: [plugin({ check: x => { calls.push('check'); return x.startsWith('+'); } }, {
      success: x => { calls.push('success'); return x.slice(1); },
      alternative: x => { calls.push('alternative'); return x.trim(); },
      after: x => { calls.push('after'); return `[${x}]`; },
    })] };
    for (const [tail, input, output, expected] of [
      ['? test.check > test.success ~ test.alternative', '+12', '12', ['check', 'success']],
      ['? test.check > test.success ~ test.alternative', ' 12 ', '12', ['check', 'alternative']],
      ['? test.check > test.success', ' 12 ', ' 12 ', ['check']],
      ['? test.check ~ test.alternative', '+12', '+12', ['check']],
      ['? test.check ~ test.alternative', ' 12 ', '12', ['check', 'alternative']],
      ['? test.check', ' 12 ', ' 12 ', ['check']],
      ['? test.check > test.success ~ test.alternative > test.after', ' 12 ', '[12]', ['check', 'alternative', 'after']],
      ['? test.check > test.success > test.after', ' 12 ', '[ 12 ]', ['check', 'after']],
      ['? test.check > test.success ? test.check ~ test.alternative', '+ 12 ', '12', ['check', 'success', 'check', 'alternative']],
    ]) {
      const template = new PayloadTemplate(`{{x:string ${tail}}}`, options);
      for (let run = 0; run < 2; run++) {
        calls.length = 0;
        assert.equal(template.render({ x: input }), output);
        assert.deepEqual(calls, expected);
      }
    }
  });

  test('conditional member and collection operations keep independent branch state', () => {
    const options = { plugins: [plugin({ positive: x => x > 0, pair: xs => xs.length === 2 }, {
      increment: x => x + 1, negate: x => -x, reverse: xs => xs.reverse(), identity: x => x,
    })] };
    const template = new PayloadTemplate('{{x:number[ ? test.positive > test.increment ~ test.negate ?? omit ] ? test.pair > test.reverse ~ test.identity ?? null}}', options);
    const input = Object.freeze([1, null, -3]);
    assert.deepEqual(template.render({ x: input }), [3, 2]);
    assert.deepEqual(template.render({ x: [-3] }), [3]);
    assert.deepEqual(input, [1, null, -3]);
    assert.equal(template.render({}), null);
  });

  test('fallbacks bypass conditional callbacks and do not run again on branch results', () => {
    let calls = 0;
    const options = { plugins: [plugin({ check: () => { calls++; return false; } }, { empty: () => '' })] };
    for (const fallback of ['??', '||']) {
      const template = new PayloadTemplate(`{{x:string ? test.check ~ test.empty ${fallback} null}}`, options);
      calls = 0;
      assert.equal(template.render({}), null);
      assert.equal(calls, 0);
      assert.equal(template.render({ x: 'x' }), '');
      assert.equal(calls, 1);
    }
    assert.throws(() => new PayloadTemplate('{{x:string ? test.check}}', options).render({ x: 1 }), issue('INVALID_VARIABLE_TYPE'));
  });

  test('conditional validation does not suppress plugin exceptions or invalid branch outputs', () => {
    const throws = () => { throw new Error('private input'); };
    for (const accepted of [true, false]) {
      const options = { plugins: [plugin({ check: () => accepted, throws }, { throws, bad: () => null, identity: x => x })] };
      assert.throws(() => new PayloadTemplate('{{x:string ? test.throws ~ test.identity}}', options).render({ x: 'x' }), issue('PLUGIN_EXECUTION_FAILED'));
      for (const [operation, code] of [['throws', 'PLUGIN_EXECUTION_FAILED'], ['bad', 'INVALID_TRANSFORMER_RESULT']]) {
        const tail = accepted ? `> test.${operation} ~ test.identity` : `> test.identity ~ test.${operation}`;
        assert.throws(() => new PayloadTemplate(`{{x:string[ ? test.check ${tail} ]}}`, options).render({ x: ['x'] }), error =>
          issue(code)(error) && error.issue.operation === `test.${operation}` && error.issue.valuePath === '$[0]');
        const skipped = accepted ? `> test.identity ~ test.${operation}` : `> test.${operation} ~ test.identity`;
        assert.equal(new PayloadTemplate(`{{x:string ? test.check ${skipped}}}`, options).render({ x: 'x' }), 'x');
      }
    }
  });

});
