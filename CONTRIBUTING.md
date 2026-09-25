# Contributing

**✋ MANUAL — Develop and merge**

Work on a feature branch, update tests and docs, run `npm test`, and merge your PR into `main`. Writing notes under **Unreleased** in `CHANGELOG.md` is optional; preparation drafts them from commit subjects when that section is empty. Include generated docs in your commits.

**✋ MANUAL — Start the release**

Start on up-to-date `main` with a clean working tree. Authenticate with `npm login` and `gh auth login` if needed; GitHub CLI needs permission to request Pages builds.

```sh
npm run prepare-version -- patch  # or minor / major
```

This automatically sets the version and date, preserves existing notes or drafts them from commits since the current version's tag, adds `<!-- requires-review -->`, and generates docs.

**✋ MANUAL — Review and remove the marker**

Read and edit the new version's notes in `CHANGELOG.md`. Commit subjects are only a draft: combine or rewrite them as useful release notes. Remove `<!-- requires-review -->` when finished. Leave Unreleased empty and the prepared changes uncommitted.

```sh
npm run publish-version
```

Publication stops while the marker remains. Once removed, it validates, runs tests, commits, tags, publishes to npm, pushes to GitHub, and waits for Pages to deploy the release commit. No approval marker or separate approval file is needed.

**✋ MANUAL — Only if a step fails:** fix the reported issue and rerun `npm run publish-version` from the same checkout. Do not prepare another version. An identical package already on npm is not published again. Creating a GitHub Release page is optional and separate.

README and CHANGELOG are the documentation sources; the Pages-only footer lives in `docs/_includes/home-footer.md`. Builds, tests, and release commands generate the Pages files automatically. Empty Unreleased sections and internal review markers are hidden on Pages.
