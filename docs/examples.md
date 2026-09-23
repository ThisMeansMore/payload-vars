---
title: Examples
---

<!-- {% raw %} -->

# Template examples

<a id="example-values"></a>

## One set of values for every example

Every template below uses these same values. Only the template changes.

```json
{
  "name": "Ada",
  "nickname": "",
  "note": null,
  "total": 19.95,
  "discount": 0,
  "paid": false,
  "confirmed": true,
  "tags": [
    "new",
    "",
    null,
    "sale"
  ],
  "scores": [
    5,
    0,
    null,
    8
  ],
  "emptyTags": [],
  "unavailableTags": null
}
```

Here, `""` means empty text, `null` means no value, and `[]` is an empty list. **missingNote** and **missingTags** are deliberately absent: no values were supplied for them.

Compare each template on the left with its rendered payload on the right.

<a id="fill-in-details"></a>

## Fill in the details

Ordinary values replace the placeholders. Fixed text such as USD stays as it is.

<table>
<thead>
<tr><th>Template</th><th>Rendered payload</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "name": "{{name:string}}",
  "total": "{{total:number}}",
  "paid": "{{paid:boolean}}",
  "confirmed": "{{confirmed:boolean}}",
  "currency": "USD"
}</code></pre></td>
<td valign="top"><pre><code>{
  "name": "Ada",
  "total": 19.95,
  "paid": false,
  "confirmed": true,
  "currency": "USD"
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="missing-values-as-null"></a>

## ?? null: keep a place for missing values

The note is null and missingNote was not supplied. Both appear as null. Empty text, zero, and false stay unchanged.

<table>
<thead>
<tr><th>Template</th><th>Rendered payload</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "name": "{{name:string ?? null}}",
  "nickname": "{{nickname:string ?? null}}",
  "note": "{{note:string ?? null}}",
  "missingNote": "{{missingNote:string ?? null}}",
  "total": "{{total:number ?? null}}",
  "discount": "{{discount:number ?? null}}",
  "paid": "{{paid:boolean ?? null}}",
  "confirmed": "{{confirmed:boolean ?? null}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "name": "Ada",
  "nickname": "",
  "note": null,
  "missingNote": null,
  "total": 19.95,
  "discount": 0,
  "paid": false,
  "confirmed": true
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="empty-values-as-null"></a>

## || null: also replace empty text, zero, and false

Only the rule changes. Nickname, discount, and paid now become null too. The name, total, and confirmed values stay unchanged.

<table>
<thead>
<tr><th>Template</th><th>Rendered payload</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "name": "{{name:string || null}}",
  "nickname": "{{nickname:string || null}}",
  "note": "{{note:string || null}}",
  "missingNote": "{{missingNote:string || null}}",
  "total": "{{total:number || null}}",
  "discount": "{{discount:number || null}}",
  "paid": "{{paid:boolean || null}}",
  "confirmed": "{{confirmed:boolean || null}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "name": "Ada",
  "nickname": null,
  "note": null,
  "missingNote": null,
  "total": 19.95,
  "discount": null,
  "paid": null,
  "confirmed": true
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="omit-missing-values"></a>

## ?? omit: leave out missing values

The note and missingNote fields disappear. Empty text, zero, and false are still included.

<table>
<thead>
<tr><th>Template</th><th>Rendered payload</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "name": "{{name:string ?? omit}}",
  "nickname": "{{nickname:string ?? omit}}",
  "note": "{{note:string ?? omit}}",
  "missingNote": "{{missingNote:string ?? omit}}",
  "total": "{{total:number ?? omit}}",
  "discount": "{{discount:number ?? omit}}",
  "paid": "{{paid:boolean ?? omit}}",
  "confirmed": "{{confirmed:boolean ?? omit}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "name": "Ada",
  "nickname": "",
  "total": 19.95,
  "discount": 0,
  "paid": false,
  "confirmed": true
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="omit-empty-values"></a>

## || omit: also leave out empty text, zero, and false

The same values now produce a shorter payload. Only the name, total, and confirmed fields remain.

<table>
<thead>
<tr><th>Template</th><th>Rendered payload</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "name": "{{name:string || omit}}",
  "nickname": "{{nickname:string || omit}}",
  "note": "{{note:string || omit}}",
  "missingNote": "{{missingNote:string || omit}}",
  "total": "{{total:number || omit}}",
  "discount": "{{discount:number || omit}}",
  "paid": "{{paid:boolean || omit}}",
  "confirmed": "{{confirmed:boolean || omit}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "name": "Ada",
  "total": 19.95,
  "confirmed": true
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="keep-list-positions"></a>

## ?? null inside a list: keep all positions

The null entries stay as null. Empty text and zero also stay, so both lists keep all four positions.

<table>
<thead>
<tr><th>Template</th><th>Rendered payload</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "tags": "{{tags:string[ ?? null ]}}",
  "scores": "{{scores:number[ ?? null ]}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "tags": [
    "new",
    "",
    null,
    "sale"
  ],
  "scores": [
    5,
    0,
    null,
    8
  ]
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="empty-list-items-as-null"></a>

