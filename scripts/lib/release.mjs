import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const releaseFiles = ['package.json', 'package-lock.json', 'CHANGELOG.md', 'CHANGELOG-ARCHIVE.md',
  'docs/index.md', 'docs/changelog.md', 'docs/changelog-archive.md'];
export const run = (command, args, options = {}) => (execFileSync(command, args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options,
}) ?? '').trim();
export const git = (...args) => run('git', args);
export const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
export { syncDocs } from './docs.mjs';

export function assertMain() {
  if (git('branch', '--show-current') !== 'main') {
    throw new Error('Publication runs only on main after the release PR is merged. Switch with `git switch main`, then run `git pull --ff-only`.');
  }
}

export function assertClean() {
  if (git('status', '--porcelain', '--untracked-files=all')) {
    throw new Error('The working tree must be clean. Commit feature work through its PR; on a release branch, preserve or revert unfinished edits before retrying. Never commit directly to main.');
  }
}

export function assertReleaseBranch(version) {
  const expected = `release/v${version}`;
  const branch = git('branch', '--show-current');
  if (branch !== expected) {
    throw new Error(`Version ${version} must be prepared on ${expected}, not ${branch || 'a detached HEAD'}. From updated main run \`git switch -c ${expected}\`, then rerun preparation.`);
  }
}

export function checkGitHubSettings() {
  const origin = git('remote', 'get-url', 'origin');
  const repository = githubJson(
    ['repo', 'view', origin, '--json', 'nameWithOwner,viewerPermission'],
    'GitHub CLI could not inspect the origin repository. Run `gh auth login`, confirm repository access, then retry.',
  );
  if (repository.viewerPermission !== 'ADMIN') {
    throw new Error(`GitHub CLI lacks admin access to ${repository.nameWithOwner}. Run \`gh auth login\` with the repository owner account, then retry.`);
  }
  const endpoint = `repos/${repository.nameWithOwner}`;
  const protection = githubJson(
    ['api', `${endpoint}/branches/main/protection`],
    'GitHub CLI could not inspect main protection. Confirm `gh auth status` has repository administration access, then retry.',
  );
  if (!protection.required_pull_request_reviews) {
    throw new Error('GitHub main must require pull requests. Enable “Require a pull request before merging” in branch protection, then retry.');
  }
  if (protection.required_pull_request_reviews.required_approving_review_count !== 0) {
    throw new Error('GitHub main currently requires approving reviews. For this single-maintainer repository set required approvals to 0, then retry.');
  }
  if (!protection.enforce_admins?.enabled) {
    throw new Error('GitHub main still allows administrator bypass. Enable “Do not allow bypassing the above settings” so every main change, including releases, goes through a PR.');
  }
  const pages = `${endpoint}/pages`;
  const site = githubJson(
    ['api', pages],
    'GitHub CLI could not inspect Pages. Confirm Pages is enabled and `gh auth status` can access the repository, then retry.',
  );
  if (site.build_type !== 'legacy' || site.source?.branch !== 'main' || site.source?.path !== '/docs') {
    throw new Error('GitHub Pages must deploy from main /docs. Correct Pages settings, then retry before preparing or publishing a release.');
  }
  return { endpoint, pages };
}

export function githubJson(args, message) {
  try { return JSON.parse(run('gh', args)); }
  catch (cause) {
    const error = new Error(message);
    error.stderr = cause.stderr;
    throw error;
  }
}

export function assertReleaseFiles() {
  const changed = new Set([
    ...git('diff', '--name-only', 'HEAD').split('\n'),
    ...git('ls-files', '--others', '--exclude-standard').split('\n'),
  ].filter(Boolean));
  const unexpected = [...changed].filter(path => !releaseFiles.includes(path));
  if (unexpected.length) throw new Error(`Unrelated changes found: ${unexpected.join(', ')}. Commit these separately before releasing.`);
}

