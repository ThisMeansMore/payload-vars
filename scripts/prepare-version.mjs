import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { assertMain, assertClean, assertVersions, git, readJson, releaseFiles, sections, syncDocs, tagCommit, report } from './lib/release.mjs';

try {
  const increment = process.argv[2];
  if (process.argv.length !== 3 || !['patch', 'minor', 'major'].includes(increment)) {
    throw new Error('Usage: npm run prepare-version -- patch|minor|major');
  }
  assertMain();
  const statePath = git('rev-parse', '--git-path', 'payload-vars-release.json');
  if (existsSync(statePath)) throw new Error('A version is already prepared. Review CHANGELOG.md and run npm run publish-version; do not bump again.');
  assertClean();
  const pkg = assertVersions();
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Preparation requires a stable major.minor.patch version.');
  const parts = pkg.version.split('.').map(Number);
  const index = { major: 0, minor: 1, patch: 2 }[increment];
  parts[index]++;
  for (let i = index + 1; i < 3; i++) parts[i] = 0;
  const version = parts.join('.');
  if (tagCommit(version)) throw new Error(`Tag v${version} already exists.`);
  const changelog = readFileSync('CHANGELOG.md', 'utf8');
  const entries = sections(changelog);
  const pending = entries.filter(entry => entry.title === 'Unreleased');
  if (pending.length !== 1 || !pending[0].body.replace(/<!--[\s\S]*?-->/g, '').trim()) throw new Error('Add release notes under ## Unreleased in CHANGELOG.md first.');
  if (entries.some(entry => entry.title.split(' — ')[0] === version)) throw new Error(`CHANGELOG.md already has a ${version} entry.`);
  const snapshots = releaseFiles.map(path => [path, readFileSync(path)]);
  const state = { version, baseHead: git('rev-parse', 'HEAD') };
  try {
    writeFileSync(statePath, JSON.stringify(state, null, 2));
    pkg.version = version;
    const lock = readJson('package-lock.json');
    lock.version = version;
    lock.packages[''].version = version;
    for (const [path, data] of [['package.json', pkg], ['package-lock.json', lock]]) writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
    const date = new Date().toISOString().slice(0, 10);
    writeFileSync('CHANGELOG.md', changelog.replace(/^## Unreleased\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/m, (_, notes) => `## Unreleased\n\n## ${version} — ${date}\n${notes.replace(/^<!-- reviewed -->[ \t]*\r?$/gm, '')}`));
    syncDocs();
  } catch (error) {
    for (const [path, data] of snapshots) writeFileSync(path, data);
    rmSync(statePath, { force: true });
    throw error;
  }
  console.log(`Prepared ${version}, without committing or tagging. Review CHANGELOG.md, add <!-- reviewed --> in its ${version} section, then run npm run publish-version.`);
} catch (error) {
  report(error);
}
