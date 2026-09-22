import { PayloadTemplateError } from './payload-template.error.js';
import type { BaseType, FallbackExpression, JsonValue, JsonTemplateValue, PayloadVariable } from './payload-template.types.js';

export interface Declaration extends PayloadVariable { paths: string[] }
export interface Contract {
  template: JsonValue;
  declarations: Map<string, Declaration>;
  locations: Map<string, Declaration>;
}

const identifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const expressionPattern = /^(string|number|boolean)\s*(?:\[\s*(?:(\?\?|\|\|)\s*(null|omit|throw)\s*)?\])?\s*(?:(\?\?|\|\|)\s*(null|omit|throw))?$/;

export function childPath(path: string, key: string): string {
  return identifierPattern.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

export function parsePlaceholder(value: string, path: string): Declaration | undefined {
  if (!value.includes('{{') && !value.includes('}}')) return undefined;
  const match = /^\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^{}:]*?)\s*\}\}$/.exec(value);
  if (!match) {
    throw new PayloadTemplateError({ code: 'INVALID_PLACEHOLDER', path, placeholder: value });
  }
  const name = match[1]!;
  const expression = match[2]!;
  const parsed = expressionPattern.exec(expression);
  if (!parsed) {
    if (!/^(string|number|boolean)\b/.test(expression)) {
      throw new PayloadTemplateError({ code: 'UNSUPPORTED_TYPE', path, variableName: name, declaredType: expression });
    }
    throw new PayloadTemplateError({ code: 'INVALID_FALLBACK_SYNTAX', path, variableName: name, placeholder: value });
  }
  const array = expression.includes('[');
  if (array && parsed[1] === 'boolean') {
    throw new PayloadTemplateError({ code: 'UNSUPPORTED_TYPE', path, variableName: name, declaredType: 'boolean[]' });
  }
  const memberFallback = parsed[2] ? { operator: parsed[2], action: parsed[3] } as FallbackExpression : undefined;
  const valueFallback = parsed[4] ? { operator: parsed[4], action: parsed[5] } as FallbackExpression : undefined;
  const format = (fallback: FallbackExpression) => `${fallback.operator} ${fallback.action}`;
  const canonical = parsed[1] + (array ? memberFallback ? `[ ${format(memberFallback)} ]` : '[]' : '')
    + (valueFallback ? ` ${format(valueFallback)}` : '');
  return {
    name, type: (parsed[1] + (array ? '[]' : '')) as BaseType,
    ...(memberFallback ? { memberFallback } : {}), ...(valueFallback ? { valueFallback } : {}),
    declaration: `{{${name}:${canonical}}}`, paths: [path],
  };
}

export function validateTemplate(template: JsonTemplateValue): Contract {
  const declarations = new Map<string, Declaration>();
  const locations = new Map<string, Declaration>();
  function visit(value: JsonTemplateValue, path: string): JsonValue {
    if (typeof value === 'string') {
      const found = parsePlaceholder(value, path);
      if (!found) return value;
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
  return { template: normalizedTemplate, declarations, locations };
}
