import { createRegistries, type PayloadTemplateOptions, type PayloadOperation, type PluginRegistries } from './plugins.js';
import { argumentReferenceSource, variableNameSource, operationNameSource, typeSource, actionSource, operatorSource } from './expression-syntax.js';
import { PayloadTemplateError } from './payload-template.error.js';
import type { AllowedValue, BaseType, FallbackExpression, JsonValue, JsonTemplateValue, PayloadVariable } from './payload-template.types.js';

export interface Declaration extends PayloadVariable { paths: string[] }
export interface Contract {
  plugins: PluginRegistries;
  template: JsonValue;
  outputTemplate: JsonValue;
  lookupMaps: Map<string, Readonly<Record<string, JsonValue>>>;
  declarations: Map<string, Declaration>;
  locations: Map<string, Declaration>;
}

const identifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const lookupSource = String.raw`lookup\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)`;
const operationSource = String.raw`(?:${operationNameSource}|lookup\s*\(\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\))\s*`;
// A conditional owns at most one success transform and one alternative.
const operationsSource = String.raw`(?:[!>]\s*${operationSource}|\?\s*${operationSource}(?:>\s*${operationSource})?(?:~\s*${operationSource})?)*`;
const scopeSource = String.raw`(${operationsSource})(?:(${operatorSource})\s*(${actionSource})\s*)?`;
const expressionPattern = new RegExp(String.raw`^(${typeSource})\s*(?:\[\s*${scopeSource}\])?\s*${scopeSource}$`);
const scalarAllowedPattern = new RegExp(String.raw`^(${typeSource})\s+in\s*\[\s*([\s\S]*?)\s*\]\s*${scopeSource}$`);
const arrayAllowedPattern = new RegExp(String.raw`^(string|number)\s*\[\s*([\s\S]+)\s*\]\s*${scopeSource}$`);
const placeholderPattern = new RegExp(String.raw`^\{\{\s*(${variableNameSource})\s*:\s*([^{}:]*?)\s*\}\}$`);
const supportedTypePattern = new RegExp(String.raw`^(${typeSource})\b`);
const interactionNamePattern = /^[a-z]+(?:\.[a-z]+)?$/;

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

function extractInteraction(source: string): { expression: string; interaction?: string } {
  let quote: '"' | "'" | undefined;
  let escaped = false;
  let brackets = 0;
  const markers: number[] = [];
  for (let index = 0; index < source.length; index++) {
    const character = source[index]!;
    if (escaped) { escaped = false; continue; }
    if (quote && character === '\\') { escaped = true; continue; }
    if (character === '"' || character === "'") {
      if (!quote) quote = character;
      else if (quote === character) quote = undefined;
    } else if (!quote && character === '[') brackets++;
    else if (!quote && character === ']') brackets--;
    else if (!quote && character === '@' && brackets === 0) markers.push(index);
  }
  if (!markers.length) return { expression: source };
  if (markers.length !== 1) return { expression: source, interaction: '' };
  const index = markers[0]!;
  const expression = source.slice(0, index).trim();
  const interaction = source.slice(index + 1).trim();
  if (!expression || !interactionNamePattern.test(interaction)) return { expression: source, interaction: '' };
  return { expression, interaction };
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
  const annotated = extractInteraction(match[2]!);
  if (annotated.interaction === '') {
    throw new PayloadTemplateError({ code: 'INVALID_INTERACTION_SYNTAX', path, variableName: name, placeholder: value });
  }
  let expression = annotated.expression;
  const interaction = annotated.interaction;
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
    source.matchAll(new RegExp(String.raw`([!?>~])\s*(${operationNameSource}|${lookupSource})`, 'g')),
    match => ({ kind: match[1] === '!' || match[1] === '?' ? 'validator' : 'transformer',
      name: match[3] ? 'lookup' : match[2]!, ...(match[3] ? { argument: match[3] } : {}),
      ...(match[1] === '?' || match[1] === '~' ? { operator: match[1] as '?' | '~' } : {}) }));
  const memberOperations = allowedValues ? [] : operations(parsed[2] ?? '');
  const valueOperations = operations(parsed[allowedValues ? 3 : 5] ?? '');
  const format = (ops: PayloadOperation[], fallback?: FallbackExpression) => [
    ...ops.map(op => `${op.operator ?? (op.kind === 'validator' ? '!' : '>')} ${op.name}${op.argument ? `(${op.argument})` : ''}`),
    ...(fallback ? [`${fallback.operator} ${fallback.action}`] : []),
  ].join(' ');
  const member = format(memberOperations, memberFallback);
  const whole = format(valueOperations, valueFallback);
  const domain = allowedValues?.map(formatAllowedValue).join(', ');
  const canonical = parsed[1] + (allowedValues ? (array ? `[ ${domain} ]` : ` in [ ${domain} ]`)
    : array ? member ? `[ ${member} ]` : '[]' : '') + (derived ? ` = ${derived.name}(${derived.arguments.join(',')})` : '')
    + (whole ? ` ${whole}` : '') + (interaction ? ` @ ${interaction}` : '');
  return {
    ...(memberOperations.length ? { memberOperations } : {}),
    ...(valueOperations.length ? { valueOperations } : {}),
    ...(derived ? { function: derived, derived: true as const } : {}),
    name, type: (parsed[1] + (array ? '[]' : '')) as BaseType,
    ...(interaction ? { interaction } : {}),
    ...(allowedValues ? { allowedValues } : {}),
    ...(memberFallback ? { memberFallback } : {}), ...(valueFallback ? { valueFallback } : {}),
    declaration: `{{${name}:${canonical}}}`, paths: [path],
  };
}

