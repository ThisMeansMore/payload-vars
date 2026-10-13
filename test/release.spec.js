import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'payload-vars-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = join(root, 'repo');
  const remote = join(root, 'remote.git');
  const bin = join(root, 'bin');
  mkdirSync(cwd);
  mkdirSync(bin);
  mkdirSync(join(cwd, 'scripts/lib'), { recursive: true });
  mkdirSync(join(cwd, 'docs/_includes'), { recursive: true });
  for (const file of ['lib/release.mjs', 'lib/docs.mjs', 'prepare-version.mjs', 'publish-version.mjs', 'build.mjs']) {
    copyFileSync(new URL(`../scripts/${file}`, import.meta.url), join(cwd, 'scripts', file));
  }
  const write = (file, content) => writeFileSync(join(cwd, file), content);
  const read = file => readFileSync(join(cwd, file), 'utf8');
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  const flag = name => writeFileSync(join(root, name), 'yes');
  const unflag = name => rmSync(join(root, name), { force: true });

  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Release test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  write('package.json', JSON.stringify({ name: 'release-fixture', version: '1.2.3', type: 'module' }, null, 2) + '\n');
  write('package-lock.json', JSON.stringify({ version: '1.2.3', packages: { '': { version: '1.2.3' } } }, null, 2) + '\n');
  write('README.md', '# payload-vars\n\nDocumentation.\n');
  write('docs/_includes/home-footer.md', '[Changelog](changelog.md)\n');
  write('CHANGELOG.md', '# Changelog\n\n## Unreleased\n\n- New feature.\n\n## 1.2.3 — 2026-09-25\n\n- Previous release.\n');
  write('CHANGELOG-ARCHIVE.md', '# Changelog archive\n\n[Recent releases](CHANGELOG.md)\n');
  execFileSync(process.execPath, ['scripts/build.mjs', '--docs'], { cwd });
  git('add', '.');
  git('commit', '-m', 'initial');
  git('tag', 'v1.2.3');
  execFileSync('git', ['init', '--bare', remote], { stdio: 'pipe' });
  git('remote', 'add', 'origin', remote);
  git('push', 'origin', 'main', '--tags');

  const realGit = execFileSync('command', ['-v', 'git'], { encoding: 'utf8', shell: true }).trim();
  writeFileSync(join(bin, 'git'), `#!/usr/bin/env node
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const root = process.env.RELEASE_TEST_ROOT;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(root, 'calls'), 'git ' + args.join(' ') + '\\n');
const result = cp.spawnSync(${JSON.stringify(realGit)}, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`, { mode: 0o755 });

  writeFileSync(join(bin, 'npm'), `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.env.RELEASE_TEST_ROOT;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(root, 'calls'), 'npm ' + args.join(' ') + '\\n');
const pkg = JSON.parse(fs.readFileSync('package.json'));
const has = name => fs.existsSync(path.join(root, name));
if (args[0] === 'test') {
  if (has('fail-test')) process.exit(1);
} else if (args[0] === 'config') {
  console.log('https://registry.example.invalid/');
} else if (args[0] === 'whoami') {
  if (has('npm-network')) { console.error('EAI_AGAIN registry unavailable'); process.exit(1); }
  if (has('unauthenticated')) process.exit(1);
  console.log('release-owner');
} else if (args[0] === 'login') {
  if (has('login-fails')) process.exit(1);
  fs.rmSync(path.join(root, 'unauthenticated'), { force: true });
  if (!has('login-keeps-access')) fs.rmSync(path.join(root, 'access-denied'), { force: true });
} else if (args[0] === 'access') {
  console.log(JSON.stringify({ [pkg.name]: has('access-denied') ? 'read-only' : 'read-write' }));
} else if (args[0] === 'pack') {
  const files = ['package.json', 'package-lock.json', 'CHANGELOG.md', 'CHANGELOG-ARCHIVE.md', 'docs/index.md', 'docs/changelog.md', 'docs/changelog-archive.md'];
  const contents = files.map(file => fs.readFileSync(file, 'utf8')).join('');
  const integrity = 'sha512-' + crypto.createHash('sha512').update(contents).digest('base64');
  const packed = { name: pkg.name, version: pkg.version, integrity, filename: 'fixture.tgz' };
  if (has('wrong-pack-version')) packed.version = '0.0.0';
  fs.writeFileSync(path.join(args[args.indexOf('--pack-destination') + 1], packed.filename), JSON.stringify(packed));
  console.log(JSON.stringify(has('npm12-pack') ? { [pkg.name]: packed } : [packed]));
} else if (args[0] === 'view') {
  if (has('network-error')) { console.log(JSON.stringify({ error: { code: 'EAI_AGAIN' } })); process.exit(1); }
  if (!has('published')) { console.log(JSON.stringify({ error: { code: 'E404' } })); process.exit(1); }
  if (has('delayed-view')) {
    const counter = path.join(root, 'view-count');
    const count = fs.existsSync(counter) ? Number(fs.readFileSync(counter)) : 0;
    fs.writeFileSync(counter, String(count + 1));
    if (count < 2) { console.log(JSON.stringify({ error: { code: 'E404' } })); process.exit(1); }
  }
  const published = JSON.parse(fs.readFileSync(path.join(root, 'published'), 'utf8'));
  console.log(JSON.stringify(has('npm12-pack') ? [published] : published));
} else if (args[0] === 'publish') {
  if (has('fail-publish')) process.exit(1);
  const pack = JSON.parse(fs.readFileSync(args[1]));
  fs.writeFileSync(path.join(root, 'published'), JSON.stringify({ version: pack.version, 'dist.integrity': pack.integrity }));
} else { process.exit(2); }
`, { mode: 0o755 });

  writeFileSync(join(bin, 'gh'), `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = process.env.RELEASE_TEST_ROOT;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(root, 'calls'), 'gh ' + args.join(' ') + '\\n');
const has = name => fs.existsSync(path.join(root, name));
if (has('gh-unavailable')) process.exit(1);
if (args[0] === 'repo') {
  console.log(JSON.stringify({ nameWithOwner: 'fixture/repo', viewerPermission: has('not-admin') ? 'WRITE' : 'ADMIN' }));
} else if (args[1].endsWith('/branches/main/protection')) {
  console.log(JSON.stringify({
    required_pull_request_reviews: has('no-pr-rule') ? null : { required_approving_review_count: has('approval-required') ? 1 : 0 },
    enforce_admins: { enabled: !has('admin-bypass') }
  }));
} else if (args[1].includes('/commits/') && args[1].endsWith('/pulls')) {
  const version = JSON.parse(fs.readFileSync('package.json')).version;
  console.log(JSON.stringify(has('wrong-pr') ? [] : [{ merged_at: '2026-10-13T00:00:00Z', base: { ref: 'main' }, head: { ref: 'release/v' + version } }]));
} else if (args[1].endsWith('/pages/builds/latest')) {
  const commit = cp.execFileSync('git', ['rev-parse', has('old-pages') ? 'HEAD^' : 'HEAD'], { encoding: 'utf8' }).trim();
  const failed = has('pages-fails');
  console.log(JSON.stringify({ commit, status: failed ? 'errored' : 'built', error: { message: failed ? 'build failed' : null } }));
} else if (args.includes('POST')) {
  fs.rmSync(path.join(root, 'old-pages'), { force: true });
  console.log(JSON.stringify({ status: 'queued' }));
} else {
  console.log(JSON.stringify({ build_type: 'legacy', source: { branch: 'main', path: '/docs' } }));
}
`, { mode: 0o755 });

  const env = { ...process.env, PATH: bin + delimiter + process.env.PATH, RELEASE_TEST_ROOT: root, PAYLOAD_VARS_RELEASE_POLL_MS: '1' };
  const run = (script, ...args) => spawnSync(process.execPath, [`scripts/${script}.mjs`, ...args], { cwd, env, encoding: 'utf8' });
  const review = () => write('CHANGELOG.md', read('CHANGELOG.md').replace('<!-- requires-review -->', ''));
  const prepare = (increment = 'patch', version = '1.2.4') => {
    git('switch', '-c', `release/v${version}`);
    const result = run('prepare-version', increment);
    assert.equal(result.status, 0, result.stderr);
    return result;
  };
  const mergeRelease = (version = '1.2.4') => {
    review();
    git('add', '.');
    git('commit', '-m', `chore: release ${version}`);
    git('push', '-u', 'origin', `release/v${version}`);
    git('switch', 'main');
    git('merge', '--ff-only', `release/v${version}`);
    git('push', 'origin', 'main');
  };
  const prepareAndMerge = () => { prepare(); mergeRelease(); };
  const calls = () => existsSync(join(root, 'calls')) ? readFileSync(join(root, 'calls'), 'utf8').trim().split('\n') : [];
  return { root, cwd, remote, env, git, write, read, run, review, prepare, mergeRelease, prepareAndMerge, flag, unflag, calls };
}

