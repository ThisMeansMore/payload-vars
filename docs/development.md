---
title: Development
---

<!-- {% raw %} -->

# Development

API reference, TypeScript input inference, migration guidance, and repository workflows in one place. For validators, transformers, and custom extensions, see [Plugins](plugins.md).

- [API reference](#api-reference): construction, normalization, extraction, rendering, errors, and highlighting.
- [TypeScript input inference](#typescript-input-inference): literal templates, fallbacks, reusable types, and runtime limits.
- [Migration and project development](#migration-and-project-development): migrating callers, working on the library, documentation, and releases.

## API reference

```ts
import {
  PayloadTemplate,
  PayloadTemplateError,
  type BaseType,
  type FallbackExpression,
  type ParsedVariableExpression,
  type PayloadVariable,
  type PayloadVariableType,
  type PayloadTemplateIssue,
  type JsonPrimitive,
  type JsonObject,
  type JsonValue,
  type JsonTemplateValue,
  type PayloadTemplateVariables,
} from 'payload-vars';
```

### Construction and validation

`new PayloadTemplate(template)` (accepting `JsonTemplateValue`) validates all placeholders and repeated variable contracts, then stores a private, normalized snapshot and compiled contract. Invalid syntax or conflicting declarations throw `PayloadTemplateError` with original template paths. Construction does not require runtime variables or evaluate fallbacks.

```ts
const template = new PayloadTemplate({
  products: '{{ products : string[??omit]??throw }}',
});
```

Validation happens once in the constructor. Extraction and rendering reuse the validated contract. Later changes to the original input cannot change the instance.

### Plugin configuration

Pass `PayloadTemplateOptions` as the second constructor argument to register custom plugins. Built-in operations remain available regardless of this configuration. See [Plugins](plugins.md#plugin-configuration) for configuration, custom callbacks, and built-ins.

### Normalized template

`template.toJSON(): JsonValue` returns an independent copy with canonical placeholder strings. Nested arrays and objects are copied; literal values and object keys are preserved.

```ts
template.toJSON();
// { products: '{{products:string[ ?? omit ] ?? throw}}' }

JSON.stringify(template, null, 2); // Indented, normalized JSON
```

The constructor accepts already parsed JSON. Normalization is idempotent. Editing a returned template cannot change future method results.

### Extraction

`template.extractVariables(): PayloadVariable[]` returns the compiled variable contracts in first occurrence order, deduplicating matching declarations. Each call returns fresh objects, including nested fallback expressions and operation arrays.

```ts
template.extractVariables();
// [{
//   name: 'products',
//   type: 'string[]',
//   memberFallback: { operator: '??', action: 'omit' },
//   valueFallback: { operator: '??', action: 'throw' },
//   declaration: '{{products:string[ ?? omit ] ?? throw}}',
// }]
```

`BaseType` contains only the five supported base types. `PayloadVariableType` aliases `BaseType`. `ParsedVariableExpression` contains `name`, `type`, optional `memberFallback`, and optional `valueFallback`. `PayloadVariable` adds the canonical `declaration` string. Optional `memberOperations` and `valueOperations` contain ordered `PayloadOperation` objects (`{ kind: 'validator' | 'transformer', name: string }`). Absent fallbacks and empty operation lists are omitted from extracted objects.

### Rendering

`template.render(variables: PayloadTemplateVariables<T>): JsonValue` evaluates declared variables using the compiled contract and produces a fresh result. It ignores unused variables and treats inherited properties as missing. Template and supplied values are not mutated. Supplied arrays are copied.

Literal templates infer required variables and their input types. Dynamic templates accept `Readonly<Record<string, unknown>>`. See the [TypeScript guide](#typescript-input-inference) for fallback typing, readonly inputs, and limits.

Fallback evaluation precedes validation for both whole values and array members. Rendering stops at the first error. Root omission is an error because the method returns a JSON value.

Runtime values are supplied per call and never stored on the instance. Reuse the same instance for multiple payloads; a failed render does not affect subsequent calls.

```ts
template.render({ products: ['A', null, 'B'] }); // { products: ['A', 'B'] }
template.render({ products: ['C'] });            // { products: ['C'] }
```

### Errors

`PayloadTemplateError.issue` is a discriminated union. `error.message` is the issue code. Runtime values are never included in errors.

| Code | Details |
| --- | --- |
| `INVALID_PLACEHOLDER` | `path`, `placeholder` |
| `UNSUPPORTED_TYPE` | `path`, `variableName`, `declaredType` |
| `INVALID_FALLBACK_SYNTAX` | `path`, `variableName`, `placeholder` |
| `VARIABLE_EXPRESSION_CONFLICT` | `variableName`, `declaration`, `declaredAt`, `conflictingDeclaration`, `conflictingAt` |
| `INVALID_PLUGIN_NAME`, `DUPLICATE_PLUGIN_NAME` | `plugin` |
| `INVALID_PLUGIN_OPERATION_NAME`, `INVALID_PLUGIN_OPERATION` | `kind`, `operation`, `plugin` |
| `UNKNOWN_PLUGIN_OPERATION` | `kind`, `operation`, `path`, `variableName` |
| `VALIDATION_FAILED` | Runtime details, `kind`, `operation`, optional `valuePath` |
| `PLUGIN_EXECUTION_FAILED` | Runtime details, `kind`, `operation`, optional `valuePath` |
| `INVALID_TRANSFORMER_RESULT` | Runtime details, `kind`, `operation`, optional `valuePath` |
| `MISSING_VARIABLE` | Runtime details |
| `INVALID_VARIABLE_TYPE` | Runtime details, `actualType`, optional `valuePath` |
| `FALLBACK_THROW` | Runtime details, `operator`, optional `valuePath` |
| `CANNOT_OMIT_ROOT` | Runtime details |

Runtime details are `variableName`, canonical `declaration`, `expectedType` (the base type), and `templatePaths` (all occurrences). Conflict declarations are canonical. Syntax errors include original template text because it cannot be normalized.

Paths start at `$`, use `.key` for identifier keys, and `[0]` for array positions. Other keys use bracketed JSON strings, such as `$["order-id"]`. Member errors include an original input `valuePath`, such as `$[2]`, even when earlier members were omitted.

```ts
try {
  const template = new PayloadTemplate({ amount: '{{amount:number || throw}}' });
  template.render({ amount: 0 });
} catch (error) {
  if (error instanceof PayloadTemplateError) {
    switch (error.issue.code) {
      case 'FALLBACK_THROW':
        console.log(error.issue.variableName, error.issue.templatePaths);
        break;
    }
  }
  throw error;
}
```

### Expression highlighting

`template.tokenizePayloadExpression(): TokenizedPayloadExpression[]` uses the normalized payload already stored by the constructor. Supply the input once at construction; no additional expression argument or normalization call is needed.

Each result contains a JSON `path`, the normalized `expression` including mustache delimiters, and its `tokens`. Results follow payload traversal order, include repeated occurrences, and omit literal values. A root expression has path `$`; a payload without expressions returns `[]`. Each call returns independent objects and arrays.

Each token has `kind`, exact normalized `text`, and `start` (inclusive) and `end` (exclusive) UTF-16 offsets relative to that entry's expression, not the serialized JSON. Concatenating its token texts reproduces the normalized expression. `TokenizedPayloadExpression`, `PayloadExpressionToken`, and `PayloadExpressionTokenKind` are exported types.

Kinds are `delimiter`, `variable`, `punctuation`, `type`, `operator`, `action`, `validator`, `transformer`, `whitespace`, and `unknown`. Keywords are classified by position: `string` is a variable in `{{string:boolean}}`. Constructor validation rejects incomplete or invalid expressions before tokenization; original whitespace is not retained. Tokenization does not change validation, rendering, or the stored payload, and does not tokenize surrounding JSON.

The consumer chooses styling, for example with arbitrary CSS classes:

```ts
import { PayloadTemplate, type PayloadExpressionTokenKind } from 'payload-vars';

const template = new PayloadTemplate({ products: '{{products:string[??omit]??throw}}' });
const classes: Record<PayloadExpressionTokenKind, string> = {
  delimiter: 'muted', variable: 'blue', punctuation: 'muted', type: 'purple',
  operator: 'orange', action: 'green', validator: 'blue', transformer: 'purple', whitespace: 'plain', unknown: 'underlined',
};
for (const { path, tokens } of template.tokenizePayloadExpression()) {
  const container = document.createElement('pre');
  container.dataset.path = path;
  for (const token of tokens) {
    const span = document.createElement('span');
    span.className = classes[token.kind];
    span.textContent = token.text;
    container.append(span);
  }
  document.body.append(container);
}
```

The method returns only token data; CSS classes and DOM elements above belong entirely to consumer code.

## TypeScript input inference

`PayloadTemplate` infers the variables accepted by `render()` from literal templates. This requires TypeScript 5.0 or newer. JavaScript users retain the same runtime validation.

```ts
import { PayloadTemplate } from 'payload-vars';

const template = new PayloadTemplate({
  orderId: '{{orderId:string}}',
  amount: '{{amount:number}}',
  products: '{{products:string[ ?? omit ]}}',
  comment: '{{comment:string ?? omit}}',
});

template.render({
  orderId: 'ORD-123',
  amount: 19.95,
  products: ['A', null, 'B'],
  // comment is optional
});

// TypeScript errors: orderId must be a string and amount must be a number.
template.render({ orderId: 123, amount: '19.95', products: [] });
```

Inline constructor arguments preserve literals automatically. When declaring a template separately, use `as const` to prevent placeholder strings from widening:

```ts
const rawTemplate = {
  items: ['{{id:string}}', { amount: '{{amount:number}}' }],
} as const;

const template = new PayloadTemplate(rawTemplate);
template.render({ id: 'ORD-123', amount: 19.95 });
```

Nested objects and arrays are inspected. Object keys are literal and do not declare variables. Repeated variables share one input property. Readonly template arrays and readonly supplied arrays are supported. Extra variables remain allowed, matching the runtime behavior that ignores unused inputs.

### Fallback input types

| Declaration | Inferred input |
| --- | --- |
| `string` | Required `string` |
| `number` | Required `number` |
| `boolean` | Required `boolean` |
| `string[]` | Required `readonly string[]` |
| `number[]` | Required `readonly number[]` |
| `string ?? null` or `string ?? omit` | Optional `string \| null \| undefined` |
| `string ?? throw` | Required `string` |
| `string \|\| null` or `string \|\| omit` | Optional `string \| null \| undefined \| false \| 0 \| 0n` |
| `boolean \|\| throw` | Required `true` |
| `string[ ?? omit ]` | Required `readonly (string \| null \| undefined)[]` |
| `number[ \|\| null ] ?? omit` | Optional array whose members accept numbers and representable falsy values, or a nullish whole value |

For `null` and `omit`, fallback inputs are added to the declared base type. `??` admits `null` and `undefined`; `||` also admits `''`, `0`, `false`, and `0n`. Whole-value fallbacks make the property optional. Member fallbacks affect members independently and do not make the whole array optional.

`throw` describes a requirement to the caller: values must satisfy the base type and cannot be nullish or missing. For `boolean || throw`, TypeScript can also exclude `false`. Runtime validation continues to throw when JavaScript callers or external data violate these requirements.

### Reusable input types

`PayloadTemplateVariables<T>` exposes the inferred input contract:

```ts
import { PayloadTemplate, type PayloadTemplateVariables } from 'payload-vars';

const rawTemplate = { amount: '{{amount:number}}' } as const;
type Variables = PayloadTemplateVariables<typeof rawTemplate>;

const values: Variables = { amount: 19.95 };
new PayloadTemplate(rawTemplate).render(values);
```

### Dynamic templates and runtime validation

Templates loaded from JSON or otherwise containing widened `string` values cannot provide a complete compile-time contract. They accept `Readonly<Record<string, unknown>>`, with validation performed at runtime. This applies to the whole contract if any template value is dynamic. Type inference also falls back to runtime validation at 16 nested traversal levels to bound compiler work.

```ts
import { PayloadTemplate, type JsonTemplateValue } from 'payload-vars';

const rawTemplate: JsonTemplateValue = JSON.parse(jsonText);
const template = new PayloadTemplate(rawTemplate);
template.render(runtimeValues);
```

`JsonTemplateValue` accepts mutable or deeply readonly JSON trees. To deliberately use runtime validation with a known template and untyped external values, widen the instance explicitly:

```ts
const template = new PayloadTemplate<JsonTemplateValue>({
  amount: '{{amount:number}}',
});
const values: Record<string, unknown> = { amount: 'invalid' };
template.render(values); // Compiles; throws INVALID_VARIABLE_TYPE at runtime.
```

TypeScript inference supplements validation; it does not replace it:

- `number` includes `NaN` and infinities. Runtime validation enforces finite numbers.
- TypeScript cannot subtract `0` from `number` or `''` from `string`. Such values still compile for `|| throw` and fail at runtime.
- `NaN` has no distinct literal type. A non-number `|| null` or `|| omit` declaration accepts it at runtime, but its inferred input excludes general numbers other than `0`.
- Syntax errors and conflicting declarations are still reported by the constructor. The type layer does not promise compile-time syntax diagnostics.
- `render()` and `toJSON()` still return `JsonValue`, and `extractVariables()` returns `PayloadVariable[]`. Precise output inference is outside this input-inference feature.

## Migration and project development

### Documentation website

GitHub Pages publishes `docs/` from `main` at <https://thismeansmore.github.io/payload-vars/>. Changes pushed to `main` rebuild the site automatically. Relative `.md` links work on GitHub and are converted to website links during the build.

The homepage is generated from README, the package version, and `docs/_includes/home-footer.md`; the changelog and its archive are generated from CHANGELOG and CHANGELOG-ARCHIVE. Edit those sources. The changelog keeps the latest five releases in full; release preparation archives older entries and links to them with one-line summaries. Builds and tests refresh the pages automatically, or use `npm run docs:sync`. The shared generator in `scripts/lib/docs.mjs` adjusts links and protects template expressions from Liquid processing.

Site settings and navigation are in `_config.yml`. Page content is wrapped in Liquid raw tags inside HTML comments to preserve literal template examples while keeping the comments hidden on GitHub. Keep these wrappers when editing pages. New pages should include YAML front matter with a `title`; add them to `header_pages` to include them in navigation.

### Migrating from functions to the class

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

### Migrating from suffix syntax

This is a breaking contract change. Nullable suffixes such as `string?` and `string[]?` are no longer supported; `!` and `_` are not modifiers either.

Choose explicit fallback behavior:

- Use `string ?? null` to replace nullish values with `null` while preserving empty strings.
- Use `string || null` to replace all falsy values with `null`.
- Use `number ?? null` and `boolean ?? null` to preserve `0` and `false`.
- Use `string[] ?? null` for a nullish whole array.
- Use `string[ ?? null ]` to allow nullish members as JSON `null`.
- Use `?? omit` or `|| omit` to remove a value from its container.

The old nullable behavior has no exact universal replacement: empty arrays now remain empty, and `||` follows JavaScript truthiness consistently. Normalize special business values before supplying variables if needed.

Extracted variables now include a canonical `declaration` and optional structured fallbacks. The `type` field always contains a base type. Replace handling of `VARIABLE_TYPE_CONFLICT` with `VARIABLE_EXPRESSION_CONFLICT`, and use canonical declaration fields when displaying contracts. Runtime issues now also include `declaration`. See [API and errors](#errors).

### Migrating TypeScript callers

Literal templates now infer `render()` inputs. Existing TypeScript callers may receive errors for missing or incompatible values previously caught only at runtime. `throw` fallbacks require supplied values. Preserve literal types with `as const` for separately declared templates; use `PayloadTemplate<JsonTemplateValue>` when accepting untyped external values for runtime validation. See the [TypeScript guide](#typescript-input-inference).

TypeScript consumers need version 5.0 or newer for the class's const type parameter. JavaScript runtime requirements are unchanged.

### Local development

```sh
npm ci
npm test
```

Tests cover parsing, canonical contracts, scalar and array fallbacks, omission, validation, structured errors, and immutability. Compile-time tests use positive cases and `@ts-expect-error` assertions and run as part of both `npm test` and `npm run typecheck`. The package has no runtime dependencies. Error codes and issue shapes are public API.

Templates must be parsed JSON trees. Raw JSON parsing, partial interpolation, object variables, and `boolean[]` are outside this API. [Plugins](plugins.md) provide date and email validation and transformations that preserve the declared type.

### Contributing and releasing

Follow the [contribution guide](https://github.com/ThisMeansMore/payload-vars/blob/main/CONTRIBUTING.md) for the two-command release workflow and changelog review. Release orchestration lives in `scripts/prepare-version.mjs` and `scripts/publish-version.mjs`; shared release and docs helpers live in `scripts/lib/`.

<!-- {% endraw %} -->
