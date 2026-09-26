import { createRegistries, type PayloadTemplateOptions, type PayloadOperation, type PluginRegistries } from './plugins.js';
import { variableNameSource, operationNameSource, typeSource, actionSource, operatorSource } from './expression-syntax.js';
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
const operationsSource = String.raw`(?:[@>]\s*${operationNameSource}\s*)*`;
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
  const expression = match[2]!;
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
    source.matchAll(new RegExp(String.raw`([@>])\s*(${operationNameSource})`, 'g')),
    match => ({ kind: match[1] === '@' ? 'validator' : 'transformer', name: match[2]! }));
  const memberOperations = operations(parsed[2] ?? '');
  const valueOperations = operations(parsed[5] ?? '');
  const format = (ops: PayloadOperation[], fallback?: FallbackExpression) => [
    ...ops.map(op => `${op.kind === 'validator' ? '@' : '>'} ${op.name}`),
    ...(fallback ? [`${fallback.operator} ${fallback.action}`] : []),
  ].join(' ');
  const member = format(memberOperations, memberFallback);
  const whole = format(valueOperations, valueFallback);
  const canonical = parsed[1] + (array ? member ? `[ ${member} ]` : '[]' : '') + (whole ? ` ${whole}` : '');
  return {
    ...(memberOperations.length ? { memberOperations } : {}),
    ...(valueOperations.length ? { valueOperations } : {}),
    name, type: (parsed[1] + (array ? '[]' : '')) as BaseType,
    ...(memberFallback ? { memberFallback } : {}), ...(valueFallback ? { valueFallback } : {}),
    declaration: `{{${name}:${canonical}}}`, paths: [path],
  };
}

export function validateTemplate(template: JsonTemplateValue, options: PayloadTemplateOptions = {}): Contract {
  const plugins = createRegistries(options.plugins);
  const declarations = new Map<string, Declaration>();
  const locations = new Map<string, Declaration>();
  function visit(value: JsonTemplateValue, path: string): JsonValue {
    if (typeof value === 'string') {
      const found = parsePlaceholder(value, path);
      if (!found) return value;
      for (const op of [...(found.memberOperations ?? []), ...(found.valueOperations ?? [])]) {
        if (!plugins[op.kind].has(op.name)) throw new PayloadTemplateError({
          code: 'UNKNOWN_PLUGIN_OPERATION', path, variableName: found.name, kind: op.kind, operation: op.name,
        });
      }
      const previous = declarations.get(found.name);
      if (previous && previous.declaration !== found.declaration) {
        throw new PayloadTemplateError({ code: 'VARIABLE_EXPRESSION_CONFLICT', variableName: found.name,
          declaration: previous.declaration, declaredAt: previous.paths[0]!,
          conflictingDeclaration: found.declaration, conflictingAt: path });
      }
      if (previous) previous.paths.push(path);
      else declarations.set(found.name, found);
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
  return { template: normalizedTemplate, declarations, locations, plugins };
}
