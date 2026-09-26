import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';

const progressMessage = 'Running release integration tests. This can take 1–2 minutes; a quiet terminal is normal.';
const useColor = process.env.NO_COLOR === undefined && process.env.FORCE_COLOR !== '0' && process.env.TERM !== 'dumb';
console.log(useColor ? `\u001b[36m${progressMessage}\u001b[0m` : progressMessage);
// Flush the test runner's output before synchronous Git fixtures occupy this process.
await new Promise(resolve => setImmediate(resolve));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'payload-vars-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = join(root, 'repo');
  const remote = join(root, 'remote.git');
  mkdirSync(cwd);
  mkdirSync(join(root, 'bin'));
  mkdirSync(join(cwd, 'scripts/lib'), { recursive: true });
  mkdirSync(join(cwd, 'docs/_includes'), { recursive: true });
  for (const file of ['lib/release.mjs', 'lib/docs.mjs', 'prepare-version.mjs', 'publish-version.mjs', 'build.mjs']) {
    copyFileSync(new URL(`../scripts/${file}`, import.meta.url), join(cwd, 'scripts', file));
  }
  const write = (file, content) => writeFileSync(join(cwd, file), content);
  const read = file => readFileSync(join(cwd, file), 'utf8');
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Release test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  write('package.json', JSON.stringify({ name: 'release-fixture', version: '1.2.3', type: 'module' }, null, 2) + '\n');
  write('package-lock.json', JSON.stringify({ version: '1.2.3', packages: { '': { version: '1.2.3' } } }, null, 2) + '\n');
  write('README.md', '# payload-vars\n\nDocumentation.\n');
  write('docs/_includes/home-footer.md', '[Changelog](changelog.md)\n');
  write('CHANGELOG.md', '# Changelog\n\n## Unreleased\n\n- New feature.\n\n## 1.2.3 — 2026-09-25\n\n<!-- reviewed -->\n\n- Previous release.\n');
  execFileSync(process.execPath, ['scripts/build.mjs', '--docs'], { cwd });
  git('add', '.');
  git('commit', '-m', 'initial');
  git('tag', 'v1.2.3');
  execFileSync('git', ['init', '--bare', remote], { stdio: 'pipe' });
  git('remote', 'add', 'origin', remote);
  git('push', 'origin', 'main', '--tags');
  // Real Git repositories; npm registry and publishing are simulated and never use the network.
  writeFileSync(join(root, 'bin/npm'), `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.env.RELEASE_TEST_ROOT;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(root, 'calls'), args.join(' ') + '\\n');
const pkg = JSON.parse(fs.readFileSync('package.json'));
if (args[0] === 'test') {
  if (fs.existsSync(path.join(root, 'fail-test'))) process.exit(1);
} else if (args[0] === 'config') {
  console.log('https://registry.example.invalid/');
} else if (args[0] === 'pack') {
  const files = ['package.json', 'package-lock.json', 'CHANGELOG.md', 'docs/index.md', 'docs/changelog.md'];
  const contents = files.map(file => fs.readFileSync(file, 'utf8')).join('');
  const integrity = 'sha512-' + crypto.createHash('sha512').update(contents).digest('base64');
  const packed = { name: pkg.name, version: pkg.version, integrity, filename: 'fixture.tgz' };
  if (fs.existsSync(path.join(root, 'wrong-pack-version'))) packed.version = '0.0.0';
  fs.writeFileSync(path.join(args[args.indexOf('--pack-destination') + 1], packed.filename), JSON.stringify(packed));
  console.log(JSON.stringify(fs.existsSync(path.join(root, 'npm12-pack')) ? { [pkg.name]: packed } : [packed]));
} else if (args[0] === 'view') {
  if (fs.existsSync(path.join(root, 'network-error'))) {
    console.log(JSON.stringify({ error: { code: 'EAI_AGAIN' } })); process.exit(1);
  }
  if (!fs.existsSync(path.join(root, 'published'))) {
    console.log(JSON.stringify({ error: { code: 'E404' } })); process.exit(1);
  }
  const published = JSON.parse(fs.readFileSync(path.join(root, 'published'), 'utf8'));
  console.log(JSON.stringify(fs.existsSync(path.join(root, 'npm12-pack')) ? [published] : published));
} else if (args[0] === 'publish') {
  if (fs.existsSync(path.join(root, 'fail-publish'))) process.exit(1);
  if (fs.readFileSync('CHANGELOG.md', 'utf8').match(/<!-- (reviewed|requires-review) -->/g) || fs.readFileSync('docs/changelog.md', 'utf8').match(/<!-- (reviewed|requires-review) -->/g)) process.exit(3);
  const pack = JSON.parse(fs.readFileSync(args[1]));
  fs.writeFileSync(path.join(root, 'published'), JSON.stringify({ version: pack.version, 'dist.integrity': pack.integrity }));
} else { process.exit(2); }
`, { mode: 0o755 });
  writeFileSync(join(root, 'bin/gh'), `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = process.env.RELEASE_TEST_ROOT;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(root, 'gh-calls'), args.join(' ') + '\\n');
if (fs.existsSync(path.join(root, 'gh-unavailable'))) process.exit(1);
if (args[0] === 'repo') {
  if (args[1] !== 'view' || !args[2] || args[2].startsWith('-') || args.includes('--repo')) {
    console.error('gh repo view requires a positional repository argument');
    process.exit(1);
  }
  console.log('fixture/repo');
} else if (args.includes('POST')) {
  if (fs.existsSync(path.join(root, 'pages-request-fails'))) process.exit(1);
  console.log(JSON.stringify({ status: 'queued' }));
} else if (args[1].endsWith('/builds/latest')) {
  const commit = cp.execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const failed = fs.existsSync(path.join(root, 'pages-fails'));
  console.log(JSON.stringify({ commit, status: failed ? 'errored' : 'built', error: { message: failed ? 'build failed' : null } }));
} else {
  console.log(JSON.stringify({ build_type: 'legacy', source: { branch: 'main', path: '/docs' } }));
}
`, { mode: 0o755 });
  const env = { ...process.env, PATH: join(root, 'bin') + delimiter + process.env.PATH, RELEASE_TEST_ROOT: root };
  const run = (script, ...args) => spawnSync(process.execPath, [`scripts/${script}.mjs`, ...args], { cwd, env, encoding: 'utf8' });
  const review = () => write('CHANGELOG.md', read('CHANGELOG.md').replace('<!-- requires-review -->', ''));
  const prepare = () => { const result = run('prepare-version', 'patch'); assert.equal(result.status, 0, result.stderr); };
  const flag = name => writeFileSync(join(root, name), 'yes');
  return { root, cwd, remote, git, write, read, run, review, prepare, flag };
}