test('preparation requires the exact release branch and explains the next step', t => {
  const f = fixture(t);
  const main = f.run('prepare-version', 'patch');
  assert.equal(main.status, 1);
  assert.match(main.stderr, /git switch -c release\/v1\.2\.4/);
  assert.equal(JSON.parse(f.read('package.json')).version, '1.2.3');
  f.git('switch', '-c', 'feature');
  assert.match(f.run('prepare-version', 'patch').stderr, /release\/v1\.2\.4/);
  assert.equal(f.git('status', '--porcelain'), '');
});

test('preparation requires a clean release branch at current origin/main', t => {
  const f = fixture(t);
  f.git('switch', '-c', 'release/v1.2.4');
  f.write('dirty', 'work');
  assert.match(f.run('prepare-version', 'patch').stderr, /working tree must be clean/);
  rmSync(join(f.cwd, 'dirty'));
  f.write('README.md', '# changed\n');
  f.git('add', '.'); f.git('commit', '-m', 'ahead');
  assert.match(f.run('prepare-version', 'patch').stderr, /must start at current origin\/main/);
  assert.equal(JSON.parse(f.read('package.json')).version, '1.2.3');
});

test('preparation checks PR-only main and Pages settings before changing release files', t => {
  for (const [flag, message] of [['admin-bypass', /administrator bypass/], ['no-pr-rule', /must require pull requests/], ['approval-required', /requires approving reviews/]]) {
    const f = fixture(t);
    f.git('switch', '-c', 'release/v1.2.4');
    f.flag(flag);
    const result = f.run('prepare-version', 'patch');
    assert.match(result.stderr, message);
    assert.equal(JSON.parse(f.read('package.json')).version, '1.2.3');
    assert.equal(f.git('status', '--porcelain'), '');
  }
});

