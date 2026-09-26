import test from 'node:test';
import assert from 'node:assert/strict';
import { compactChangelog, sections } from '../scripts/lib/release.mjs';

test('changelog retains five full releases and archives all older details without duplication', () => {
  const releases = Array.from({ length: 7 }, (_, index) => ({
    title: `1.0.${7 - index} — 2026-09-25`,
    body: `- Summary ${7 - index}.\n\n### Fixed\n\n- More detail and [migration](docs/development.md).\n\n\`\`\`md\n## Example heading\n\`\`\``,
  }));
  const changelog = '# Changelog\n\n## Unreleased\n\n- Pending.\n\n'
    + releases.map(entry => `## ${entry.title}\n\n${entry.body}\n\n`).join('');
  const archive = '# Changelog archive\n\n[Recent releases](CHANGELOG.md)\n';
  const result = compactChangelog(changelog, archive);
  assert.equal(sections(result.changelog).filter(entry => /^1\./.test(entry.title)).length, 5);
  assert.match(result.changelog, /## Unreleased\n\n- Pending\./);
  assert.match(result.changelog, /\[1\.0\.2 — 2026-09-25\]\(CHANGELOG-ARCHIVE.md#102--2026-09-25\) — Summary 2\./);
  assert.deepEqual(sections(result.archive).map(entry => ({ ...entry, body: entry.body.trim() })), releases.slice(5));
  assert.deepEqual(compactChangelog(result.changelog, result.archive), result);

  const next = compactChangelog(result.changelog.replace('## Unreleased', '## Unreleased\n\n## 1.0.8 — 2026-09-26\n\n- Next.'), result.archive);
  assert.equal(sections(next.archive).length, 3);
  assert.equal(sections(next.archive)[0].title, releases[4].title);
  assert.equal((next.changelog.match(/## Older releases/g) ?? []).length, 1);
});

test('short changelogs and their existing archives remain unchanged', () => {
  const changelog = '# Changelog\n\n## Unreleased\n\n## 1.0.0 — 2026-09-25\n\n- Initial release.\n';
  const archive = '# Changelog archive\n';
  assert.deepEqual(compactChangelog(changelog, archive), { changelog, archive });
});
