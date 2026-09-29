# Changelog archive

Full notes for older releases. See the [changelog](CHANGELOG.md) for the latest five releases and a summary of this archive.

## 2.0.4 — 2026-09-27

### Changes

- feat: text plugin

## 2.0.3 — 2026-09-27

### Changes

- refactor: plugin namespaces file separation

## 2.0.2 — 2026-09-27

### Breaking changes

- Rename `PayloadTemplate.compile()` to `PayloadTemplate.variables()`. The returned variable contracts and copy semantics are unchanged; compilation remains in the constructor.

### Changes

- Rename the internal constructor helper to `buildContract()` and update tests, README, and documentation to distinguish construction from variable inspection.

## 2.0.1 — 2026-09-27

### Breaking changes

- Correct the missed public API rename intended for 2.0.0: replace `PayloadTemplate.extractVariables()` with `PayloadTemplate.compile()`. The return type and behavior remain unchanged.

## 2.0.0 — 2026-09-27

### Changes

- Replaced @ with ! for mandatory validation.
- Added ? for conditional validation and optional ~ for the alternative transformation.
- Renamed the internal validateTemplate() function to compile() and organized unit tests into suites.
- Simplified the README introduction around templates stored as human-readable JSON.

## 1.4.1 — 2026-09-26

### Changes

- docs: plugins examples

## 1.4.0 — 2026-09-26

### Breaking changes

- Require `namespace.operation` for built-in and custom operations. Built-ins now use `date.dateonly`, `date.isodatetime`, `email.email`, `email.domain`, `collection.unique`, and `collection.range`; bare names are invalid syntax.
- Reserve `text`, `number`, `boolean`, `date`, `collection`, `array`, `email`, `url`, `json`, `encoding`, `iso`, `time`, `phone`, `network`, `id`, and `core`. Custom registrations using these names fail with `RESERVED_PLUGIN_NAME`, including empty plugins and non-conflicting operations.
- Update plugin examples, syntax documentation, and migration guidance for qualified built-ins and reserved namespaces.

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

## 1.1.7 — 2026-09-25

### Fixed

- Hide the empty Unreleased heading on the documentation site.

## 1.1.6 — 2026-09-25

### Changed

- Remove internal review markers from changelogs before release while preserving safe publication retries.

## 1.1.5 — 2026-09-25

### Fixed

- Releases explicitly deploy GitHub Pages and verify the deployed commit, preventing outdated documentation after a version bump.

## 1.1.4 — 2026-09-25

### Added

- Package version below the documentation homepage title, updated automatically on version bumps.
- Changelog in the repository and documentation site.
- Two-step release workflow: prepare a version, review its changelog, then validate and publish with retry support.
- Publication guard requiring reviewed changelog notes, synchronized docs and versions, and an empty Unreleased section.

## 1.1.3 — 2026-09-25

### Changed

- Generate the documentation homepage from README with a Pages-only Guides list and GitHub source link.

## 1.1.2 — 2026-09-25

### Changed

- Clarify that templates are defined as data, with a comparison to schema validation and JSON templating tools.
- Clarify the npm and GitHub release workflow.

## 1.1.1 — 2026-09-23

### Added

- CommonJS support alongside ES modules, with matching TypeScript declarations.
- GitHub Pages documentation and side-by-side template examples.

### Fixed

- Preserve template expressions when rendering documentation with Jekyll.

## 1.1.0 — 2026-09-23

### Added

- `tokenizePayloadExpression()` for syntax highlighting, including token kinds and character offsets.

## 1.0.2 — 2026-09-23

### Added

- Exported `isJsonValue` type guard.

## 1.0.1 — 2026-09-22

### Changed

- Require a clean working tree on `main` for version bumps and npm publication.

## 1.0.0 — 2026-09-22

### Changed

- **Breaking:** Replace standalone extraction and rendering functions with `PayloadTemplate`. Construct a template, then use `extractVariables()` and `render()`.
- **Breaking:** Replace nullable `?` suffixes with explicit `??` / `||` fallback rules and `null`, `omit`, or `throw` actions, including array-member rules.
- **Breaking:** Variable contracts and structured errors now include declarations and fallback information. See the [migration guide](docs/development.md) for API, syntax, and error changes.

### Added

- Template normalization through `toJSON()`.
- TypeScript inference of render inputs from literal templates.
