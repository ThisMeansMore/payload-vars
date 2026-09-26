---
title: Getting started
---

<!-- Generated from README.md, package.json, and docs/_includes/home-footer.md by scripts/lib/docs.mjs. Do not edit directly. -->
<!-- {% raw %} -->

# payload-vars

Package version: v1.3.0

**Create payload templates as data, not code.** Variable names, types, and fallback rules live inside the template itself. Load a template at runtime, validate it, extract its variable contract, and render a JSON payload with supplied values.

The complete definition is plain JSON, so templates can be created, edited, serialized, and exchanged independently of application code.

## How it compares

| Category | A good fit when you need… |
| --- | --- |
| Schema validation | General data validation with schemas defined in JavaScript or TypeScript (e.g. [Zod](https://zod.dev/basics)). |
| General JSON templating | JSON templates stored as data, with expressions, conditions, and loops for generating dynamic output (e.g. [JSON-e](https://json-e.js.org/operators.html)). |
| Typed placeholder templates | JSON templates with a small syntax for typed placeholders and fallback rules, plus an input contract you can inspect before rendering (the focus of **payload-vars**). |

**Define the output shape and input contract together, using a small placeholder syntax.** Choose payload-vars for configurable payloads where filling typed values into a predefined structure covers your needs. Declarations such as `{{orderId:string}}` keep the rules in the template, and `extractVariables()` lets an application or editor discover its inputs.

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

### 2. Validation

Construct a validated template and inspect its normalized formatting.

```js
const template = new PayloadTemplate(rawTemplate);
const normalized = template.toJSON();
// {
//   orderId: '{{orderId:string}}',
//   products: '{{products:string[ ?? omit ] ?? throw}}',
// }
```

### 3. Extraction

Extract variable contracts from the validated template.

```js
const variables = template.extractVariables();
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

### 4. Rendering

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

TypeScript infers `render()` inputs from literal templates. Use `as const` on separately declared templates to preserve their literal types; see [TypeScript input inference](development.md#typescript-input-inference).

## Plugins: your rules, inside plain JSON

**Validate an email. Extract its domain. Turn calendar dates into UTC timestamps. All in the template.**

Chain `@` validators and `>` transformers to express what a value must satisfy and how it should change. Built-in plugins cover dates, email addresses, and collections. Add your own reusable business rules with a few functions; the template stays portable JSON.

```ts
new PayloadTemplate('{{value:string @ email > domain}}')
  .render({ value: 'user@Example.com' }); // 'example.com'

new PayloadTemplate('{{value:string[ @ dateonly > isodatetime ] @ range}}')
  .render({ value: ['2026-01-01', '2026-12-31'] });
// ['2026-01-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z']
```

Use `@` for validation and `>` for transformation, in execution order. Existing `??` and `||` fallbacks still handle only nullish/falsy inputs; validation failures throw errors. Built-in operations are always available, including with `plugins: []`. Register custom extensions with `{ plugins: [customPlugin] }` and reference their operations as `@ customPlugin.validateSomething` or `> customPlugin.transformSomething`, using the plugin's `name` as its namespace. Custom operations cannot override built-ins.

**[Explore Plugins →](plugins.md)** — built-ins, execution order, and a complete custom-plugin example.

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

See the [syntax guide](syntax.md) and [Development](development.md) for the API, errors, TypeScript, and migration guidance.

## Module formats

The package supports both ES modules and CommonJS, with matching TypeScript declarations.

```js
// ES modules
import { PayloadTemplate } from 'payload-vars';

// CommonJS
const { PayloadTemplate } = require('payload-vars');
```

Import from the package root so your runtime selects the appropriate entry point.

## Guides

- [Changelog](changelog.md): version history and unreleased changes.
- [Examples](examples.md): demo templates and resulting payloads side by side.
- [Template syntax](syntax.md): types, fallbacks, array members, and omission.
- [Plugins](plugins.md): validators, transformers, built-ins, and your own reusable rules.
- [Development](development.md): API reference, structured errors, TypeScript, migration, testing, and releases.

[View the source on GitHub](https://github.com/ThisMeansMore/payload-vars)

<!-- {% endraw %} -->
