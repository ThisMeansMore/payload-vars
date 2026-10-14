import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PayloadTemplate } from '../dist/index.js';
import { generatePayload, parseControlValue, uiContracts } from '../docs/assets/playground-contracts.js';
import { highlightJson } from '../docs/assets/playground-highlight.js';
import { formatJson, parseJson } from '../docs/assets/playground-json.js';
import { createPlaygroundUiForm } from '../docs/assets/playground-ui-form.js';
import { playgroundUrls, renderPlaygroundPage } from '../scripts/serve-playground.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const root = fileURLToPath(new URL('../', import.meta.url));
const jsFiles = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? jsFiles(path) : entry.name.endsWith('.js') ? [path] : [];
});

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
  const uiPayload = extract('example-ui-payload');
  const uiDefinition = extract('example-ui-form');
  const headlessContracts = headlessTemplate.variables();
  const contracts = template.variables();
  const headlessGenerated = generatePayload(headlessContracts, headlessPayload);
  const generated = generatePayload(contracts, uiPayload);
  let generatedId = 0;
  const form = createPlaygroundUiForm(template, uiDefinition, {
    idGenerator: () => `ui_test${++generatedId}`,
  });
  const rendered = form.submit(generated);
  const neededFrom = contracts.find(contract => contract.name === 'neededFrom');
  const collected = { ...generated, neededFrom: parseControlValue(neededFrom, '') };
  const renderedWithPassthrough = form.submit(collected, { passthrough: true });
  const highlighted = template.tokenizePayloadExpression();
  assert.equal(headlessContracts.length, 6);
  assert.deepEqual(headlessTemplate.toJSON(), template.toJSON());
  assert.equal(uiContracts(headlessContracts).length, 0);
  assert.equal('sections' in headlessTemplate.toJSON(), false);
  assert.deepEqual(headlessTemplate.toJSON().static, {
    note: 'Rendered by the payload template',
  });
  assert.deepEqual(headlessPayload, { unused: 'Rendered only with passthrough' });
  assert.equal('unused' in headlessTemplate.render(headlessGenerated), false);
  assert.equal(headlessTemplate.render(headlessGenerated, { passthrough: true }).unused,
    'Rendered only with passthrough');
  assert.equal(contracts.length, 6);
  assert.equal(uiContracts(contracts).length, 0);
  assert.equal(form.fields().length, 5);
  assert.ok(!form.fields().some(field => field.variable === 'reference'));
  assert.match(form.fields()[0].id, /^ui_/);
  assert.equal(form.fields()[0].variable, 'plan');
  assert.equal(form.fields()[0].ui, 'choice');
  assert.equal(highlighted.length, 6);
  assert.ok(!highlighted.flatMap(item => item.tokens).some(token => token.kind === 'interaction'));
  const tokenMap = new Map(highlighted.map(item => [item.expression, item.tokens]));
  const highlightedJson = highlightJson(JSON.stringify(template.toJSON(), null, 2), tokenMap);
  assert.match(highlightedJson, /class="json-key">"plan"/);
  assert.match(highlightedJson, /class="token-variable">plan/);
  assert.doesNotMatch(highlightedJson, /class="token-interaction"/);
  assert.equal(rendered.request.reference, 'Supplied by application state');
  assert.equal(rendered.request.plan, 'Starter');
  assert.deepEqual(rendered.request.extensions, ['Reporting']);
  assert.equal(renderedWithPassthrough.request.neededFrom, '');
  assert.equal('notInTemplate' in rendered, false);
  assert.equal(renderedWithPassthrough.notInTemplate, 'Rendered only with passthrough');

  assert.match(read('README.md'), /Open the playground.*playground\.html/);
  assert.match(read('docs/_config.yml'), /header_pages:\n  - playground\.html/);
  assert.doesNotMatch(read('docs/index.md'), /Open the playground.*Read the documentation/);
  assert.match(page, /assets\/playground\.js/);
  assert.match(page, /assets\/playground\.css/);
  assert.match(page, /id="template-highlight"/);
  assert.match(page, /id="template-wrap-lines" type="checkbox">/);
  assert.match(page, /id="template-editor" class="playground__code-editor">/);
  assert.match(page, /id="template-json"[^>]*wrap="off"/);
  assert.match(page, /id="template-error"[\s\S]*role="alert"/);
  assert.match(page, /aria-describedby="template-error" aria-invalid="false"/);
  assert.match(page, /id="flow-headless"[^>]*aria-pressed="true"/);
  assert.match(page, /data-flow="headless"[^>]*>1\. Template Designer<\/button>/);
  assert.match(page, /class="playground__flow-arrow" aria-hidden="true">→<\/span>/);
  assert.match(page, /data-flow="ui"[^>]*>2\. Form Designer<\/button>/);
  assert.doesNotMatch(page, /From JSON template to validated payload/);
  assert.doesNotMatch(page, /id="compile-template"|id="reset-example"|id="reset-template"/);
  assert.match(page, /id="flow-description">Step 1 — Create and test a reusable template[\s\S]*id="demo-hint"[\s\S]*Click on[\s\S]*id="reset-demo"[\s\S]*>Demo<\/button>[\s\S]*to restore the example template and testing payload\./);
  assert.match(page, /<h2 id="template-heading">Template<\/h2>/);
  assert.match(page, /<h2 id="input-heading">Payload<\/h2>\s*<button id="reset-payload"/);
  assert.match(page, /<h2 id="rendered-heading">Rendered<\/h2>/);
  assert.match(page, /id="payload-passthrough" type="checkbox"/);
  assert.match(page, /<form id="headless-form" novalidate>[\s\S]*id="payload-json"/);
  assert.match(page, /id="payload-highlight"/);
  assert.match(page, /id="template-format-progress"[^>]*aria-hidden="true" hidden/);
  assert.match(page, /id="ui-form-format-progress"[^>]*aria-hidden="true" hidden/);
  assert.match(page, /id="payload-format-progress"[^>]*aria-hidden="true" hidden/);
  assert.match(page, /id="generated-preview" hidden>[\s\S]*<form id="generated-form" novalidate>[\s\S]*id="generated-fields"[\s\S]*<\/form>[\s\S]*id="additional-payload-heading"/);
  assert.match(page, /class="playground__controls-scroll">[\s\S]*class="playground__mock-app">[\s\S]*Consumer application preview[\s\S]*<form id="generated-form" novalidate>[\s\S]*id="generated-fields"[\s\S]*<\/form>[\s\S]*<\/div>[\s\S]*<\/div>[\s\S]*id="additional-payload-heading"/);
  assert.match(page, /id="additional-payload-heading">Additional payload/);
  assert.match(page, /playground__panel-badge">Application state/);
  assert.match(page, /id="additional-payload-json"[\s\S]*aria-describedby="additional-payload-error"/);
  assert.match(page, /id="additional-payload-format-progress"[^>]*aria-hidden="true" hidden/);
  assert.doesNotMatch(page, /Validate and render/);
  assert.match(page, /id="render-errors"[^>]*aria-label="Rendering errors"/);
  assert.match(page, /id="render-call"[^>]*playground__render-call[\s\S]*playground__call-instance[\s\S]*playground__call-method[\s\S]*playground__call-payload/);
  assert.match(page, /id="contract-cards" class="playground__contract-grid"/);
  assert.match(page, /data-contract-view="cards" aria-pressed="true">View cards<\/button>/);
  assert.match(page, /data-contract-view="raw" aria-pressed="false">View raw JSON<\/button>/);
  assert.equal((page.match(/playground__panel(?: |")/g) ?? []).length, 4);
  assert.match(page, /id="ui-form-panel"[\s\S]*<h2 id="ui-form-heading">UI form<\/h2>/);
  assert.match(page, /playground__panel-badge--mock">template\.createUiForm\(\)/);
  assert.match(page, /id="example-ui-form" type="application\/json"/);
  assert.doesNotMatch(page.match(/<script id="example-ui-template"[\s\S]*?<\/script>/)?.[0] ?? '', / @ /);
  assert.doesNotMatch(page, /id="example-payload"/);
  const browserModule = read('docs/assets/playground.js');
  const playgroundStyles = read('docs/assets/playground.css');
  assert.match(playgroundStyles, /max-width: 1700px;[\s\S]*width: calc\(100vw - 2rem\)/);
  assert.match(playgroundStyles, /\.playground__grid\.is-ui-flow \{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(playgroundStyles, /\.playground__controls-scroll \{[\s\S]*max-height: 28\.5rem[\s\S]*overflow: auto[\s\S]*scrollbar-gutter: stable/);
  assert.match(playgroundStyles, /\.playground__mock-app \{[\s\S]*border: 1px solid #cbd5e1[\s\S]*box-shadow:/);
  assert.match(playgroundStyles, /#rendered-json \{[\s\S]*overflow: auto[\s\S]*white-space: pre/);
  assert.match(playgroundStyles, /\.playground__grid\.is-ui-flow > \.playground__panel:first-child \{[\s\S]*background: #f1f3f5/);
  assert.match(playgroundStyles, /\.playground__code-editor\.is-readonly \{[\s\S]*background: #e2e8f0/);
  assert.match(playgroundStyles, /\.playground__flow-switch\.is-form-designer \.playground__flow-arrow/);
  assert.match(playgroundStyles, /button\[data-flow="headless"\]::before \{[\s\S]*content: '✎'[\s\S]*width: \.85rem/);
  assert.match(playgroundStyles, /button\.is-complete::before \{[\s\S]*content: '✓'/);
  assert.match(browserModule, /import \{ PayloadTemplate \} from '\.\/payload-vars\/index\.js'/);
  assert.doesNotMatch(browserModule, /cdn\.jsdelivr\.net|local-package/);
  assert.match(browserModule, /headlessForm\.addEventListener\('submit'/);
  assert.match(browserModule, /generatedForm\.addEventListener\('submit'/);
  assert.match(browserModule, /generatedForm\.addEventListener\('input', applyGeneratedForm\)/);
  assert.match(browserModule, /compiled\.render\(payload, \{ passthrough: payloadPassthrough\.checked \}\)/);
  assert.match(browserModule, /uiForm\.submit\(payload, \{ passthrough: payloadPassthrough\.checked \}\)/);
  assert.match(browserModule, /const instance = flow === 'ui' \? 'form' : 'template'/);
  assert.match(browserModule, /token\('passthrough', 'playground__call-options'\)/);
  assert.match(browserModule, /`playground__call-boolean is-\$\{payloadPassthrough\.checked\}`/);
  assert.match(browserModule, /function renderContracts\(items, kind = 'variables'\)/);
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
  assert.match(browserModule, /payloadEditor\.addEventListener\('scroll', \(\) => syncEditorScroll\(payloadHighlight, payloadEditor\)\)/);
  assert.match(browserModule, /templateWrapLines\.addEventListener\('change'/);
  assert.match(browserModule, /classList\.toggle\('is-wrapped', wrapped\)/);
  assert.doesNotMatch(browserModule, /(?:templateEditor|payloadEditor)\.addEventListener\('blur'/);
  assert.match(browserModule, /compileTemplate\(\{ format: true \}\)/);
  assert.match(browserModule, /byId\('reset-demo'\)\.addEventListener\('click', resetExample\)/);
  assert.match(browserModule, /resetPayload\.addEventListener\('click', resetVariablePayload\)/);
  assert.match(browserModule, /payload = generatePayload\(contracts, examplePayloads\[flow\]\)/);
  assert.match(browserModule, /resetPayload\.hidden = !isHeadless/);
  assert.match(browserModule, /generatedPreview\.hidden = isHeadless/);
  assert.match(browserModule, /demoHint\.hidden = !isHeadless/);
  assert.match(browserModule, /templateEditor\.readOnly = !isHeadless/);
  assert.match(browserModule, /templateEditorShell\.classList\.toggle\('is-readonly', !isHeadless\)/);
  assert.match(browserModule, /templateBadge\.textContent = isHeadless \? 'Editable' : 'Existing template'/);
  assert.match(browserModule, /templateSources\[nextFlow\] = templateEditor\.value/);
  assert.match(browserModule, /flowSwitch\.classList\.toggle\('is-form-designer', !isHeadless\)/);
  assert.match(browserModule, /byId\('flow-headless'\)\.classList\.toggle\('is-complete', !isHeadless\)/);
  assert.match(browserModule, /`Invalid JSON: \$\{result\.message\}`/);
  assert.match(browserModule, /editor\.setAttribute\('aria-invalid'/);
  assert.match(browserModule, /marker\.className = 'playground__required'/);
  assert.match(browserModule, /required \? ' \(required\)' : ''/);
  assert.match(browserModule, /createPlaygroundUiForm\(compiled, parsed\.value\)/);
  assert.match(browserModule, /control\.name = field\.variable/);
  assert.match(browserModule, /control\.id = field\.id/);
  assert.match(browserModule, /payload = \{ \.\.\.additionalPayload, \.\.\.formValues \}/);
  assert.match(browserModule, /function applyAdditionalPayload\(\)/);
  assert.match(browserModule, /startFormatCountdown\(additionalPayloadFormatProgress\)/);
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

test('UI controls preserve empty strings according to template fallback semantics', () => {
  assert.equal(parseControlValue({ type: 'string' }, ''), '');
  assert.equal(parseControlValue({ type: 'string', valueFallback: { operator: '??', action: 'omit' } }, ''), '');
  assert.equal(parseControlValue({ type: 'string', valueFallback: { operator: '||', action: 'throw' } }, ''), undefined);
  assert.equal(parseControlValue({ type: 'string', allowedValues: ['A'] }, ''), undefined);
  assert.equal(parseControlValue({ type: 'number' }, ''), undefined);
  assert.equal(parseControlValue({ type: 'string[]' }, ''), undefined);
  assert.equal(parseControlValue({ type: 'number' }, '3.5'), 3.5);
  assert.deepEqual(parseControlValue({ type: 'string[]' }, 'one, two'), ['one', 'two']);
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

test('proposed UI form mock normalizes ids, enriches fields, and delegates submission', () => {
  const template = new PayloadTemplate({
    name: '{{name:string}}',
    rating: '{{rating:number in [1, 2, 3] ?? omit}}',
  });
  const form = createPlaygroundUiForm(template, {
    title: 'Review',
    sections: [{
      title: 'Details',
      fields: [
        { id: 'ui_name01', label: 'Name', variable: 'name', ui: 'text' },
        { label: 'Rating', variable: 'rating', ui: 'rating.stars' },
      ],
    }],
  }, { idGenerator: () => 'ui_rate01' });

  assert.deepEqual(form.toJSON().sections[0].fields.map(field => field.id), ['ui_name01', 'ui_rate01']);
  assert.deepEqual(form.fields().map(field => ({
    id: field.id, variable: field.variable, type: field.type, required: field.required,
  })), [
    { id: 'ui_name01', variable: 'name', type: 'string', required: true },
    { id: 'ui_rate01', variable: 'rating', type: 'number', required: false },
  ]);
  assert.deepEqual(form.fields()[1].allowedValues, [1, 2, 3]);
  assert.deepEqual(form.submit({ name: 'Ada', rating: 3, unused: true }), { name: 'Ada', rating: 3 });
  assert.deepEqual(form.submit({ name: 'Ada', unused: true }, { passthrough: true }), {
    name: 'Ada', unused: true,
  });

  const copy = form.toJSON();
  copy.sections[0].fields[0].label = 'Changed';
  assert.equal(form.toJSON().sections[0].fields[0].label, 'Name');
});

test('proposed UI form mock rejects unsafe, duplicate, and unknown field contracts', () => {
  const template = new PayloadTemplate({ name: '{{name:string}}', email: '{{email:string}}' });
  const definition = fields => ({ title: 'Profile', sections: [{ title: 'Main', fields }] });
  assert.throws(() => createPlaygroundUiForm(template, definition([
    { id: 'name', label: 'Name', variable: 'name', ui: 'text' },
  ])), /expected \/\^ui_/);
  assert.throws(() => createPlaygroundUiForm(template, definition([
    { id: 'ui_same1', label: 'Name', variable: 'name', ui: 'text' },
    { id: 'ui_same1', label: 'Email', variable: 'email', ui: 'text' },
  ])), /duplicate id "ui_same1"/);
  assert.throws(() => createPlaygroundUiForm(template, definition([
    { id: 'ui_name1', label: 'Name', variable: 'name', ui: 'text' },
    { id: 'ui_name2', label: 'Again', variable: 'name', ui: 'text' },
  ])), /duplicate template variable "name"/);
  assert.throws(() => createPlaygroundUiForm(template, definition([
    { id: 'ui_other', label: 'Other', variable: 'missing', ui: 'text' },
  ])), /unknown template variable "missing"/);
  assert.throws(() => createPlaygroundUiForm(template, {
    title: 'Profile', sections: [], extra: true,
  }), /unknown property/);
});

test('playground browser module is syntactically valid', () => {
  for (const path of ['docs/assets/playground.js', 'docs/assets/playground-ui-form.js']) {
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${path}: ${result.stderr}`);
  }
});

test('local playground server produces a standalone page', () => {
  const rendered = renderPlaygroundPage(read('docs/playground.html'));
  assert.match(rendered, /^<!doctype html>/);
  assert.match(rendered, /<title>payload-vars playground<\/title>/);
  assert.doesNotMatch(rendered, /^---/);
  assert.doesNotMatch(rendered, /\{%\s*(?:end)?raw/);
  assert.equal(JSON.parse(read('package.json')).scripts.playground,
    'npm run build && node --watch scripts/serve-playground.mjs');
});

test('hosted playground package matches the browser-compatible build', () => {
  const distRoot = join(root, 'dist');
  const hostedRoot = join(root, 'docs/assets/payload-vars');
  const expected = jsFiles(distRoot)
    .filter(path => !relative(distRoot, path).startsWith(`cjs${sep}`))
    .map(path => relative(distRoot, path))
    .sort();
  const actual = jsFiles(hostedRoot).map(path => relative(hostedRoot, path)).sort();

  assert.deepEqual(actual, expected);
  for (const path of expected) {
    assert.equal(readFileSync(join(hostedRoot, path), 'utf8'), readFileSync(join(distRoot, path), 'utf8'), path);
  }
});

test('local playground server advertises local, private, and network addresses', () => {
  const interfaces = {
    lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    network0: [{ address: '192.0.2.10', family: 'IPv4', internal: false }],
    private0: [{ address: '100.64.0.10', family: 'IPv4', internal: false }],
    network1: [{ address: '2001:db8::10', family: 'IPv6', internal: false }],
  };
  assert.deepEqual(playgroundUrls('0.0.0.0', 4173, interfaces), [
    { label: 'Local', url: 'http://localhost:4173/playground.html' },
    { label: 'Private', url: 'http://100.64.0.10:4173/playground.html' },
    { label: 'Network', url: 'http://192.0.2.10:4173/playground.html' },
  ]);
  assert.deepEqual(playgroundUrls('127.0.0.1', 5000, interfaces), [
    { label: 'Local', url: 'http://127.0.0.1:5000/playground.html' },
  ]);
});
