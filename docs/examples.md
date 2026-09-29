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
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "name": "Ada",
  "total": 19.95,
  "paid": false,
  "items": [
    "Notebook"
  ],
  "quantities": [
    2
  ]
}</code></pre></td>
<td valign="top"><pre><code>{
  "customer": "{{name:string}}",
  "total": "{{total:number}}",
  "paid": "{{paid:boolean}}",
  "items": "{{items:string[]}}",
  "quantities": "{{quantities:number[]}}",
  "currency": "USD"
}</code></pre></td>
<td valign="top"><pre><code>{
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
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="missing-values-as-null"></a>

### Keep a place for a missing delivery note

`?? null` keeps empty text, zero, and false.

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "nickname": "",
  "discount": 0,
  "paid": false,
  "note": null
}</code></pre></td>
<td valign="top"><pre><code>{
  "nickname": "{{nickname:string ?? null}}",
  "discount": "{{discount:number ?? null}}",
  "paid": "{{paid:boolean ?? null}}",
  "note": "{{note:string ?? null}}",
  "instructions": "{{instructions:string ?? null}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "nickname": "",
  "discount": 0,
  "paid": false,
  "note": null,
  "instructions": null
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="empty-values-as-null"></a>

### Store unanswered form fields as null

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "nickname": "",
  "age": 0,
  "subscribed": false
}</code></pre></td>
<td valign="top"><pre><code>{
  "nickname": "{{nickname:string || null}}",
  "age": "{{age:number || null}}",
  "subscribed": "{{subscribed:boolean || null}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "nickname": null,
  "age": null,
  "subscribed": null
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="omit-missing-values"></a>

### Leave out an optional delivery note

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "name": "Ada",
  "note": null
}</code></pre></td>
<td valign="top"><pre><code>{
  "name": "{{name:string}}",
  "note": "{{note:string ?? omit}}",
  "instructions": "{{instructions:string ?? omit}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "name": "Ada"
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="omit-empty-values"></a>

### Leave blank profile fields out of an update

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "name": "Ada",
  "nickname": ""
}</code></pre></td>
<td valign="top"><pre><code>{
  "name": "{{name:string}}",
  "nickname": "{{nickname:string || omit}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "name": "Ada"
}</code></pre></td>
</tr>
</tbody>
</table>

### Require a stock count, even when it is zero

A missing count fails; a supplied `0` is allowed.

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{}</code></pre></td>
<td valign="top"><pre><code>{
  "stock": "{{stock:number ?? throw}}"
}</code></pre></td>
<td valign="top"><pre><code>Throws FALLBACK_THROW</code></pre></td>
</tr>
</tbody>
</table>

### Require acceptance of the terms

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "accepted": false
}</code></pre></td>
<td valign="top"><pre><code>{
  "accepted": "{{accepted:boolean || throw}}"
}</code></pre></td>
<td valign="top"><pre><code>Throws FALLBACK_THROW</code></pre></td>
</tr>
</tbody>
</table>

<a id="keep-list-positions"></a>

### Keep missing daily readings in their original positions

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "readings": [
    12,
    null,
    0
  ]
}</code></pre></td>
<td valign="top"><pre><code>{
  "readings": "{{readings:number[ ?? null ]}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "readings": [
    12,
    null,
    0
  ]
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="empty-list-items-as-null"></a>

### Mark blank survey answers as unanswered

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "answers": [
    "Yes",
    "",
    null
  ]
}</code></pre></td>
<td valign="top"><pre><code>{
  "answers": "{{answers:string[ || null ]}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "answers": [
    "Yes",
    null,
    null
  ]
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="remove-null-list-items"></a>

### Remove missing readings but keep zero readings

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "readings": [
    12,
    null,
    0
  ]
}</code></pre></td>
<td valign="top"><pre><code>{
  "readings": "{{readings:number[ ?? omit ]}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "readings": [
    12,
    0
  ]
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="remove-empty-list-items"></a>

### Remove blank product tags

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "tags": [
    "new",
    "",
    null,
    "sale"
  ]
}</code></pre></td>
<td valign="top"><pre><code>{
  "tags": "{{tags:string[ || omit ]}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "tags": [
    "new",
    "sale"
  ]
}</code></pre></td>
</tr>
</tbody>
</table>

