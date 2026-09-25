---
title: Development
---

<!-- {% raw %} -->

# Migration and development

## Documentation website

GitHub Pages publishes `docs/` from `main` at <https://thismeansmore.github.io/payload-vars/>. Changes pushed to `main` rebuild the site automatically. Relative `.md` links work on GitHub and are converted to website links during the build.

The homepage is generated from README, the package version, and `docs/_includes/home-footer.md`; the changelog page is generated from CHANGELOG. Edit those sources. Builds and tests refresh the pages automatically, or use `npm run docs:sync`. The shared generator in `scripts/lib/docs.mjs` adjusts links and protects template expressions from Liquid processing.

Site settings and navigation are in `_config.yml`. Page content is wrapped in Liquid raw tags inside HTML comments to preserve literal template examples while keeping the comments hidden on GitHub. Keep these wrappers when editing pages. New pages should include YAML front matter with a `title`; add them to `header_pages` to include them in navigation.

## Migrating from functions to the class

The public API now exposes `PayloadTemplate` instead of the standalone validation, extraction, and rendering functions. Create one instance per template and reuse it:

```ts
import { PayloadTemplate } from 'payload-vars';

const template = new PayloadTemplate(rawTemplate); // Validate once
const normalized = template.toJSON();
const variables = template.extractVariables();
const payload = template.render(values);
```

Replace `validatePayloadTemplate(rawTemplate)` with construction followed by `toJSON()`, `extractPayloadVariables(rawTemplate)` with `extractVariables()`, and `renderPayloadTemplate(rawTemplate, values)` with `render(values)`. Template syntax and conflict errors now occur during construction; runtime value errors occur during rendering. The standalone functions are no longer exported.

Instances snapshot their input. To change a template, create a new instance. Returned templates and extracted contracts are independent copies. Runtime values are passed to each render call and are not retained.

## Migrating from suffix syntax

This is a breaking contract change. Nullable suffixes such as `string?` and `string[]?` are no longer supported; `!` and `_` are not modifiers either.

Choose explicit fallback behavior:

- Use `string ?? null` to replace nullish values with `null` while preserving empty strings.
- Use `string || null` to replace all falsy values with `null`.
- Use `number ?? null` and `boolean ?? null` to preserve `0` and `false`.
- Use `string[] ?? null` for a nullish whole array.
- Use `string[ ?? null ]` to allow nullish members as JSON `null`.
- Use `?? omit` or `|| omit` to remove a value from its container.

The old nullable behavior has no exact universal replacement: empty arrays now remain empty, and `||` follows JavaScript truthiness consistently. Normalize special business values before supplying variables if needed.

Extracted variables now include a canonical `declaration` and optional structured fallbacks. The `type` field always contains a base type. Replace handling of `VARIABLE_TYPE_CONFLICT` with `VARIABLE_EXPRESSION_CONFLICT`, and use canonical declaration fields when displaying contracts. Runtime issues now also include `declaration`. See [API and errors](api.md).

## TypeScript inference

Literal templates now infer `render()` inputs. Existing TypeScript callers may receive errors for missing or incompatible values previously caught only at runtime. `throw` fallbacks require supplied values. Preserve literal types with `as const` for separately declared templates; use `PayloadTemplate<JsonTemplateValue>` when accepting untyped external values for runtime validation. See the [TypeScript guide](typescript.md).

TypeScript consumers need version 5.0 or newer for the class's const type parameter. JavaScript runtime requirements are unchanged.

## Development

```sh
npm ci
npm test
```

Tests cover parsing, canonical contracts, scalar and array fallbacks, omission, validation, structured errors, and immutability. Compile-time tests use positive cases and `@ts-expect-error` assertions and run as part of both `npm test` and `npm run typecheck`. The package has no runtime dependencies. Error codes and issue shapes are public API.

Templates must be parsed JSON trees. Raw JSON parsing, date validation, formatters, partial interpolation, object variables, and `boolean[]` are outside this API. Dates can be supplied as strings without semantic validation.

## Contributing and releasing

Follow the [contribution guide](https://github.com/ThisMeansMore/payload-vars/blob/main/CONTRIBUTING.md) for the two-command release workflow and changelog review. Release orchestration lives in `scripts/prepare-version.mjs` and `scripts/publish-version.mjs`; shared release and docs helpers live in `scripts/lib/`.

<!-- {% endraw %} -->
