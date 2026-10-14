import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PayloadTemplate } from '../dist/index.js';
import { generatePayload, uiContracts } from '../docs/assets/playground-contracts.js';
import { highlightJson } from '../docs/assets/playground-highlight.js';
import { formatJson, parseJson } from '../docs/assets/playground-json.js';
import { playgroundUrls, renderPlaygroundModule, renderPlaygroundPage } from '../scripts/serve-playground.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('playground example compiles, renders, and is linked from the project home', () => {
  const page = read('docs/playground.html');
  const extract = id => {
    const match = page.match(new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)<\\/script>`));
    assert.ok(match, `${id} must exist`);
    return JSON.parse(match[1]);
  };
  const headlessTemplate = new PayloadTemplate(extract('example-headless-template'));
  const headlessPayload = extract('example-headless-payload');
  const template = new PayloadTemplate(extract('example-ui-template'));
  const headlessContracts = headlessTemplate.variables();
  const contracts = template.variables();
  const headlessGenerated = generatePayload(headlessContracts, headlessPayload);
  const generated = generatePayload(contracts);
  const rendered = template.render(generated);
  const highlighted = template.tokenizePayloadExpression();
  assert.equal(headlessContracts.length, 6);
  assert.equal(uiContracts(headlessContracts).length, 0);
  assert.equal('sections' in headlessTemplate.toJSON(), false);
  assert.deepEqual(headlessTemplate.toJSON().static, {
    note: 'Rendered directly from the template', enabled: true,
  });
  assert.deepEqual(headlessPayload, { unused: 'Rendered only with passthrough' });
  assert.equal('unused' in headlessTemplate.render(headlessGenerated), false);
  assert.equal(headlessTemplate.render(headlessGenerated, { passthrough: true }).unused,
    'Rendered only with passthrough');
  assert.equal(contracts.length, 6);
  assert.equal(uiContracts(contracts).length, 5);
  assert.ok(!uiContracts(contracts).some(contract => contract.name === 'reference'));
  assert.equal(highlighted.length, 6);
  assert.ok(highlighted.flatMap(item => item.tokens).some(token => token.kind === 'interaction'));
  const tokenMap = new Map(highlighted.map(item => [item.expression, item.tokens]));
  const highlightedJson = highlightJson(JSON.stringify(template.toJSON(), null, 2), tokenMap);
  assert.match(highlightedJson, /class="json-key">"Plan"/);
  assert.match(highlightedJson, /class="token-variable">plan/);
  assert.match(highlightedJson, /class="token-interaction">choice/);
  assert.equal(rendered.sections[0].content.Reference, '');
  assert.equal(rendered.sections[0].content.Plan, 'Starter');
  assert.deepEqual(rendered.sections[1].content.Extensions, ['Reporting']);

  assert.match(read('README.md'), /Open the playground.*playground\.html/);
  assert.match(read('docs/_config.yml'), /header_pages:\n  - playground\.html/);
  assert.doesNotMatch(read('docs/index.md'), /Open the playground.*Read the documentation/);
  assert.match(page, /assets\/playground\.js/);
  assert.match(page, /assets\/playground\.css/);
  assert.match(page, /id="template-highlight"/);
  assert.match(page, /id="template-wrap-lines" type="checkbox" checked/);
  assert.match(page, /id="template-editor" class="playground__code-editor is-wrapped"/);
  assert.match(page, /id="template-error"[\s\S]*role="alert"/);
  assert.match(page, /aria-describedby="template-error" aria-invalid="false"/);
  assert.match(page, /id="flow-headless"[^>]*aria-pressed="true"/);
  assert.doesNotMatch(page, /From JSON template to validated payload/);
  assert.doesNotMatch(page, /id="compile-template"|id="reset-example"|id="reset-template"/);
  assert.match(page, /id="flow-description">Test validation and transformation[\s\S]*Click on[\s\S]*id="reset-demo"[\s\S]*>Demo<\/button>[\s\S]*to restore the example template and testing payload\./);
  assert.match(page, /<h2 id="template-heading">Template<\/h2>/);
  assert.match(page, /<h2 id="input-heading">Payload<\/h2>\s*<button id="reset-payload"/);
  assert.match(page, /<h2 id="rendered-heading">Rendered<\/h2>/);
  assert.match(page, /id="payload-passthrough" type="checkbox"/);
  assert.match(page, /<form id="headless-form" novalidate>[\s\S]*id="payload-json"/);
  assert.match(page, /id="payload-highlight"/);
  assert.match(page, /id="template-format-progress"[^>]*aria-hidden="true" hidden/);
  assert.match(page, /id="payload-format-progress"[^>]*aria-hidden="true" hidden/);
  assert.match(page, /<form id="generated-form" novalidate hidden>/);
  assert.doesNotMatch(page, /Validate and render/);
  assert.match(page, /id="render-errors"[^>]*aria-label="Rendering errors"/);
  assert.match(page, /id="render-call"[^>]*playground__render-call[\s\S]*playground__call-instance[\s\S]*playground__call-method[\s\S]*playground__call-payload/);
  assert.match(page, /id="contract-cards" class="playground__contract-grid"/);
  assert.match(page, /data-contract-view="cards" aria-pressed="true">View cards<\/button>/);
  assert.match(page, /data-contract-view="raw" aria-pressed="false">View raw JSON<\/button>/);
  assert.equal((page.match(/playground__panel(?: |")/g) ?? []).length, 3);
  assert.doesNotMatch(page, /id="example-payload"/);
  const browserModule = read('docs/assets/playground.js');
  assert.match(browserModule, /headlessForm\.addEventListener\('submit'/);
  assert.match(browserModule, /generatedForm\.addEventListener\('submit'/);
  assert.match(browserModule, /generatedForm\.addEventListener\('input', applyGeneratedForm\)/);
  assert.match(browserModule, /compiled\.render\(payload, \{ passthrough: payloadPassthrough\.checked \}\)/);
  assert.match(browserModule, /token\('template', 'playground__call-instance'\)/);
  assert.match(browserModule, /token\('passthrough', 'playground__call-options'\)/);
  assert.match(browserModule, /`playground__call-boolean is-\$\{payloadPassthrough\.checked\}`/);
  assert.match(browserModule, /function renderContracts\(items\)/);
  assert.match(browserModule, /contractFact\('Fallback', contractFallback\(contract\)\)/);
  assert.match(browserModule, /items: \$\{contract\.memberFallback\.operator\}/);
  assert.match(browserModule, /contractViewButtons\.forEach\(button => button\.addEventListener\('click'/);
  assert.match(browserModule, /renderedOutput\.innerHTML = highlightJson\(formatJson\(value\)\)/);
  assert.match(browserModule, /issue\.code.*locations\.join\(', '\)/s);
  assert.match(browserModule, /declared type \$\{JSON\.stringify\(issue\.declaredType\)\}/);
  assert.match(browserModule, /compiled\.tokenizePayloadExpression\(\)/);
  assert.match(browserModule, /import \{ highlightJson \} from '\.\/playground-highlight\.js'/);
  assert.match(browserModule, /const editorIdleDelay = 3000/);
  assert.match(browserModule, /startFormatCountdown\(templateFormatProgress\)/);
  assert.match(browserModule, /startFormatCountdown\(payloadFormatProgress\)/);
  assert.match(browserModule, /stopFormatCountdown\(templateFormatProgress\)/);
  assert.match(browserModule, /stopFormatCountdown\(payloadFormatProgress\)/);
  assert.match(browserModule, /setTimeout\(\(\) => compileTemplate\(\{ format: true \}\), editorIdleDelay\)/);
  assert.match(browserModule, /payloadFeedbackTimer = setTimeout\(\(\) => \{[\s\S]*applyHeadlessPayload\(\);[\s\S]*\}, editorIdleDelay\)/);
  assert.match(browserModule, /payloadHighlight\.innerHTML = `\$\{highlightJson\(payloadEditor\.value\)\}\\n`/);
  assert.match(browserModule, /payloadEditor\.addEventListener\('scroll', syncPayloadScroll\)/);
  assert.match(browserModule, /templateWrapLines\.addEventListener\('change'/);
  assert.match(browserModule, /classList\.toggle\('is-wrapped', wrapped\)/);
  assert.doesNotMatch(browserModule, /(?:templateEditor|payloadEditor)\.addEventListener\('blur'/);
  assert.match(browserModule, /compileTemplate\(\{ format: true \}\)/);
  assert.match(browserModule, /byId\('reset-demo'\)\.addEventListener\('click', resetExample\)/);
  assert.match(browserModule, /resetPayload\.addEventListener\('click', resetVariablePayload\)/);
  assert.match(browserModule, /payload = generatePayload\(contracts, examplePayloads\[flow\]\)/);
  assert.match(browserModule, /resetPayload\.hidden = !isHeadless/);
  assert.match(browserModule, /`Invalid JSON: \$\{result\.message\}`/);
  assert.match(browserModule, /editor\.setAttribute\('aria-invalid'/);
  assert.match(browserModule, /marker\.className = 'playground__required'/);
  assert.match(browserModule, /required \? ' \(required\)' : ''/);
  assert.match(browserModule, /uiContracts\(contracts\)/);
  assert.match(browserModule, /button\.dataset\.flow === flow/);
});

test('headless payload generation preserves key order and supplies type-safe starters', () => {
  const contracts = [
    { name: 'title', type: 'string' },
    { name: 'count', type: 'number' },
    { name: 'active', type: 'boolean' },
    { name: 'tags', type: 'string[]' },
    { name: 'rating', type: 'number', allowedValues: [1, 2, 3], interaction: 'rating.stars' },
    { name: 'computed', type: 'string', derived: true, interaction: 'text' },
  ];
  const preserved = generatePayload(contracts, { title: 'Edited', orphan: 'Kept', count: 7 });
  assert.deepEqual(preserved, {
    title: 'Edited', orphan: 'Kept', count: 7, active: false, tags: [''], rating: 1,
  });
  assert.deepEqual(Object.keys(preserved), ['title', 'orphan', 'count', 'active', 'tags', 'rating']);
  assert.deepEqual(generatePayload(contracts), {
    title: '', count: 0, active: false, tags: [''], rating: 1,
  });
  assert.deepEqual(uiContracts(contracts).map(contract => contract.name), ['rating']);
});

test('playground JSON helpers format valid input and describe invalid input', () => {
  const parsed = parseJson('{"title":"Example","enabled":true}');
  assert.deepEqual(parsed, { ok: true, value: { title: 'Example', enabled: true } });
  assert.equal(formatJson(parsed.value), '{\n  "title": "Example",\n  "enabled": true\n}');

  const invalid = parseJson('{"title":}');
  assert.equal(invalid.ok, false);
  assert.equal(typeof invalid.message, 'string');
  assert.ok(invalid.message.length > 0);
});

test('playground browser module is syntactically valid', () => {
  const result = spawnSync(process.execPath, ['--check', 'docs/assets/playground.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('local playground server produces a standalone page', () => {
  const rendered = renderPlaygroundPage(read('docs/playground.html'));
  assert.match(rendered, /^<!doctype html>/);
  assert.match(rendered, /<title>payload-vars playground<\/title>/);
  assert.doesNotMatch(rendered, /^---/);
  assert.doesNotMatch(rendered, /\{%\s*(?:end)?raw/);
  const browserModule = renderPlaygroundModule(read('docs/assets/playground.js'));
  assert.match(browserModule, /from '\/local-package\/index\.js'/);
  assert.doesNotMatch(browserModule, /cdn\.jsdelivr\.net\/npm\/payload-vars/);
  assert.equal(JSON.parse(read('package.json')).scripts.playground,
    'npm run build && node --watch scripts/serve-playground.mjs');
});

test('local playground server advertises local, Tailscale, and network addresses', () => {
  const interfaces = {
    lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    en0: [{ address: '192.168.1.8', family: 'IPv4', internal: false }],
    utun3: [{ address: '100.116.235.117', family: 'IPv4', internal: false }],
    utun4: [{ address: 'fd7a:115c:a1e0::1', family: 'IPv6', internal: false }],
  };
  assert.deepEqual(playgroundUrls('0.0.0.0', 4173, interfaces), [
    { label: 'Local', url: 'http://localhost:4173/playground.html' },
    { label: 'Tailscale', url: 'http://100.116.235.117:4173/playground.html' },
    { label: 'Network', url: 'http://192.168.1.8:4173/playground.html' },
  ]);
  assert.deepEqual(playgroundUrls('127.0.0.1', 5000, interfaces), [
    { label: 'Local', url: 'http://127.0.0.1:5000/playground.html' },
  ]);
});
