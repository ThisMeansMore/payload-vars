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

Use `! namespace.operation` for throwing validation, `? namespace.operation` for conditional validation, and `> namespace.operation` to transform. Each segment uses the same identifier syntax as variable names. Operations run left-to-right within a scope and precede that scope's optional fallback in the declaration:

```text
{{value:string ! email.email > email.domain}}
{{value:string[ ! date.dateonly > date.isodatetime ?? omit ] ! collection.range ?? throw}}
```

At runtime, the whole-value fallback runs first, followed by type checking. For arrays, each member's fallback, type check, and operations run before collection operations. A fallback-produced `null` bypasses member operations but remains visible to collection operations; omitted members are removed first.

Validators return a boolean without modifying the input. With `!`, failure raises `VALIDATION_FAILED`. With `?`, success applies the immediately following optional `>` transformation; failure applies the optional `~` transformation, or leaves the value unchanged when `~` is absent. Neither kind of validation triggers a fallback. Plugin exceptions still raise `PLUGIN_EXECUTION_FAILED`, including inside conditionals. Transformers preserve the declared type. Their results are checked without running fallbacks again, so a string transformer may return `""` even with `|| null`. Returning `null`, `undefined`, an omission marker, another type, or a non-finite number fails with `INVALID_TRANSFORMER_RESULT`. Collection transformations may retain existing member-fallback nulls but cannot add new nulls. Collection validators receive a frozen copy; collection transformers receive a mutable copy.

A conditional group is `? validator [> transformer] [~ transformer]`. Both transformations are optional. `~` belongs only to the immediately preceding conditional group in the same scope; it is invalid after `!`, a standalone transformation, or a fallback. Only the chosen branch runs, receiving the value tested by the validator. Subsequent operations continue left-to-right; a second `>` after a success transformation is unconditional.

```text
{{value:string ? date.dateonly > date.isodatetime}}
{{value:string ? date.dateonly > date.isodatetime ~ custom.trim}}
{{values:string[ ? date.dateonly > date.isodatetime ?? omit ] ?? null}}
```

The second example requires a registered `custom.trim` transformer. Operation names and plugin behavior are unchanged. All operations, including both branches, are resolved during construction. The old `@` operator is rejected with `LEGACY_VALIDATION_SYNTAX`; replace it with `!` to preserve its behavior.

See [Plugins](plugins.md) for the built-in operations, configuration, and custom validator and transformer examples.

Plugin whitespace follows the existing canonical rules: `string[!date.dateonly>date.isodatetime]!collection.range` becomes `string[ ! date.dateonly > date.isodatetime ] ! collection.range`. Repeated source names may use different operations and fallbacks; each occurrence is evaluated independently from the original input. Their base types must agree. Unknown operation names fail during construction. Built-in and custom operation references require `namespace.operation` with any of `!`, `?`, `>`, or `~`, for example `! email.email` or `> custom.trim`. Each segment matches `[A-Za-z_][A-Za-z0-9_]*`, with exactly one dot and no whitespace around it for all operation references. This syntax applies in both member and whole-value scopes.

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

`toJSON()` returns a template with canonical placeholders. Extraction exposes the complete canonical placeholder as `declaration`. It does not mutate template strings. Identical canonical declarations remain deduplicated by `variables()`. Distinct expressions for the same source name retain their own declarations and paths. Incompatible base types raise `VARIABLE_TYPE_CONFLICT`.

Unsupported examples include `string?`, `string!`, `string_`, `boolean[]`, `string ? null`, `string ?? undefined`, `string && throw`, `string[ omit ]`, unbalanced brackets, and multiple fallbacks at the same level.

## Derived expressions and omission

Use `resultName:baseType = namespace.function(arg1,arg2)` before whole-value operations and the optional fallback. Array result base types use empty brackets, such as `number[] = custom.values($.source)`. Canonical calls remove whitespace inside the argument list: `{{hours:number = date.interval(start,end) > date.msToHours}}`.

Bare arguments are exact root-relative template paths to placeholders, including derived placeholders: `start`, `dates.start`, `items[0].date`, or `[0].date` for a root array. Property segments match `[A-Za-z_][A-Za-z0-9_]*`; array indices are nonnegative decimal integers with no leading zeros except `0`. No whitespace is allowed inside a path. Array positions refer to the original template before omitted entries are removed. Resolution never searches by leaf name or placeholder input name, so repeated leaf names are unambiguous when fully qualified. Literal keys containing dots/brackets are not treated as paths. Quoted keys, keys outside this identifier grammar, wildcards, relative paths, literals, container references, root references, and nested calls are unsupported. Unknown paths and incompatible declared property types fail during construction, as do self-references and cycles.

`$.name` explicitly reads a single original render input by name; it is not a nested input path. Its required type comes from the function signature. No placeholder is needed for a raw argument. A bare reference uses the referenced placeholder's declared result type for construction checks and its fully evaluated value at runtime. Derived output names do not become required render inputs. Canonical calls preserve the source distinction and remove whitespace around arguments.

**Migration:** bare arguments previously read original inputs. Change `fn(a,b)` to `fn($.a,$.b)` to preserve that behavior.

Use terminal `> core.omit` to remove the containing property or array entry unconditionally after evaluation. It cannot be used inside member brackets or as a conditional branch. A trailing fallback keeps its usual timing. See [functions and omission](plugins/guide.md#derived-functions).

<!-- {% endraw %} -->
