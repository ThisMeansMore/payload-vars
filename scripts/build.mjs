import { syncDocs } from './lib/docs.mjs';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

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
}
