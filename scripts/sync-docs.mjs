import { readFileSync, writeFileSync } from 'node:fs';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const footer = readFileSync(new URL('../docs/_includes/home-footer.md', import.meta.url), 'utf8');
const body = readme
  .replace(/^\[Documentation\]\(https:\/\/thismeansmore\.github\.io\/payload-vars\/\)\r?\n\r?\n/m, '')
  .replace(/(\]\()docs\//g, '$1');
const homepage = `---
title: Getting started
---

<!-- Generated from README.md and docs/_includes/home-footer.md by scripts/sync-docs.mjs. Do not edit directly. -->
<!-- {% raw %} -->

${body.trimEnd()}

${footer.trimEnd()}

<!-- {% endraw %} -->
`;

writeFileSync(new URL('../docs/index.md', import.meta.url), homepage);