## || null inside a list: replace empty text and zero

The empty tag and the zero score become null. The lists still keep all four positions.

<table>
<thead>
<tr><th>Template</th><th>Rendered payload</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "tags": "{{tags:string[ || null ]}}",
  "scores": "{{scores:number[ || null ]}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "tags": [
    "new",
    null,
    null,
    "sale"
  ],
  "scores": [
    5,
    null,
    null,
    8
  ]
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="remove-null-list-items"></a>

## ?? omit inside a list: remove null entries

The null entries disappear. Empty text and zero remain in their original order.

<table>
<thead>
<tr><th>Template</th><th>Rendered payload</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "tags": "{{tags:string[ ?? omit ]}}",
  "scores": "{{scores:number[ ?? omit ]}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "tags": [
    "new",
    "",
    "sale"
  ],
  "scores": [
    5,
    0,
    8
  ]
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="remove-empty-list-items"></a>

## || omit inside a list: also remove empty text and zero

Only the filled-in tags and nonzero scores remain.

<table>
<thead>
<tr><th>Template</th><th>Rendered payload</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "tags": "{{tags:string[ || omit ]}}",
  "scores": "{{scores:number[ || omit ]}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "tags": [
    "new",
    "sale"
  ],
  "scores": [
    5,
    8
  ]
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="missing-and-empty-lists"></a>

## Handle a missing list as well as its items

The rule inside the brackets cleans the supplied tags. The rule after the brackets leaves out unavailableTags and missingTags. An empty list stays an empty list, even with || omit.

<table>
<thead>
<tr><th>Template</th><th>Rendered payload</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "tags": "{{tags:string[ || omit ] ?? omit}}",
  "unavailableTags": "{{unavailableTags:string[ || omit ] ?? omit}}",
  "missingTags": "{{missingTags:string[ || omit ] ?? omit}}",
  "emptyTags": "{{emptyTags:string[] || omit}}"
}</code></pre></td>
<td valign="top"><pre><code>{
  "tags": [
    "new",
    "sale"
  ],
  "emptyTags": []
}</code></pre></td>
</tr>
</tbody>
</table>

<a id="reuse-values"></a>

## Use the same value in several places

The same name fills both locations. The missing note is left out of the delivery details.

<table>
<thead>
<tr><th>Template</th><th>Rendered payload</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>{
  "customer": {
    "name": "{{name:string}}"
  },
  "delivery": {
    "recipient": "{{name:string}}",
    "note": "{{missingNote:string ?? omit}}"
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

## Leave out an item from a list

The missing note disappears from this list. The name and total stay in order.

<table>
<thead>
<tr><th>Template</th><th>Rendered payload</th></tr>
</thead>
<tbody>
<tr>
<td valign="top"><pre><code>[
  "{{name:string}}",
  "{{missingNote:string ?? omit}}",
  "{{total:number}}"
]</code></pre></td>
<td valign="top"><pre><code>[
  "Ada",
  19.95
]</code></pre></td>
</tr>
</tbody>
</table>

<!-- {% endraw %} -->
