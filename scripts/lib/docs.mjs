import { readFileSync, writeFileSync } from 'node:fs';

export const stripReviewMarkers = markdown => markdown
  .replace(/^[ \t]*<!-- reviewed -->[ \t]*\r?\n?/gm, '')
  .replace(/<!-- reviewed -->/g, '')
  .replace(/\n{3,}/g, '\n\n');

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const adjustLinks = markdown => markdown.replace(/(\]\()docs\//g, '$1');

// Shared by builds and both release commands. Importing this module changes no files.
export function syncDocs({ check = false } = {}) {
  const { version } = JSON.parse(read('package.json'));
  const body = adjustLinks(read('README.md'))
    .replace(/^# payload-vars\r?$/m, () => `# payload-vars\n\nPackage version: v${version}`)
    .replace(/^\[Documentation\]\(https:\/\/thismeansmore\.github\.io\/payload-vars\/\)\r?\n\r?\n/m, '');
  // Keep the authoring placeholder in CHANGELOG.md, but omit it on Pages when empty.
  const changelog = stripReviewMarkers(read('CHANGELOG.md'))
    .replace(/^## Unreleased[ \t]*\r?\n(?:[ \t]*\r?\n)*(?=## |$(?![\s\S]))/gm, '');
  const pages = [
    ['docs/index.md', 'Getting started', 'README.md, package.json, and docs/_includes/home-footer.md',
      `${body.trimEnd()}\n\n${read('docs/_includes/home-footer.md').trimEnd()}`],
    ['docs/changelog.md', 'Changelog', 'CHANGELOG.md', adjustLinks(changelog).trimEnd()],
  ];
  for (const [path, title, sources, content] of pages) {
    const contents = `---
title: ${title}
---

<!-- Generated from ${sources} by scripts/lib/docs.mjs. Do not edit directly. -->
<!-- {% raw %} -->

${content}

<!-- {% endraw %} -->
`;
    if (check) {
      if (read(path) !== contents) throw new Error(`${path} is stale. Run npm run docs:sync.`);
    } else {
      writeFileSync(new URL(path, root), contents);
    }
  }
}
