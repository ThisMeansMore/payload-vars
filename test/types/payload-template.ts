import { PayloadTemplate, type JsonValue, type JsonTemplateValue,
  type PayloadTemplateVariables } from '../../src/index.js';

const strict = new PayloadTemplate({
  orderId: '{{orderId:string}}', nested: ['{{amount:number}}', { enabled: '{{enabled:boolean}}' }],
  products: '{{products:string[]}}', quantities: '{{quantities:number[]}}',
});
strict.render({ orderId: 'id', amount: 0, enabled: false, products: ['a'], quantities: [1], unused: 42 });
strict.render({ orderId: '', amount: 1, enabled: true, products: [] as readonly string[], quantities: [0] as const });
// @ts-expect-error Missing required variables in nested structures.
strict.render({ orderId: 'id' });
// @ts-expect-error Scalar types are not coerced.
strict.render({ orderId: 123, amount: 0, enabled: false, products: [], quantities: [] });
// @ts-expect-error Strict arrays reject null members.
strict.render({ orderId: 'id', amount: 0, enabled: false, products: [null], quantities: [] });
// @ts-expect-error Strict values reject explicit undefined.
strict.render({ orderId: undefined, amount: 0, enabled: false, products: [], quantities: [] });
// @ts-expect-error Number array members must be numbers.
strict.render({ orderId: 'id', amount: 0, enabled: false, products: [], quantities: ['1'] });

const nullish = new PayloadTemplate({
  a: '{{a:string??null}}', b: '{{b:number ?? omit}}', c: '{{c:boolean??null}}',
  d: '{{d:string[]??omit}}', e: '{{e:number[] ?? null}}',
});
nullish.render({});
nullish.render({ a: null, b: undefined, c: false, d: null, e: undefined });
nullish.render({ a: '', b: 0, c: null, d: ['x'], e: [0] });
// @ts-expect-error Nullish fallback does not accept a falsy wrong type.
nullish.render({ a: false });
// @ts-expect-error Whole-array fallback does not relax members.
nullish.render({ d: [null] });

const falsy = new PayloadTemplate({
  a: '{{a:string||null}}', b: '{{b:number || omit}}', c: '{{c:boolean||null}}',
  d: '{{d:string[]||omit}}',
});
falsy.render({});
falsy.render({ a: 0, b: '', c: 0n, d: false });
falsy.render({ a: false, b: null, c: undefined, d: '' });
// @ts-expect-error Truthy numbers do not trigger string fallback.
falsy.render({ a: 1 });
// @ts-expect-error Truthy booleans do not trigger array fallback.
falsy.render({ d: true });

const throwing = new PayloadTemplate({
  a: '{{a:string ?? throw}}', b: '{{b:number || throw}}', c: '{{c:boolean || throw}}',
  d: '{{d:string[] ?? throw}}',
});
throwing.render({ a: '', b: 1, c: true, d: [] });
// @ts-expect-error Throw fallbacks are required inputs.
throwing.render({});
// @ts-expect-error Throw fallbacks do not admit nullish inputs.
throwing.render({ a: null, b: 1, c: true, d: [] });
// @ts-expect-error Boolean || throw can exclude false statically.
throwing.render({ a: '', b: 1, c: false, d: [] });
// JavaScript number/string types cannot exclude 0, NaN, infinity, or empty strings.
new PayloadTemplate('{{x:number || throw}}').render({ x: 0 });
new PayloadTemplate('{{x:number}}').render({ x: Infinity });
new PayloadTemplate('{{x:string || throw}}').render({ x: '' });
new PayloadTemplate('{{x:boolean ?? throw}}').render({ x: false });

const members = new PayloadTemplate({
  a: '{{a:string[ ?? omit ]}}', b: '{{b:number[ || null ]}}',
  c: '{{c:string[??null]??omit}}', d: '{{d:number[||omit]||null}}',
});
members.render({ a: ['a', null, undefined], b: [1, null, undefined, false, '', 0n] });
members.render({ a: [] as const, b: [0], c: null, d: false });
// @ts-expect-error Member fallback alone does not make the whole variable optional.
members.render({ b: [] });
// @ts-expect-error Member fallback alone does not accept a null whole array.
members.render({ a: null, b: [] });
// @ts-expect-error Nonmatching members still need their base type.
members.render({ a: [false], b: [] });
// @ts-expect-error Whole fallback does not bypass invalid remaining members.
members.render({ a: [], b: [], c: [1] });
new PayloadTemplate('{{x:string[??throw]??null}}').render({});
// @ts-expect-error Throwing member fallback requires non-nullish members.
new PayloadTemplate('{{x:string[??throw]??null}}').render({ x: [null] });
new PayloadTemplate('{{x:number[||omit]??throw}}').render({ x: [1, null, false] });
// @ts-expect-error Combined outer throw still requires the array.
new PayloadTemplate('{{x:number[||omit]??throw}}').render({});

