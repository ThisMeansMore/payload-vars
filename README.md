# payload-vars

[Documentation](https://thismeansmore.github.io/payload-vars/)

**Imagine a DTO with validation and transformation rules, all expressed in plain, human-readable JSON.** Templates live in data, so you can store them, inspect their input contracts, and render them into payloads with runtime values.

The package has no runtime dependencies and supports browsers and Node.js 18+, with ES module and CommonJS entry points.

## Install

```sh
npm install payload-vars
```

## Basic usage

```js
import { PayloadTemplate } from 'payload-vars';
```

### 1. JSON with variables

Define the payload structure with variable expressions as ordinary JSON strings.

```js
const rawTemplate = {
  orderId: '{{ orderId : string }}',
  products: '{{products:string[??omit]??throw}}',
};
```

### 2. Compilation

The constructor validates the template and compiles a reusable contract:

```js
const template = new PayloadTemplate(rawTemplate);
```

The template provides these methods:

| Method | Returns |
| --- | --- |
| `compile()` | Variable contracts in first occurrence order, with matching declarations deduplicated. |
| `toJSON()` | A copy of the normalized template. |
| `render(values)` | The payload with runtime values filled in. |
| `tokenizePayloadExpression()` | Highlighting tokens for each normalized placeholder occurrence. |

Inspect the normalized template:

```js
const normalized = template.toJSON();
// {
//   orderId: '{{orderId:string}}',
//   products: '{{products:string[ ?? omit ] ?? throw}}',
// }
```

Inspect the compiled variable contracts:

```js
const variables = template.compile();
// [
//   {
//     name: 'orderId',
//     type: 'string',
//     declaration: '{{orderId:string}}',
//   },
//   {
//     name: 'products',
//     type: 'string[]',
//     memberFallback: { operator: '??', action: 'omit' },
//     valueFallback: { operator: '??', action: 'throw' },
//     declaration: '{{products:string[ ?? omit ] ?? throw}}',
//   },
// ]
```

### 3. Rendering

Render the resulting object with runtime values.

```js
const payload = template.render({
  orderId: 'ORD-123',
  products: ['A', null, 'B'],
});
// { orderId: 'ORD-123', products: ['A', 'B'] }
```

`template.toJSON()` returns the normalized template; `render()` returns the payload with values filled in.

Placeholders occupy an entire string. Types are `string`, `number`, `boolean`, `string[]`, and `number[]`. Use `??` for nullish fallback or `||` for falsy fallback, with actions `null`, `omit`, or `throw`. Invalid templates throw `PayloadTemplateError`; inputs are never mutated.

TypeScript infers `render()` inputs from literal templates. Use `as const` on separately declared templates to preserve their literal types; see [TypeScript input inference](docs/development.md#typescript-input-inference).

## Plugins: your rules, inside plain JSON

**Validate an email. Extract its domain. Turn calendar dates into UTC timestamps. All in the template.**

Chain `!` validators, `?` conditional validators, and `>` transformers to express what a value must satisfy and how it should change. Built-in plugins cover dates, email addresses, and collections. Add your own reusable business rules with a few functions; the template stays portable JSON.

```ts
new PayloadTemplate('{{value:string ! email.email > email.domain}}')
  .render({ value: 'user@Example.com' }); // 'example.com'

new PayloadTemplate('{{value:string ? date.dateonly > date.isodatetime}}')
  .render({ value: 'not a date' }); // 'not a date'

new PayloadTemplate('{{value:string[ ! date.dateonly > date.isodatetime ] ! collection.range}}')
  .render({ value: ['2026-01-01', '2026-12-31'] });
// ['2026-01-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z']
```

Use `!` to throw on validation failure. Use `?` to transform with `>` on success, or with the optional `~` alternative on failure. Without `~`, failed conditional validation leaves the value unchanged. `??` and `||` still handle only nullish/falsy inputs before operations run. Built-in operations are always available, including with `plugins: []`. Register custom extensions with `{ plugins: [customPlugin] }` and reference their operations as `! customPlugin.validateSomething` or `> customPlugin.transformSomething`, using the plugin's `name` as its namespace. All operations require `namespace.operation`. Custom plugins cannot use the [16 reserved built-in namespaces](docs/plugins.md#reserved-namespaces) or override built-ins.

**[Explore Plugins →](docs/plugins.md)** — built-ins, execution order, and a complete custom-plugin example.

## Syntax highlighting

```js
const expressions = template.tokenizePayloadExpression();
// expressions[0]:
// {
//   path: '$.orderId',
//   expression: '{{orderId:string}}',
//   tokens: [
//     { kind: 'delimiter', text: '{{', start: 0, end: 2 },
//     { kind: 'variable', text: 'orderId', start: 2, end: 9 },
//     { kind: 'punctuation', text: ':', start: 9, end: 10 },
//     { kind: 'type', text: 'string', start: 10, end: 16 },
//     { kind: 'delimiter', text: '}}', start: 16, end: 18 },
//   ],
// }
```

Each token has `kind`, `text`, `start`, and `end`. Map kinds to your own styles.

See the [syntax guide](docs/syntax.md) and [Development](docs/development.md) for the API, errors, TypeScript, and migration guidance.

## Module formats

The package supports both ES modules and CommonJS, with matching TypeScript declarations.

```js
// ES modules
import { PayloadTemplate } from 'payload-vars';

// CommonJS
const { PayloadTemplate } = require('payload-vars');
```

Import from the package root so your runtime selects the appropriate entry point.
