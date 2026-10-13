# Contributing

**✋ MANUAL — Develop and merge feature work**

Work on a feature branch, update tests and docs, run `npm test`, and merge your PR into `main`. Never commit directly to `main`. Writing notes under **Unreleased** in `CHANGELOG.md` is optional; preparation also works without that heading and drafts notes from merged commit subjects. Include generated docs in your commits.

**✋ MANUAL — Create the release branch**

Start on clean, up-to-date `main`. Choose the next version implied by the increment and create its exact release branch. For example, from `2.2.6`:

```sh
git switch main
git pull --ff-only
git switch -c release/v2.2.7
npm run prepare-version -- patch
```

Use `minor` or `major` with the matching branch name when appropriate. Preparation refuses every other branch and any release branch not created from current `origin/main`. It sets the version and date, moves existing Unreleased notes or drafts them from commits, adds `<!-- requires-review -->`, generates docs, and leaves the changes uncommitted. It does not create an empty Unreleased heading.

The latest five releases keep their full notes in `CHANGELOG.md`. Preparation moves older entries into `CHANGELOG-ARCHIVE.md` and leaves a one-line summary linked to the full notes. Each summary uses the release's first bullet, so lead with its most useful change. Archive notes are preserved, including breaking changes and migration guidance.

**✋ MANUAL — Review and merge the release PR**

Read and edit the new version's notes in `CHANGELOG.md`. Commit subjects are only a draft: combine or rewrite them as useful release notes. Remove `<!-- requires-review -->` when finished, then commit the prepared files on the release branch, push it, and merge its PR. Do not run preparation again.

```sh
git add package.json package-lock.json CHANGELOG.md CHANGELOG-ARCHIVE.md docs/index.md docs/changelog.md docs/changelog-archive.md
git commit -m "chore: release 2.2.7"
git push -u origin release/v2.2.7
gh pr create --base main --title "chore: release 2.2.7" --body "Prepare v2.2.7 for publication."
```

**✋ MANUAL — Publish the merged release**

After the release PR is merged, synchronize `main` and publish:

```sh
git switch main
git pull --ff-only
npm run publish-version
```

Publication requires GitHub protection to require PRs with zero approvals and admin bypass disabled. It verifies that `HEAD` came from the matching merged release PR. If npm write access is unavailable, it starts `npm login` before creating a tag and rechecks access. It runs tests, packs the artifact, pushes only the version tag, publishes npm once, verifies registry integrity, and verifies Pages. It never commits or pushes `main`.

**✋ MANUAL — Only if publication fails:** follow the corrective instruction in the error and rerun `npm run publish-version` for the same merged version. Durable checkpoints are the Git tag, npm artifact integrity, and Pages commit; an identical tag or package is reused. Never prepare another version, move a tag, or publish from a feature/release branch. Creating a GitHub Release page is optional and separate.

README, CHANGELOG, and CHANGELOG-ARCHIVE are the documentation sources; the Pages-only footer lives in `docs/_includes/home-footer.md`. Builds, tests, and release commands generate the Pages files automatically. Internal review markers are hidden on Pages.
