# payload-vars

Validate JSON templates, extract typed variables, and render them with runtime values. This ESM package has no runtime dependencies and supports browsers and Node.js 18+.

## Install

```sh
npm install payload-vars
```

## Basic usage

```js
import { PayloadTemplate } from 'payload-vars';
```

### 1. JSON with variables

Start with unformatted variable expressions.

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

Placeholders occupy an entire string. Types are `string`, `number`, `boolean`, `string[]`, and `number[]`. Use `??` for nullish fallback or `||` for falsy fallback, with actions `null`, `omit`, or `throw`. Invalid templates throw `PayloadTemplateError`; inputs are never mutated.

TypeScript infers `render()` inputs from literal templates. Use `as const` on separately declared templates to preserve their literal types; see the [TypeScript guide](docs/typescript.md).

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

See the [syntax guide](docs/syntax.md), [API and errors](docs/api.md), and [migration and development guide](docs/development.md) for details.
