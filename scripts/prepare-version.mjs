import { readFileSync, writeFileSync } from 'node:fs';
import { assertClean, assertReleaseBranch, assertVersions, checkGitHubSettings, git, readJson, releaseFiles, sections, syncDocs, tagCommit, report, compactChangelog } from './lib/release.mjs';

try {
  const increment = process.argv[2];
  if (process.argv.length !== 3 || !['patch', 'minor', 'major'].includes(increment)) {
    throw new Error('Usage: npm run prepare-version -- patch|minor|major');
  }
  assertClean();
  const pkg = assertVersions();
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Preparation requires a stable major.minor.patch version. Correct the current version on a feature branch, merge it, then recreate the release branch.');
  const parts = pkg.version.split('.').map(Number);
  const index = { major: 0, minor: 1, patch: 2 }[increment];
  parts[index]++;
  for (let i = index + 1; i < 3; i++) parts[i] = 0;
  const version = parts.join('.');
  assertReleaseBranch(version);
  try { git('fetch', 'origin', 'main'); }
  catch { throw new Error('Could not fetch origin/main. Check GitHub authentication and network access, run `git fetch origin main`, then retry preparation. No release files were changed.'); }
  const baseHead = git('rev-parse', 'HEAD');
  if (baseHead !== git('rev-parse', 'FETCH_HEAD')) {
    throw new Error(`The release branch must start at current origin/main. Delete or rename this branch, run \`git switch main && git pull --ff-only\`, then recreate \`release/v${version}\`.`);
  }
  checkGitHubSettings();
  if (tagCommit(version)) throw new Error(`Tag v${version} already exists. Do not reuse or move it; verify that release, then choose the next version from updated main.`);
  const changelog = readFileSync('CHANGELOG.md', 'utf8');
  const entries = sections(changelog);
  const pending = entries.filter(entry => entry.title === 'Unreleased');
  if (pending.length > 1) throw new Error('CHANGELOG.md contains multiple Unreleased sections. Keep at most one, commit the correction on the feature branch, and merge it before preparing a release.');
  const notes = pending[0]?.body.replace(/<!--(?: reviewed | requires-review )-->/g, '').trim() || draftNotes(pkg.version);
  if (entries.some(entry => entry.title.split(' — ')[0] === version)) throw new Error(`CHANGELOG.md already has a ${version} entry. Do not prepare it again; verify the existing release or correct the changelog on a feature branch before choosing the next version.`);
  const snapshots = releaseFiles.map(path => [path, readFileSync(path)]);
  try {
    pkg.version = version;
    const lock = readJson('package-lock.json');
    lock.version = version;
    lock.packages[''].version = version;
    for (const [path, data] of [['package.json', pkg], ['package-lock.json', lock]]) writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
    const date = new Date().toISOString().slice(0, 10);
    const release = `## ${version} — ${date}\n\n<!-- requires-review -->\n\n${notes}\n\n`;
    const prepared = pending.length
      ? changelog.replace(/^## Unreleased\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/m, release)
      : insertRelease(changelog, release);
    const compact = compactChangelog(prepared, readFileSync('CHANGELOG-ARCHIVE.md', 'utf8'));
    writeFileSync('CHANGELOG.md', compact.changelog);
    writeFileSync('CHANGELOG-ARCHIVE.md', compact.archive);
    syncDocs();
  } catch (error) {
    for (const [path, data] of snapshots) writeFileSync(path, data);
    throw error;
  }
  console.log(`Prepared ${version} on release/v${version}, without committing or tagging. Review CHANGELOG.md and remove <!-- requires-review -->. Then commit and push this release branch, merge its PR, switch to updated main, and run npm run publish-version.`);
} catch (error) {
  report(error);
}

function draftNotes(previousVersion) {
  const tag = `v${previousVersion}`;
  if (!tagCommit(previousVersion)) throw new Error(`Cannot draft notes: ${tag} is missing. Fetch release tags or write notes under Unreleased.`);
  try { git('merge-base', '--is-ancestor', tag, 'HEAD'); }
  catch { throw new Error(`${tag} is not an ancestor of this release branch. Return to synchronized main and recreate the release branch before preparing.`); }
  const subjects = git('log', '--no-merges', '--reverse', '--format=%s', `${tag}..HEAD`);
  if (!subjects) throw new Error(`No commits since ${tag}. Add Unreleased notes if you intend to release again.`);
  return '### Changes\n\n' + subjects.split('\n').map(subject => `- ${subject}`).join('\n');
}

function insertRelease(changelog, release) {
  const firstSection = changelog.search(/^## /m);
  if (firstSection < 0) return `${changelog.trimEnd()}\n\n${release}`;
  return changelog.slice(0, firstSection) + release + changelog.slice(firstSection);
}
