---
title: Getting started
---

<!-- Generated from README.md, package.json, and docs/_includes/home-footer.md by scripts/lib/docs.mjs. Do not edit directly. -->
<!-- {% raw %} -->

# payload-vars

Package version: v2.2.3

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
| `variables()` | Variable contracts in first occurrence order, with matching declarations deduplicated. |
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
const variables = template.variables();
// [
//   {
//     name: 'orderId',
//     type: 'string',
//     declaration: '{{orderId:string}}',
//     paths: ['$.orderId'],
//   },
//   {
//     name: 'products',
//     type: 'string[]',
//     memberFallback: { operator: '??', action: 'omit' },
//     valueFallback: { operator: '??', action: 'throw' },
//     declaration: '{{products:string[ ?? omit ] ?? throw}}',
//     paths: ['$.products'],
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

TypeScript infers `render()` inputs from literal templates. Use `as const` on separately declared templates to preserve their literal types; see [TypeScript input inference](development.md#typescript-input-inference).

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

Use `!` to throw on validation failure. Use `?` to transform with `>` on success, or with the optional `~` alternative on failure. Without `~`, failed conditional validation leaves the value unchanged. `??` and `||` still handle only nullish/falsy inputs before operations run. Built-in operations are always available, including with `plugins: []`. Register custom extensions with `{ plugins: [customPlugin] }` and reference their operations as `! customPlugin.validateSomething` or `> customPlugin.transformSomething`, using the plugin's `name` as its namespace. All operations require `namespace.operation`. Custom plugins cannot use the [17 reserved built-in namespaces](plugins.md#reserved-namespaces) or override built-ins. The `style` namespace handles named casing and word styles; `text` handles trimming and whitespace normalization.

**[Explore Plugins →](plugins.md)** — built-ins, execution order, and a complete custom-plugin example.

## Derived values and output omission

```ts
const template = new PayloadTemplate({
  date1: '{{date1:string > date.isodatetime > core.omit}}',
  date2: '{{date2:string > date.isodatetime > core.omit}}',
  hoursDifference: '{{hoursDifference:number = date.interval(date1,date2) > date.msToHours}}',
});
template.render({ date1: '2026-01-01', date2: '2026-01-02' });
// { hoursDifference: 24 }
```

**Breaking change:** bare function arguments now read evaluated template properties, including properties hidden by `core.omit`. Use `date.interval($.date1,$.date2)` to retain the original-input behavior, or `date.interval(date1,$.date2)` to mix sources. Raw date-only strings still fail `date.interval` validation; transformed ISO datetimes succeed.

Bare references are root-relative placeholder locations (`date1`, `dates.start`, `items[0].date`), not the input names inside placeholders. Array indices refer to template positions before omissions. References evaluate by dependency, once per location per render, regardless of property order; derived-property chains are supported, and unknown references and cycles fail at construction. Each ordinary occurrence starts from its original input. Derived output names are never required inputs. See [function syntax](syntax.md#derived-expressions-and-omission) for path restrictions and [the function guide](plugins/guide.md#derived-functions).

`core.omit` removes the containing property or array entry after evaluation. It must be an unconditional, terminal whole-value operation; root omission throws `CANNOT_OMIT_ROOT`. See [derived functions](plugins/guide.md#derived-functions) for custom signatures, execution order, and extraction metadata.

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

## Plugin namespaces

- [array](plugins/array.md)
- [boolean](plugins/boolean.md)
- [collection](plugins/collection.md)
- [core](plugins/core.md)
- [date](plugins/date.md)
- [email](plugins/email.md)
- [encoding](plugins/encoding.md)
- [id](plugins/id.md)
- [iso](plugins/iso.md)
- [json](plugins/json.md)
- [network](plugins/network.md)
- [number](plugins/number.md)
- [phone](plugins/phone.md)
- [style](plugins/style.md)
- [text](plugins/text.md)
- [time](plugins/time.md)
- [url](plugins/url.md)

[View the source on GitHub](https://github.com/ThisMeansMore/payload-vars)

<!-- {% endraw %} -->
