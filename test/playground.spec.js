import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PayloadTemplate } from '../dist/index.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('playground example compiles, renders, and is linked from the project home', () => {
  const page = read('docs/playground.html');
  const extract = id => {
    const match = page.match(new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)<\\/script>`));
    assert.ok(match, `${id} must exist`);
    return JSON.parse(match[1]);
  };
  const template = new PayloadTemplate(extract('example-template'));
  const rendered = template.render(extract('example-payload'));
  assert.equal(template.variables().length, 5);
  assert.equal(rendered.sections[0].content.Plan, 'Growth');
  assert.deepEqual(rendered.sections[1].content.Extensions, ['Reporting', 'Audit log']);

  assert.match(read('README.md'), /Open the playground.*playground\.html/);
  assert.match(read('docs/_config.yml'), /header_pages:\n  - playground\.html/);
  assert.doesNotMatch(read('docs/index.md'), /Open the playground.*Read the documentation/);
  assert.match(page, /assets\/playground\.js/);
  assert.match(page, /assets\/playground\.css/);
  assert.match(page, /<form id="generated-form">[\s\S]*<button type="submit">Validate and render<\/button>/);
  assert.equal((page.match(/playground__panel(?: |")/g) ?? []).length, 3);
  assert.doesNotMatch(page, /id="payload-json"/);
  const browserModule = read('docs/assets/playground.js');
  assert.match(browserModule, /generatedForm\.addEventListener\('submit'/);
  assert.match(browserModule, /compiled\.render\(payload\)/);
});

test('playground browser module is syntactically valid', () => {
  const result = spawnSync(process.execPath, ['--check', 'docs/assets/playground.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
