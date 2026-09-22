import type { JsonTemplateValue } from './payload-template.types.js';

// Match JavaScript's whitespace tokens without removing whitespace inside identifiers.
type Whitespace = ' ' | '\t' | '\n' | '\r' | '\v' | '\f' | '\u00a0' | '\u1680'
  | '\u2000' | '\u2001' | '\u2002' | '\u2003' | '\u2004' | '\u2005' | '\u2006'
  | '\u2007' | '\u2008' | '\u2009' | '\u200a' | '\u2028' | '\u2029' | '\u202f'
  | '\u205f' | '\u3000' | '\ufeff';
type Trim<S extends string> = S extends `${Whitespace}${infer Rest}` ? Trim<Rest>
  : S extends `${infer Rest}${Whitespace}` ? Trim<Rest> : S;
type Action = 'null' | 'omit' | 'throw';
type Fallback = { operator: '??' | '||'; action: Action };
type ParseAction<S extends string, Operator extends '??' | '||'> = Trim<S> extends infer A extends Action
  ? { operator: Operator; action: A } : never;
type ParseFallback<S extends string> = Trim<S> extends `??${infer Rest}` ? ParseAction<Rest, '??'>
  : Trim<S> extends `||${infer Rest}` ? ParseAction<Rest, '||'> : never;
type Primitive<S extends string> = S extends 'string' ? string : S extends 'number' ? number
  : S extends 'boolean' ? boolean : never;
type Nullish = null | undefined;
type Falsy = Nullish | '' | 0 | false | 0n;
type WithFallback<Value, F extends Fallback> = F['action'] extends 'throw'
  ? F['operator'] extends '||' ? Exclude<Value, Falsy> : Value
  : Value | (F['operator'] extends '??' ? Nullish : Falsy);
type Expression = { input: unknown; optional: boolean };
type ApplyFallback<Value, S extends string> = Trim<S> extends '' ? { input: Value; optional: false }
  : ParseFallback<S> extends infer F extends Fallback
    ? { input: WithFallback<Value, F>; optional: F['action'] extends 'throw' ? false : true }
    : never;
type Members<Value, S extends string> = ApplyFallback<Value, S> extends infer E extends Expression ? E['input'] : never;
type ParseExpression<S extends string> = S extends `${infer Base}[${infer Member}]${infer Whole}`
  ? Trim<Base> extends 'string' | 'number'
    ? ApplyFallback<ReadonlyArray<Members<Primitive<Trim<Base>>, Member>>, Whole> : never
  : S extends `${infer Base}??${infer Rest}` ? ApplyFallback<Primitive<Trim<Base>>, `??${Rest}`>
  : S extends `${infer Base}||${infer Rest}` ? ApplyFallback<Primitive<Trim<Base>>, `||${Rest}`>
  : { input: Primitive<Trim<S>>; optional: false };

declare const dynamicTemplate: unique symbol;
type Dynamic = typeof dynamicTemplate;
type Variable = Expression & { name: string };
type ParseString<S extends string> = string extends S ? Dynamic
  : S extends `{{${infer Name}:${infer E}}}`
    ? ParseExpression<Trim<E>> extends infer Parsed extends Expression ? Parsed & { name: Trim<Name> } : never
    : never;

// Widened JSON and exceptionally deep trees retain the runtime-validated API.
type Variables<T, Depth extends readonly unknown[] = []> = 0 extends (1 & T) ? Dynamic
  : JsonTemplateValue extends T ? Dynamic
  : Depth['length'] extends 16 ? Dynamic
  : T extends string ? ParseString<T>
  : T extends readonly unknown[] ? Variables<T[number], [...Depth, unknown]>
  : T extends object ? { [K in keyof T]: Variables<T[K], [...Depth, unknown]> }[keyof T]
  : never;
type Named<V, Name extends string> = Extract<V, { name: Name }>;
type RequiredNames<V extends Variable> = V extends { optional: false } ? V['name'] : never;
type Inputs<V extends Variable> = {
  readonly [Name in RequiredNames<V>]: Named<V, Name>['input'];
} & {
  readonly [Name in Exclude<V['name'], RequiredNames<V>>]?: Named<V, Name>['input'];
};

/** Inferred render inputs for a literal template; dynamic templates use runtime validation. */
export type PayloadTemplateVariables<T extends JsonTemplateValue> =
  Dynamic extends Variables<T> ? Readonly<Record<string, unknown>>
  : Inputs<Extract<Variables<T>, Variable>> & Readonly<Record<string, unknown>>;
