---
title: email namespace
---

<!-- {% raw %} -->

# email namespace

[← All plugin namespaces](../plugins.md)

Email address and domain validation, plus domain extraction.

| Operation | Validator (`!`, `?`) | Transformer (`>`, `~`) |
| --- | --- | --- |
| `email.email` | Yes | No |
| `email.domain` | Yes | Yes |

`email.email` validates common ASCII dot-atom addresses with a dotted DNS domain (quoted local parts and internationalized addresses are unsupported). `email.domain` validates dotted ASCII DNS labels. The `email.domain` transformer extracts and lowercases the domain of a valid email: `user@Example.com` becomes `example.com`.

```ts
new PayloadTemplate('{{email:string ! email.email > email.domain}}')
  .render({ email: 'user@Example.com' }); // 'example.com'
```

These operations accept strings. Validation does not narrow TypeScript's `string` type; validity is checked at render time.

<!-- {% endraw %} -->