test('preparation moves notes, removes Unreleased, generates docs and never commits or tags', t => {
  const f = fixture(t);
  const head = f.git('rev-parse', 'HEAD');
  const result = f.prepare();
  assert.match(result.stdout, /merge its PR/);
  assert.equal(JSON.parse(f.read('package.json')).version, '1.2.4');
  assert.doesNotMatch(f.read('CHANGELOG.md'), /^## Unreleased$/m);
  assert.match(f.read('CHANGELOG.md'), /^## 1\.2\.4 — /m);
  assert.match(f.read('CHANGELOG.md'), /<!-- requires-review -->/);
  assert.doesNotMatch(f.read('docs/changelog.md'), /requires-review/);
  assert.equal(f.git('rev-parse', 'HEAD'), head);
  assert.equal(f.git('tag', '--list', 'v1.2.4'), '');
});

test('preparation works without an Unreleased heading by drafting merged commit subjects', t => {
  const f = fixture(t);
  f.write('CHANGELOG.md', f.read('CHANGELOG.md').replace('## Unreleased\n\n- New feature.\n\n', ''));
  f.git('add', '.'); f.git('commit', '-m', 'docs: useful change'); f.git('push', 'origin', 'main');
  f.prepare();
  assert.match(f.read('CHANGELOG.md'), /### Changes\n\n- docs: useful change/);
});

test('publication requires clean synchronized main after the release PR', t => {
  const f = fixture(t);
  f.prepare(); f.review();
  assert.match(f.run('publish-version').stderr, /only on main after the release PR/);
  f.mergeRelease();
  f.write('dirty', 'work');
  assert.match(f.run('publish-version').stderr, /working tree must be clean/);
  rmSync(join(f.cwd, 'dirty'));
  f.write('README.md', '# later\n'); f.git('add', '.'); f.git('commit', '-m', 'local main commit');
  assert.match(f.run('publish-version').stderr, /not exactly origin\/main/);
  assert.equal(existsSync(join(f.root, 'published')), false);
});

test('publication tags merged main, never pushes main, then publishes and verifies Pages', t => {
  const f = fixture(t);
  f.prepareAndMerge();
  const callCount = f.calls().length;
  const result = f.run('publish-version');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Released 1\.2\.4/);
  assert.equal(f.git('rev-parse', 'v1.2.4^{commit}'), f.git('rev-parse', 'HEAD'));
  assert.match(f.git('ls-remote', 'origin', 'refs/tags/v1.2.4^{}'), new RegExp(f.git('rev-parse', 'HEAD')));
  const calls = f.calls().slice(callCount);
  assert.deepEqual(calls.filter(call => call.startsWith('git push ')), ['git push origin refs/tags/v1.2.4:refs/tags/v1.2.4']);
  assert.equal(calls.some(call => call.startsWith('git add ') || call.startsWith('git commit ')), false);
  assert.ok(calls.findIndex(call => call.includes('git push origin refs/tags/v1.2.4')) < calls.findIndex(call => call.startsWith('npm publish ')));
});

test('publication works from a fresh checkout without hidden release state', t => {
  const f = fixture(t);
  f.prepareAndMerge();
  const fresh = join(f.root, 'fresh');
  execFileSync('git', ['clone', '--branch', 'main', f.remote, fresh], { stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'Release test'], { cwd: fresh });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: fresh });
  execFileSync('git', ['config', 'tag.gpgsign', 'false'], { cwd: fresh });
  const result = spawnSync(process.execPath, ['scripts/publish-version.mjs'], { cwd: fresh, env: f.env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(fresh, '.git/payload-vars-release.json')), false);
});

