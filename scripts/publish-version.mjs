import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import {
  assertMain, assertClean, assertVersions, assertReviewed, assertTag,
  checkGitHubSettings, git, githubJson, run, readJson, releaseFiles, syncDocs, tagCommit, report,
} from './lib/release.mjs';

const pollDelay = Number(process.env.PAYLOAD_VARS_RELEASE_POLL_MS ?? 5000);

try {
  if (process.argv.length === 3 && process.argv[2] === '--check') {
    checkRelease();
    runTests();
    checkRelease();
  } else if (process.argv.length === 2) {
    await publishVersion();
  } else {
    throw new Error('Usage: npm run publish-version after the release PR has been merged into main.');
  }
} catch (error) {
  report(error);
  if (!process.argv.includes('--check')) {
    console.error('Fix the reported condition, then rerun npm run publish-version. Do not prepare another version and do not move or delete an existing release tag.');
  }
}

async function publishVersion() {
  assertMain();
  assertClean();
  const pkg = assertVersions();
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Publication requires a stable major.minor.patch version committed by the release PR.');
  assertReviewed(pkg.version);

  const commit = git('rev-parse', 'HEAD');
  checkRemoteMain(commit);
  checkGeneratedDocs(pkg.version);
  checkMergedRelease(pkg);
  const { pages } = checkGitHub(pkg.version, commit);
  const registry = pkg.publishConfig?.registry ?? run('npm', ['config', 'get', 'registry']);
  ensureNpmAccess(pkg, registry);

  runTests();
  assertClean();
  checkRemoteMain(commit);
  assertVersions();
  assertReviewed(pkg.version);
  checkGeneratedDocs(pkg.version);

  const packed = packPackage(pkg);
  try {
    const existing = publishedArtifact(pkg, registry);
    if (existing && existing['dist.integrity'] !== packed.integrity) {
      throw new Error(`npm already contains ${pkg.version} with a different artifact. Do not move the tag or republish; investigate the registry artifact.`);
    }

    pushTag(pkg.version, commit);

    if (existing) {
      console.log(`npm ${pkg.version} already contains this artifact; skipping publication.`);
    } else {
      try {
        run('npm', ['publish', packed.path, '--registry', registry], { stdio: 'inherit' });
      } catch (error) {
        const recovered = await waitForPublishedArtifact(pkg, registry, packed.integrity, 12, false);
        if (!recovered) throw error;
      }
      await waitForPublishedArtifact(pkg, registry, packed.integrity, 60, true);
    }

    await deployPages(pages, commit);
  } finally {
    rmSync(packed.directory, { recursive: true, force: true });
  }
  console.log(`Released ${pkg.version}: the merged main commit is tagged, npm integrity matches, and Pages is deployed.`);
}

function runTests() {
  run('npm', ['test'], { stdio: 'inherit' });
  checkGeneratedDocs(readJson('package.json').version);
}

function checkRelease() {
  assertMain();
  assertClean();
  const { version } = assertVersions();
  assertReviewed(version);
  checkGeneratedDocs(version);
  assertTag(version);
}

function checkRemoteMain(commit) {
  try { git('fetch', 'origin', 'main'); }
  catch { throw new Error('Could not fetch origin/main. Check GitHub authentication and network access, run `git fetch origin main`, then retry publication. No tag or npm package was created.'); }
  const remote = git('rev-parse', 'FETCH_HEAD');
  if (remote !== commit) {
    throw new Error('Local main is not exactly origin/main. Run `git switch main && git pull --ff-only`; if that cannot fast-forward, preserve your work on a feature branch and restore main before publishing.');
  }
}

