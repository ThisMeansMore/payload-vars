import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { PayloadTemplate, PayloadTemplateError } from '../dist/index.js';

const plugin = (validators = {}, transformers = {}) => ({ name: 'test', validators, transformers });
const issue = code => error => error instanceof PayloadTemplateError && error.issue.code === code;

describe('compilation', () => {
  test('conflicts compare complete normalized expressions and expose both paths', () => {
    const pairs = [['string', 'string ?? null'], ['string ?? null', 'string ?? omit'],
      ['string ?? throw', 'string || throw'], ['string[]', 'string[ ?? omit ]'],
      ['string[ ?? omit ]', 'string[ || omit ]'],
      ['string[ ?? omit ] ?? throw', 'string[ ?? omit ] ?? null'], ['number', 'string']];
    for (const [first, second] of pairs) {
      assert.throws(() => new PayloadTemplate({ a: `{{x:${first}}}`, nested: [`{{x:${second}}}`] }).compile(), error => {
        assert.ok(error instanceof PayloadTemplateError);
        assert.deepEqual(error.issue, { code: 'VARIABLE_EXPRESSION_CONFLICT', variableName: 'x',
          declaration: `{{x:${first}}}`, declaredAt: '$.a', conflictingDeclaration: `{{x:${second}}}`, conflictingAt: '$.nested[0]' });
        return true;
      });
    }
  });

  test('rejects unsupported types, old suffixes, and malformed fallback syntax', () => {
    for (const type of ['integer', 'date', 'datetime', 'object', 'boolean[]', 'boolean[ ?? omit ]']) {
      assert.throws(() => new PayloadTemplate(`{{x:${type}}}`).compile(), error => {
        assert.ok(error instanceof PayloadTemplateError);
        assert.equal(error.issue.code, 'UNSUPPORTED_TYPE');
        return true;
      });
    }
    for (const expression of ['string?', 'string!', 'string_', 'string[]?', 'string?[]',
      'string ? null', 'string ??', 'string ?? undefined', 'string && throw', 'string[ ?? ]',
      'string[ ?? omit', 'string[ omit ]', 'string[ ?? omit ] ??', 'string ?? null ?? throw',
      'string[ ?? omit ][ ?? null ]', 'string | | null', 'string ?? n ull']) {
      assert.throws(() => new PayloadTemplate(`{{x:${expression}}}`).compile(), error => {
        assert.ok(error instanceof PayloadTemplateError);
        assert.ok(['INVALID_FALLBACK_SYNTAX', 'UNSUPPORTED_TYPE'].includes(error.issue.code));
        return true;
      });
    }
  });

  test('rejects invalid names, markers and interpolation', () => {
    for (const placeholder of ['{{1x:string}}', '{{x-y:string}}', '{{x.y:string}}',
      'prefix {{x:string}} suffix', '{{', '}}', '{{x:string}} extra', '{{x:}}oops']) {
      assert.throws(() => new PayloadTemplate([placeholder]).compile(), { issue: { code: 'INVALID_PLACEHOLDER', path: '$[0]', placeholder } });
    }
  });
  test('validation and extraction reject the same invalid contracts with original paths', () => {
    for (const [template, code, path] of [
      [{ nested: ['{{x:string ?? invalid}}'] }, 'INVALID_FALLBACK_SYNTAX', '$.nested[0]'],
      [{ nested: ['prefix {{x:string}}'] }, 'INVALID_PLACEHOLDER', '$.nested[0]'],
      [{ nested: ['{{x:object}}'] }, 'UNSUPPORTED_TYPE', '$.nested[0]'],
      [{ a: '{{x:string??null}}', nested: ['{{x:string??omit}}'] }, 'VARIABLE_EXPRESSION_CONFLICT', '$.nested[0]'],
    ]) {
      let issue;
      assert.throws(() => new PayloadTemplate(template).toJSON(), error => {
        assert.ok(error instanceof PayloadTemplateError);
        assert.equal(error.issue.code, code);
        assert.equal(error.issue.path ?? error.issue.conflictingAt, path);
        issue = error.issue;
        return true;
      });
      assert.throws(() => new PayloadTemplate(template).compile(), error => {
        assert.deepEqual(error.issue, issue);
        return true;
      });
    }
  });

  test('bare built-in and custom references are invalid in both scopes', () => {
    for (const name of ['dateonly', 'isodatetime', 'email', 'domain', 'unique', 'range', 'same', 'toString']) {
      for (const operator of ['!', '>']) {
        for (const expression of [`string ${operator} ${name}`, `string[ ${operator} ${name} ]`]) {
          assert.throws(() => new PayloadTemplate(`{{x:${expression}}}`, {
            plugins: [plugin({ same: () => true }, { same: x => x })],
          }), issue('INVALID_FALLBACK_SYNTAX'));
        }
      }
    }
  });


  test('compiles valid operation combinations in both scopes with every fallback', () => {
    const options = { plugins: [plugin({ check: () => true }, { change: x => x })] };
    for (const operations of ['! test.check', '! test.check > test.change', '> test.change',
      '? test.check', '? test.check > test.change', '? test.check ~ test.change',
      '? test.check > test.change ~ test.change',
      '> test.change ? test.check > test.change ~ test.change ! test.check',
      '? test.check > test.change > test.change', '? test.check ? test.check ~ test.change']) {
      for (const fallback of ['', '?? null', '?? omit', '?? throw', '|| null', '|| omit', '|| throw']) {
        for (const expression of [`string ${operations} ${fallback}`, `string[ ${operations} ${fallback} ]`]) {
          const canonical = new PayloadTemplate(`{{x:${expression}}}`, options).toJSON();
          assert.equal(new PayloadTemplate(canonical, options).toJSON(), canonical);
          assert.equal(new PayloadTemplate(canonical.replaceAll(' ', ''), options).toJSON(), canonical);
        }
      }
    }
  });

  test('rejects invalid operator combinations at construction', () => {
    for (const tail of ['~ test.change', '! test.check ~ test.change', '! test.check > test.change ~ test.change',
      '> test.change ~ test.change', '?', '!', '>', '? > test.change', '? test.check >',
      '? test.check ~', '? test.check ~ test.change ~ test.change',
      '? test.check > test.change > test.change ~ test.change',
      '? test.check ! test.check ~ test.change', '? test.check ?? null ~ test.change',
      '? test.check ?? null > test.change', '?? test.check', '??? test.check', '? ? test.check']) {
      for (const expression of [`string ${tail}`, `string[ ${tail} ]`]) {
        assert.throws(() => new PayloadTemplate(`{{x:${expression}}}`), issue('INVALID_FALLBACK_SYNTAX'));
      }
    }
    assert.throws(() => new PayloadTemplate('{{x:string[ ? date.dateonly ] ~ date.isodatetime}}'), issue('INVALID_FALLBACK_SYNTAX'));
  });

  test('rejects legacy @ with migration guidance and the original path', () => {
    for (const expression of ['string @ date.dateonly', 'string[@date.dateonly>date.isodatetime]']) {
      assert.throws(() => new PayloadTemplate({ nested: [`{{x:${expression}}}`] }), error => {
        assert.equal(error.issue.code, 'LEGACY_VALIDATION_SYNTAX');
        assert.equal(error.issue.path, '$.nested[0]');
        assert.match(error.message, /@.*no longer supported.*!.*\?/);
        return true;
      });
    }
  });

  test('resolves both conditional branches during compilation', () => {
    for (const tail of ['? missing.check', '? date.dateonly > missing.change', '? date.dateonly ~ missing.change',
      '? date.dateonly > date.isodatetime ~ missing.change']) {
      assert.throws(() => new PayloadTemplate({ x: `{{x:string ${tail}}}` }), error =>
        issue('UNKNOWN_PLUGIN_OPERATION')(error) && error.issue.path === '$.x' && error.issue.operation.startsWith('missing.'));
    }
    assert.throws(() => new PayloadTemplate(['{{x:string ! date.dateonly}}', '{{x:string ? date.dateonly}}']), issue('VARIABLE_EXPRESSION_CONFLICT'));
  });

  test('rejects conflicting and malformed built-in operations', () => {
    assert.throws(() => new PayloadTemplate(['{{x:string ! date.dateonly > date.isodatetime}}', '{{x:string > date.isodatetime ! date.dateonly}}']), issue('VARIABLE_EXPRESSION_CONFLICT'));
    for (const tail of ['!', '>', '! date only', '?? null ! date.dateonly', '! date.dateonly[]', '[! date.dateonly] >', '!! date.dateonly']) {
      assert.throws(() => new PayloadTemplate(`{{x:string ${tail}}}`), issue('INVALID_FALLBACK_SYNTAX'));
    }
  });


  test('rejects conflicting and malformed custom operations', () => {
    const custom = plugin({ check: () => true }, { trim: x => x.trim() });
    const options = { plugins: [custom] };
    assert.throws(() => new PayloadTemplate(['{{x:string ! test.check}}', '{{x:string ! other.check}}'], {
      plugins: [custom, { ...custom, name: 'other' }],
    }), issue('VARIABLE_EXPRESSION_CONFLICT'));
    for (const reference of ['test.', '.check', 'test..check', 'test.group.check', 'test .check', 'test. check', '1test.check', 'test.1check']) {
      for (const tail of [`! ${reference}`, `[ > ${reference} ]`]) {
        assert.throws(() => new PayloadTemplate(`{{x:string ${tail}}}`, options), issue('INVALID_FALLBACK_SYNTAX'));
      }
    }
    assert.throws(() => new PayloadTemplate('{{test.x:string}}'), issue('INVALID_PLACEHOLDER'));
  });

});
