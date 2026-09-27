import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PayloadTemplate, PayloadTemplateError } from '../dist/index.js';

const render = (operations, x) => new PayloadTemplate(`{{x:string ${operations}}}`).render({ x });
const issue = (code, name) => error => error instanceof PayloadTemplateError
  && error.issue.code === code && error.issue.operation === `style.${name}`;
const styles = ['camelCase', 'pascalCase', 'snakeCase', 'kebabCase'];

describe('built-in style operations', () => {
  test('styles share tokenization and normalize mixed input, acronyms, and digits', () => {
    for (const [input, outputs] of [
      ['Customer fullAddress', ['customerFullAddress', 'CustomerFullAddress', 'customer_full_address', 'customer-full-address']],
      ['customerFull_address', ['customerFullAddress', 'CustomerFullAddress', 'customer_full_address', 'customer-full-address']],
      ['URLValue', ['urlValue', 'UrlValue', 'url_value', 'url-value']],
      ['XMLHTTPParser', ['xmlhttpParser', 'XmlhttpParser', 'xmlhttp_parser', 'xmlhttp-parser']],
      ['version2URLValue42', ['version2UrlValue42', 'Version2UrlValue42', 'version2_url_value42', 'version2-url-value42']],
      ['  customer__full---address\t\n', ['customerFullAddress', 'CustomerFullAddress', 'customer_full_address', 'customer-full-address']],
      ['\u00a0customer\r\nfull\taddress\u2003', ['customerFullAddress', 'CustomerFullAddress', 'customer_full_address', 'customer-full-address']],
    ]) {
      styles.forEach((name, index) => {
        assert.equal(render(`> style.${name} ! style.${name}`, input), outputs[index]);
      });
    }
  });

  test('style validators accept only canonical spelling and knownCase accepts their union', () => {
    const canonical = ['customerFullAddress', 'CustomerFullAddress', 'customer_full_address', 'customer-full-address'];
    styles.forEach((name, index) => {
      for (const [other, value] of canonical.entries()) {
        if (index === other) assert.equal(render(`! style.${name}`, value), value);
        else assert.throws(() => render(`! style.${name}`, value), issue('VALIDATION_FAILED', name));
        assert.equal(render('! style.knownCase', value), value);
      }
    });
    for (const value of ['Customer fullAddress', 'customerFull_address', 'URLValue', 'CUSTOMER', 'customer__address', 'customer--address', ' customer']) {
      for (const name of [...styles, 'knownCase']) {
        assert.throws(() => render(`! style.${name}`, value), issue('VALIDATION_FAILED', name));
      }
    }
    assert.throws(() => new PayloadTemplate('{{x:string > style.knownCase}}'), issue('UNKNOWN_PLUGIN_OPERATION', 'knownCase'));
  });

  test('single words and numeric strings can match several styles', () => {
    for (const value of ['customer', 'word42', 'a']) {
      for (const name of ['camelCase', 'snakeCase', 'kebabCase', 'knownCase']) {
        assert.equal(render(`! style.${name}`, value), value);
      }
      assert.equal(render('> style.pascalCase ! style.pascalCase', value), value[0].toUpperCase() + value.slice(1));
    }
    for (const name of [...styles, 'knownCase']) assert.equal(render(`! style.${name}`, '123'), '123');
  });

  test('style operations reject unsupported characters and values without words', () => {
    for (const value of ['', ' \t_-', 'hello.world', 'hello/world', "can't", 'café', '你好', 'hello🙂', 'a\0b']) {
      for (const name of [...styles, 'knownCase']) {
        assert.throws(() => render(`! style.${name}`, value), issue('VALIDATION_FAILED', name));
        if (name !== 'knownCase') {
          assert.throws(() => render(`> style.${name}`, value), issue('PLUGIN_EXECUTION_FAILED', name));
        }
      }
    }
  });

  test('casing validators require unchanged transformer output', () => {
    for (const [name, input, output] of [
      ['upperCase', 'Émail_some-Text 42!\t', 'ÉMAIL_SOME-TEXT 42!\t'],
      ['lowerCase', 'ÉMAIL_Some-Text 42!\t', 'émail_some-text 42!\t'],
    ]) {
      assert.equal(render(`> style.${name} ! style.${name}`, input), output);
      assert.equal(render(`! style.${name}`, output), output);
      assert.throws(() => render(`! style.${name}`, input), issue('VALIDATION_FAILED', name));
    }
    for (const name of ['upperCase', 'lowerCase']) {
      for (const value of ['', '123!']) assert.equal(render(`! style.${name} > style.${name}`, value), value);
    }
  });

  test('validation order controls whether mixed input is normalized', () => {
    for (const value of ['Customer fullAddress', 'customerFull_address']) {
      assert.throws(() => render('! style.knownCase > style.snakeCase', value), issue('VALIDATION_FAILED', 'knownCase'));
      assert.equal(render('> style.snakeCase ! style.knownCase', value), 'customer_full_address');
    }
    assert.equal(render('! style.knownCase > style.snakeCase', 'customerFullAddress'), 'customer_full_address');
    assert.equal(render('? style.knownCase > style.snakeCase ~ text.trim', ' Customer fullAddress '), 'Customer fullAddress');
    assert.deepEqual(new PayloadTemplate('{{x:string[ > style.snakeCase ! style.knownCase ]}}')
      .render({ x: ['URLValue', 'Customer fullAddress'] }), ['url_value', 'customer_full_address']);
  });

  test('validators reject nonstrings without throwing callback errors', () => {
    for (const name of [...styles, 'knownCase', 'upperCase', 'lowerCase']) {
      assert.throws(() => new PayloadTemplate(`{{x:number ! style.${name}}}`).render({ x: 42 }), issue('VALIDATION_FAILED', name));
    }
  });

  test('style operations are built in for CommonJS too', () => {
    const api = createRequire(import.meta.url)('../dist/cjs/index.js');
    assert.equal(new api.PayloadTemplate('{{x:string > style.pascalCase ! style.knownCase}}', { plugins: [] })
      .render({ x: 'URLValue' }), 'UrlValue');
    assert.equal(Object.hasOwn(api, 'stylePlugin'), false);
  });
});
