import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PayloadTemplate, PayloadTemplateError } from '../dist/index.js';

const plugin = (validators = {}, transformers = {}) => ({ name: 'test', validators, transformers });
const issue = code => error => error instanceof PayloadTemplateError && error.issue.code === code;

describe('plugin registration and built-ins', () => {
  test('built-ins are always available in both package formats', async () => {
    const esm = await import('../dist/index.js');
    const cjs = createRequire(import.meta.url)('../dist/cjs/index.js');
    for (const api of [esm, cjs]) {
      for (const name of ['builtInPlugins', 'stylePlugin', 'textPlugin', 'datePlugin', 'emailPlugin', 'collectionPlugin']) {
        assert.equal(Object.hasOwn(api, name), false);
      }
      for (const options of [undefined, { plugins: [] }, { plugins: [plugin({ email: () => false })] }]) {
        assert.equal(new api.PayloadTemplate('{{x:string > style.pascalCase ! style.knownCase}}', options)
          .render({ x: 'URLValue' }), 'UrlValue');
        assert.equal(new api.PayloadTemplate('{{x:string > text.normalizeSpaces > text.trim ! text.trim ! text.normalizeSpaces}}', options)
          .render({ x: ' A  test ' }), 'A test');
        for (const name of ['camelCase', 'pascalCase', 'snakeCase', 'kebabCase', 'upperCase', 'lowerCase', 'knownCase']) {
          for (const operator of ['!', '>']) {
            const operation = `text.${name}`;
            assert.throws(() => new api.PayloadTemplate(`{{x:string ${operator} ${operation}}}`, options),
              error => error instanceof api.PayloadTemplateError
                && error.issue.code === 'UNKNOWN_PLUGIN_OPERATION' && error.issue.operation === operation);
          }
        }
        assert.equal(new api.PayloadTemplate('{{x:string ! date.dateonly > date.isodatetime}}', options)
          .render({ x: '2026-01-01' }), '2026-01-01T00:00:00.000Z');
        assert.equal(new api.PayloadTemplate('{{x:string ! email.email > email.domain ! email.domain}}', options)
          .render({ x: 'user@Example.com' }), 'example.com');
      }
    }
  });

  test('namespaces isolate callbacks and built-ins with exact lookup', () => {
    const first = plugin({ same: x => x === 'ok', email: () => false }, { same: x => x.toUpperCase(), domain: () => 'custom' });
    const second = { name: 'other', validators: { same: x => x === 'OK' } };
    const options = { plugins: [first, second] };
    const template = new PayloadTemplate('{{x:string ! test.same > test.same ! other.same}}', options);
    first.validators.same = () => false;
    first.transformers.same = () => null;
    first.name = 'changed';
    assert.equal(template.render({ x: 'ok' }), 'OK');
    first.name = 'test';
    assert.equal(new PayloadTemplate('{{x:string > test.domain}}', options).render({ x: 'x' }), 'custom');
    assert.throws(() => new PayloadTemplate('{{x:string ! test.email}}', options).render({ x: 'a@example.com' }),
      e => issue('VALIDATION_FAILED')(e) && e.issue.operation === 'test.email');
    for (const reference of ['missing.same', 'test.missing', 'test.toString', 'date.missing', 'Date.dateonly']) {
      assert.throws(() => new PayloadTemplate(`{{x:string ! ${reference}}}`, options),
        e => issue('UNKNOWN_PLUGIN_OPERATION')(e) && e.issue.operation === reference);
    }
    assert.throws(() => new PayloadTemplate('{{x:string > other.same}}', options), issue('UNKNOWN_PLUGIN_OPERATION'));
    assert.throws(() => new PayloadTemplate('{{x:string > date.dateonly}}'), issue('UNKNOWN_PLUGIN_OPERATION'));
    assert.throws(() => new PayloadTemplate('{{x:string ! test.same}}'), issue('UNKNOWN_PLUGIN_OPERATION'));
  });

  test('duplicate namespaces fail even for empty or disjoint plugins', () => {
    const custom = plugin({ same: () => true });
    for (const plugins of [[custom, custom], [plugin(), plugin()], [custom, plugin({}, { other: x => x })]]) {
      assert.throws(() => new PayloadTemplate(null, { plugins }), error => {
        assert.deepEqual(error.issue, { code: 'DUPLICATE_PLUGIN_NAME', plugin: 'test' });
        return true;
      });
    }
  });

  test('all reserved namespaces reject custom registrations in both package formats', async () => {
    const esm = await import('../dist/index.js');
    const cjs = createRequire(import.meta.url)('../dist/cjs/index.js');
    for (const api of [esm, cjs]) {
      for (const name of ['style', 'text', 'number', 'boolean', 'date', 'collection', 'array', 'email', 'url',
        'json', 'encoding', 'iso', 'time', 'phone', 'network', 'id', 'core']) {
        for (const extension of [{}, { validators: { extra: () => true } }, { transformers: { extra: x => x } }]) {
          assert.throws(() => new api.PayloadTemplate(null, { plugins: [{ name, ...extension }] }), error => {
            assert.ok(error instanceof api.PayloadTemplateError);
            assert.deepEqual(error.issue, { code: 'RESERVED_PLUGIN_NAME', plugin: name });
            return true;
          });
        }
      }
      assert.equal(new api.PayloadTemplate('{{x:string ! Text.check}}', {
        plugins: [{ name: 'Text', validators: { check: () => true } }],
      }).render({ x: 'ok' }), 'ok');
    }
  });

  test('registration validates names and callbacks', () => {
    for (const name of ['', '1test', 'a.b', 'a-b', 'a b', '$test', 'é', null, 123]) {
      assert.throws(() => new PayloadTemplate(null, { plugins: [{ name }] }), issue('INVALID_PLUGIN_NAME'));
    }
    for (const kind of ['validators', 'transformers']) {
      for (const name of ['', 'a.b', '1op', 'a-b', 'a b', '$op']) {
        assert.throws(() => new PayloadTemplate(null, { plugins: [{ name: 'test', [kind]: { [name]: x => x } }] }),
          issue('INVALID_PLUGIN_OPERATION_NAME'));
      }
      for (const fn of [null, undefined, true, 1, 'callback', {}]) {
        assert.throws(() => new PayloadTemplate(null, { plugins: [{ name: 'test', [kind]: { bad: fn } }] }),
          e => issue('INVALID_PLUGIN_OPERATION')(e) && e.issue.operation === 'test.bad');
      }
    }
    assert.equal(new PayloadTemplate('{{x:string ! _test2.do_something}}', {
      plugins: [{ name: '_test2', validators: { do_something: () => true } }],
    }).render({ x: 'ok' }), 'ok');
  });

  test('built-ins reject invalid calendars, timestamps, email addresses, and collections', () => {
    for (const [name, values] of [
      ['date.dateonly', ['2026-02-29', '2024-02-30', '2026-13-01', '2026-1-1', '']],
      ['date.isodatetime', ['2026-01-01', '2026-02-30T00:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T00:00:00']],
      ['email.email', ['a@@example.com', '.a@example.com', 'a..b@example.com', 'a@-example.com', 'a b@example.com']],
      ['email.domain', ['localhost', '-example.com', 'example..com', 'example.com/']],
    ]) for (const x of values) {
      assert.throws(() => new PayloadTemplate(`{{x:string ! ${name}}}`).render({ x }), issue('VALIDATION_FAILED'));
    }
    assert.equal(new PayloadTemplate('{{x:string ! date.dateonly}}').render({ x: '2024-02-29' }), '2024-02-29');
    assert.equal(new PayloadTemplate('{{x:string ! date.isodatetime > date.isodatetime}}').render({ x: '2026-01-01T01:00:00+01:00' }), '2026-01-01T00:00:00.000Z');
    for (const x of [[], [1], [1, 1], [2, 1], [1, 2, 3]]) {
      assert.throws(() => new PayloadTemplate('{{x:number[] ! collection.range}}').render({ x }), issue('VALIDATION_FAILED'));
    }
  });

});
