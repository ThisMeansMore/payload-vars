import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const releaseFiles = ['package.json', 'package-lock.json', 'CHANGELOG.md', 'docs/index.md', 'docs/changelog.md'];
export const run = (command, args, options = {}) => (execFileSync(command, args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options,
}) ?? '').trim();
export const git = (...args) => run('git', args);
export const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
export { syncDocs } from './docs.mjs';

export function assertMain() {
  if (git('branch', '--show-current') !== 'main') throw new Error('Releases require the main branch. Merge and switch to main first.');
}

export function assertClean() {
  if (git('status', '--porcelain', '--untracked-files=all')) throw new Error('Releases require a clean working tree. Commit your changes first.');
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
    throw new Error('package.json and package-lock.json versions do not match.');
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
      section = { title: line.slice(3), body: '', reviewed: false };
      result.push(section);
    } else if (section) {
      section.body += `${line}\n`;
      if (line.trim() === '<!-- reviewed -->') section.reviewed = true;
    }
  }
  return result;
}

export function assertReviewed(version) {
  const entries = sections(readFileSync('CHANGELOG.md', 'utf8'));
  const pending = entries.filter(entry => entry.title === 'Unreleased');
  if (pending.length !== 1 || pending[0].body.replace(/<!--[\s\S]*?-->/g, '').trim()) {
    throw new Error('CHANGELOG.md must have one empty Unreleased section. Run npm run prepare-version -- patch (or minor/major) before review.');
  }
  const releases = entries.filter(entry => entry.title.split(' — ')[0] === version);
  if (releases.length !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(releases[0].title.split(' — ')[1] ?? '') || !releases[0].reviewed) {
    throw new Error(`Review the notes for ${version} in CHANGELOG.md, then add <!-- reviewed --> on its own line in that section. Run npm run publish-version when ready.`);
  }
}

export function tagCommit(version) {
  const ref = `refs/tags/v${version}`;
  try { git('show-ref', '--verify', ref); } catch { return undefined; }
  return git('rev-parse', `${ref}^{commit}`);
}

export function assertTag(version) {
  if (tagCommit(version) !== git('rev-parse', 'HEAD')) throw new Error(`Git tag v${version} must point to the release commit. Use npm run publish-version.`);
}

export function report(error) {
  console.error(`Release blocked: ${error.message}`);
  if (error.stderr) console.error(String(error.stderr).trim());
  process.exitCode = 1;
}
