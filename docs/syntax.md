---
title: Syntax
---

<!-- {% raw %} -->

# Template syntax

The `PayloadTemplate` constructor accepts parsed JSON values. A placeholder occupies an entire JSON string: `{{name:expression}}`. Names match `[A-Za-z_][A-Za-z0-9_]*`. Partial interpolation is unsupported. Strings without `{{` or `}}` are constants; object keys are always literal.

## Base types

| Type | Valid values |
| --- | --- |
| `string` | Any string, including `""` |
| `number` | Finite JavaScript numbers, including `0` |
| `boolean` | `true` or `false` |
| `string[]` | Arrays of strings |
| `number[]` | Arrays of finite numbers |

Values are never coerced. Without a fallback, missing variables fail with `MISSING_VARIABLE`; supplied `undefined`, `null`, and incompatible values fail type validation. Empty arrays remain empty. There are no separate nullable or optional types.

## Fallback expressions

Fallbacks run before type validation. `??` matches `null`, `undefined`, and missing variables. `||` matches all JavaScript falsy values, including `""`, `0`, `false`, and `NaN`. Arrays, including `[]`, are truthy. A falsy non-array input also triggers an array's `||` fallback before array validation.

| Action | Result |
| --- | --- |
| `null` | JSON `null`, bypassing validation for that value |
| `omit` | Remove the containing object property or array entry |
| `throw` | Raise a structured `PayloadTemplateError` with code `FALLBACK_THROW` |

Values that do not trigger a fallback must still pass strict base-type validation.

```text
{{comment:string ?? null}}
{{comment:string || omit}}
{{amount:number || throw}}
{{enabled:boolean ?? throw}}
{{products:string[] ?? omit}}
```

`string ?? throw` preserves `""`, `number ?? throw` preserves `0`, and `boolean ?? throw` preserves `false`. Using `|| throw` rejects each of those values.

## Array members

Place a fallback inside brackets to process each member independently:

| Expression | Input | Output |
| --- | --- | --- |
| `string[ ?? omit ]` | `["a", "", null, undefined, "b"]` | `["a", "", "b"]` |
| `string[ ?? null ]` | `["a", "", null, undefined, "b"]` | `["a", "", null, null, "b"]` |
| `string[ \|\| omit ]` | `["a", "", null, undefined, "b"]` | `["a", "b"]` |
| `number[ \|\| null ]` | `[1, undefined, null, 0, 2]` | `[1, null, null, null, 2]` |

Both operators support `throw` for members. Sparse array slots are processed as `undefined`. Omission preserves the order of remaining members. Remaining members must pass type validation; for example, `number[ ?? omit ]` still rejects `"2"` and `NaN`.

Combine member and whole-value fallbacks:

```text
{{products:string[ ?? omit ] ?? throw}}
{{amounts:number[ || null ] ?? omit}}
```

The outer fallback processes the supplied variable first. Only an actual array reaches member processing. Member fallback alone cannot handle a missing or nullish whole array.

## Validators and transformers

Use `@ name` to validate and `> name` to transform. Operation names use the same identifier syntax as variable names. Operations run left-to-right within a scope and precede that scope's optional fallback in the declaration:

```text
{{value:string @ email > domain}}
{{value:string[ @ dateonly > isodatetime ?? omit ] @ range ?? throw}}
```

At runtime, the whole-value fallback runs first, followed by type checking. For arrays, each member's fallback, type check, and operations run before collection operations. A fallback-produced `null` bypasses member operations but remains visible to collection operations; omitted members are removed first.

Validators return a boolean without modifying the input. `false` raises `VALIDATION_FAILED`; it never triggers a fallback. Transformers preserve the declared type. Their results are checked without running fallbacks again, so a string transformer may return `""` even with `|| null`. Returning `null`, `undefined`, an omission marker, another type, or a non-finite number fails with `INVALID_TRANSFORMER_RESULT`. Collection transformations may retain existing member-fallback nulls but cannot add new nulls. Collection validators receive a frozen copy; collection transformers receive a mutable copy.

See [Plugins](plugins.md) for the built-in operations, configuration, and custom validator and transformer examples.

Plugin whitespace follows the existing canonical rules: `string[@dateonly>isodatetime]@range` becomes `string[ @ dateonly > isodatetime ] @ range`. Repeated declarations must include identical operations in identical order. Unknown operation names fail during construction.

## Omission

Omission removes an object property, a placeholder entry in a template array, or an individual member of a supplied array. Empty containers remain present. Intentional omission uses an internal symbol, never `undefined` or `null`.

A root placeholder has no containing structure. If its `omit` fallback triggers, rendering raises `CANNOT_OMIT_ROOT`; otherwise it renders normally. `render()` always returns a JSON value on success.

## Whitespace and canonical contracts

Whitespace between tokens is insignificant, including spaces, tabs, and newlines around names, colons, brackets, operators, and actions. Tokens themselves cannot be split (`? ?`, `| |`, and `n ull` are invalid). Placeholder delimiters remain `{{` and `}}`, and the placeholder must occupy the entire string.

| Input expression | Canonical expression |
| --- | --- |
| `string??null` | `string ?? null` |
| `string   ??   null` | `string ?? null` |
| `string [ ]` | `string[]` |
| `string[?? omit]` | `string[ ?? omit ]` |
| `string [   ?? omit ]??throw` | `string[ ?? omit ] ?? throw` |

`toJSON()` returns a template with canonical placeholders. Extraction exposes the complete canonical placeholder as `declaration`. It does not mutate template strings. Repeated names must have identical canonical declarations, including both fallback operators and actions. Whitespace differences do not conflict.

Unsupported examples include `string?`, `string!`, `string_`, `boolean[]`, `string ? null`, `string ?? undefined`, `string && throw`, `string[ omit ]`, unbalanced brackets, and multiple fallbacks at the same level.

<!-- {% endraw %} -->