const whitespace = new PayloadTemplate({
  values: '{{ \tx \n: string \r[\t??\nomit\r] \n??\tthrow \n}}',
  again: '{{x:string[??omit]??throw}}',
  amount: '{{\u00a0n\ufeff:\u2003number\u2028||\u3000null\u2029}}',
});
whitespace.render({ x: ['a', null] });
// @ts-expect-error Whitespace normalization preserves the member type.
whitespace.render({ x: [1] });
// @ts-expect-error Repeated variables stay required.
whitespace.render({});

const literal = { nested: ['{{x:number}}', { y: '{{y:string ?? omit}}' }] } as const;
const fromLiteral = new PayloadTemplate(literal);
fromLiteral.render({ x: 1 });
// @ts-expect-error Readonly nested templates retain literal inference.
fromLiteral.render({ x: '1' });
const input: PayloadTemplateVariables<typeof literal> = { x: 1 };
fromLiteral.render(input);
// @ts-expect-error Exported input helper preserves required variables.
const badInput: PayloadTemplateVariables<typeof literal> = {};
void badInput;

// Widened strings, dynamic JSON, and explicit widening preserve runtime validation.
const widened = { x: '{{x:number}}' };
new PayloadTemplate(widened).render({ x: 'runtime checked' });
declare const dynamic: JsonValue;
new PayloadTemplate(dynamic).render({ anything: null });
declare const readonlyDynamic: JsonTemplateValue;
new PayloadTemplate(readonlyDynamic).render({ anything: undefined });
const runtimeOnly = new PayloadTemplate<JsonTemplateValue>({ x: '{{x:number}}' });
runtimeOnly.render({ x: 'runtime checked' });
declare const anyTemplate: any;
new PayloadTemplate(anyTemplate).render({ arbitrary: 1 });
new PayloadTemplate({ constant: 1, literal: 'hello', '{{key:string}}': null }).render({});
new PayloadTemplate(['{{x:string}}', '{{y:number ?? null}}']).render({ x: 'a' });
// @ts-expect-error Root array placeholders are inferred.
new PayloadTemplate(['{{x:string}}']).render({});
// Empty and primitive templates need no variables.
new PayloadTemplate([]).render({});
new PayloadTemplate(null).render({});

// A dynamic leaf makes the complete runtime contract unknown.
declare const dynamicLeaf: string;
new PayloadTemplate({ known: '{{known:number}}', dynamic: dynamicLeaf }).render({});
// Literal boolean || null accepts true plus all representable falsy inputs.
new PayloadTemplate('{{x:boolean || null}}').render({ x: true });
// @ts-expect-error A truthy string cannot satisfy boolean fallback.
new PayloadTemplate('{{x:boolean || null}}').render({ x: 'yes' });
// @ts-expect-error Strict booleans reject null.
new PayloadTemplate('{{x:boolean}}').render({ x: null });
// @ts-expect-error Whole-array || throw requires an actual array.
new PayloadTemplate('{{x:string[] || throw}}').render({ x: false });
// @ts-expect-error Member || throw requires numbers, not falsy values of other types.
new PayloadTemplate('{{x:number[ || throw ]}}').render({ x: [false] });

// Very deep templates gracefully use runtime validation rather than exceeding compiler recursion limits.
type Nest<T, D extends unknown[] = []> = D['length'] extends 17 ? T : { nested: Nest<T, [...D, unknown]> };
declare const deep: Nest<'{{x:number}}'>;
new PayloadTemplate(deep).render({ x: 'runtime checked' });

// The documented rendered return type remains JsonValue in this input-inference release.
const result: JsonValue = fromLiteral.render({ x: 1 });
void result;
