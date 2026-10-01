---
title: Examples
---

<!-- {% raw %} -->

# Template examples

Each example has its own input. Use `new PayloadTemplate(template).render(input)` to get the result. The examples use built-in operations, except for the final custom-function example.

<a id="fill-in-details"></a>

### Send an order confirmation

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "name": "Ada",
  "total": 19.95,
  "paid": false,
  "items": [
    "Notebook"
  ],
  "quantities": [
    2
  ]
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "customer": "Ada",
  "total": 19.95,
  "paid": false,
  "items": [
    "Notebook"
  ],
  "quantities": [
    2
  ],
  "currency": "USD"
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "customer": "{{name:string}}",
  "total": "{{total:number}}",
  "paid": "{{paid:boolean}}",
  "items": "{{items:string[]}}",
  "quantities": "{{quantities:number[]}}",
  "currency": "USD"
}
```

<a id="missing-values-as-null"></a>

### Keep a place for a missing delivery note

`?? null` keeps empty text, zero, and false.

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "nickname": "",
  "discount": 0,
  "paid": false,
  "note": null
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "nickname": "",
  "discount": 0,
  "paid": false,
  "note": null,
  "instructions": null
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "nickname": "{{nickname:string ?? null}}",
  "discount": "{{discount:number ?? null}}",
  "paid": "{{paid:boolean ?? null}}",
  "note": "{{note:string ?? null}}",
  "instructions": "{{instructions:string ?? null}}"
}
```

<a id="empty-values-as-null"></a>

### Store unanswered form fields as null

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "nickname": "",
  "age": 0,
  "subscribed": false
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "nickname": null,
  "age": null,
  "subscribed": null
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "nickname": "{{nickname:string || null}}",
  "age": "{{age:number || null}}",
  "subscribed": "{{subscribed:boolean || null}}"
}
```

<a id="omit-missing-values"></a>

### Leave out an optional delivery note

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "name": "Ada",
  "note": null
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "name": "Ada"
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "name": "{{name:string}}",
  "note": "{{note:string ?? omit}}",
  "instructions": "{{instructions:string ?? omit}}"
}
```

<a id="omit-empty-values"></a>

### Leave blank profile fields out of an update

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "name": "Ada",
  "nickname": ""
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "name": "Ada"
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "name": "{{name:string}}",
  "nickname": "{{nickname:string || omit}}"
}
```

### Require a stock count, even when it is zero

A missing count fails; a supplied `0` is allowed.

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{}
```

</td>
<td valign="top"><pre><code>Throws FALLBACK_THROW</code></pre></td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "stock": "{{stock:number ?? throw}}"
}
```

### Require acceptance of the terms

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "accepted": false
}
```

</td>
<td valign="top"><pre><code>Throws FALLBACK_THROW</code></pre></td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "accepted": "{{accepted:boolean || throw}}"
}
```

<a id="keep-list-positions"></a>

### Keep missing daily readings in their original positions

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "readings": [
    12,
    null,
    0
  ]
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "readings": [
    12,
    null,
    0
  ]
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "readings": "{{readings:number[ ?? null ]}}"
}
```

<a id="empty-list-items-as-null"></a>

### Mark blank survey answers as unanswered

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "answers": [
    "Yes",
    "",
    null
  ]
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "answers": [
    "Yes",
    null,
    null
  ]
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "answers": "{{answers:string[ || null ]}}"
}
```

<a id="remove-null-list-items"></a>

### Remove missing readings but keep zero readings

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "readings": [
    12,
    null,
    0
  ]
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "readings": [
    12,
    0
  ]
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "readings": "{{readings:number[ ?? omit ]}}"
}
```

<a id="remove-empty-list-items"></a>

### Remove blank product tags

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "tags": [
    "new",
    "",
    null,
    "sale"
  ]
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "tags": [
    "new",
    "sale"
  ]
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "tags": "{{tags:string[ || omit ]}}"
}
```

### Require a reading for every day

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "readings": [
    12,
    null,
    0
  ]
}
```

</td>
<td valign="top"><pre><code>Throws FALLBACK_THROW</code></pre></td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "readings": "{{readings:number[ ?? throw ]}}"
}
```

### Reject a guest list with a blank name

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "guests": [
    "Ada",
    ""
  ]
}
```

</td>
<td valign="top"><pre><code>Throws FALLBACK_THROW</code></pre></td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "guests": "{{guests:string[ || throw ]}}"
}
```

<a id="missing-and-empty-lists"></a>

### Accept optional tag lists and clean their contents

An empty list stays `[]`, even with `|| omit`.

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "tags": [
    "new",
    "",
    null
  ],
  "savedTags": [],
  "suggestedTags": null
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "tags": [
    "new"
  ],
  "savedTags": [],
  "suggestedTags": null
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "tags": "{{tags:string[ || omit ] ?? omit}}",
  "savedTags": "{{savedTags:string[] || omit}}",
  "suggestedTags": "{{suggestedTags:string[] ?? null}}",
  "extraTags": "{{extraTags:string[] ?? omit}}"
}
```

<a id="reuse-values"></a>

### Reuse the customer name for delivery

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "name": "Ada"
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "customer": {
    "name": "Ada"
  },
  "delivery": {
    "recipient": "Ada"
  }
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "customer": {
    "name": "{{name:string}}"
  },
  "delivery": {
    "recipient": "{{name:string}}",
    "note": "{{note:string ?? omit}}"
  }
}
```

<a id="omit-list-entry"></a>

### Build a packing slip without an optional note

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "name": "Ada",
  "total": 19.95
}
```

