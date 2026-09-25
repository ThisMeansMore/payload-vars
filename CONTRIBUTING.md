# Contributing

Work on a feature branch, update tests and docs, and add notes under **Unreleased** in `CHANGELOG.md`. Run `npm test`, commit, and merge your PR into `main`.

To release, start on up-to-date `main` with a clean working tree. Authenticate with `npm login` and `gh auth login` if needed; GitHub CLI needs permission to request Pages builds.

```sh
npm run prepare-version -- patch  # or minor / major
# Review the new CHANGELOG.md entry and add <!-- reviewed --> on its own line.
npm run publish-version
```

Preparation updates versions, dates the changelog entry, and generates docs. Leave those changes uncommitted while you review. Keep Unreleased empty; if you edit the notes again, remove the marker until you have reviewed them again.

After the review and pre-publication checks pass, the command removes all review markers from the changelog and generated docs. Approval is remembered locally for retries and is invalidated if the notes change. Publication then commits, tags, publishes to npm, pushes to GitHub, and requests a Pages deployment. It finishes only when Pages reports the release commit deployed. If any step fails, fix the reported issue and rerun `npm run publish-version` from the same checkout. It reuses the prepared version and skips an identical package already on npm. A GitHub Release page remains optional.

README and CHANGELOG are the documentation sources; the Pages-only footer lives in `docs/_includes/home-footer.md`. Builds, tests, and release commands generate the Pages files automatically. `npm run docs:sync` refreshes just the docs. Empty Unreleased sections are hidden on Pages. Include generated changes in ordinary development commits; the release command handles its own commit.
