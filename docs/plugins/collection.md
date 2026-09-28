---
title: collection namespace
---

<!-- {% raw %} -->

# collection namespace

[← All plugin namespaces](../plugins.md)

Whole-collection validation for string and number arrays.

| Operation | Kind | Requirement |
| --- | --- | --- |
| `collection.unique` | Validator | All values are unique |
| `collection.range` | Validator | Exactly two strictly ascending values |

`collection.unique` checks the entire collection using `Set` equality. `collection.range` requires exactly two strictly ascending strings or numbers; strings use JavaScript lexicographic order. Member transformations run first, so `string[ ! date.dateonly > date.isodatetime ] ! collection.range` compares the transformed strings.

```ts
new PayloadTemplate('{{values:number[] ! collection.unique ! collection.range}}')
  .render({ values: [1, 2] }); // [1, 2]
```

Collection validators receive a frozen copy of the processed array. Member fallbacks and transformations run first; see [execution order and array scopes](guide.md#execution-order-and-array-scopes). This namespace currently has no transformers or functions. The separate [array](array.md) namespace is reserved for future array-specific operations.

<!-- {% endraw %} -->
