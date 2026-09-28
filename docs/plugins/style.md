---
title: style namespace
---

<!-- {% raw %} -->

# style namespace

[← All plugin namespaces](../plugins.md)

Named casing and word styles for strings. All operations below are always available.

| Operation | Validator (`!`, `?`) | Transformer (`>`, `~`) |
| --- | --- | --- |
| `style.camelCase` | Yes | Yes |
| `style.pascalCase` | Yes | Yes |
| `style.snakeCase` | Yes | Yes |
| `style.kebabCase` | Yes | Yes |
| `style.knownCase` | Yes | No |
| `style.upperCase` | Yes | Yes |
| `style.lowerCase` | Yes | Yes |

## Word styles


## Uppercase and lowercase

`style.upperCase` and `style.lowerCase` use JavaScript `toUpperCase()` and `toLowerCase()`, including their Unicode casing behavior, without changing separators or whitespace. Each validator passes exactly when its transformer would leave the string unchanged; empty strings pass. These operations allow punctuation and Unicode text.

```ts
new PayloadTemplate('{{name:string > style.upperCase ! style.upperCase}}')
  .render({ name: 'some-name' }); // 'SOME-NAME'
new PayloadTemplate('{{name:string > style.lowerCase}}')
  .render({ name: 'Some_Name' }); // 'some_name'
```

Casing operations formerly under `text` have no compatibility aliases; those old references throw `UNKNOWN_PLUGIN_OPERATION`. Use [text](text.md) for trimming and whitespace normalization.

<!-- {% endraw %} -->
