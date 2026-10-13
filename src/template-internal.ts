import { createRegistries, type PayloadTemplateOptions, type PayloadOperation, type PluginRegistries } from './plugins.js';
import { argumentReferenceSource, variableNameSource, operationNameSource, typeSource, actionSource, operatorSource } from './expression-syntax.js';
import { PayloadTemplateError } from './payload-template.error.js';
import type { AllowedValue, BaseType, FallbackExpression, JsonValue, JsonTemplateValue, PayloadVariable } from './payload-template.types.js';

export interface Declaration extends PayloadVariable { paths: string[] }
export interface Contract {
  plugins: PluginRegistries;
  template: JsonValue;
  declarations: Map<string, Declaration>;
  locations: Map<string, Declaration>;
}

const identifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const operationSource = String.raw`${operationNameSource}\s*`;
// A conditional owns at most one success transform and one alternative.
const operationsSource = String.raw`(?:[!>]\s*${operationSource}|\?\s*${operationSource}(?:>\s*${operationSource})?(?:~\s*${operationSource})?)*`;
const scopeSource = String.raw`(${operationsSource})(?:(${operatorSource})\s*(${actionSource})\s*)?`;
const expressionPattern = new RegExp(String.raw`^(${typeSource})\s*(?:\[\s*${scopeSource}\])?\s*${scopeSource}$`);
const scalarAllowedPattern = new RegExp(String.raw`^(${typeSource})\s+in\s*\[\s*([\s\S]*?)\s*\]\s*${scopeSource}$`);
const arrayAllowedPattern = new RegExp(String.raw`^(string|number)\s*\[\s*([\s\S]+)\s*\]\s*${scopeSource}$`);
const placeholderPattern = new RegExp(String.raw`^\{\{\s*(${variableNameSource})\s*:\s*([^{}:]*?)\s*\}\}$`);
const supportedTypePattern = new RegExp(String.raw`^(${typeSource})\b`);

