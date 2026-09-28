import { PayloadTemplate, type PayloadVarsPlugin, type PayloadTemplateVariables } from '../../src/index.js';
const template = new PayloadTemplate({ hours: '{{hours:number = date.interval($.start,$.end) > date.msToHours}}', label: '{{label:string}}' });
template.render({ start: 'a', end: 'b', label: 'x' });
// @ts-expect-error Function arguments are required without their own placeholders.
template.render({ label: 'x' });
// @ts-expect-error Derived names cannot replace source arguments.
template.render({ hours: 1, label: 'x' });
// @ts-expect-error Built-in function arguments are strings.
template.render({ start: 1, end: 'b', label: 'x' });
// @ts-expect-error Ordinary inputs are still required.
template.render({ start: 'a', end: 'b' });
const plugin = {
  name: 'custom', functions: { length: { argumentTypes: ['number[]'], resultType: 'number', execute: (values: readonly number[]) => values.length } },
} as const satisfies PayloadVarsPlugin;
const custom = new PayloadTemplate('{{out:number = custom.length($.items)}}', { plugins: [plugin] });
custom.render({ items: [1, 2] as const });
// @ts-expect-error Custom function arguments retain their declared types.
custom.render({ items: ['a'] });
// @ts-expect-error A custom function-only input is required.
custom.render({});
type Inputs = PayloadTemplateVariables<'{{out:number = custom.length($.items)}}', { plugins: readonly [typeof plugin] }>;
const inputs: Inputs = { items: [1] };
custom.render(inputs);
new PayloadTemplate({ omitted: '{{x:string > core.omit}}', kept: '{{x:string > text.trim}}' }).render({ x: 'a' });
// @ts-expect-error Omission does not make the source optional.
new PayloadTemplate('{{x:string > core.omit}}').render({});
new PayloadTemplate('{{out:number = date.interval($.start,$.end) || null}}').render({ start: 'a', end: 'b' });
// @ts-expect-error Result fallbacks do not make function arguments optional.
new PayloadTemplate('{{out:number = date.interval($.start,$.end) || null}}').render({});
const asyncPlugin: PayloadVarsPlugin = { name: 'async', functions: {
  // @ts-expect-error Functions are synchronous.
  run: { argumentTypes: [], resultType: 'number', execute: async () => 1 },
} };
void asyncPlugin;

const widened: PayloadVarsPlugin = plugin;
new PayloadTemplate('{{out:number = custom.length($.items)}}', { plugins: [widened] }).render({ items: [1] });
// @ts-expect-error Widened plugin metadata still requires argument names.
new PayloadTemplate('{{out:number = custom.length($.items)}}', { plugins: [widened] }).render({});
const repeated = new PayloadTemplate({ a: '{{x:string ?? null}}', b: '{{x:string}}' });
repeated.render({ x: 'a' });
// @ts-expect-error Every occurrence must accept the shared input.
repeated.render({ x: undefined });

const chain = new PayloadTemplate({
  final: '{{result:number = custom.length(nested.copy)}}',
  nested: { copy: '{{derived:number[] = extra.identity(items)}}' },
  items: '{{source:number[] > core.omit}}',
}, { plugins: [plugin, { name: 'extra', functions: {
  identity: { argumentTypes: ['number[]'], resultType: 'number[]', execute: (v: readonly number[]) => v },
} }] });
chain.render({ source: [1, 2] });
// @ts-expect-error Derived output names do not replace the transitive original input.
chain.render({ result: 1, derived: [1], items: [1] });
// @ts-expect-error Referenced property's input retains its declared type.
chain.render({ source: ['a'] });
const mixed = new PayloadTemplate({ a: '{{input:string > core.omit}}', out: '{{out:number = date.interval(a,$.end)}}' });
mixed.render({ input: 'a', end: 'b' });
// @ts-expect-error Raw function arguments are required alongside property inputs.
mixed.render({ input: 'a' });
