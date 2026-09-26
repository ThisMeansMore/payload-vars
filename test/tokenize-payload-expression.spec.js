import test from 'node:test';
import assert from 'node:assert/strict';
import { PayloadTemplate } from '../dist/index.js';

// Exercise the internal lexer separately, including inputs rejected by construction.
import { tokenizePayloadExpression as tokenize } from '../dist/tokenize-payload-expression.js';
const significant = expression => tokenize(expression).filter(t => t.kind !== 'whitespace').map(t => [t.kind, t.text]);
function coverage(expression) {
  const tokens = tokenize(expression);
  let offset = 0;
  for (const token of tokens) {
    assert.equal(token.start, offset);
    assert.ok(token.end > token.start);
    assert.equal(token.text, expression.slice(token.start, token.end));
    offset = token.end;
  }
  assert.equal(offset, expression.length);
  assert.equal(tokens.map(t => t.text).join(''), expression);
  return tokens;
}

test('classifies the examples by syntactic position', () => {
  for (const [name, type] of [['orderId', 'string'], ['string', 'boolean']]) {
    assert.deepEqual(significant(`{{${name}:${type}}}`), [
      ['delimiter', '{{'], ['variable', name], ['punctuation', ':'], ['type', type], ['delimiter', '}}'],
    ]);
  }
  for (const [name, type, operator, action, fallback] of [
    ['products', 'string', '??', 'omit', 'throw'], ['amounts', 'number', '||', 'null', 'omit'],
  ]) {
    assert.deepEqual(significant(`{{${name}:${type}[ ${operator} ${action} ] ?? ${fallback}}}`), [
      ['delimiter', '{{'], ['variable', name], ['punctuation', ':'], ['type', type],
      ['punctuation', '['], ['operator', operator], ['action', action], ['punctuation', ']'],
      ['operator', '??'], ['action', fallback], ['delimiter', '}}'],
    ]);
  }
});

test('supports every valid scalar, array and fallback combination', () => {
  const fallbacks = ['', '??null', '??omit', '??throw', '||null', '||omit', '||throw'];
  for (const type of ['string', 'number', 'boolean']) {
    const members = type === 'boolean' ? [''] : ['', ...fallbacks.map(f => `[${f}]`)];
    for (const member of members) for (const fallback of fallbacks) {
      const expression = `{{_value2:${type}${member}${fallback}}}`;
      assert.doesNotThrow(() => new PayloadTemplate(expression));
      assert.ok(coverage(expression).every(t => t.kind !== 'unknown'));
    }
  }
});

test('keyword-like names are variables and misplaced keywords are unknown', () => {
  for (const name of ['string', 'number', 'boolean', 'null', 'omit', 'throw', '_name1']) {
    assert.equal(tokenize(`{{${name}:boolean}}`)[1].kind, 'variable');
  }
  for (const expression of ['{{x:null}}', '{{x:string omit}}', '{{x:string ?? boolean}}', '{{x:string ?? null throw}}']) {
    assert.ok(coverage(expression).some(t => t.kind === 'unknown'));
  }
});

test('preserves whitespace and exact UTF-16 offsets', () => {
  assert.deepEqual(coverage(' \t{{string :\nboolean}}😀'), [
    { kind: 'whitespace', text: ' \t', start: 0, end: 2 },
    { kind: 'delimiter', text: '{{', start: 2, end: 4 },
    { kind: 'variable', text: 'string', start: 4, end: 10 },
    { kind: 'whitespace', text: ' ', start: 10, end: 11 },
    { kind: 'punctuation', text: ':', start: 11, end: 12 },
    { kind: 'whitespace', text: '\n', start: 12, end: 13 },
    { kind: 'type', text: 'boolean', start: 13, end: 20 },
    { kind: 'delimiter', text: '}}', start: 20, end: 22 },
    { kind: 'unknown', text: '😀', start: 22, end: 24 },
  ]);
  coverage('\r\n\u00a0{{ x:\tstring[ \n?? omit\t] || null }}\u2028');
});

