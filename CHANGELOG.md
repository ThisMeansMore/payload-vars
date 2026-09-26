# Changelog

Notable changes, starting with 1.0.0. Historical dates follow Git tags.

The latest five releases are detailed below. Older releases have one-line summaries linking to their full notes in the [archive](CHANGELOG-ARCHIVE.md).

## Unreleased

## 1.3.0 — 2026-09-26

### Breaking changes

- Built-in validators and transformers are always available, regardless of `plugins` configuration.
- Custom operations require `pluginName.operationName`; plugin namespaces must be unique identifiers. Bare custom aliases are no longer supported.
- Remove the `builtInPlugins`, `datePlugin`, `emailPlugin`, and `collectionPlugin` registration exports. Register only custom plugins.
- Replace `DUPLICATE_PLUGIN_OPERATION` with `DUPLICATE_PLUGIN_NAME`, and add construction errors for invalid plugin names, operation names, and callbacks.

## 1.2.2 — 2026-09-26

### Changes

- chore: add integration tests message

## 1.2.1 — 2026-09-26

### Changes

- chore: simplified release and changelog
- docs: simplified changelog and documentation

## 1.2.0 — 2026-09-26

- Add pluggable validators (`@`) and type-preserving transformers (`>`), with date, email, and collection built-ins, member/collection scopes, and unchanged fallback behavior.

## 1.1.8 — 2026-09-25

- Improved releasing notes logic

### Changed

- Release preparation drafts missing notes from commits and marks them for review; remove the review marker before publishing.

## Older releases

- [1.1.7 — 2026-09-25](CHANGELOG-ARCHIVE.md#117--2026-09-25) — Hide the empty Unreleased heading on the documentation site.
- [1.1.6 — 2026-09-25](CHANGELOG-ARCHIVE.md#116--2026-09-25) — Remove internal review markers from changelogs before release while preserving safe publication retries.
- [1.1.5 — 2026-09-25](CHANGELOG-ARCHIVE.md#115--2026-09-25) — Releases explicitly deploy GitHub Pages and verify the deployed commit, preventing outdated documentation after a version bump.
- [1.1.4 — 2026-09-25](CHANGELOG-ARCHIVE.md#114--2026-09-25) — Package version below the documentation homepage title, updated automatically on version bumps.
- [1.1.3 — 2026-09-25](CHANGELOG-ARCHIVE.md#113--2026-09-25) — Generate the documentation homepage from README with a Pages-only Guides list and GitHub source link.
- [1.1.2 — 2026-09-25](CHANGELOG-ARCHIVE.md#112--2026-09-25) — Clarify that templates are defined as data, with a comparison to schema validation and JSON templating tools.
- [1.1.1 — 2026-09-23](CHANGELOG-ARCHIVE.md#111--2026-09-23) — CommonJS support alongside ES modules, with matching TypeScript declarations.
- [1.1.0 — 2026-09-23](CHANGELOG-ARCHIVE.md#110--2026-09-23) — `tokenizePayloadExpression()` for syntax highlighting, including token kinds and character offsets.
- [1.0.2 — 2026-09-23](CHANGELOG-ARCHIVE.md#102--2026-09-23) — Exported `isJsonValue` type guard.
- [1.0.1 — 2026-09-22](CHANGELOG-ARCHIVE.md#101--2026-09-22) — Require a clean working tree on `main` for version bumps and npm publication.
- [1.0.0 — 2026-09-22](CHANGELOG-ARCHIVE.md#100--2026-09-22) — **Breaking:** Replace standalone extraction and rendering functions with `PayloadTemplate`. Construct a template, then use `extractVariables()` and `render()`.