test('preparation bumps all versions, moves notes, preserves historical reviews and does not commit', t => {
  const f = fixture(t);
  const head = f.git('rev-parse', 'HEAD');
  f.prepare();
  assert.equal(JSON.parse(f.read('package.json')).version, '1.2.4');
  assert.equal(JSON.parse(f.read('package-lock.json')).packages[''].version, '1.2.4');
  assert.match(f.read('docs/index.md'), /Package version: v1.2.4/);
  assert.doesNotMatch(f.read('docs/changelog.md'), /^## Unreleased$/m);
  assert.match(f.read('docs/changelog.md'), /^## 1\.2\.4 — /m);
  assert.match(f.read('CHANGELOG.md'), /## Unreleased\n\n## 1.2.4 — \d{4}-\d{2}-\d{2}/);
  assert.match(f.read('CHANGELOG.md'), /## 1.2.3[^]*<!-- reviewed -->/);
  assert.match(f.read('CHANGELOG.md'), /<!-- requires-review -->/);
  assert.doesNotMatch(f.read('docs/changelog.md'), /<!-- requires-review -->/);
  assert.equal(f.git('rev-parse', 'HEAD'), head);
  assert.equal(f.git('tag', '--list', 'v1.2.4'), '');
  assert.equal(f.run('prepare-version', 'patch').status, 1, 'cannot accidentally bump twice');
  assert.match(f.run('publish-version').stderr, /Review the notes for 1.2.4/);
  assert.equal(f.git('rev-parse', 'HEAD'), head);
});

test('preparation rejects dirty branches and invalid increments, and drafts missing notes', t => {
  const f = fixture(t);
  assert.equal(f.run('prepare-version', 'invalid').status, 1);
  f.git('switch', '-c', 'feature');
  assert.match(f.run('prepare-version', 'patch').stderr, /main branch/);
  f.git('switch', 'main');
  f.write('unrelated', 'work');
  assert.match(f.run('prepare-version', 'patch').stderr, /clean working tree/);
  rmSync(join(f.cwd, 'unrelated'));
  f.write('CHANGELOG.md', f.read('CHANGELOG.md').replace('- New feature.', ''));
  f.git('add', '.'); f.git('commit', '-m', 'empty notes');
  f.prepare();
  assert.match(f.read('CHANGELOG.md'), /### Changes\n\n- empty notes/);
  assert.match(f.read('CHANGELOG.md'), /<!-- requires-review -->/);
  assert.match(f.run('publish-version').stderr, /remove <!-- requires-review -->/);
});

test('publication refreshes reviewed docs, commits only release files and publishes matching tag', t => {
  const f = fixture(t);
  f.prepare(); f.review();
  const result = f.run('publish-version');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.git('status', '--porcelain'), '');
  assert.equal(f.git('rev-parse', 'v1.2.4^{commit}'), f.git('rev-parse', 'HEAD'));
  assert.doesNotMatch(f.read('CHANGELOG.md'), /<!-- reviewed -->/);
  assert.doesNotMatch(f.read('docs/changelog.md'), /<!-- reviewed -->/);
  assert.doesNotMatch(f.git('show', 'HEAD:CHANGELOG.md'), /<!-- reviewed -->/);
  assert.equal(f.run('publish-version', '--check').status, 0);
  assert.match(f.git('ls-remote', 'origin', 'refs/tags/v1.2.4^{}'), new RegExp(f.git('rev-parse', 'HEAD')));
  assert.equal(existsSync(join(f.cwd, '.git/payload-vars-release.json')), false);
});

test('npm 12 pack metadata supports publication and retry without republishing', t => {
  const f = fixture(t);
  f.prepare(); f.review(); f.flag('npm12-pack'); f.flag('pages-fails');
  assert.match(f.run('publish-version').stderr, /Pages deployment failed/);
  rmSync(join(f.root, 'pages-fails'));
  const retry = f.run('publish-version');
  assert.equal(retry.status, 0, retry.stderr);
  assert.match(retry.stdout, /skipping publication/);
  assert.equal(readFileSync(join(f.root, 'calls'), 'utf8').split('\n').filter(line => line.startsWith('publish ')).length, 1);
});

test('both npm pack formats reject a mismatched version before publication', t => {
  for (const npm12 of [false, true]) {
    const f = fixture(t);
    f.prepare(); f.review(); f.flag('wrong-pack-version');
    if (npm12) f.flag('npm12-pack');
    assert.match(f.run('publish-version').stderr, /Packed artifact does not match the prepared version/);
    assert.equal(existsSync(join(f.root, 'published')), false);
  }
});

test('publication rejects unrelated edits, pending notes, example review markers and failing tests', t => {
  const f = fixture(t);
  f.prepare(); f.review();
  f.write('unrelated', 'work');
  assert.match(f.run('publish-version').stderr, /Unrelated changes/);
  rmSync(join(f.cwd, 'unrelated'));
  const reviewed = f.read('CHANGELOG.md');
  f.write('CHANGELOG.md', reviewed.replace('## Unreleased', '## Unreleased\n- Pending'));
  assert.match(f.run('publish-version').stderr, /empty Unreleased/);
  f.write('CHANGELOG.md', reviewed.replace('- New feature.', '```md\n<!-- requires-review -->\n```\n- New feature.'));
  assert.match(f.run('publish-version').stderr, /Review the notes/);
  f.write('CHANGELOG.md', reviewed);
  f.flag('fail-test');
  assert.equal(f.run('publish-version').status, 1);
  assert.equal(f.git('tag', '--list', 'v1.2.4'), '');
  assert.equal(existsSync(join(f.root, 'published')), false);
});

test('push failure can be retried without another bump, commit or npm publication', t => {
  const f = fixture(t);
  f.prepare(); f.review();
  const hook = join(f.remote, 'hooks/pre-receive');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  assert.equal(f.run('publish-version').status, 1);
  assert.equal(existsSync(join(f.root, 'published')), true);
  const head = f.git('rev-parse', 'HEAD');
  rmSync(hook);
  const retry = f.run('publish-version');
  assert.equal(retry.status, 0, retry.stderr);
  assert.match(retry.stdout, /skipping publication/);
  assert.equal(f.git('rev-parse', 'HEAD'), head);
  assert.equal(readFileSync(join(f.root, 'calls'), 'utf8').split('\n').filter(line => line.startsWith('publish ')).length, 1);
});

test('npm failure can be retried and registry errors never imply an unpublished version', t => {
  const f = fixture(t);
  f.prepare(); f.review(); f.flag('network-error');
  assert.equal(f.run('publish-version').status, 1);
  assert.equal(existsSync(join(f.root, 'published')), false);
  rmSync(join(f.root, 'network-error'));
  f.flag('fail-publish');
  assert.equal(f.run('publish-version').status, 1);
  rmSync(join(f.root, 'fail-publish'));
  const retry = f.run('publish-version');
  assert.equal(retry.status, 0, retry.stderr);
});

test('publication rejects an existing npm artifact with different contents', t => {
  const f = fixture(t);
  f.prepare(); f.review();
  writeFileSync(join(f.root, 'published'), JSON.stringify({ version: '1.2.4', 'dist.integrity': 'different' }));
  assert.match(f.run('publish-version').stderr, /different artifact/);
  assert.equal(f.git('ls-remote', 'origin', 'refs/tags/v1.2.4'), '');
});

test('minor and major preparation select the intended version without approving it', t => {
  for (const [increment, version] of [['minor', '1.3.0'], ['major', '2.0.0']]) {
    const f = fixture(t);
    const result = f.run('prepare-version', increment);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(f.read('package.json')).version, version);
    assert.match(f.run('publish-version').stderr, new RegExp(`Review the notes for ${version}`));
  }
});

test('publication rejects manifest changes and conflicting local or remote tags', t => {
  const f = fixture(t);
  f.prepare(); f.review();
  const original = f.read('package.json');
  f.write('package.json', original.replace('release-fixture', 'other-package'));
  assert.match(f.run('publish-version').stderr, /beyond the prepared version bump/);
  f.write('package.json', original);
  const lock = f.read('package-lock.json');
  f.write('package-lock.json', lock.replaceAll('1.2.4', '1.2.5'));
  assert.match(f.run('publish-version').stderr, /versions do not match/);
  f.write('package-lock.json', lock);
  f.git('tag', 'v1.2.4');
  assert.match(f.run('publish-version').stderr, /Local tag/);
  f.git('push', 'origin', 'v1.2.4');
  f.git('tag', '-d', 'v1.2.4');
  assert.match(f.run('publish-version').stderr, /Remote tag/);
  assert.equal(existsSync(join(f.root, 'published')), false);
});

test('direct publish guard requires clean main, synchronized docs and a matching release tag', t => {
  const f = fixture(t);
  f.prepare(); f.review();
  const result = f.run('publish-version');
  assert.equal(result.status, 0, result.stderr);
  f.git('switch', '-c', 'feature');
  assert.match(f.run('publish-version', '--check').stderr, /main branch/);
  f.git('switch', 'main');
  f.write('unrelated', 'change');
  assert.match(f.run('publish-version', '--check').stderr, /clean working tree/);
  rmSync(join(f.cwd, 'unrelated'));
  f.write('docs/index.md', 'stale');
  f.git('add', '.'); f.git('commit', '-m', 'stale docs');
  assert.match(f.run('publish-version', '--check').stderr, /stale/);
  assert.equal(f.run('build', '--docs').status, 0);
  f.git('add', '.'); f.git('commit', '-m', 'sync docs');
  assert.match(f.run('publish-version', '--check').stderr, /tag v1.2.4 must point/);
});


test('Pages failure keeps release retryable without republishing npm', t => {
  const f = fixture(t);
  f.prepare(); f.review(); f.flag('pages-fails');
  const failed = f.run('publish-version');
  assert.match(failed.stderr, /Pages deployment failed/);
  assert.equal(existsSync(join(f.cwd, '.git/payload-vars-release.json')), true);
  assert.equal(existsSync(join(f.root, 'published')), true);
  rmSync(join(f.root, 'pages-fails'));
  const retry = f.run('publish-version');
  assert.equal(retry.status, 0, retry.stderr);
  assert.match(retry.stdout, /deployed Pages/);
  assert.equal(readFileSync(join(f.root, 'calls'), 'utf8').split('\n').filter(line => line.startsWith('publish ')).length, 1);
  assert.equal(existsSync(join(f.cwd, '.git/payload-vars-release.json')), false);
});

test('Pages access is checked before npm publication and request failures retain state', t => {
  const f = fixture(t);
  f.prepare(); f.review(); f.flag('gh-unavailable');
  assert.equal(f.run('publish-version').status, 1);
  assert.equal(existsSync(join(f.root, 'published')), false);
  assert.equal(f.git('tag', '--list', 'v1.2.4'), '');
  rmSync(join(f.root, 'gh-unavailable'));
  f.flag('pages-request-fails');
  assert.equal(f.run('publish-version').status, 1);
  assert.equal(existsSync(join(f.cwd, '.git/payload-vars-release.json')), true);
  rmSync(join(f.root, 'pages-request-fails'));
  const retry = f.run('publish-version');
  assert.equal(retry.status, 0, retry.stderr);
});


test('commit failure can be retried after removing the review gate', t => {
  const f = fixture(t);
  f.prepare();
  f.flag('fail-test');
  assert.match(f.run('publish-version').stderr, /remove <!-- requires-review -->/);
  assert.match(f.read('CHANGELOG.md'), /<!-- requires-review -->/);
  f.review();
  assert.equal(f.run('publish-version').status, 1);
  rmSync(join(f.root, 'fail-test'));
  const hook = join(f.cwd, '.git/hooks/pre-commit');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  assert.equal(f.run('publish-version').status, 1);
  assert.doesNotMatch(f.read('CHANGELOG.md'), /<!-- (reviewed|requires-review) -->/);
  rmSync(hook);
  const retry = f.run('publish-version');
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(existsSync(join(f.cwd, '.git/payload-vars-review.json')), false);
});

test('Pages changelog keeps Unreleased only when there are pending notes', t => {
  const f = fixture(t);
  assert.match(f.read('docs/changelog.md'), /## Unreleased\n\n- New feature\./);
  f.write('CHANGELOG.md', '# Changelog\n\n## Unreleased\n');
  assert.equal(f.run('build', '--docs').status, 0);
  assert.doesNotMatch(f.read('docs/changelog.md'), /^## Unreleased$/m);
  assert.match(f.read('CHANGELOG.md'), /^## Unreleased$/m);
});
