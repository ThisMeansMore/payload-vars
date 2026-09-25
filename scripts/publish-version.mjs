import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import {
  assertMain, assertClean, assertReleaseFiles, assertVersions, assertReviewed, assertTag,
  git, run, readJson, releaseFiles, syncDocs, tagCommit, report,
} from './lib/release.mjs';

try {
  if (process.argv.length === 3 && process.argv[2] === '--check') {
    // npm's prepublishOnly hook uses the same validation without committing or publishing.
    checkRelease();
    runTests();
    checkRelease();
  } else if (process.argv.length === 2) {
    publishVersion();
  } else {
    throw new Error('Usage: npm run publish-version (choose the version during preparation).');
  }
} catch (error) {
  report(error);
  if (!process.argv.includes('--check')) console.error('After resolving the issue, rerun npm run publish-version. Do not prepare another version.');
}

function publishVersion() {
  assertMain();
  const statePath = git('rev-parse', '--git-path', 'payload-vars-release.json');
  if (!existsSync(statePath)) throw new Error('No prepared release. Run npm run prepare-version -- patch (or minor/major) first.');
  const state = readJson(statePath);
  const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
  const pkg = assertVersions();
  if (state.version !== pkg.version) throw new Error('The package version differs from the prepared release. Do not bump it again.');

  checkPreparedChanges(state, save);
  assertReviewed(state.version);
  const existingTag = tagCommit(state.version);
  if (existingTag && existingTag !== state.releaseCommit) throw new Error(`Local tag v${state.version} already belongs to another commit.`);
  syncDocs();
  if (state.releaseCommit) assertClean();
  runTests();
  checkPreparedChanges(state, save);
  assertVersions();
  assertReviewed(state.version);

  checkRemote(state);
  commitRelease(state, save);
  checkRelease();
  publishPackage(pkg);
  git('push', '--atomic', 'origin', 'HEAD:refs/heads/main', `refs/tags/v${state.version}:refs/tags/v${state.version}`);
  rmSync(statePath);
  console.log(`Released ${state.version} to npm and pushed v${state.version} to GitHub.`);
}

function runTests() {
  run('npm', ['test'], { stdio: 'inherit' });
  syncDocs({ check: true });
}

function checkRelease() {
  assertMain();
  assertClean();
  const { version } = assertVersions();
  assertReviewed(version);
  syncDocs({ check: true });
  assertTag(version);
}

function checkPreparedChanges(state, save) {
  const head = git('rev-parse', 'HEAD');
  if (head !== state.baseHead) {
    // Recover a successful commit if the process stopped before saving its ID.
    if (!state.releaseCommit && state.releaseTree === git('rev-parse', 'HEAD^{tree}') && git('rev-parse', 'HEAD^') === state.baseHead) {
      state.releaseCommit = head;
      save();
    }
    if (head !== state.releaseCommit) throw new Error('HEAD changed since preparation. Finish the prepared release from its original checkout.');
    assertClean();
    return;
  }
  assertReleaseFiles();
  for (const path of ['package.json', 'package-lock.json']) {
    const expected = JSON.parse(git('show', `${state.baseHead}:${path}`));
    expected.version = state.version;
    if (path === 'package-lock.json') expected.packages[''].version = state.version;
    if (!isDeepStrictEqual(readJson(path), expected)) throw new Error(`${path} has changes beyond the prepared version bump. Commit implementation changes before preparing a release.`);
  }
}

function checkRemote(state) {
  git('fetch', 'origin', 'main');
  try { git('merge-base', '--is-ancestor', 'FETCH_HEAD', 'HEAD'); }
  catch { throw new Error('origin/main has changes missing locally. Update main before publishing; do not publish from a divergent branch.'); }
  const tag = `refs/tags/v${state.version}`;
  const remoteTag = git('ls-remote', '--tags', 'origin', tag, `${tag}^{}`);
  if (remoteTag) {
    const lines = remoteTag.split('\n');
    const remoteCommit = (lines.find(line => line.endsWith('^{}')) ?? lines[0]).split(/\s/)[0];
    if (remoteCommit !== state.releaseCommit) throw new Error(`Remote tag v${state.version} already belongs to another commit.`);
  }
}

function commitRelease(state, save) {
  if (!state.releaseCommit) {
    git('add', '--', ...releaseFiles);
    state.releaseTree = git('write-tree');
    save();
    git('commit', '-m', `chore: release ${state.version}`);
    if (git('rev-parse', 'HEAD^{tree}') !== state.releaseTree || git('rev-parse', 'HEAD^') !== state.baseHead) throw new Error('A commit hook changed the prepared release. Inspect the commit before publishing.');
    state.releaseCommit = git('rev-parse', 'HEAD');
    save();
  }
  if (!tagCommit(state.version)) git('tag', '-a', `v${state.version}`, '-m', `v${state.version}`, state.releaseCommit);
}

function publishPackage(pkg) {
  const directory = mkdtempSync(join(tmpdir(), 'payload-vars-publish-'));
  try {
    const packs = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', directory]));
    if (packs.length !== 1 || packs[0].version !== pkg.version || !packs[0].integrity) throw new Error('Packed artifact does not match the prepared version.');
    const pack = packs[0];
    const registry = pkg.publishConfig?.registry ?? run('npm', ['config', 'get', 'registry']);
    const published = publishedArtifact(pkg, registry);
    checkRelease();
    if (published) {
      if (published.version !== pkg.version || published['dist.integrity'] !== pack.integrity) throw new Error(`npm already contains ${pkg.version} with a different artifact. Refusing to overwrite or push this release.`);
      console.log(`npm ${pkg.version} already contains this artifact; skipping publication.`);
    } else {
      run('npm', ['publish', join(directory, pack.filename), '--registry', registry], { stdio: 'inherit' });
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function publishedArtifact(pkg, registry) {
  try {
    return JSON.parse(run('npm', ['view', `${pkg.name}@${pkg.version}`, 'version', 'dist.integrity', '--json', '--registry', registry]));
  } catch (error) {
    let code;
    try { code = JSON.parse(String(error.stdout)).error?.code; } catch { /* Only E404 proves absence. */ }
    if (code !== 'E404') throw error;
    return undefined;
  }
}
