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
- [Reserved namespaces](#reserved-namespaces)
- [Built-in operations](#built-in-operations)
- [Writing a custom plugin](#writing-a-custom-plugin)
- [Errors and TypeScript](#errors-and-typescript)
- [Conditional validation](#conditional-validation)
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

`? validator [> transformer] [~ transformer]` selects at most one transformation. Without `~`, a failed check keeps the value unchanged. Both branches receive the tested value, preserve its declared type, and use the same plugins as ordinary transformations. Exceptions from callbacks still throw. Fallbacks run before these operations. See [conditional syntax](syntax.md#validators-and-transformers).

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

`PayloadValidator<T>` is `(value: T) => boolean`; `PayloadTransformer<T>` is `(value: T) => T`. Annotate callback parameters or use these aliases when defining custom functions. Collection callbacks can use typed arrays such as `readonly string[]` or `number[]`. Plugins are responsible for providing operations suitable for the scope where they are used; template syntax has no plugin type metadata. Callbacks must be synchronous. Validators should return `false` for invalid input, rather than throwing. Exceptions are wrapped in `PLUGIN_EXECUTION_FAILED` without exposing their contents.

Each `PayloadVarsPlugin` has a unique namespace `name` and optional `validators` and `transformers` records. Record keys are local operation names without dots. Different plugins may export the same operation names, and a validator and transformer may share a name. Duplicate namespaces throw `DUPLICATE_PLUGIN_NAME` during construction, even for empty plugins or repeated registration of the same object. Invalid identifiers and non-function callbacks are rejected during construction. Registry functions are snapshotted during construction.

Lookup is exact: every reference must include its namespace. Bare operation names are invalid syntax. There are no aliases, overrides, or registration-order precedence rules. Built-in definitions are private core capabilities and are not exported as registration objects.

## Reserved namespaces

These 16 case-sensitive namespaces belong to the library:

| Namespace | Intended scope |
| --- | --- |
| `text` | General string operations |
| `number` | Numeric operations |
| `boolean` | Boolean operations |
| `date` | Dates and datetimes |
| `collection` | General collection operations |
| `array` | Array-specific operations |
| `email` | Email addresses and domains |
| `url` | URLs and TLDs |
| `json` | JSON text |
| `encoding` | Encoding and decoding |
| `iso` | ISO country, currency, and language codes |
| `time` | Times of day and durations |
| `phone` | Phone numbers |
| `network` | IP addresses and network identifiers |
| `id` | Identifiers such as UUIDs |
| `core` | General operations across types |

Custom plugins using any of these names throw `RESERVED_PLUGIN_NAME` during construction, even when empty or defining non-conflicting operations. Existing `collection.unique` and `collection.range` operations keep their names; `array` is reserved for future operations. Reserved names do not imply implemented operations: only the built-ins listed below are currently available. For example, `iso.country` and `url.tld` are potential future operations, not current built-ins. Adding a reserved namespace in the future is a compatibility change for custom plugins using that name.

## Built-in operations

The built-ins are always available:

| Group | Validators | Transformers |
| --- | --- | --- |
| Text styles | `text.camelCase`, `text.pascalCase`, `text.snakeCase`, `text.kebabCase`, `text.knownCase` | `text.camelCase`, `text.pascalCase`, `text.snakeCase`, `text.kebabCase` |
| Text casing and whitespace | `text.upperCase`, `text.lowerCase`, `text.trim`, `text.normalizeSpaces` | `text.upperCase`, `text.lowerCase`, `text.trim`, `text.normalizeSpaces` |
| Dates | `date.dateonly`, `date.isodatetime` | `date.isodatetime` |
| Email | `email.email`, `email.domain` | `email.domain` |
| Collections | `collection.unique`, `collection.range` | None |

The four text styles share a tokenizer. It splits on JavaScript whitespace (`\s`), underscores, hyphens, lowercase-to-uppercase boundaries, digit-to-uppercase boundaries, and acronym boundaries (`URLValue` → `URL`, `Value`). Digits stay attached to the preceding word (`version2Value42` → `version2`, `Value42`). Repeated and edge separators are ignored when transforming. Words contain only ASCII letters and digits; punctuation, non-ASCII letters, and other unsupported characters are rejected, never discarded. Empty and separator-only inputs are also rejected. Invalid style input returns `false` from validators and throws from transformers (reported as `VALIDATION_FAILED` and `PLUGIN_EXECUTION_FAILED`, respectively).

Words are lowercased before formatting, so acronyms normalize as words: `URLValue` becomes `UrlValue` in PascalCase. Mixed input such as `Customer fullAddress` or `customerFull_address` is allowed by transformers:

| Operation | Output for `Customer fullAddress` |
| --- | --- |
| `text.camelCase` | `customerFullAddress` |
| `text.pascalCase` | `CustomerFullAddress` |
| `text.snakeCase` | `customer_full_address` |
| `text.kebabCase` | `customer-full-address` |

Each style validator requires the input to equal its own normalized output exactly. `text.knownCase` is a validator only and passes if any of those four validators passes. It rejects mixed styles, spaces, and noncanonical acronyms such as `URLValue`. Single words can match several styles: `customer` passes camel, snake, and kebab case; `Customer` passes PascalCase; digit-only strings such as `123` pass all four.

```ts
new PayloadTemplate('{{name:string > text.snakeCase}}')
  .render({ name: 'Customer fullAddress' }); // 'customer_full_address'
new PayloadTemplate('{{name:string ! text.knownCase > text.snakeCase}}')
  .render({ name: 'Customer fullAddress' }); // throws VALIDATION_FAILED before conversion
new PayloadTemplate('{{name:string > text.snakeCase ! text.knownCase}}')
  .render({ name: 'Customer fullAddress' }); // 'customer_full_address'
```

`text.upperCase` and `text.lowerCase` use JavaScript `toUpperCase()` and `toLowerCase()`, including their Unicode casing behavior, without changing separators or whitespace. `text.trim` uses JavaScript `trim()`. `text.normalizeSpaces` replaces every run of JavaScript whitespace (`/\s+/g`) with one ordinary space. It preserves a resulting space at either edge: `"  A\t test\n"` becomes `" A test "`. Compose it with `text.trim` to remove those edge spaces. Each of these four validators passes exactly when its transformer would leave the string unchanged; empty strings pass. These operations allow punctuation and Unicode text.

```ts
new PayloadTemplate('{{name:string > text.upperCase ! text.upperCase}}')
  .render({ name: 'some-name' }); // 'SOME-NAME'
new PayloadTemplate('{{name:string > text.lowerCase}}')
  .render({ name: 'Some_Name' }); // 'some_name'
new PayloadTemplate('{{name:string > text.normalizeSpaces > text.trim}}')
  .render({ name: '  A\t test\n' }); // 'A test'
```

`date.dateonly` requires a real calendar date in `YYYY-MM-DD` form. `date.isodatetime` requires a valid date and time with seconds and an explicit `Z` or `±HH:MM` offset; fractional seconds are optional. The transformer accepts either form and returns UTC ISO text, for example `2026-01-01T00:00:00.000Z`.

`email.email` validates common ASCII dot-atom addresses with a dotted DNS domain (quoted local parts and internationalized addresses are unsupported). `email.domain` validates dotted ASCII DNS labels. The `email.domain` transformer extracts and lowercases the domain of a valid email: `user@Example.com` becomes `example.com`.

`collection.unique` checks the entire collection using `Set` equality. `collection.range` requires exactly two strictly ascending strings or numbers; strings use JavaScript lexicographic order. Member transformations run first, so `string[ ! date.dateonly > date.isodatetime ] ! collection.range` compares the transformed strings.

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

`PayloadTemplateError.issue` identifies the full operation reference (including the namespace for built-in and custom callbacks) and variable; member errors include the original input member path. See [structured errors](development.md#errors) for complete fields.

Plugin validators do not narrow the TypeScript input type: `string ! email.email` still accepts a `string` at compile time. Email validity is checked at runtime. The syntax carries no metadata linking a callback's parameter type to a scope, so configure and use operations with compatible base types. See [TypeScript input inference](development.md#typescript-input-inference).

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