function checkMergedRelease(pkg) {
  let base;
  try { base = git('rev-parse', 'HEAD^1'); }
  catch { throw new Error('The release PR commit has no parent. Merge a prepared release PR into main before publishing.'); }
  const previous = JSON.parse(git('show', `${base}:package.json`));
  if (previous.version === pkg.version || compareVersions(previous.version, pkg.version) >= 0) {
    throw new Error(`HEAD does not look like a new ${pkg.version} release PR. Prepare the next version on release/v${pkg.version}, merge that PR, then publish from updated main.`);
  }
  const changed = git('diff', '--name-only', `${base}..HEAD`).split('\n').filter(Boolean);
  const unexpected = changed.filter(path => !releaseFiles.includes(path));
  if (unexpected.length) {
    throw new Error(`Changes after the release was prepared are present in ${unexpected.join(', ')}. Prepare and merge a fresh release PR from the latest main before publishing.`);
  }
  for (const path of ['package.json', 'package-lock.json']) {
    const expected = JSON.parse(git('show', `${base}:${path}`));
    expected.version = pkg.version;
    if (path === 'package-lock.json') expected.packages[''].version = pkg.version;
    if (!isDeepStrictEqual(readJson(path), expected)) {
      throw new Error(`${path} contains changes beyond the release version. Fix them on a feature branch, merge it, then prepare a new release branch.`);
    }
  }
}

function compareVersions(left, right) {
  if (!/^\d+\.\d+\.\d+$/.test(left) || !/^\d+\.\d+\.\d+$/.test(right)) return 0;
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}

function checkGitHub(version, commit) {
  const { endpoint, pages } = checkGitHubSettings();
  const pulls = ghJson(['api', `${endpoint}/commits/${commit}/pulls`], 'GitHub CLI could not verify the release PR for HEAD. Check `gh auth status` and repository access, then retry.');
  if (!pulls.some(pull => pull.merged_at && pull.base?.ref === 'main' && pull.head?.ref === `release/v${version}`)) {
    throw new Error(`HEAD is not associated with a merged release/v${version} pull request. Prepare that release branch, merge its PR, switch to updated main, then retry.`);
  }
  return { pages };
}

function ghJson(args, message) {
  return githubJson(args, message);
}

function ensureNpmAccess(pkg, registry) {
  if (hasNpmAccess(pkg, registry)) return;
  console.log(`npm write access is unavailable. Starting \`npm login --registry ${registry}\` before any tag or publication.`);
  try { run('npm', ['login', '--registry', registry], { stdio: 'inherit' }); }
  catch { throw new Error(`npm login failed. Run \`npm login --registry ${registry}\` manually, confirm the account owns ${pkg.name}, then retry publication.`); }
  if (!hasNpmAccess(pkg, registry)) {
    throw new Error(`The authenticated npm account does not have read-write access to ${pkg.name}. Log in with its owner using \`npm login --registry ${registry}\`, then retry.`);
  }
}

function hasNpmAccess(pkg, registry) {
  let username;
  try {
    username = run('npm', ['whoami', '--registry', registry]);
  } catch (cause) {
    if (isNetworkFailure(cause)) throw npmNetworkError(registry, cause);
    return false;
  }
  let response;
  try {
    response = run('npm', ['access', 'list', 'packages', username, pkg.name, '--json', '--registry', registry]);
  } catch (cause) {
    if (isNetworkFailure(cause)) throw npmNetworkError(registry, cause);
    return false;
  }
  try { return JSON.parse(response)?.[pkg.name] === 'read-write'; }
  catch { throw new Error(`npm returned an unreadable access response for ${pkg.name}. Run \`npm access list packages ${username} ${pkg.name} --json --registry ${registry}\`, resolve the npm CLI or registry problem, then retry.`); }
}

function isNetworkFailure(error) {
  return /EAI_AGAIN|ENOTFOUND|ECONN(?:REFUSED|RESET)|ETIMEDOUT|network/i.test(`${error?.message ?? ''}\n${error?.stdout ?? ''}\n${error?.stderr ?? ''}`);
}

function npmNetworkError(registry, cause) {
  const error = new Error(`npm could not reach ${registry}. Check the registry URL, network, proxy, and npm status, then rerun publication; npm login was not started and no tag was created.`);
  error.stderr = cause.stderr || cause.stdout;
  return error;
}

function checkGeneratedDocs(version) {
  try { syncDocs({ check: true }); }
  catch (cause) {
    const error = new Error(`Generated docs are stale for ${version}. Return to release/v${version}, run \`npm run docs:sync\`, commit the generated files, and merge the corrected release PR. Do not edit or commit directly on main.`);
    error.stderr = cause.message;
    throw error;
  }
}

