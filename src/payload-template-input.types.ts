import type { PayloadTemplateOptions } from './plugins.js';
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
// Plugin operations preserve the declared type; only the trailing fallback affects inputs.
type ScopeFallback<S extends string> = S extends `${string}??${infer Rest}` ? `??${Rest}`
  : S extends `${string}||${infer Rest}` ? `||${Rest}` : '';
type Base<S extends string, Acc extends string = ''> = S extends `${infer Head}${infer Tail}`
  ? Head extends Whitespace | '=' | '!' | '~' | '>' | '?' | '|' ? Acc : Base<Tail, `${Acc}${Head}`> : Acc;
type ApplyFallback<Value, S extends string> = Trim<S> extends '' ? { input: Value; optional: false }
  : ParseFallback<S> extends infer F extends Fallback
    ? { input: WithFallback<Value, F>; optional: F['action'] extends 'throw' ? false : true }
    : never;
type Members<Value, S extends string> = ApplyFallback<Value, ScopeFallback<S>> extends infer E extends Expression ? E['input'] : never;
type ParseExpression<S extends string> = S extends `${infer Base}[${infer Member}]${infer Whole}`
  ? Trim<Base> extends 'string' | 'number'
    ? ApplyFallback<ReadonlyArray<Members<Primitive<Trim<Base>>, Member>>, ScopeFallback<Whole>> : never
  : ApplyFallback<Primitive<Base<Trim<S>>>, ScopeFallback<S>>;

declare const dynamicTemplate: unique symbol;
type Dynamic = typeof dynamicTemplate;
type Variable = Expression & { name: string };
type TypeValue<S> = S extends `${infer B}[]` ? ReadonlyArray<Primitive<B>> : S extends string ? Primitive<S> : unknown;
type FunctionTypes<Name extends string, P extends PayloadTemplateOptions> = Name extends 'date.interval' ? readonly ['string', 'string']
  : Name extends `${infer Namespace}.${infer Method}`
    ? P extends { plugins: readonly (infer Plugin)[] }
      ? Extract<Plugin, { name: Namespace }> extends { functions: infer F }
        ? Method extends keyof F ? F[Method] extends { argumentTypes: infer Args } ? Args : never : never
        : never
      : never
    : never;
type ArgumentInput<Types, Index extends number> = [Types] extends [never] ? unknown
  : Types extends readonly unknown[] ? TypeValue<Types[Index]> : unknown;
type Arguments<S extends string, Types, Index extends unknown[] = []> = Trim<S> extends '' ? never
  : S extends `${infer Name},${infer Rest}`
    ? { name: Trim<Name>; input: ArgumentInput<Types, Index['length']>; optional: false } | Arguments<Rest, Types, [...Index, unknown]>
    : { name: Trim<S>; input: ArgumentInput<Types, Index['length']>; optional: false };
type ParseString<S extends string, P extends PayloadTemplateOptions> = string extends S ? Dynamic
  : S extends `{{${infer Name}:${infer E}}}`
    ? E extends `${string}=${infer Fn}(${infer Args})${string}`
      ? Arguments<Args, FunctionTypes<Trim<Fn>, P>>
      : ParseExpression<Trim<E>> extends infer Parsed extends Expression ? Parsed & { name: Trim<Name> } : never
    : never;

// Widened JSON and exceptionally deep trees retain the runtime-validated API.
type Variables<T, P extends PayloadTemplateOptions, Depth extends readonly unknown[] = []> = 0 extends (1 & T) ? Dynamic
  : JsonTemplateValue extends T ? Dynamic
  : Depth['length'] extends 16 ? Dynamic
  : T extends string ? ParseString<T, P>
  : T extends readonly unknown[] ? Variables<T[number], P, [...Depth, unknown]>
  : T extends object ? { [K in keyof T]: Variables<T[K], P, [...Depth, unknown]> }[keyof T]
  : never;
type Named<V, Name extends string> = Extract<V, { name: Name }>;
// All occurrences must accept the supplied source value.
type SharedInput<V> = (V extends Variable ? (value: V['input']) => void : never) extends
  (value: infer Input) => void ? Input : never;
type RequiredNames<V extends Variable> = V extends { optional: false } ? V['name'] : never;
type Inputs<V extends Variable> = {
  readonly [Name in RequiredNames<V>]: SharedInput<Named<V, Name>>;
} & {
  readonly [Name in Exclude<V['name'], RequiredNames<V>>]?: SharedInput<Named<V, Name>>;
};

/** Inferred render inputs for a literal template; dynamic templates use runtime validation. */
export type PayloadTemplateVariables<T extends JsonTemplateValue, P extends PayloadTemplateOptions = PayloadTemplateOptions> =
  Dynamic extends Variables<T, P> ? Readonly<Record<string, unknown>>
  : Inputs<Extract<Variables<T, P>, Variable>> & Readonly<Record<string, unknown>>;
