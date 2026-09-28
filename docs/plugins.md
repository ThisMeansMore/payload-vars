---
title: Plugins
---

<!-- {% raw %} -->

# Plugins

Plugins add named validators, transformers, and derived functions to JSON templates. Built-ins are always available, including with `plugins: []`. Each namespace has its own reference page below.

## Namespace reference

| Namespace | Scope | Availability |
| --- | --- | --- |
| [style](plugins/style.md) | Named casing and word styles | Available |
| [text](plugins/text.md) | Trimming and whitespace normalization | Available |
| [number](plugins/number.md) | Numeric operations | Reserved; no operations yet |
| [boolean](plugins/boolean.md) | Boolean operations | Reserved; no operations yet |
| [date](plugins/date.md) | Dates, datetimes, and intervals | Available |
| [collection](plugins/collection.md) | General collection operations | Available |
| [array](plugins/array.md) | Array-specific operations | Reserved; no operations yet |
| [email](plugins/email.md) | Email addresses and domains | Available |
| [url](plugins/url.md) | URLs and TLDs | Reserved; no operations yet |
| [json](plugins/json.md) | JSON text | Reserved; no operations yet |
| [encoding](plugins/encoding.md) | Encoding and decoding | Reserved; no operations yet |
| [iso](plugins/iso.md) | ISO country, currency, and language codes | Reserved; no operations yet |
| [time](plugins/time.md) | Times of day and durations | Reserved; no operations yet |
| [phone](plugins/phone.md) | Phone numbers | Reserved; no operations yet |
| [network](plugins/network.md) | IP addresses and network identifiers | Reserved; no operations yet |
| [id](plugins/id.md) | Identifiers such as UUIDs | Reserved; no operations yet |
| [core](plugins/core.md) | General operations across types | Available |

## Plugin guide

Shared rules and custom registration live in the [plugin guide](plugins/guide.md):

- [Validators and transformers](plugins/guide.md#validators-and-transformers)
- [Conditional validation](plugins/guide.md#conditional-validation)
- [Execution order and array scopes](plugins/guide.md#execution-order-and-array-scopes)
- [Derived functions](plugins/guide.md#derived-functions)
- [Plugin configuration](plugins/guide.md#plugin-configuration)
- [Writing a custom plugin](plugins/guide.md#writing-a-custom-plugin)
- [Errors and TypeScript](plugins/guide.md#errors-and-typescript)
- [Migrating from flat plugin names](plugins/guide.md#migrating-from-flat-plugin-names)

## Reserved namespaces

All 17 namespaces listed above are reserved. Custom plugins using any of these names raise `RESERVED_PLUGIN_NAME`, even when empty. A reserved namespace does not necessarily have implemented operations; availability is listed in the table above. Adding a reserved namespace in the future is a compatibility change for custom plugins using that name.

## Built-in operations

Browse the [namespace reference](#namespace-reference) for operation signatures, validation rules, and examples. Built-ins cannot be overridden. Operation names require their namespace, such as `! email.email`, `> text.trim`, or `= date.interval(start,end)`.

## Derived functions

Functions read named original render inputs and produce a typed result. See the [function guide](plugins/guide.md#derived-functions) for custom signatures and execution order, or [date intervals](plugins/date.md#intervals-and-hours) for a complete example.

## Output omission

Use terminal `> core.omit` to remove a property or array entry after evaluation. See the [core namespace](plugins/core.md) for restrictions, fallback behavior, and examples.

<!-- {% endraw %} -->