export function childPath(path: string, key: string): string {
  return identifierPattern.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function splitAllowedValues(source: string): string[] | undefined {
  const values: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (const character of source) {
    if (escaped) { current += character; escaped = false; continue; }
    if (quote && character === '\\') { current += character; escaped = true; continue; }
    if (character === '"' || character === "'") {
      if (!quote) quote = character;
      else if (quote === character) quote = undefined;
      current += character;
      continue;
    }
    if (character === ',' && !quote) { values.push(current.trim()); current = ''; continue; }
    current += character;
  }
  if (quote || escaped) return undefined;
  values.push(current.trim());
  return values.every(value => value.length > 0) ? values : undefined;
}

function parseAllowedValues(source: string, type: string): AllowedValue[] | undefined {
  const parts = splitAllowedValues(source);
  if (!parts) return undefined;
  const values: AllowedValue[] = [];
  for (const part of parts) {
    if (type === 'string') {
      if (part.startsWith('"')) {
        if (!part.endsWith('"')) return undefined;
        try {
          const value: unknown = JSON.parse(part);
          if (typeof value !== 'string') return undefined;
          values.push(value);
        } catch { return undefined; }
      } else if (part.startsWith("'")) {
        if (!part.endsWith("'")) return undefined;
        const inner = part.slice(1, -1);
        if (/\\(?![\\'])/.test(inner)) return undefined;
        values.push(inner.replace(/\\([\\'])/g, '$1'));
      } else {
        if (!/^[A-Za-z0-9_$.-]+(?:\s+[A-Za-z0-9_$.-]+)*$/.test(part)) return undefined;
        values.push(part);
      }
    } else if (type === 'number') {
      if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(part)) return undefined;
      const value = Number(part);
      if (!Number.isFinite(value)) return undefined;
      values.push(value);
    } else {
      if (part !== 'true' && part !== 'false') return undefined;
      values.push(part === 'true');
    }
  }
  return new Set(values).size === values.length ? values : undefined;
}

function formatAllowedValue(value: AllowedValue): string {
  if (typeof value !== 'string') return String(value);
  return /^[A-Za-z0-9_$.-]+(?:\s+[A-Za-z0-9_$.-]+)*$/.test(value) && value.length > 0
    ? value : JSON.stringify(value);
}

function findTopLevelEquals(source: string): number {
  let quote: '"' | "'" | undefined;
  let escaped = false;
  let brackets = 0;
  for (let index = 0; index < source.length; index++) {
    const character = source[index]!;
    if (escaped) { escaped = false; continue; }
    if (quote && character === '\\') { escaped = true; continue; }
    if (character === '"' || character === "'") {
      if (!quote) quote = character;
      else if (quote === character) quote = undefined;
    } else if (!quote && character === '[') brackets++;
    else if (!quote && character === ']') brackets--;
    else if (!quote && brackets === 0 && character === '=') return index;
  }
  return -1;
}

function isDerivedPrefix(source: string): boolean {
  if (new RegExp(String.raw`^(?:${typeSource})\s*(?:\[\s*\])?$`).test(source)) return true;
  const scalar = new RegExp(String.raw`^(${typeSource})\s+in\s*\[\s*([\s\S]*?)\s*\]$`).exec(source);
  if (scalar) return Boolean(parseAllowedValues(scalar[2]!, scalar[1]!));
  const array = new RegExp(String.raw`^(string|number)\s*\[\s*([\s\S]+)\s*\]$`).exec(source);
  return Boolean(array && parseAllowedValues(array[2]!, array[1]!));
}

export function parsePlaceholder(value: string, path: string): Declaration | undefined {
  if (!value.includes('{{') && !value.includes('}}')) return undefined;
  const match = placeholderPattern.exec(value);
  if (!match) {
    throw new PayloadTemplateError({ code: 'INVALID_PLACEHOLDER', path, placeholder: value });
  }
  const name = match[1]!;
  let expression = match[2]!;
  let derived: { name: string; arguments: string[] } | undefined;
  const equals = findTopLevelEquals(expression);
  if (equals !== -1) {
    const prefix = expression.slice(0, equals).trim();
    const call = new RegExp(String.raw`^\s*(${operationNameSource})\s*\(([^()]*)\)([\s\S]*)$`).exec(expression.slice(equals + 1));
    if (!call || !isDerivedPrefix(prefix)) throw new PayloadTemplateError({ code: 'INVALID_PLACEHOLDER', path, placeholder: value });
    const args = call[2]!.trim() ? call[2]!.split(',').map(arg => arg.trim()) : [];
    if (args.some(arg => !new RegExp(`^${argumentReferenceSource}$`).test(arg))) {
      throw new PayloadTemplateError({ code: 'INVALID_FUNCTION_ARGUMENTS', path, variableName: name, operation: call[1]! });
    }
    derived = { name: call[1]!, arguments: args };
    expression = prefix + call[3]!;
  }
  if (expression.includes('@')) {
    throw new PayloadTemplateError({ code: 'LEGACY_VALIDATION_SYNTAX', path, variableName: name, placeholder: value });
  }
  const scalarAllowed = scalarAllowedPattern.exec(expression);
  const arrayAllowedCandidate = scalarAllowed ? undefined : arrayAllowedPattern.exec(expression);
  const allowedMatch = scalarAllowed ?? arrayAllowedCandidate;
  const allowedValues = allowedMatch ? parseAllowedValues(allowedMatch[2]!, allowedMatch[1]!) : undefined;
  const allowedArray = Boolean(arrayAllowedCandidate && allowedValues);
  if (allowedMatch && !allowedValues && (scalarAllowed
    || allowedMatch[2]!.trim().length > 0 && !/^\s*(?:[!?>~]|\?\?|\|\|)/.test(allowedMatch[2]!))) {
    throw new PayloadTemplateError({ code: 'INVALID_ALLOWED_VALUES_SYNTAX', path, variableName: name, placeholder: value });
  }
  const parsed = allowedValues ? allowedMatch! : expressionPattern.exec(expression);
  if (!parsed) {
    if (!supportedTypePattern.test(expression)) {
      throw new PayloadTemplateError({ code: 'UNSUPPORTED_TYPE', path, variableName: name, declaredType: expression });
    }
    throw new PayloadTemplateError({ code: 'INVALID_FALLBACK_SYNTAX', path, variableName: name, placeholder: value });
  }
  const array = allowedValues ? allowedArray : expression.includes('[');
  if (array && parsed[1] === 'boolean') {
    throw new PayloadTemplateError({ code: 'UNSUPPORTED_TYPE', path, variableName: name, declaredType: 'boolean[]' });
  }
  const memberFallback = !allowedValues && parsed[3] ? { operator: parsed[3], action: parsed[4] } as FallbackExpression : undefined;
  const valueFallback = allowedValues
    ? parsed[4] ? { operator: parsed[4], action: parsed[5] } as FallbackExpression : undefined
    : parsed[6] ? { operator: parsed[6], action: parsed[7] } as FallbackExpression : undefined;
  const operations = (source: string): PayloadOperation[] => Array.from(
    source.matchAll(new RegExp(String.raw`([!?>~])\s*(${operationNameSource})`, 'g')),
    match => ({ kind: match[1] === '!' || match[1] === '?' ? 'validator' : 'transformer', name: match[2]!,
      ...(match[1] === '?' || match[1] === '~' ? { operator: match[1] as '?' | '~' } : {}) }));
  const memberOperations = allowedValues ? [] : operations(parsed[2] ?? '');
  const valueOperations = operations(parsed[allowedValues ? 3 : 5] ?? '');
  const format = (ops: PayloadOperation[], fallback?: FallbackExpression) => [
    ...ops.map(op => `${op.operator ?? (op.kind === 'validator' ? '!' : '>')} ${op.name}`),
    ...(fallback ? [`${fallback.operator} ${fallback.action}`] : []),
  ].join(' ');
  const member = format(memberOperations, memberFallback);
  const whole = format(valueOperations, valueFallback);
  const domain = allowedValues?.map(formatAllowedValue).join(', ');
  const canonical = parsed[1] + (allowedValues ? (array ? `[ ${domain} ]` : ` in [ ${domain} ]`)
    : array ? member ? `[ ${member} ]` : '[]' : '') + (derived ? ` = ${derived.name}(${derived.arguments.join(',')})` : '') + (whole ? ` ${whole}` : '');
  return {
    ...(memberOperations.length ? { memberOperations } : {}),
    ...(valueOperations.length ? { valueOperations } : {}),
    ...(derived ? { function: derived, derived: true as const } : {}),
    name, type: (parsed[1] + (array ? '[]' : '')) as BaseType,
    ...(allowedValues ? { allowedValues } : {}),
    ...(memberFallback ? { memberFallback } : {}), ...(valueFallback ? { valueFallback } : {}),
    declaration: `{{${name}:${canonical}}}`, paths: [path],
  };
}

export function buildContract(template: JsonTemplateValue, options: PayloadTemplateOptions = {}): Contract {
  const plugins = createRegistries(options.plugins);
  const declarations = new Map<string, Declaration>();
  const locations = new Map<string, Declaration>();
  const inputs = new Map<string, BaseType>();
  const requireInput = (name: string, type: BaseType, path: string) => {
    const previous = inputs.get(name);
    if (previous && previous !== type) throw new PayloadTemplateError({ code: 'VARIABLE_TYPE_CONFLICT', variableName: name, expectedType: previous, conflictingType: type, path });
    inputs.set(name, type);
  };
  function visit(value: JsonTemplateValue, path: string): JsonValue {
    if (typeof value === 'string') {
      const found = parsePlaceholder(value, path);
      if (!found) return value;
      for (const op of [...(found.memberOperations ?? []), ...(found.valueOperations ?? [])]) {
        if (!plugins[op.kind].has(op.name)) throw new PayloadTemplateError({
          code: 'UNKNOWN_PLUGIN_OPERATION', path, variableName: found.name, kind: op.kind, operation: op.name,
        });
      }
      for (const [scope, ops] of [['member', found.memberOperations ?? []], ['value', found.valueOperations ?? []]] as const) {
        ops.forEach((op, index) => {
          if (op.name === 'core.omit' && (scope !== 'value' || op.kind !== 'transformer' || op.operator
            || index !== ops.length - 1 || ops[index - 1]?.operator === '?')) {
            throw new PayloadTemplateError({ code: 'INVALID_OMIT_OPERATION', path, variableName: found.name, operation: op.name });
          }
        });
      }
      if (found.function) {
        const fn = plugins.function.get(found.function.name);
        const issue = { path, variableName: found.name, operation: found.function.name };
        if (!fn) throw new PayloadTemplateError({ code: 'UNKNOWN_PLUGIN_OPERATION', kind: 'function', ...issue });
        if (fn.argumentTypes.length !== found.function.arguments.length) throw new PayloadTemplateError({ code: 'INVALID_FUNCTION_ARGUMENTS', ...issue });
        if (fn.resultType !== found.type) throw new PayloadTemplateError({ code: 'FUNCTION_RESULT_TYPE_MISMATCH', ...issue });
        found.function.arguments.forEach((name, index) => {
          if (name.startsWith('$.')) requireInput(name.slice(2), fn.argumentTypes[index]!, path);
        });
      } else requireInput(found.name, found.type, path);
      const previous = declarations.get(found.declaration);
      if (previous) previous.paths.push(path);
      else declarations.set(found.declaration, found);
      locations.set(path, previous ?? found);
      return found.declaration;
    } else if (Array.isArray(value)) {
      return value.map((item, index) => visit(item, `${path}[${index}]`));
    } else if (value !== null && typeof value === 'object') {
      const result: Record<string, JsonValue> = {};
      for (const key of Object.keys(value)) {
        Object.defineProperty(result, key, { value: visit((value as { readonly [key: string]: JsonTemplateValue })[key]!, childPath(path, key)),
          enumerable: true, writable: true, configurable: true });
      }
      return result;
    }
    return value;
  }
  const normalizedTemplate = visit(template, '$');
  const dependencies = new Map<string, string[]>();
  for (const [path, declaration] of locations) {
    const fn = declaration.function;
    const targets: string[] = [];
    fn?.arguments.forEach((reference, index) => {
      if (reference.startsWith('$.')) return;
      const target = reference.startsWith('[') ? `$${reference}` : `$.${reference}`;
      const referenced = locations.get(target);
      const issue = { path, variableName: declaration.name, operation: fn.name,
        argumentName: reference, argumentIndex: index, referencePath: target };
      if (!referenced) throw new PayloadTemplateError({ code: 'UNKNOWN_FUNCTION_REFERENCE', ...issue });
      const expectedType = plugins.function.get(fn.name)!.argumentTypes[index]!;
      if (referenced.type !== expectedType) throw new PayloadTemplateError({
        code: 'FUNCTION_ARGUMENT_TYPE_MISMATCH', ...issue, expectedType, actualType: referenced.type,
      });
      targets.push(target);
    });
    dependencies.set(path, targets);
  }
  const complete = new Set<string>();
  const active = new Set<string>();
  function check(path: string, chain: string[]): void {
    if (active.has(path)) throw new PayloadTemplateError({ code: 'CYCLIC_FUNCTION_REFERENCE', path, templatePaths: [...chain, path] });
    if (complete.has(path)) return;
    active.add(path);
    for (const target of dependencies.get(path)!) check(target, [...chain, path]);
    active.delete(path);
    complete.add(path);
  }
  for (const path of locations.keys()) check(path, []);
  return { template: normalizedTemplate, declarations, locations, plugins };
}
