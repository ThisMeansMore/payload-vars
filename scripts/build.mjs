import { syncDocs } from './lib/docs.mjs';
import { cpSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--docs')) {
  throw new Error('Usage: node scripts/build.mjs [--docs]');
}
syncDocs();
if (process.argv[2] !== '--docs') {
  const require = createRequire(import.meta.url);
  rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });
  for (const config of ['tsconfig.json', 'tsconfig.cjs.json']) {
    execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', config], { stdio: 'inherit', cwd: new URL('..', import.meta.url) });
  }
  mkdirSync(new URL('../dist/cjs', import.meta.url), { recursive: true });
  writeFileSync(new URL('../dist/cjs/package.json', import.meta.url), '{"type":"commonjs"}\n');

  const distRoot = fileURLToPath(new URL('../dist/', import.meta.url));
  const playgroundPackageRoot = fileURLToPath(new URL('../docs/assets/payload-vars/', import.meta.url));
  rmSync(playgroundPackageRoot, { recursive: true, force: true });
  cpSync(distRoot, playgroundPackageRoot, {
    recursive: true,
    filter(source) {
      const path = relative(distRoot, source);
      if (!path) return true;
      if (path === 'cjs' || path.startsWith(`cjs${sep}`)) return false;
      return statSync(source).isDirectory() || source.endsWith('.js');
    },
  });
}