test('GitHub PR protection and release-PR association are checked before tags or npm', t => {
  for (const [flag, message] of [['admin-bypass', /administrator bypass/], ['no-pr-rule', /must require pull requests/], ['approval-required', /requires approving reviews/], ['wrong-pr', /not associated with a merged/]]) {
    const f = fixture(t);
    f.prepareAndMerge(); f.flag(flag);
    assert.match(f.run('publish-version').stderr, message);
    assert.equal(f.git('tag', '--list', 'v1.2.4'), '');
    assert.equal(existsSync(join(f.root, 'published')), false);
  }
});

test('missing npm access starts login before tagging and rechecks access', t => {
  const f = fixture(t);
  f.prepareAndMerge(); f.flag('unauthenticated');
  const result = f.run('publish-version');
  assert.equal(result.status, 0, result.stderr);
  const calls = f.calls();
  assert.ok(calls.some(call => call.startsWith('npm login --registry')));
  assert.ok(calls.findIndex(call => call.startsWith('npm login ')) < calls.findIndex(call => call.includes('git tag -a v1.2.4')));
});

test('failed npm login stops before tag creation and gives a corrective command', t => {
  const f = fixture(t);
  f.prepareAndMerge(); f.flag('unauthenticated'); f.flag('login-fails');
  const result = f.run('publish-version');
  assert.match(result.stderr, /npm login --registry/);
  assert.equal(f.git('tag', '--list', 'v1.2.4'), '');
  assert.equal(existsSync(join(f.root, 'published')), false);
});

test('read-only npm access starts login before tagging', t => {
  const f = fixture(t);
  f.prepareAndMerge(); f.flag('access-denied');
  const result = f.run('publish-version');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(f.calls().some(call => call.startsWith('npm login --registry')));
});

