---
title: date namespace
---

<!-- {% raw %} -->

# date namespace

[← All plugin namespaces](../plugins.md)

Date validation, normalization, and interval calculations.

| Operation | Kind | Input → result |
| --- | --- | --- |
| `date.dateonly` | Validator | String → boolean |
| `date.isodatetime` | Validator | String → boolean |
| `date.isodatetime` | Transformer | String → string |
| `date.interval` | Function | Two strings → number (milliseconds) |
| `date.msToHours` | Transformer | Number → number (hours) |

## Validation and normalization

`date.dateonly` requires a real calendar date in `YYYY-MM-DD` form. `date.isodatetime` requires a valid date and time with seconds and an explicit `Z` or `±HH:MM` offset; fractional seconds are optional. The transformer accepts either form and returns UTC ISO text, for example `2026-01-01T00:00:00.000Z`.

```ts
new PayloadTemplate('{{date:string ! date.dateonly > date.isodatetime}}')
  .render({ date: '2026-01-01' }); // '2026-01-01T00:00:00.000Z'
```

## Intervals and hours

`date.interval` accepts two strings, validates each using the same rules as `date.isodatetime`, and returns `date2 - date1` as finite milliseconds. Both timestamps need seconds and explicit `Z` or `±HH:MM` offsets. Invalid calendars and offset-free datetimes fail with `PLUGIN_EXECUTION_FAILED`. `date.msToHours` divides a number by `3_600_000`, preserving fractions and negative values.

```ts
const template = new PayloadTemplate({
  date1: '{{date1:string > date.isodatetime > core.omit}}',
  date2: '{{date2:string > date.isodatetime > core.omit}}',
  hoursDifference: '{{hoursDifference:number = date.interval(date1,date2) > date.msToHours}}',
});
template.render({ date1: '2026-01-01', date2: '2026-01-02' });
// { hoursDifference: 24 }
```

Bare arguments read the evaluated `date1` and `date2` properties, whose transformations run even though `core.omit` hides them. Date-only render inputs therefore work here. Use `date.interval($.date1,$.date2)` for untouched inputs (which must already be valid ISO datetimes), or `date.interval(date1,$.date2)` for mixed sources. A template containing only `hoursDifference` must use raw references. See [derived functions](guide.md#derived-functions) for execution order and [core.omit](core.md) for output omission.

<!-- {% endraw %} -->
