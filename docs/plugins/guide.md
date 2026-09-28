---
title: Plugin guide
---

<!-- {% raw %} -->

# Plugin guide

[← All plugin namespaces](../plugins.md)

Shared syntax, execution rules, and registration for every plugin namespace.

- [Validators and transformers](#validators-and-transformers)
- [Conditional validation](#conditional-validation)
- [Execution order and array scopes](#execution-order-and-array-scopes)
- [Derived functions](#derived-functions)
- [Plugin configuration](#plugin-configuration)
- [Writing a custom plugin](#writing-a-custom-plugin)
- [Errors and TypeScript](#errors-and-typescript)
- [Migrating from flat plugin names](#migrating-from-flat-plugin-names)

## Validators and transformers

| Syntax | Purpose | Result |
| --- | --- | --- |
| `! namespace.operation` | Check a value against a rule. | Keep the value when valid; throw when invalid. |
| `? namespace.operation` | Check a value conditionally. | Apply the following `>` on success; otherwise apply `~`, or keep the value. |
| `~ namespace.operation` | Transform when conditional validation fails. | Allowed only within a `?` group. |
| `> namespace.operation` | Transform a value. | Use the returned value, which must keep the declared base type. |

```ts
import { PayloadTemplate } from 'payload-vars';

const template = new PayloadTemplate({
  domain: '{{email:string ! email.email > email.domain}}',
});

template.render({ email: 'user@Example.com' });
// { domain: 'example.com' }
```

Here `string` checks the base type, `! email.email` validates the address, and `> email.domain` extracts a lowercase domain. Both the supplied email and the resulting domain are strings. A transformer cannot turn a string into a number or an object.

Operation order matters: each operation receives the preceding operation's result. Throwing validators leave the value unchanged. Built-in and custom operations both require `namespace.operation`, such as `email.email` or `custom.trim`. Each name segment must match `[A-Za-z_][A-Za-z0-9_]*`. Names are case-sensitive; exactly one dot and no whitespace around it are allowed. Variable names remain unchanged.

## Conditional validation

`? validator [> transformer] [~ transformer]` selects at most one transformation. Without `~`, a failed check keeps the value unchanged. Both branches receive the tested value, preserve its declared type, and use the same plugins as ordinary transformations. Exceptions from callbacks still throw. Fallbacks run before these operations. See [conditional syntax](../syntax.md#validators-and-transformers).

Replace the old `@` operator with `!` for the same throwing behavior. Old expressions now fail during compilation with `LEGACY_VALIDATION_SYNTAX` and migration guidance.

## Execution order and array scopes

Inside `[]`, operations apply to each array member. After `]`, operations apply to the processed collection:

```ts
const period = new PayloadTemplate(
  '{{dates:string[ ! date.dateonly > date.isodatetime ?? omit ] ! collection.range ?? throw}}',
);

period.render({ dates: ['2026-01-01', null, '2026-12-31'] });
// ['2026-01-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z']
```

The whole-value fallback runs first. Each remaining member then goes through its own fallback, base-type check, and operations. Collection operations run last. This example omits a null member, validates the remaining calendar dates, converts them to UTC ISO strings, and checks that the resulting pair is strictly ascending.

Although fallback syntax comes after operations in a declaration, fallbacks execute first. `??` and `||` handle missing, nullish, or falsy inputs; they do not catch failed validators or plugin exceptions. A fallback-produced `null` skips that member's operations but remains visible to collection operations. Omitted members are removed before collection operations.

Transformer results are checked against the declared type without rerunning fallbacks. For example, a string transformer returning `''` does not trigger a later `|| null`. Collection transformations may retain existing member-fallback nulls but cannot introduce new nulls. Collection validators receive a frozen copy; collection transformers receive a mutable copy.

## Derived functions

A function takes evaluated property references, original input references, or both, and produces a typed result:

```text
{{hoursDifference:number = date.interval(date1,date2) > date.msToHours}}
```

Arguments are comma-separated references with optional surrounding whitespace. Bare `date1` reads the evaluated template property at `$.date1`; it does not select the input variable named inside that placeholder. `$.date1` reads the untouched original render input. Mix both forms freely. Raw references need no separate placeholder. Bare references can target derived properties, provided the dependency graph has no cycles. Nested inline calls are unsupported. See [path syntax](../syntax.md#derived-expressions-and-omission).

This is a breaking change from the original-input meaning of bare arguments. Prefix old raw arguments with `$.` to migrate. A result fallback does not make raw arguments optional; a referenced property retains its own input fallback rules.

See [date](date.md#intervals-and-hours) for `date.interval` and `date.msToHours`.

Register a custom synchronous function with `argumentTypes`, `resultType`, and `execute`:

```ts
import { PayloadTemplate, type PayloadVarsPlugin } from 'payload-vars';

const custom = {
  name: 'custom',
  functions: {
    count: {
      argumentTypes: ['string[]'],
      resultType: 'number',
      execute: (items: readonly string[]) => items.length,
    },
  },
} as const satisfies PayloadVarsPlugin;

new PayloadTemplate('{{count:number = custom.count($.items)}}', { plugins: [custom] })
  .render({ items: ['A', 'B'] }); // 2
```

`PayloadFunction` is the exported signature type. Argument and result types use the five supported base types. Construction snapshots signatures and callbacks, resolves names, and checks arity, the declared result type, and compatible base-type requirements for all source inputs. Function arrays cannot contain nulls, holes, or non-finite numbers. Function callbacks receive separate copies of array arguments (including repeated arguments), with no callback receiver. Returned arrays are copied before operations run. Callbacks must be synchronous; promises are invalid results.

Execution order is:

1. Resolve each raw argument from the original-input store, or evaluate and cache the referenced template location. Validate the resulting argument against the function signature.
2. Call the function, wrapping exceptions as `PLUGIN_EXECUTION_FAILED` with `kind: 'function'` and no exception contents.
3. Validate the result against `resultType`; a mismatch raises `INVALID_FUNCTION_RESULT` before fallbacks run.
4. Apply the result's whole-value fallback, then normal base validation and operations. For example, a valid numeric result of `0` can trigger `|| null`. Fallbacks never catch function failures or invalid results.
5. Cache the evaluated value by template location. Apply terminal [core.omit](core.md) only when assembling output.

Every occurrence evaluates independently from original inputs, including identical declarations at different locations. The per-render cache is never shared between renders. Function arguments never read assembled output. `core.omit` preserves the internal evaluated value; a fallback resolving to `omit` has no usable value and causes `INVALID_FUNCTION_ARGUMENT` when referenced. Fallback-produced null also causes that error because the supported function argument types exclude null. Arrays containing fallback nulls likewise fail function argument validation. Template order does not change dependency values. Callbacks should avoid external side effects.

## Plugin configuration

The optional second constructor argument is `PayloadTemplateOptions`. Its `plugins` array registers custom extensions. Built-in operations are always available, including when `plugins` is omitted or `[]`. Custom plugins cannot override built-ins.

```ts
import { PayloadTemplate,
  type PayloadVarsPlugin, type PayloadValidator, type PayloadTransformer } from 'payload-vars';

const positive: PayloadValidator<number> = value => value > 0;
const trim: PayloadTransformer<string> = value => value.trim();
const customPlugin: PayloadVarsPlugin = {
  name: 'textAndNumbers',
  validators: { positive },
  transformers: { trim },
};

new PayloadTemplate('{{x:string ! date.dateonly}}', { plugins: [] });
new PayloadTemplate('{{x:string > textAndNumbers.trim ! email.email}}', {
  plugins: [customPlugin],
});
```

`PayloadValidator<T>` is `(value: T) => boolean`; `PayloadTransformer<T>` is `(value: T) => T`. Annotate callback parameters or use these aliases when defining custom functions. Collection callbacks can use typed arrays such as `readonly string[]` or `number[]`. Plugins are responsible for providing operations suitable for the scope where they are used; validator and transformer syntax has no plugin type metadata. Callbacks must be synchronous. Validators should return `false` for invalid input, rather than throwing. Exceptions are wrapped in `PLUGIN_EXECUTION_FAILED` without exposing their contents.

Each `PayloadVarsPlugin` has a unique namespace `name` and optional `validators`, `transformers`, and `functions` records. Record keys are local operation names without dots. Different plugins may export the same operation names, and a validator and transformer may share a name. Duplicate namespaces throw `DUPLICATE_PLUGIN_NAME` during construction, even for empty plugins or repeated registration of the same object. Invalid identifiers and non-function callbacks are rejected during construction. Registry functions are snapshotted during construction.

Lookup is exact: every reference must include its namespace. Bare operation names are invalid syntax. There are no aliases, overrides, or registration-order precedence rules. Built-in definitions are private core capabilities and are not exported as registration objects.

## Writing a custom plugin

Keep application-specific rules in a reusable plugin. This example trims a name and then checks that it contains text:

```ts
import { PayloadTemplate, type PayloadVarsPlugin } from 'payload-vars';

const customPlugin: PayloadVarsPlugin = {
  name: 'custom',
  validators: {
    nonempty: (value: string) => typeof value === 'string' && value.length > 0,
  },
  transformers: {
    trim: (value: string) => value.trim(),
  },
};

const greeting = new PayloadTemplate({
  name: '{{name:string > custom.trim ! custom.nonempty}}',
}, { plugins: [customPlugin] });

greeting.render({ name: '  Ada  ' }); // { name: 'Ada' }
greeting.render({ name: '   ' });    // throws VALIDATION_FAILED
```

Use synchronous, deterministic callbacks and avoid mutating external state. A validator should return a boolean; a transformer should return a value of the same type. Plugin callbacks receive values, not the full variables object. Register the custom plugins a template needs; built-ins require no registration.

## Errors and TypeScript

Construction checks plugin namespaces, operation identifiers, callback functions, and that every referenced operation exists. Rendering checks values and executes callbacks:

| Code | Meaning |
| --- | --- |
| `UNKNOWN_PLUGIN_OPERATION` | The expression names an operation that was not registered. |
| `RESERVED_PLUGIN_NAME` | A custom plugin uses a namespace reserved for built-ins. |
| `DUPLICATE_PLUGIN_NAME` | Two configured plugins use the same namespace. |
| `INVALID_PLUGIN_NAME` | A plugin namespace is not a valid identifier. |
| `INVALID_PLUGIN_OPERATION_NAME` | A local operation key is not a valid identifier. |
| `INVALID_PLUGIN_OPERATION` | A registered callback is not a function. |
| `VALIDATION_FAILED` | A validator did not return `true`. |
| `PLUGIN_EXECUTION_FAILED` | A callback threw; its exception contents are not exposed. |
| `INVALID_TRANSFORMER_RESULT` | A transformer returned an invalid value for the declared type. |

`PayloadTemplateError.issue` identifies the full operation reference (including the namespace for built-in and custom callbacks) and variable; member errors include the original input member path. See [structured errors](../development.md#errors) for complete fields.

Plugin validators do not narrow the TypeScript input type: `string ! email.email` still accepts a `string` at compile time. Email validity is checked at runtime. The syntax carries no metadata linking a callback's parameter type to a scope, so configure and use operations with compatible base types. See [TypeScript input inference](../development.md#typescript-input-inference).

## Migrating from flat plugin names

All built-in references must now be qualified:

| Previous name | Required name |
| --- | --- |
| `dateonly` | `date.dateonly` |
| `isodatetime` | `date.isodatetime` |
| `email` | `email.email` |
| `domain` | `email.domain` |
| `unique` | `collection.unique` |
| `range` | `collection.range` |

The mapping applies to both `!` validators and `>` transformers where supported. Bare references are rejected with `INVALID_FALLBACK_SYNTAX`; no compatibility aliases are provided. Rename any custom plugin using a reserved namespace (for example, `text` to `custom`) and update its template references.

Change custom references such as `> trim` to `> custom.trim`, using the plugin's `name`. Rename plugin names containing hyphens, spaces, or dots to valid identifiers. Remove built-in plugins from configuration: `{ plugins: [...builtInPlugins, customPlugin] }` becomes `{ plugins: [customPlugin] }`.

The `builtInPlugins`, `datePlugin`, `emailPlugin`, and `collectionPlugin` registration exports have been removed. `plugins: []` now retains all built-ins. Bare custom operation aliases are no longer supported, and duplicate plugin namespaces are rejected even when their operations differ. These are breaking changes.

<!-- {% endraw %} -->
