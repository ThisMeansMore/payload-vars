---
title: text namespace
---

<!-- {% raw %} -->

# text namespace

[← All plugin namespaces](../plugins.md)

Trimming and whitespace normalization for strings.

| Operation | Validator (`!`, `?`) | Transformer (`>`, `~`) |
| --- | --- | --- |
| `text.trim` | Yes | Yes |
| `text.normalizeSpaces` | Yes | Yes |

`text.trim` uses JavaScript `trim()`. `text.normalizeSpaces` replaces every run of JavaScript whitespace (`/\s+/g`) with one ordinary space. It preserves a resulting space at either edge: `"  A\t test\n"` becomes `" A test "`. Compose it with `text.trim` to remove those edge spaces.

Each validator passes exactly when its transformer would leave the string unchanged; empty strings pass. Both operations allow punctuation and Unicode text.

```ts
new PayloadTemplate('{{name:string > text.normalizeSpaces > text.trim}}')
  .render({ name: '  A\t test\n' }); // 'A test'
```

For casing and word styles, use [style](style.md). Former casing operations under `text` have no compatibility aliases; referencing them throws `UNKNOWN_PLUGIN_OPERATION`.

<!-- {% endraw %} -->