export function assertVersions() {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  if (pkg.version !== lock.version || pkg.version !== lock.packages?.['']?.version) {
    throw new Error('package.json and package-lock.json versions do not match. Restore or correct both files on the current feature/release branch, commit that fix through its PR, then retry.');
  }
  return pkg;
}

export function sections(markdown) {
  // Ignore headings and review markers inside fenced examples.
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let fence;
  let section;
  const result = [];
  for (const line of lines) {
    const delimiter = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (delimiter?.[0] === fence[0] && delimiter.length >= fence.length) fence = undefined;
      if (section) section.body += `${line}\n`;
      continue;
    }
    if (delimiter) { fence = delimiter; if (section) section.body += `${line}\n`; continue; }
    if (line.startsWith('## ')) {
      section = { title: line.slice(3), body: '' };
      result.push(section);
    } else if (section) {
      section.body += `${line}\n`;
    }
  }
  return result;
}

export function compactChangelog(changelog, archive) {
  const isRelease = entry => /^\d+\.\d+\.\d+ — \d{4}-\d{2}-\d{2}$/.test(entry.title);
  const entries = sections(changelog);
  const overflow = entries.filter(isRelease).slice(5);
  if (!overflow.length) return { changelog, archive };
  const archived = [...overflow, ...sections(archive).filter(isRelease)];
  const titles = new Set();
  for (const entry of archived) {
    if (titles.has(entry.title)) throw new Error(`Duplicate archived release: ${entry.title}`);
    titles.add(entry.title);
  }
  const format = entry => `## ${entry.title}\n\n${entry.body.trim() ? entry.body.trim() + '\n\n' : ''}`;
  const summaries = archived.map(entry => {
    const anchor = entry.title.replace(/[^\w -]/g, '').replaceAll(' ', '-');
    const summary = entry.body.match(/^- (.+)$/m)?.[1] ?? 'Full release notes.';
    return `- [${entry.title}](CHANGELOG-ARCHIVE.md#${anchor}) — ${summary}`;
  }).join('\n');
  const retained = entries.filter(entry => entry.title !== 'Older releases' && !overflow.includes(entry));
  return {
    changelog: changelog.slice(0, changelog.indexOf('\n## ') + 1)
      + retained.map(format).join('') + `## Older releases\n\n${summaries}\n`,
    archive: archive.slice(0, archive.indexOf('\n## ') < 0 ? archive.length : archive.indexOf('\n## ') + 1).trimEnd()
      + '\n\n' + archived.map(format).join('').trimEnd() + '\n',
  };
}

export function assertReviewed(version) {
  const changelog = readFileSync('CHANGELOG.md', 'utf8');
  const entries = sections(changelog);
  const pending = entries.filter(entry => entry.title === 'Unreleased');
  if (pending.length) {
    throw new Error('The prepared changelog must not contain an Unreleased section. Prepare the version on its release branch so those notes move into the numbered release.');
  }
  const releases = entries.filter(entry => entry.title.split(' — ')[0] === version);
  if (releases.length !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(releases[0].title.split(' — ')[1] ?? '') || /<!--\s*requires-review\s*-->/.test(changelog) || !releases[0].body.replace(/<!--[\s\S]*?-->/g, '').trim()) {
    throw new Error(`Review the ${version} notes on the release branch and remove <!-- requires-review -->. Commit them, merge the release PR, switch to updated main, then publish.`);
  }
}

export function tagCommit(version) {
  const ref = `refs/tags/v${version}`;
  try { git('show-ref', '--verify', ref); } catch { return undefined; }
  return git('rev-parse', `${ref}^{commit}`);
}

export function assertTag(version) {
  if (tagCommit(version) !== git('rev-parse', 'HEAD')) throw new Error(`Git tag v${version} must point to this merged release commit. Run npm run publish-version; do not create or move the tag manually.`);
}

export function report(error) {
  console.error(`Release blocked: ${error.message}`);
  if (error.stderr) console.error(String(error.stderr).trim());
  process.exitCode = 1;
}
