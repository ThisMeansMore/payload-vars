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
│  npm whoami → should show thismeansmore; otherwise run npm login.
│  Choose: patch = fixes · minor = compatible features · major = breaking changes.
↓
🚀 Publish new npm version
   npm run release:patch  (or release:minor / release:major)
   Success → git push origin main --follow-tags
   Failed after version bump? Fix the cause, then retry npm publish only.
   Do not bump again. After success, push the release commit and tag as above.
```
