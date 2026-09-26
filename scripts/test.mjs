import { readdirSync, writeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const releaseTest = 'release.spec.js';
const tests = readdirSync(new URL('test/', root))
  .filter(name => name.endsWith('.spec.js') && name !== releaseTest).sort();

function run(files) {
  const result = spawnSync(process.execPath, ['--test', ...files.map(name => `test/${name}`)], {
    cwd: root, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.signal) console.error(`Test process terminated by ${result.signal}.`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(tests);
const message = 'Running release integration tests. This can take 1–2 minutes; a quiet terminal is normal.';
const useColor = process.env.NO_COLOR === undefined && process.env.FORCE_COLOR !== '0'
  && process.env.TERM !== 'dumb' && (process.stdout.isTTY || process.env.FORCE_COLOR);
// Write from the parent before starting Node's buffering test runner.
writeSync(1, '\n' + (useColor ? `\u001b[36m${message}\u001b[0m` : message) + '\n');
run([releaseTest]);
