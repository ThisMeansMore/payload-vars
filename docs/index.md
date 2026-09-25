---
title: Getting started
---

<!-- Generated from README.md, package.json, and docs/_includes/home-footer.md by scripts/lib/docs.mjs. Do not edit directly. -->
<!-- {% raw %} -->

# payload-vars

Package version: v1.1.4

**Create payload templates as data, not code.** Variable names, types, and fallback rules live inside the template itself. Load a template at runtime, validate it, extract its variable contract, and render a JSON payload with supplied values.

The complete definition is plain JSON, so templates can be created, edited, serialized, and exchanged independently of application code.

## How it compares

| Approach | What it provides |
| --- | --- |
| Schema validation (e.g. [Zod](https://zod.dev/basics)) | Validates data against schemas typically defined in JavaScript or TypeScript. |
| JSON templating (e.g. [JSON-e](https://json-e.js.org/operators.html)) | Stores templates as data, with expressions, conditionals, and loops for generating JSON. |
| **payload-vars** | Combines a JSON payload template with inline variable types and fallback rules, plus an extractable variable contract. |

Use payload-vars when the payload shape and input rules should be defined together as data, with declarations such as `{{orderId:string}}` embedded directly in the template.

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

TypeScript infers `render()` inputs from literal templates. Use `as const` on separately declared templates to preserve their literal types; see the [TypeScript guide](typescript.md).

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

See the [syntax guide](syntax.md), [API and errors](api.md), and [migration and development guide](development.md) for details.

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
- [API and structured errors](api.md): validation, rendering, extraction, and syntax highlighting.
- [TypeScript input inference](typescript.md): inferred inputs and reusable types.
- [Migration and development](development.md): migration notes, testing, and releases.

[View the source on GitHub](https://github.com/ThisMeansMore/payload-vars)

<!-- {% endraw %} -->
