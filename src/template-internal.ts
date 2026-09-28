import { createRegistries, type PayloadTemplateOptions, type PayloadOperation, type PluginRegistries } from './plugins.js';
import { argumentReferenceSource, variableNameSource, operationNameSource, typeSource, actionSource, operatorSource } from './expression-syntax.js';
import { PayloadTemplateError } from './payload-template.error.js';
import type { BaseType, FallbackExpression, JsonValue, JsonTemplateValue, PayloadVariable } from './payload-template.types.js';

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
const placeholderPattern = new RegExp(String.raw`^\{\{\s*(${variableNameSource})\s*:\s*([^{}:]*?)\s*\}\}$`);
const supportedTypePattern = new RegExp(String.raw`^(${typeSource})\b`);

export function childPath(path: string, key: string): string {
  return identifierPattern.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
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
  if (expression.includes('=')) {
    const call = new RegExp(String.raw`^((?:${typeSource})(?:\s*\[\s*\])?)\s*=\s*(${operationNameSource})\s*\(([^()]*)\)([\s\S]*)$`).exec(expression);
    if (!call) throw new PayloadTemplateError({ code: 'INVALID_PLACEHOLDER', path, placeholder: value });
    const args = call[3]!.trim() ? call[3]!.split(',').map(arg => arg.trim()) : [];
    if (args.some(arg => !new RegExp(`^${argumentReferenceSource}$`).test(arg))) {
      throw new PayloadTemplateError({ code: 'INVALID_FUNCTION_ARGUMENTS', path, variableName: name, operation: call[2]! });
    }
    derived = { name: call[2]!, arguments: args };
    expression = call[1]! + call[4]!;
  }
  if (expression.includes('@')) {
    throw new PayloadTemplateError({ code: 'LEGACY_VALIDATION_SYNTAX', path, variableName: name, placeholder: value });
  }
  const parsed = expressionPattern.exec(expression);
  if (!parsed) {
    if (!supportedTypePattern.test(expression)) {
      throw new PayloadTemplateError({ code: 'UNSUPPORTED_TYPE', path, variableName: name, declaredType: expression });
    }
    throw new PayloadTemplateError({ code: 'INVALID_FALLBACK_SYNTAX', path, variableName: name, placeholder: value });
  }
  const array = expression.includes('[');
  if (array && parsed[1] === 'boolean') {
    throw new PayloadTemplateError({ code: 'UNSUPPORTED_TYPE', path, variableName: name, declaredType: 'boolean[]' });
  }
  const memberFallback = parsed[3] ? { operator: parsed[3], action: parsed[4] } as FallbackExpression : undefined;
  const valueFallback = parsed[6] ? { operator: parsed[6], action: parsed[7] } as FallbackExpression : undefined;
  const operations = (source: string): PayloadOperation[] => Array.from(
    source.matchAll(new RegExp(String.raw`([!?>~])\s*(${operationNameSource})`, 'g')),
    match => ({ kind: match[1] === '!' || match[1] === '?' ? 'validator' : 'transformer', name: match[2]!,
      ...(match[1] === '?' || match[1] === '~' ? { operator: match[1] as '?' | '~' } : {}) }));
  const memberOperations = operations(parsed[2] ?? '');
  const valueOperations = operations(parsed[5] ?? '');
  const format = (ops: PayloadOperation[], fallback?: FallbackExpression) => [
    ...ops.map(op => `${op.operator ?? (op.kind === 'validator' ? '!' : '>')} ${op.name}`),
    ...(fallback ? [`${fallback.operator} ${fallback.action}`] : []),
  ].join(' ');
  const member = format(memberOperations, memberFallback);
  const whole = format(valueOperations, valueFallback);
  const canonical = parsed[1] + (array ? member ? `[ ${member} ]` : '[]' : '') + (derived ? ` = ${derived.name}(${derived.arguments.join(',')})` : '') + (whole ? ` ${whole}` : '');
  return {
    ...(memberOperations.length ? { memberOperations } : {}),
    ...(valueOperations.length ? { valueOperations } : {}),
    ...(derived ? { function: derived, derived: true as const } : {}),
    name, type: (parsed[1] + (array ? '[]' : '')) as BaseType,
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
