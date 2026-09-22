# Migration and development

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
npm run typecheck
npm test
npm run test:types
npm run build
npm pack --dry-run
```

Tests cover parsing, canonical contracts, scalar and array fallbacks, omission, validation, structured errors, and immutability. Compile-time tests use positive cases and `@ts-expect-error` assertions and run as part of both `npm test` and `npm run typecheck`. The package has no runtime dependencies. Error codes and issue shapes are public API.

Templates must be parsed JSON trees. Raw JSON parsing, date validation, formatters, partial interpolation, object variables, and `boolean[]` are outside this API. Dates can be supplied as strings without semantic validation.

## Publishing a new version

Merge your changes into `main`, switch to it, and pull the merged changes before publishing. With a clean working tree and npm authentication configured, choose the version increment:

```sh
git switch main
git pull --ff-only
```

```sh
npm run release:patch
npm run release:minor
npm run release:major
```

Each command checks that the current branch is `main` and the working tree is clean, then runs the build, compile-time tests, and runtime tests through npm's `preversion` hook. If they pass, `npm version` updates `package.json` and `package-lock.json`, creates a version commit and Git tag, and `npm publish` publishes the public package. The `prepack` hook rebuilds the distribution before publishing.

These commands require a clean Git working tree and do not push commits or tags to the remote. If publication fails after the version bump, resolve the publishing issue and retry `npm publish` for that version instead of bumping again.

Direct `npm publish` calls also check the branch and working tree and run the tests through `prepublishOnly`. Feature branches, detached HEADs, and directories without a Git repository are rejected. `npm run release:check` runs just the guard; `npm pack --dry-run` remains available on feature branches. These are local npm lifecycle checks, so do not bypass them with `--ignore-scripts`.

If a version was already bumped on a feature branch but publishing failed, merge that version into `main` along with the implementation. Then publish the existing version with `npm publish`; do not run another version-bump command. For the pending `1.0.0` release, this avoids accidentally creating `2.0.0`.