test('npm access still denied after login stops before tagging with the next step', t => {
  const f = fixture(t);
  f.prepareAndMerge(); f.flag('access-denied'); f.flag('login-keeps-access');
  const result = f.run('publish-version');
  assert.match(result.stderr, /does not have read-write access/);
  assert.match(result.stderr, /npm login --registry/);
  assert.equal(f.git('tag', '--list', 'v1.2.4'), '');
});

test('npm network failure does not start login or create a tag', t => {
  const f = fixture(t);
  f.prepareAndMerge(); f.flag('npm-network');
  const result = f.run('publish-version');
  assert.match(result.stderr, /could not reach/);
  assert.equal(f.calls().some(call => call.startsWith('npm login ')), false);
  assert.equal(f.git('tag', '--list', 'v1.2.4'), '');
});

test('tag push failure stops before npm and explains the safe retry', t => {
  const f = fixture(t);
  f.prepareAndMerge();
  const hook = join(f.remote, 'hooks/pre-receive');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const failed = f.run('publish-version');
  assert.match(failed.stderr, /Fix GitHub authentication or tag permissions/);
  assert.equal(existsSync(join(f.root, 'published')), false);
  rmSync(hook);
  const retry = f.run('publish-version');
  assert.equal(retry.status, 0, retry.stderr);
});

test('npm metadata propagation is polled without publishing twice', t => {
  const f = fixture(t);
  f.prepareAndMerge(); f.flag('delayed-view');
  const result = f.run('publish-version');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.calls().filter(call => call.startsWith('npm publish ')).length, 1);
});

test('npm failure after tag is safely retryable without moving the tag', t => {
  const f = fixture(t);
  f.prepareAndMerge(); f.flag('fail-publish');
  assert.equal(f.run('publish-version').status, 1);
  const tag = f.git('rev-parse', 'v1.2.4^{commit}');
  f.unflag('fail-publish');
  const retry = f.run('publish-version');
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(f.git('rev-parse', 'v1.2.4^{commit}'), tag);
});

test('matching npm artifacts are reused and mismatched artifacts stop permanently', t => {
  const matching = fixture(t);
  matching.prepareAndMerge();
  assert.equal(matching.run('publish-version').status, 0);
  const retry = matching.run('publish-version');
  assert.equal(retry.status, 0, retry.stderr);
  assert.match(retry.stdout, /skipping publication/);
  assert.equal(matching.calls().filter(call => call.startsWith('npm publish ')).length, 1);

  const mismatch = fixture(t);
  mismatch.prepareAndMerge();
  writeFileSync(join(mismatch.root, 'published'), JSON.stringify({ version: '1.2.4', 'dist.integrity': 'different' }));
  assert.match(mismatch.run('publish-version').stderr, /different artifact/);
  assert.equal(mismatch.git('tag', '--list', 'v1.2.4'), '');
});

test('Pages failure after npm remains retryable without republishing', t => {
  const f = fixture(t);
  f.prepareAndMerge(); f.flag('pages-fails');
  assert.match(f.run('publish-version').stderr, /Pages failed/);
  f.unflag('pages-fails');
  const retry = f.run('publish-version');
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(f.calls().filter(call => call.startsWith('npm publish ')).length, 1);
});

test('an old Pages deployment is rebuilt for the release commit', t => {
  const f = fixture(t);
  f.prepareAndMerge(); f.flag('old-pages');
  const result = f.run('publish-version');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.calls().filter(call => call.includes('gh api --method POST') && call.endsWith('/pages/builds')).length, 1);
});

test('the direct npm publish guard requires clean main, reviewed notes and a matching tag', t => {
  const f = fixture(t);
  f.prepareAndMerge();
  assert.match(f.run('publish-version', '--check').stderr, /tag v1\.2\.4 must point/);
  f.git('tag', 'v1.2.4');
  assert.equal(f.run('publish-version', '--check').status, 0);
  f.git('switch', '-c', 'feature');
  assert.match(f.run('publish-version', '--check').stderr, /only on main/);
});
