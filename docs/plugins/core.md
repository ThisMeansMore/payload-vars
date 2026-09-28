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

Each ordinary property starts from its original input independently. `core.omit` controls final output assembly only: functions using a bare reference still receive the omitted property’s evaluated value, including its transformations. Raw `$.name` references still receive the original input. A [fallback](../syntax.md) resolving to `omit`, unlike `core.omit`, produces no usable evaluated value and causes a structured argument error if referenced.

<!-- {% endraw %} -->