</td>
<td valign="top" markdown="block">

```json
[
  "Ada",
  19.95
]
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
[
  "{{name:string}}",
  "{{note:string ?? omit}}",
  "{{total:number}}"
]
```

### Return just the cleaned customer name

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "name": "  Ada  "
}
```

</td>
<td valign="top" markdown="block">

```json
"Ada"
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
"{{name:string > text.trim}}"
```

<a id="plugin-chains"></a>

### Clean an email address and extract its domain

`>` changes the value; `!` checks it. Read the steps from left to right.

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "email": "  Ada@Example.com  "
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "domain": "example.com"
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "domain": "{{email:string > text.trim ! email.email > email.domain ! email.domain}}"
}
```

### Reject an invalid contact email

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "email": "not-an-email"
}
```

</td>
<td valign="top"><pre><code>Throws VALIDATION_FAILED</code></pre></td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "email": "{{email:string ! email.email}}"
}
```

### Clean product tags before checking for duplicates

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "tags": [
    " new ",
    "",
    null,
    "sale"
  ]
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "tags": [
    "NEW",
    "SALE"
  ]
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "tags": "{{tags:string[ > text.trim > style.upperCase || omit ] ! collection.unique}}"
}
```

### Normalize delivery dates and keep free-text instructions

`?` applies the next `>` only when the check passes; other values stay unchanged.

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "delivery": [
    "2026-10-01",
    "Call first"
  ]
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "delivery": [
    "2026-10-01T00:00:00.000Z",
    "Call first"
  ]
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "delivery": "{{delivery:string[ ? date.dateonly > date.isodatetime ]}}"
}
```

### Normalize a delivery date, or trim the delivery instructions

`~` handles values that fail the check.

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "delivery": "  Call first  "
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "delivery": "Call first"
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "delivery": "{{delivery:string ? date.dateonly > date.isodatetime ~ text.trim}}"
}
```

### Trim a name only when it needs cleaning

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "name": "  Ada  "
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "name": "Ada"
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "name": "{{name:string ? text.trim ~ text.trim}}"
}
```

### Calculate a shift length from the original timestamps

`$.start` and `$.end` read the input JSON. No `hours` input is needed.

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "start": "2026-10-01T09:00:00Z",
  "end": "2026-10-01T17:00:00Z"
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "hours": 8
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "hours": "{{hours:number = date.interval($.start,$.end) > date.msToHours}}"
}
```

### Calculate a stay from dates already cleaned by the template

Bare paths such as `stay.start` read the template’s finished values.

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "arrival": "2026-10-01",
  "departure": "2026-10-03"
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "stay": {
    "start": "2026-10-01T00:00:00.000Z",
    "end": "2026-10-03T00:00:00.000Z"
  },
  "hours": 48
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "stay": {
    "start": "{{arrival:string > date.isodatetime}}",
    "end": "{{departure:string > date.isodatetime}}"
  },
  "hours": "{{hours:number = date.interval(stay.start,stay.end) > date.msToHours}}"
}
```

### Use a cleaned start date with an original end timestamp

`> core.omit` hides the helper field while keeping its value available to functions.

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "start": "2026-10-01",
  "end": "2026-10-01T06:00:00Z"
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "hours": 6
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "start": "{{start:string > date.isodatetime > core.omit}}",
  "hours": "{{hours:number = date.interval(start,$.end) > date.msToHours}}"
}
```

### Calculate time between two scheduled stops

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "first": "2026-10-01T09:00:00Z",
  "last": "2026-10-01T12:00:00Z"
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "stops": [
    "2026-10-01T09:00:00Z",
    "2026-10-01T12:00:00Z"
  ],
  "hours": 3
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "stops": [
    "{{first:string}}",
    "{{last:string}}"
  ],
  "hours": "{{hours:number = date.interval(stops[0],stops[1]) > date.msToHours}}"
}
```

### Leave a zero-length appointment duration unset

A function result can use a fallback too.

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "start": "2026-10-01T09:00:00Z",
  "end": "2026-10-01T09:00:00Z"
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "hours": null
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "hours": "{{hours:number = date.interval($.start,$.end) > date.msToHours || null}}"
}
```

### Register functions for a product import

For the final example, register two small functions and use `new PayloadTemplate(template, { plugins: [catalog] }).render(input)`.

```ts
import { PayloadTemplate, type PayloadVarsPlugin } from 'payload-vars';

const catalog = {
  name: 'catalog',
  functions: {
    splitTags: {
      argumentTypes: ['string'],
      resultType: 'string[]',
      execute: (text: string) => text.split(',').map(tag => tag.trim()).filter(Boolean),
    },
    count: {
      argumentTypes: ['string[]'],
      resultType: 'number',
      execute: (tags: readonly string[]) => tags.length,
    },
  },
} as const satisfies PayloadVarsPlugin;
```

### Turn imported tags into a list and count them

The first function returns a list. The second uses that function’s result.

<table>
<thead>
<tr><th>Input JSON</th><th>Expected Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top" markdown="block">

```json
{
  "tags": "new, sale"
}
```

</td>
<td valign="top" markdown="block">

```json
{
  "tags": [
    "new",
    "sale"
  ],
  "tagCount": 2
}
```

</td>
</tr>
</tbody>
</table>

Template to use:

```json
{
  "tags": "{{tags:string[] = catalog.splitTags($.tags)}}",
  "tagCount": "{{tagCount:number = catalog.count(tags)}}"
}
```

See [Syntax](syntax.md) for the full rules and the [plugin guide](plugins/guide.md#derived-functions) for more about custom functions.

<!-- {% endraw %} -->
