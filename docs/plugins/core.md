---
title: core namespace
---

<!-- {% raw %} -->

# core namespace

[← All plugin namespaces](../plugins.md)

Operations across base types.

| Operation | Kind | Scope |
| --- | --- | --- |
| `core.omit` | Renderer operation using `>` | Whole value, all supported base types |

## Output omission

`> core.omit` removes the containing output property or template array entry after evaluation succeeds. It is a renderer operation that works across all base types. It does not allow ordinary transformers to return a different type.

Only unconditional terminal whole-value use is allowed. Member-scope use, success/alternative branches, and any following operation raise `INVALID_OMIT_OPERATION`. A trailing fallback is allowed and retains its existing execution order. A fallback-produced null is also omitted; `throw`, invalid inputs, and failed operations still raise errors. Omitting the root raises `CANNOT_OMIT_ROOT`.

```ts
new PayloadTemplate({
  checked: '{{email:string ! email.email > core.omit}}',
  domain: '{{email:string > email.domain}}',
}).render({ email: 'user@Example.com' });
// { domain: 'example.com' }
```

Each property reads the original input independently. Omitting one property does not hide its source value from another property or function. To omit only nullish or falsy values, use the existing [fallback syntax](../syntax.md).

<!-- {% endraw %} -->
