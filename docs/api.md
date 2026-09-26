---
title: API
---

<!-- {% raw %} -->

# API and structured errors

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

## Construction and validation

`new PayloadTemplate(template)` (accepting `JsonTemplateValue`) validates all placeholders and repeated variable contracts, then stores a private, normalized snapshot and compiled contract. Invalid syntax or conflicting declarations throw `PayloadTemplateError` with original template paths. Construction does not require runtime variables or evaluate fallbacks.

```ts
const template = new PayloadTemplate({
  products: '{{ products : string[??omit]??throw }}',
});
```

Validation happens once in the constructor. Extraction and rendering reuse the validated contract. Later changes to the original input cannot change the instance.

## Plugin configuration

The optional second constructor argument is `PayloadTemplateOptions`. Omit `plugins` to use `builtInPlugins`; explicitly supplying an array uses exactly that collection, including `[]` to disable all plugins.

```ts
import { PayloadTemplate, builtInPlugins, datePlugin,
  type PayloadVarsPlugin, type PayloadValidator, type PayloadTransformer } from 'payload-vars';

const positive: PayloadValidator<number> = value => value > 0;
const trim: PayloadTransformer<string> = value => value.trim();
const customPlugin: PayloadVarsPlugin = {
  name: 'text-and-numbers',
  validators: { positive },
  transformers: { trim },
};

new PayloadTemplate('{{x:string @ dateonly}}', { plugins: [datePlugin] });
new PayloadTemplate('{{x:string > trim @ email}}', {
  plugins: [...builtInPlugins, customPlugin],
});
```

`PayloadValidator<T>` is `(value: T) => boolean`; `PayloadTransformer<T>` is `(value: T) => T`. Annotate callback parameters or use these aliases when defining custom functions. Collection callbacks can use typed arrays such as `readonly string[]` or `number[]`. Plugins are responsible for providing operations suitable for the scope where they are used; template syntax has no plugin type metadata. Callbacks must be synchronous. Validators should return `false` for invalid input, rather than throwing. Exceptions are wrapped in `PLUGIN_EXECUTION_FAILED` without exposing their contents.

Each `PayloadVarsPlugin` has a display `name` and optional `validators` and `transformers` records. Operation aliases must be unique within each registry across all configured plugins; a validator and transformer may share an alias. Duplicate aliases throw `DUPLICATE_PLUGIN_OPERATION` during construction, including when the same plugin is registered twice. Display names do not need to be unique and are used in error details. Registry functions are snapshotted during construction.

`datePlugin`, `emailPlugin`, `collectionPlugin`, and the readonly `builtInPlugins` collection are exported individually. See [plugin syntax and built-in behavior](syntax.md#validators-and-transformers).

## Normalized template

`template.toJSON(): JsonValue` returns an independent copy with canonical placeholder strings. Nested arrays and objects are copied; literal values and object keys are preserved.

```ts
template.toJSON();
// { products: '{{products:string[ ?? omit ] ?? throw}}' }

JSON.stringify(template, null, 2); // Indented, normalized JSON
```

The constructor accepts already parsed JSON. Normalization is idempotent. Editing a returned template cannot change future method results.

## Extraction

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

## Rendering

`template.render(variables: PayloadTemplateVariables<T>): JsonValue` evaluates declared variables using the compiled contract and produces a fresh result. It ignores unused variables and treats inherited properties as missing. Template and supplied values are not mutated. Supplied arrays are copied.

Literal templates infer required variables and their input types. Dynamic templates accept `Readonly<Record<string, unknown>>`. See the [TypeScript guide](typescript.md) for fallback typing, readonly inputs, and limits.

Fallback evaluation precedes validation for both whole values and array members. Rendering stops at the first error. Root omission is an error because the method returns a JSON value.

Runtime values are supplied per call and never stored on the instance. Reuse the same instance for multiple payloads; a failed render does not affect subsequent calls.

```ts
template.render({ products: ['A', null, 'B'] }); // { products: ['A', 'B'] }
template.render({ products: ['C'] });            // { products: ['C'] }
```

## Errors

`PayloadTemplateError.issue` is a discriminated union. `error.message` is the issue code. Runtime values are never included in errors.

| Code | Details |
| --- | --- |
| `INVALID_PLACEHOLDER` | `path`, `placeholder` |
| `UNSUPPORTED_TYPE` | `path`, `variableName`, `declaredType` |
| `INVALID_FALLBACK_SYNTAX` | `path`, `variableName`, `placeholder` |
| `VARIABLE_EXPRESSION_CONFLICT` | `variableName`, `declaration`, `declaredAt`, `conflictingDeclaration`, `conflictingAt` |
| `DUPLICATE_PLUGIN_OPERATION` | `kind`, `operation`, `plugin` |
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

## Expression highlighting

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

<!-- {% endraw %} -->
