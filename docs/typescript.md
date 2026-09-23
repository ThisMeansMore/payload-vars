---
title: TypeScript
---

<!-- {% raw %} -->

# TypeScript input inference

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

## Fallback input types

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

## Reusable input types

`PayloadTemplateVariables<T>` exposes the inferred input contract:

```ts
import { PayloadTemplate, type PayloadTemplateVariables } from 'payload-vars';

const rawTemplate = { amount: '{{amount:number}}' } as const;
type Variables = PayloadTemplateVariables<typeof rawTemplate>;

const values: Variables = { amount: 19.95 };
new PayloadTemplate(rawTemplate).render(values);
```

## Dynamic templates and runtime validation

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

<!-- {% endraw %} -->
