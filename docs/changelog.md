---
title: Changelog
---

<!-- Generated from CHANGELOG.md by scripts/lib/docs.mjs. Do not edit directly. -->
<!-- {% raw %} -->

# Changelog

Notable changes, starting with 1.0.0. Historical dates follow Git tags.

## Unreleased

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
- **Breaking:** Variable contracts and structured errors now include declarations and fallback information. See the [migration guide](development.md) for API, syntax, and error changes.

### Added

- Template normalization through `toJSON()`.
- TypeScript inference of render inputs from literal templates.

<!-- {% endraw %} -->