export function buildContract(template: JsonTemplateValue, options: PayloadTemplateOptions = {}): Contract {
  const plugins = createRegistries(options.plugins);
  const lookupMaps = new Map<string, Readonly<Record<string, JsonValue>>>();
  let outputSource = template;
  if (template !== null && !Array.isArray(template) && typeof template === 'object'
    && Object.prototype.hasOwnProperty.call(template, '_')) {
    const definitions = (template as { readonly [key: string]: JsonTemplateValue })._;
    if (definitions === null || Array.isArray(definitions) || typeof definitions !== 'object') {
      throw new PayloadTemplateError({ code: 'INVALID_LOOKUP_MAP', path: '$._' });
    }
    for (const [mapName, candidate] of Object.entries(definitions)) {
      const path = childPath('$._', mapName);
      if (!identifierPattern.test(mapName) || candidate === null || Array.isArray(candidate) || typeof candidate !== 'object') {
        throw new PayloadTemplateError({ code: 'INVALID_LOOKUP_MAP', path });
      }
      const map: Record<string, JsonValue> = {};
      for (const [key, value] of Object.entries(candidate)) {
        const scalar = value === null || typeof value === 'string' || typeof value === 'boolean'
          || typeof value === 'number' && Number.isFinite(value);
        if (!scalar || typeof value === 'string' && (value.includes('{{') || value.includes('}}'))) {
          throw new PayloadTemplateError({ code: 'INVALID_LOOKUP_MAP', path: childPath(path, key) });
        }
        Object.defineProperty(map, key, { value: value as JsonValue, enumerable: true, writable: false, configurable: false });
      }
      lookupMaps.set(mapName, Object.freeze(map));
    }
    const root: Record<string, JsonTemplateValue> = {};
    for (const key of Object.keys(template)) if (key !== '_') Object.defineProperty(root, key, {
      value: (template as { readonly [key: string]: JsonTemplateValue })[key]!, enumerable: true, writable: true, configurable: true,
    });
    outputSource = root;
  }
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
        if (op.name === 'lookup') continue;
        if (!plugins[op.kind].has(op.name)) throw new PayloadTemplateError({
          code: 'UNKNOWN_PLUGIN_OPERATION', path, variableName: found.name, kind: op.kind, operation: op.name,
        });
      }
      for (const [scope, ops] of [['member', found.memberOperations ?? []], ['value', found.valueOperations ?? []]] as const) {
        ops.forEach((op, index) => {
          if (op.name !== 'lookup') return;
          if (scope !== 'value' || op.kind !== 'transformer' || op.operator || index !== ops.length - 1 || !lookupMaps.has(op.argument!)) {
            if (!lookupMaps.has(op.argument!)) throw new PayloadTemplateError({ code: 'UNKNOWN_LOOKUP_MAP', path, mapName: op.argument! });
            throw new PayloadTemplateError({ code: 'INVALID_LOOKUP_OPERATION', path, mapName: op.argument! });
          }
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
  const normalizedOutputTemplate = visit(outputSource, '$');
  let normalizedTemplate = normalizedOutputTemplate;
  if (outputSource !== template) {
    const root: Record<string, JsonValue> = {};
    Object.defineProperty(root, '_', { value: visit((template as { readonly _: JsonTemplateValue })._, '$._'),
      enumerable: true, writable: true, configurable: true });
    for (const key of Object.keys(normalizedOutputTemplate as Record<string, JsonValue>)) Object.defineProperty(root, key, {
      value: (normalizedOutputTemplate as Record<string, JsonValue>)[key]!, enumerable: true, writable: true, configurable: true,
    });
    normalizedTemplate = root;
  }
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
  return { template: normalizedTemplate, outputTemplate: normalizedOutputTemplate, lookupMaps, declarations, locations, plugins };
}