### Require a reading for every day

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "readings": [
    12,
    null,
    0
  ]
}</code></pre></td>
<td valign="top"><pre><code>{
  "readings": "{{readings:number[ ?? throw ]}}"
}</code></pre></td>
<td valign="top"><pre><code>Throws FALLBACK_THROW</code></pre></td>
</tr>
</tbody>
</table>

### Reject a guest list with a blank name

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "guests": [
    "Ada",
    ""
  ]
}</code></pre></td>
<td valign="top"><pre><code>{
  "guests": "{{guests:string[ || throw ]}}"
}</code></pre></td>
<td valign="top"><pre><code>Throws FALLBACK_THROW</code></pre></td>
</tr>
</tbody>
</table>

<a id="missing-and-empty-lists"></a>

### Accept optional tag lists and clean their contents

An empty list stays `[]`, even with `|| omit`.

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "tags": [
    "new",
    "",
    null
  ],
  "savedTags": [],
  "suggestedTags": null
}</code></pre></td>
<td valign="top"><pre><code>{
  "tags": "{{tags:string[ || omit ] ?? omit}}",
  "savedTags": "{{savedTags:string[] || omit}}",
  "suggestedTags": "{{suggestedTags:string[] ?? null}}",
  "extraTags": "{{extraTags:string[] ?? omit}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "tags": [
    "new"
  ],
  "savedTags": [],
  "suggestedTags": null
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="reuse-values"></a>

### Reuse the customer name for delivery

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "name": "Ada"
}</code></pre></td>
<td valign="top"><pre><code>{
  "customer": {
    "name": "{{name:string}}"
  },
  "delivery": {
    "recipient": "{{name:string}}",
    "note": "{{note:string ?? omit}}"
  }
}</code></pre></td>
<td valign="top"><pre><code>{
  "customer": {
    "name": "Ada"
  },
  "delivery": {
    "recipient": "Ada"
  }
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="omit-list-entry"></a>

### Build a packing slip without an optional note

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "name": "Ada",
  "total": 19.95
}</code></pre></td>
<td valign="top"><pre><code>[
  "{{name:string}}",
  "{{note:string ?? omit}}",
  "{{total:number}}"
]</code></pre></td>
<td valign="top"><pre><code>[
  "Ada",
  19.95
]</code></pre></td>
</tr>
</tbody>
</table>

### Return just the cleaned customer name

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "name": "  Ada  "
}</code></pre></td>
<td valign="top"><pre><code>"{{name:string &gt; text.trim}}"</code></pre></td>
<td valign="top"><pre><code>"Ada"</code></pre></td>
</tr>
</tbody>
</table>

<a id="plugin-chains"></a>

### Clean an email address and extract its domain

`>` changes the value; `!` checks it. Read the steps from left to right.

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "email": "  Ada@Example.com  "
}</code></pre></td>
<td valign="top"><pre><code>{
  "domain": "{{email:string &gt; text.trim ! email.email &gt; email.domain ! email.domain}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "domain": "example.com"
}</code></pre></td>
</tr>
</tbody>
</table>

### Reject an invalid contact email

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "email": "not-an-email"
}</code></pre></td>
<td valign="top"><pre><code>{
  "email": "{{email:string ! email.email}}"
}</code></pre></td>
<td valign="top"><pre><code>Throws VALIDATION_FAILED</code></pre></td>
</tr>
</tbody>
</table>

### Clean product tags before checking for duplicates

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "tags": [
    " new ",
    "",
    null,
    "sale"
  ]
}</code></pre></td>
<td valign="top"><pre><code>{
  "tags": "{{tags:string[ &gt; text.trim &gt; style.upperCase || omit ] ! collection.unique}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "tags": [
    "NEW",
    "SALE"
  ]
}</code></pre></td>
</tr>
</tbody>
</table>

### Normalize delivery dates and keep free-text instructions

`?` applies the next `>` only when the check passes; other values stay unchanged.

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "delivery": [
    "2026-10-01",
    "Call first"
  ]
}</code></pre></td>
<td valign="top"><pre><code>{
  "delivery": "{{delivery:string[ ? date.dateonly &gt; date.isodatetime ]}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "delivery": [
    "2026-10-01T00:00:00.000Z",
    "Call first"
  ]
}</code></pre></td>
</tr>
</tbody>
</table>

