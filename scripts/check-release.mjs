import { execFileSync } from 'node:child_process';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

try {
  const branch = git('branch', '--show-current');
  if (branch !== 'main') {
    throw new Error(`Releases require main; current branch is ${branch || 'detached HEAD'}. Merge your changes into main before publishing.`);
  }
  if (git('status', '--porcelain', '--untracked-files=all')) {
    throw new Error('Releases require a clean working tree. Commit or stash changes before publishing.');
  }
} catch (error) {
  console.error(`Release blocked: ${error.status !== undefined ? 'Unable to verify Git state. Run from the repository on main.' : error.message}`);
  process.exitCode = 1;
}
