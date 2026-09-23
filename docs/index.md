---
title: Getting started
---

<!-- {% raw %} -->

# payload-vars

Validate JSON templates, extract typed variables, and render them with runtime values. This ESM package has no runtime dependencies and supports browsers and Node.js 18+.

## Install

```sh
npm install payload-vars
```

## Quick start

```js
import { PayloadTemplate } from 'payload-vars';

const template = new PayloadTemplate({
  orderId: '{{orderId:string}}',
  products: '{{products:string[ ?? omit ] ?? throw}}',
});

template.render({ orderId: 'ORD-123', products: ['A', null, 'B'] });
// { orderId: 'ORD-123', products: ['A', 'B'] }
```

Construct a template once to validate its placeholders, then reuse it to render payloads. Use `toJSON()` to inspect its normalized form and `extractVariables()` to inspect its variable contracts.

## Guides

- [Examples](examples.md): demo templates and resulting payloads side by side.
- [Template syntax](syntax.md): types, fallbacks, array members, and omission.
- [API and structured errors](api.md): validation, rendering, extraction, and syntax highlighting.
- [TypeScript input inference](typescript.md): inferred inputs and reusable types.
- [Migration and development](development.md): migration notes, testing, and releases.

[View the source on GitHub](https://github.com/ThisMeansMore/payload-vars)

<!-- {% endraw %} -->
