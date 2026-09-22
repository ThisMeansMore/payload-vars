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

## Normalized template

`template.toJSON(): JsonValue` returns an independent copy with canonical placeholder strings. Nested arrays and objects are copied; literal values and object keys are preserved.

```ts
template.toJSON();
// { products: '{{products:string[ ?? omit ] ?? throw}}' }

JSON.stringify(template, null, 2); // Indented, normalized JSON
```

The constructor accepts already parsed JSON. Normalization is idempotent. Editing a returned template cannot change future method results.

## Extraction

`template.extractVariables(): PayloadVariable[]` returns the compiled variable contracts in first occurrence order, deduplicating matching declarations. Each call returns fresh objects, including nested fallback expressions.

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

`BaseType` contains only the five supported base types. `PayloadVariableType` aliases `BaseType`. `ParsedVariableExpression` contains `name`, `type`, optional `memberFallback`, and optional `valueFallback`. `PayloadVariable` adds the canonical `declaration` string. Absent fallbacks are omitted from extracted objects.

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
