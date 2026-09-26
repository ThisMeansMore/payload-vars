---
title: Plugins
---

<!-- {% raw %} -->

# Plugins

A base type answers “is this a string?” A plugin can also answer “is this string an email address?” or turn that email into its domain. Plugins add named validators and transformers while keeping the template itself plain JSON.

The template stores operation names. Your application supplies the functions behind those names, either through the built-ins or custom plugins. You can reuse the same operations across templates without embedding JavaScript in the JSON.

- [Validators and transformers](#validators-and-transformers)
- [Execution order and array scopes](#execution-order-and-array-scopes)
- [Plugin configuration](#plugin-configuration)
- [Built-in operations](#built-in-operations)
- [Writing a custom plugin](#writing-a-custom-plugin)
- [Errors and TypeScript](#errors-and-typescript)

## Validators and transformers

| Syntax | Purpose | Result |
| --- | --- | --- |
| `@ name` | Check a value against a rule. | Keep the value when valid; throw when invalid. |
| `> name` | Transform a value. | Use the returned value, which must keep the declared base type. |

```ts
import { PayloadTemplate } from 'payload-vars';

const template = new PayloadTemplate({
  domain: '{{email:string @ email > domain}}',
});

template.render({ email: 'user@Example.com' });
// { domain: 'example.com' }
```

Here `string` checks the base type, `@ email` validates the address, and `> domain` extracts a lowercase domain. Both the supplied email and the resulting domain are strings. A transformer cannot turn a string into a number or an object.

Operation order matters: each operation receives the preceding operation's result. Validators leave the value unchanged. Operation names use the same identifier rules as variable names; a plugin's display name is not a namespace in the expression.

## Execution order and array scopes

Inside `[]`, operations apply to each array member. After `]`, operations apply to the processed collection:

```ts
const period = new PayloadTemplate(
  '{{dates:string[ @ dateonly > isodatetime ?? omit ] @ range ?? throw}}',
);

period.render({ dates: ['2026-01-01', null, '2026-12-31'] });
// ['2026-01-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z']
```

The whole-value fallback runs first. Each remaining member then goes through its own fallback, base-type check, and operations. Collection operations run last. This example omits a null member, validates the remaining calendar dates, converts them to UTC ISO strings, and checks that the resulting pair is strictly ascending.

Although fallback syntax comes after operations in a declaration, fallbacks execute first. `??` and `||` handle missing, nullish, or falsy inputs; they do not catch failed validators or plugin exceptions. A fallback-produced `null` skips that member's operations but remains visible to collection operations. Omitted members are removed before collection operations.

Transformer results are checked against the declared type without rerunning fallbacks. For example, a string transformer returning `''` does not trigger a later `|| null`. Collection transformations may retain existing member-fallback nulls but cannot introduce new nulls. Collection validators receive a frozen copy; collection transformers receive a mutable copy.

## Plugin configuration

The optional second constructor argument is `PayloadTemplateOptions`. Omit `plugins` to use `builtInPlugins`; explicitly supplying an array uses exactly that collection, including `[]` to disable all plugins.

```ts
import { PayloadTemplate, builtInPlugins, datePlugin,
  type PayloadVarsPlugin, type PayloadValidator, type PayloadTransformer } from 'payload-vars';

const positive: PayloadValidator<number> = value => value > 0;
const trim: PayloadTransformer<string> = value => value.trim();
const customPlugin: PayloadVarsPlugin = {
  name: 'text-and-numbers',
  validators: { positive },
  transformers: { trim },
};

new PayloadTemplate('{{x:string @ dateonly}}', { plugins: [datePlugin] });
new PayloadTemplate('{{x:string > trim @ email}}', {
  plugins: [...builtInPlugins, customPlugin],
});
```

`PayloadValidator<T>` is `(value: T) => boolean`; `PayloadTransformer<T>` is `(value: T) => T`. Annotate callback parameters or use these aliases when defining custom functions. Collection callbacks can use typed arrays such as `readonly string[]` or `number[]`. Plugins are responsible for providing operations suitable for the scope where they are used; template syntax has no plugin type metadata. Callbacks must be synchronous. Validators should return `false` for invalid input, rather than throwing. Exceptions are wrapped in `PLUGIN_EXECUTION_FAILED` without exposing their contents.

Each `PayloadVarsPlugin` has a display `name` and optional `validators` and `transformers` records. Operation aliases must be unique within each registry across all configured plugins; a validator and transformer may share an alias. Duplicate aliases throw `DUPLICATE_PLUGIN_OPERATION` during construction, including when the same plugin is registered twice. Display names do not need to be unique and are used in error details. Registry functions are snapshotted during construction.

`datePlugin`, `emailPlugin`, `collectionPlugin`, and the readonly `builtInPlugins` collection are exported individually. See the [built-in operations](#built-in-operations) below.

## Built-in operations

The built-ins are enabled by default:

| Plugin | Validators | Transformers |
| --- | --- | --- |
| `datePlugin` | `dateonly`, `isodatetime` | `isodatetime` |
| `emailPlugin` | `email`, `domain` | `domain` |
| `collectionPlugin` | `unique`, `range` | None |

`dateonly` requires a real calendar date in `YYYY-MM-DD` form. `isodatetime` requires a valid date and time with seconds and an explicit `Z` or `±HH:MM` offset; fractional seconds are optional. The transformer accepts either form and returns UTC ISO text, for example `2026-01-01T00:00:00.000Z`.

`email` validates common ASCII dot-atom addresses with a dotted DNS domain (quoted local parts and internationalized addresses are unsupported). `domain` validates dotted ASCII DNS labels. The `domain` transformer extracts and lowercases the domain of a valid email: `user@Example.com` becomes `example.com`.

`unique` checks the entire collection using `Set` equality. `range` requires exactly two strictly ascending strings or numbers; strings use JavaScript lexicographic order. Member transformations run first, so `string[ @ dateonly > isodatetime ] @ range` compares the transformed strings.

## Writing a custom plugin

Keep application-specific rules in a reusable plugin. This example trims a name and then checks that it contains text:

```ts
import { PayloadTemplate, builtInPlugins, type PayloadVarsPlugin } from 'payload-vars';

const textPlugin: PayloadVarsPlugin = {
  name: 'text',
  validators: {
    nonempty: (value: string) => typeof value === 'string' && value.length > 0,
  },
  transformers: {
    trim: (value: string) => value.trim(),
  },
};

const greeting = new PayloadTemplate({
  name: '{{name:string > trim @ nonempty}}',
}, { plugins: [...builtInPlugins, textPlugin] });

greeting.render({ name: '  Ada  ' }); // { name: 'Ada' }
greeting.render({ name: '   ' });    // throws VALIDATION_FAILED
```

Use synchronous, deterministic callbacks and avoid mutating external state. A validator should return a boolean; a transformer should return a value of the same type. Plugin callbacks receive values, not the full variables object. Register only the capabilities a template needs when choosing an explicit plugin set.

## Errors and TypeScript

Construction checks that every operation name exists and that aliases are unique within each registry. Rendering checks values and executes callbacks:

| Code | Meaning |
| --- | --- |
| `UNKNOWN_PLUGIN_OPERATION` | The expression names an operation that was not registered. |
| `DUPLICATE_PLUGIN_OPERATION` | Two configured entries use the same alias in the same registry. |
| `VALIDATION_FAILED` | A validator did not return `true`. |
| `PLUGIN_EXECUTION_FAILED` | A callback threw; its exception contents are not exposed. |
| `INVALID_TRANSFORMER_RESULT` | A transformer returned an invalid value for the declared type. |

`PayloadTemplateError.issue` identifies the operation and variable; member errors include the original input member path. See [structured errors](development.md#errors) for complete fields.

Plugin validators do not narrow the TypeScript input type: `string @ email` still accepts a `string` at compile time. Email validity is checked at runtime. The syntax carries no metadata linking a callback's parameter type to a scope, so configure and use operations with compatible base types. See [TypeScript input inference](development.md#typescript-input-inference).

<!-- {% endraw %} -->
