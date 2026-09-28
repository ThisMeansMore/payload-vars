---
title: Changelog
---

<!-- Generated from CHANGELOG.md by scripts/lib/docs.mjs. Do not edit directly. -->
<!-- {% raw %} -->

# Changelog

Notable changes, starting with 1.0.0. Historical dates follow Git tags.

The latest five releases are detailed below. Older releases have one-line summaries linking to their full notes in the [archive](changelog-archive.md).

## 2.1.1 — 2026-09-28

### Changes

- docs: plugins sorted

## 2.1.0 — 2026-09-28

- Add typed synchronous plugin functions with original-input arguments, including `date.interval`, and the `date.msToHours` transformer.
- Add terminal whole-value `> core.omit` to remove evaluated output properties and array entries.
- Evaluate repeated source expressions independently, allowing different operations and fallbacks while rejecting incompatible base types. Extend variable inspection, input inference, highlighting, and structured errors for derived values.

## 2.0.5 — 2026-09-27

### Changes

- feat: style namespace

## 2.0.4 — 2026-09-27

### Changes

- feat: text plugin

## 2.0.3 — 2026-09-27

### Changes

- refactor: plugin namespaces file separation

## Older releases

- [2.0.2 — 2026-09-27](changelog-archive.md#202--2026-09-27) — Rename `PayloadTemplate.compile()` to `PayloadTemplate.variables()`. The returned variable contracts and copy semantics are unchanged; compilation remains in the constructor.
- [2.0.1 — 2026-09-27](changelog-archive.md#201--2026-09-27) — Correct the missed public API rename intended for 2.0.0: replace `PayloadTemplate.extractVariables()` with `PayloadTemplate.compile()`. The return type and behavior remain unchanged.
- [2.0.0 — 2026-09-27](changelog-archive.md#200--2026-09-27) — Replaced @ with ! for mandatory validation.
- [1.4.1 — 2026-09-26](changelog-archive.md#141--2026-09-26) — docs: plugins examples
- [1.4.0 — 2026-09-26](changelog-archive.md#140--2026-09-26) — Require `namespace.operation` for built-in and custom operations. Built-ins now use `date.dateonly`, `date.isodatetime`, `email.email`, `email.domain`, `collection.unique`, and `collection.range`; bare names are invalid syntax.
- [1.3.0 — 2026-09-26](changelog-archive.md#130--2026-09-26) — Built-in validators and transformers are always available, regardless of `plugins` configuration.
- [1.2.2 — 2026-09-26](changelog-archive.md#122--2026-09-26) — chore: add integration tests message
- [1.2.1 — 2026-09-26](changelog-archive.md#121--2026-09-26) — chore: simplified release and changelog
- [1.2.0 — 2026-09-26](changelog-archive.md#120--2026-09-26) — Add pluggable validators (`@`) and type-preserving transformers (`>`), with date, email, and collection built-ins, member/collection scopes, and unchanged fallback behavior.
- [1.1.8 — 2026-09-25](changelog-archive.md#118--2026-09-25) — Improved releasing notes logic
- [1.1.7 — 2026-09-25](changelog-archive.md#117--2026-09-25) — Hide the empty Unreleased heading on the documentation site.
- [1.1.6 — 2026-09-25](changelog-archive.md#116--2026-09-25) — Remove internal review markers from changelogs before release while preserving safe publication retries.
- [1.1.5 — 2026-09-25](changelog-archive.md#115--2026-09-25) — Releases explicitly deploy GitHub Pages and verify the deployed commit, preventing outdated documentation after a version bump.
- [1.1.4 — 2026-09-25](changelog-archive.md#114--2026-09-25) — Package version below the documentation homepage title, updated automatically on version bumps.
- [1.1.3 — 2026-09-25](changelog-archive.md#113--2026-09-25) — Generate the documentation homepage from README with a Pages-only Guides list and GitHub source link.
- [1.1.2 — 2026-09-25](changelog-archive.md#112--2026-09-25) — Clarify that templates are defined as data, with a comparison to schema validation and JSON templating tools.
- [1.1.1 — 2026-09-23](changelog-archive.md#111--2026-09-23) — CommonJS support alongside ES modules, with matching TypeScript declarations.
- [1.1.0 — 2026-09-23](changelog-archive.md#110--2026-09-23) — `tokenizePayloadExpression()` for syntax highlighting, including token kinds and character offsets.
- [1.0.2 — 2026-09-23](changelog-archive.md#102--2026-09-23) — Exported `isJsonValue` type guard.
- [1.0.1 — 2026-09-22](changelog-archive.md#101--2026-09-22) — Require a clean working tree on `main` for version bumps and npm publication.
- [1.0.0 — 2026-09-22](changelog-archive.md#100--2026-09-22) — **Breaking:** Replace standalone extraction and rendering functions with `PayloadTemplate`. Construct a template, then use `extractVariables()` and `render()`.

<!-- {% endraw %} -->
