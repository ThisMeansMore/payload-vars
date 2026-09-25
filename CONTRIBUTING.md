# Internal workflow

```text
🌿 Create feature branch
│  git switch main && git pull --ff-only && git switch -c feature/short-name
↓
🛠️ Code
│  Implement the change; update tests and docs.
↓
✅ Check
│  npm test
│  Failed? Return to Code. Continue only when tests pass.
↓
📤 Commit + push
│  git add <changed-files> && git commit -m "Describe the change" &&
│  git push -u origin feature/short-name
↓
🔀 Merge
│  Open a PR into main, review it, and merge it on GitHub.
↓
🔄 Update local main
│  git switch main && git pull --ff-only
│  git status → working tree must be clean.
↓
📋 Prepare release
│  npm whoami → should show username; otherwise run npm login.
│  Choose: patch = fixes · minor = compatible features · major = breaking changes.
↓
🚀 Publish version to npm + GitHub
   npm run release:patch  (or release:minor / release:major)
   Bumps the version, creates a commit + tag, publishes to npm, then pushes to GitHub.
   npm publish failed? Fix the cause, retry npm publish, then git push origin main --follow-tags.
   Only the push failed? Retry git push origin main --follow-tags.
   Do not bump again or republish an already published version.
```

The GitHub tag matches the npm version (e.g. `v1.2.3` for npm `1.2.3`). A GitHub Release page with release notes is separate and is not created by these commands.

Builds and tests automatically regenerate `docs/index.md` from `README.md` plus the Pages-only footer in `docs/_includes/home-footer.md`. Edit those sources and include the generated homepage in your commit.