test('empty input and every incomplete prefix are lossless and do not throw', () => {
  assert.deepEqual(tokenize(''), []);
  const expression = '{{products:string[ ?? omit ] ?? throw}}';
  for (let end = 0; end <= expression.length; end++) coverage(expression.slice(0, end));
  assert.deepEqual(significant('{{x:str'), [['delimiter', '{{'], ['variable', 'x'], ['punctuation', ':'], ['unknown', 'str']]);
});

test('invalid operators, unsupported types and unexpected characters remain unknown', () => {
  for (const operator of ['?', '|', '???', '|||', '?|', '&&', '=']) {
    const tokens = coverage(`{{x:string ${operator} null}}`);
    assert.ok(!tokens.some(t => t.kind === 'operator'));
    assert.ok(tokens.some(t => t.kind === 'unknown'));
  }
  for (const type of ['object', 'String', 'stringify', 'number2']) {
    assert.ok(coverage(`{{x:${type}}}`).some(t => t.text === type && t.kind === 'unknown'));
  }
  for (const input of ['{{x:string@}}', '{{9name:string}}', '{{x:$string}}', '"{{x:string}}"', '{{x:string}\ud800', '😀{{:}}', '{{x:boolean[]}}']) coverage(input);
  // A partial validator operation still highlights its recognized operator.
  assert.equal(tokenize('{{x:string@}}').find(t => t.text === '@').kind, 'operator');
});

test('arbitrary input has contiguous coverage and calls leave template state unchanged', () => {
  const instance = new PayloadTemplate('{{x:string}}');
  const before = instance.toJSON();
  const alphabet = ['{', '}', ':', '[', ']', '?', '|', ' ', '\n', 'a', '0', '@', '😀', '\ud800'];
  let seed = 12345;
  for (let i = 0; i < 200; i++) {
    let input = '';
    for (let j = 0; j < 40; j++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      input += alphabet[seed % alphabet.length];
    }
    coverage(input);
    instance.tokenizePayloadExpression();
  }
  assert.equal(instance.toJSON(), before);
  assert.equal(instance.render({ x: 'ok' }), 'ok');
});


test('instance tokenizes normalized occurrences from its constructor snapshot', () => {
  const input = { first: '{{ x : string[??omit]??throw }}', nested: ['literal', '{{x:string[ ?? omit ] ?? throw}}'], 'odd.key': '{{string:boolean}}' };
  const instance = new PayloadTemplate(input);
  input.first = 'changed';
  const result = instance.tokenizePayloadExpression();
  assert.deepEqual(result.map(({ path, expression }) => ({ path, expression })), [
    { path: '$.first', expression: '{{x:string[ ?? omit ] ?? throw}}' },
    { path: '$.nested[1]', expression: '{{x:string[ ?? omit ] ?? throw}}' },
    { path: '$["odd.key"]', expression: '{{string:boolean}}' },
  ]);
  for (const { expression, tokens } of result) assert.deepEqual(tokens, coverage(expression));
  assert.equal(result[2].tokens[1].kind, 'variable');
  assert.notEqual(result[0].tokens, result[1].tokens);
  result[0].tokens[0].text = 'changed';
  result[1].expression = 'changed';
  result.pop();
  const next = instance.tokenizePayloadExpression();
  assert.equal(next.length, 3);
  assert.equal(next[0].tokens[0].text, '{{');
  assert.equal(next[1].expression, '{{x:string[ ?? omit ] ?? throw}}');
  assert.equal(instance.toJSON().first, '{{x:string[ ?? omit ] ?? throw}}');
});

test('root expressions and templates without expressions need no additional input', () => {
  const [root] = new PayloadTemplate('{{ orderId : string }}').tokenizePayloadExpression();
  assert.equal(root.path, '$');
  assert.equal(root.expression, '{{orderId:string}}');
  for (const value of [null, '', 'literal', 42, false, [], {}, { nested: ['plain'] }]) {
    assert.deepEqual(new PayloadTemplate(value).tokenizePayloadExpression(), []);
  }
  assert.throws(() => new PayloadTemplate('{{x:str'), { name: 'PayloadTemplateError' });
});