function packPackage(pkg) {
  const directory = mkdtempSync(join(tmpdir(), 'payload-vars-publish-'));
  try {
    const result = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', directory]));
    const packs = Array.isArray(result) ? result : Object.values(result ?? {});
    if (packs.length !== 1 || packs[0]?.name !== pkg.name || packs[0]?.version !== pkg.version
      || !packs[0]?.integrity || !packs[0]?.filename) throw new Error('Packed artifact does not match the merged release version. Fix packaging on a feature branch and prepare a new release PR.');
    return { directory, integrity: packs[0].integrity, path: join(directory, packs[0].filename) };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function pushTag(version, commit) {
  const local = tagCommit(version);
  if (local && local !== commit) throw new Error(`Local tag v${version} points elsewhere. Do not move it; inspect the conflicting release before continuing.`);
  if (!local) git('tag', '-a', `v${version}`, '-m', `v${version}`, commit);
  const ref = `refs/tags/v${version}`;
  const remoteTag = git('ls-remote', '--tags', 'origin', ref, `${ref}^{}`);
  if (remoteTag) {
    const lines = remoteTag.split('\n');
    const remoteCommit = (lines.find(line => line.endsWith('^{}')) ?? lines[0]).split(/\s/)[0];
    if (remoteCommit !== commit) throw new Error(`Remote tag v${version} points elsewhere. Do not move or delete it; inspect the conflicting release.`);
    return;
  }
  try { git('push', 'origin', `${ref}:${ref}`); }
  catch (cause) {
    const error = new Error(`Could not push v${version}. Fix GitHub authentication or tag permissions, then rerun publication; npm has not been published by this attempt.`);
    error.stderr = cause.stderr;
    throw error;
  }
}

function publishedArtifact(pkg, registry) {
  try {
    const result = JSON.parse(run('npm', ['view', `${pkg.name}@${pkg.version}`, 'version', 'dist.integrity', '--json', '--registry', registry]));
    const versions = Array.isArray(result) ? result : [result];
    if (versions.length !== 1 || versions[0]?.version !== pkg.version || !versions[0]?.['dist.integrity']) {
      throw new Error('npm registry metadata is malformed. Do not publish again until the registry returns one version and integrity value.');
    }
    return versions[0];
  } catch (error) {
    let code;
    try { code = JSON.parse(String(error.stdout)).error?.code; } catch { /* Only E404 proves absence. */ }
    if (code !== 'E404') throw error;
    return undefined;
  }
}

async function waitForPublishedArtifact(pkg, registry, integrity, attempts, required) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const published = publishedArtifact(pkg, registry);
    if (published) {
      if (published['dist.integrity'] !== integrity) throw new Error(`npm ${pkg.version} appeared with different contents. Do not move the Git tag or publish again.`);
      return published;
    }
    if (attempt + 1 < attempts) await delay(pollDelay);
  }
  if (required) throw new Error(`npm accepted ${pkg.version}, but its metadata is not visible yet. Wait for registry propagation, then rerun npm run publish-version; it will verify and skip the existing artifact.`);
  return undefined;
}

async function deployPages(endpoint, commit) {
  let requested = false;
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const build = ghJson(['api', `${endpoint}/builds/latest`], 'GitHub CLI could not read the latest Pages build. Check GitHub/Pages availability, then rerun publication; the existing tag and npm artifact will be reused.');
    if (build.commit === commit) {
      if (build.status === 'built') return;
      if (build.status === 'errored' || build.error?.message) {
        throw new Error(`GitHub Pages failed for ${commit.slice(0, 7)}: ${build.error?.message || build.status}. Fix Pages, then rerun publication; the matching tag and npm artifact will be reused.`);
      }
    } else if (!requested) {
      try { run('gh', ['api', '--method', 'POST', `${endpoint}/builds`]); }
      catch (cause) {
        const error = new Error('GitHub Pages did not start for the merged release commit. Check Pages permissions/configuration, then rerun publication; do not prepare another version.');
        error.stderr = cause.stderr;
        throw error;
      }
      requested = true;
    }
    console.log(`Waiting for GitHub Pages to deploy ${commit.slice(0, 7)}…`);
    await delay(pollDelay);
  }
  throw new Error(`Timed out waiting for Pages to deploy ${commit}. Fix or wait for Pages, then rerun publication; do not prepare another version.`);
}
