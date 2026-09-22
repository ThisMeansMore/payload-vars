import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const guard = fileURLToPath(new URL('../scripts/check-release.mjs', import.meta.url));

test('release guard permits only clean main checkouts', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'payload-vars-release-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  const check = () => spawnSync(process.execPath, [guard], { cwd, encoding: 'utf8' });
  assert.equal(check().status, 1, 'rejects directories without Git');
  git('init', '--initial-branch=main');
  git('-c', 'user.name=Release test', '-c', 'user.email=test@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'initial');
  assert.equal(check().status, 0, 'accepts clean main');
  git('switch', '-c', 'feature');
  assert.match(check().stderr, /current branch is feature/);
  assert.equal(check().status, 1);
  git('checkout', '--detach');
  assert.match(check().stderr, /detached HEAD/);
  assert.equal(check().status, 1);
  git('switch', 'main');
  writeFileSync(join(cwd, 'untracked'), 'change');
  assert.match(check().stderr, /clean working tree/);
  assert.equal(check().status, 1, 'rejects untracked files');
  git('add', 'untracked');
  assert.equal(check().status, 1, 'rejects staged changes');
  git('-c', 'user.name=Release test', '-c', 'user.email=test@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-m', 'tracked');
  assert.equal(check().status, 0);
  writeFileSync(join(cwd, 'untracked'), 'modified');
  assert.equal(check().status, 1, 'rejects unstaged changes');
});