### Normalize a delivery date, or trim the delivery instructions

`~` handles values that fail the check.

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "delivery": "  Call first  "
}</code></pre></td>
<td valign="top"><pre><code>{
  "delivery": "{{delivery:string ? date.dateonly &gt; date.isodatetime ~ text.trim}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "delivery": "Call first"
}</code></pre></td>
</tr>
</tbody>
</table>

### Trim a name only when it needs cleaning

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "name": "  Ada  "
}</code></pre></td>
<td valign="top"><pre><code>{
  "name": "{{name:string ? text.trim ~ text.trim}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "name": "Ada"
}</code></pre></td>
</tr>
</tbody>
</table>

### Calculate a shift length from the original timestamps

`$.start` and `$.end` read the input JSON. No `hours` input is needed.

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "start": "2026-10-01T09:00:00Z",
  "end": "2026-10-01T17:00:00Z"
}</code></pre></td>
<td valign="top"><pre><code>{
  "hours": "{{hours:number = date.interval($.start,$.end) &gt; date.msToHours}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "hours": 8
}</code></pre></td>
</tr>
</tbody>
</table>

### Calculate a stay from dates already cleaned by the template

Bare paths such as `stay.start` read the template’s finished values.

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "arrival": "2026-10-01",
  "departure": "2026-10-03"
}</code></pre></td>
<td valign="top"><pre><code>{
  "stay": {
    "start": "{{arrival:string &gt; date.isodatetime}}",
    "end": "{{departure:string &gt; date.isodatetime}}"
  },
  "hours": "{{hours:number = date.interval(stay.start,stay.end) &gt; date.msToHours}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "stay": {
    "start": "2026-10-01T00:00:00.000Z",
    "end": "2026-10-03T00:00:00.000Z"
  },
  "hours": 48
}</code></pre></td>
</tr>
</tbody>
</table>

### Use a cleaned start date with an original end timestamp

`> core.omit` hides the helper field while keeping its value available to functions.

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "start": "2026-10-01",
  "end": "2026-10-01T06:00:00Z"
}</code></pre></td>
<td valign="top"><pre><code>{
  "start": "{{start:string &gt; date.isodatetime &gt; core.omit}}",
  "hours": "{{hours:number = date.interval(start,$.end) &gt; date.msToHours}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "hours": 6
}</code></pre></td>
</tr>
</tbody>
</table>

### Calculate time between two scheduled stops

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "first": "2026-10-01T09:00:00Z",
  "last": "2026-10-01T12:00:00Z"
}</code></pre></td>
<td valign="top"><pre><code>{
  "stops": [
    "{{first:string}}",
    "{{last:string}}"
  ],
  "hours": "{{hours:number = date.interval(stops[0],stops[1]) &gt; date.msToHours}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "stops": [
    "2026-10-01T09:00:00Z",
    "2026-10-01T12:00:00Z"
  ],
  "hours": 3
}</code></pre></td>
</tr>
</tbody>
</table>

### Leave a zero-length appointment duration unset

A function result can use a fallback too.

<table>
<thead>
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "start": "2026-10-01T09:00:00Z",
  "end": "2026-10-01T09:00:00Z"
}</code></pre></td>
<td valign="top"><pre><code>{
  "hours": "{{hours:number = date.interval($.start,$.end) &gt; date.msToHours || null}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "hours": null
}</code></pre></td>
</tr>
</tbody>
</table>

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
<tr><th>Input JSON</th><th>Template</th><th>Result</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "tags": "new, sale"
}</code></pre></td>
<td valign="top"><pre><code>{
  "tags": "{{tags:string[] = catalog.splitTags($.tags)}}",
  "tagCount": "{{tagCount:number = catalog.count(tags)}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "tags": [
    "new",
    "sale"
  ],
  "tagCount": 2
}</code></pre></td>
</tr>
</tbody>
</table>

See [Syntax](syntax.md) for the full rules and the [plugin guide](plugins/guide.md#derived-functions) for more about custom functions.

<!-- {% endraw %} -->
