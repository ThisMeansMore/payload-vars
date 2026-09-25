# Contributing

**✋ MANUAL — Develop and write release notes**

Work on a feature branch and update tests and docs. Write a short description of your changes under **Unreleased** in `CHANGELOG.md`. Notes are **not generated from commits**; preparation stops if this section is empty. `npm run docs:sync` only regenerates documentation from existing content.

Run `npm test`, commit your changes (including generated docs), and merge your PR into `main`.

**✋ MANUAL — Start the release**

Switch to up-to-date `main` with a clean working tree. Authenticate with `npm login` and `gh auth login` if needed; GitHub CLI needs permission to request Pages builds. Choose the version increment:

```sh
npm run prepare-version -- patch  # or minor / major
```

This automatically updates versions, moves Unreleased notes into a dated release section, and generates docs.

**✋ MANUAL — Review before publishing**

Edit the new version's notes in `CHANGELOG.md`, then add `<!-- reviewed -->` on its own line inside that section. Leave Unreleased empty and the prepared changes uncommitted. If you change the notes again, remove the marker until you have reviewed them again.

When ready, run:

```sh
npm run publish-version
```

This automatically validates, runs tests, removes review markers, commits, tags, publishes to npm, pushes to GitHub, and waits for Pages to deploy the release commit. Approval stays local for retries and is invalidated if the notes change.

**✋ MANUAL — Only if a step fails:** fix the reported issue and rerun `npm run publish-version` from the same checkout. Do not prepare another version. An identical package already on npm is not published again. Creating a GitHub Release page is optional and separate.

README and CHANGELOG are the documentation sources; the Pages-only footer lives in `docs/_includes/home-footer.md`. Builds, tests, and release commands generate the Pages files automatically. Empty Unreleased sections are hidden on Pages.
