import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PayloadTemplate, PayloadTemplateError } from '../dist/index.js';

const render = (operations, x) => new PayloadTemplate(`{{x:string ${operations}}}`).render({ x });
const issue = (code, name) => error => error instanceof PayloadTemplateError
  && error.issue.code === code && error.issue.operation === `text.${name}`;

describe('built-in text operations', () => {
  test('whitespace validators require unchanged transformer output', () => {
    for (const [name, input, output] of [
      ['trim', '\u00a0 \tA  test\n\u2003', 'A  test'],
      ['normalizeSpaces', '\u00a0\tA  test\n\r\u2003', ' A test '],
      ['normalizeSpaces', 'A\ttest', 'A test'],
    ]) {
      assert.equal(render(`> text.${name} ! text.${name}`, input), output);
      assert.equal(render(`! text.${name}`, output), output);
      assert.throws(() => render(`! text.${name}`, input), issue('VALIDATION_FAILED', name));
    }
    for (const name of ['trim', 'normalizeSpaces']) {
      for (const value of ['', '123!']) assert.equal(render(`! text.${name} > text.${name}`, value), value);
    }
    assert.equal(render('> text.normalizeSpaces', ' \t\n'), ' ');
    assert.equal(render('> text.trim', ' \t\n'), '');
  });

  test('whitespace operations compose in order', () => {
    assert.throws(() => render('! text.trim > text.trim', ' A '), issue('VALIDATION_FAILED', 'trim'));
    assert.equal(render('> text.normalizeSpaces > text.trim ! text.trim ! text.normalizeSpaces', ' \tA  test\n'), 'A test');
  });

  test('validators reject nonstrings without throwing callback errors', () => {
    for (const name of ['trim', 'normalizeSpaces']) {
      assert.throws(() => new PayloadTemplate(`{{x:number ! text.${name}}}`).render({ x: 42 }), issue('VALIDATION_FAILED', name));
    }
  });

  test('text operations are built in for CommonJS too', () => {
    const api = createRequire(import.meta.url)('../dist/cjs/index.js');
    assert.equal(new api.PayloadTemplate('{{x:string > text.normalizeSpaces > text.trim ! text.trim ! text.normalizeSpaces}}', { plugins: [] })
      .render({ x: ' A  test ' }), 'A test');
    assert.equal(Object.hasOwn(api, 'textPlugin'), false);
  });
});
