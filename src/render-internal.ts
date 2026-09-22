import { PayloadTemplateError } from './payload-template.error.js';
import type { FallbackExpression, JsonValue } from './payload-template.types.js';
import { childPath, type Contract, type Declaration } from './template-internal.js';

const OMIT = Symbol('omit');
type RenderedValue = JsonValue | typeof OMIT;

function details(declaration: Declaration) {
  return { variableName: declaration.name, declaration: declaration.declaration,
    expectedType: declaration.type, templatePaths: [...declaration.paths] };
}
function actualType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && !Number.isFinite(value)) return 'non-finite number';
  return typeof value;
}

// An explicit result distinguishes a fallback-produced null from a value still needing validation.
function fallback(value: unknown, expression: FallbackExpression | undefined,
  declaration: Declaration, valuePath?: string): { value: null | typeof OMIT } | undefined {
  if (!expression || !(expression.operator === '??' ? value === null || value === undefined : !value)) return;
  if (expression.action === 'throw') {
    throw new PayloadTemplateError({ code: 'FALLBACK_THROW', ...details(declaration), operator: expression.operator,
      ...(valuePath === undefined ? {} : { valuePath }) });
  }
  return { value: expression.action === 'omit' ? OMIT : null };
}

function validate(value: unknown, declaration: Declaration): RenderedValue {
  const result = fallback(value, declaration.valueFallback, declaration);
  if (result) return result.value;
  const fail = (bad: unknown, valuePath?: string): never => {
    throw new PayloadTemplateError({ code: 'INVALID_VARIABLE_TYPE', ...details(declaration),
      actualType: actualType(bad), ...(valuePath === undefined ? {} : { valuePath }) });
  };
  const primitive = (item: unknown, type: string, path?: string): JsonValue => {
    if (type === 'string' && typeof item === 'string') return item;
    if (type === 'number' && typeof item === 'number' && Number.isFinite(item)) return item;
    if (type === 'boolean' && typeof item === 'boolean') return item;
    return fail(item, path);
  };
  if (!declaration.type.endsWith('[]')) return primitive(value, declaration.type);
  if (!Array.isArray(value)) return fail(value);
  const output: JsonValue[] = [];
  for (let index = 0; index < value.length; index++) {
    const path = `$[${index}]`;
    const member = fallback(value[index], declaration.memberFallback, declaration, path);
    if (member) {
      if (member.value !== OMIT) output.push(member.value);
    } else output.push(primitive(value[index], declaration.type.slice(0, -2), path));
  }
  return output;
}

export function renderContract(contract: Contract, variables: Readonly<Record<string, unknown>>): JsonValue {
  const values = new Map<string, RenderedValue>();
  for (const declaration of contract.declarations.values()) {
    const present = Object.prototype.hasOwnProperty.call(variables, declaration.name);
    if (!present && !declaration.valueFallback) {
      throw new PayloadTemplateError({ code: 'MISSING_VARIABLE', ...details(declaration) });
    }
    values.set(declaration.name, validate(present ? variables[declaration.name] : undefined, declaration));
  }
  function render(value: JsonValue, path: string): RenderedValue {
    const declaration = contract.locations.get(path);
    if (declaration) return values.get(declaration.name)!;
    if (Array.isArray(value)) {
      const result: JsonValue[] = [];
      value.forEach((item, index) => {
        const rendered = render(item, `${path}[${index}]`);
        if (rendered !== OMIT) result.push(rendered);
      });
      return result;
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, JsonValue> = {};
      for (const key of Object.keys(value)) {
        const rendered = render(value[key]!, childPath(path, key));
        if (rendered !== OMIT) Object.defineProperty(result, key, { value: rendered,
          enumerable: true, writable: true, configurable: true });
      }
      return result;
    }
    return value;
  }
  const result = render(contract.template, '$');
  if (result === OMIT) throw new PayloadTemplateError({ code: 'CANNOT_OMIT_ROOT', ...details(contract.locations.get('$')!) });
  return result;
}
