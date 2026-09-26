import type { PayloadOperation, PluginRegistries } from './plugins.js';
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

function validate(value: unknown, declaration: Declaration, plugins: PluginRegistries): RenderedValue {
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
  const operations = (initial: JsonValue, ops: PayloadOperation[] | undefined, type: string, valuePath?: string): JsonValue => {
    let current = initial;
    for (const op of ops ?? []) {
      const issue = { ...details(declaration), kind: op.kind, operation: op.name,
        ...(valuePath === undefined ? {} : { valuePath }) };
      // Validators see an immutable snapshot; transformers may edit their own copy.
      const input = Array.isArray(current) ? [...current] : current;
      if (op.kind === 'validator' && Array.isArray(input)) Object.freeze(input);
      let next: unknown;
      try {
        next = plugins[op.kind].get(op.name)!(input as never);
      } catch {
        throw new PayloadTemplateError({ code: 'PLUGIN_EXECUTION_FAILED', ...issue });
      }
      if (op.kind === 'validator') {
        if (next !== true) throw new PayloadTemplateError({ code: 'VALIDATION_FAILED', ...issue });
        continue;
      }
      const matches = (item: unknown, base: string) => typeof item === base
        && (base !== 'number' || Number.isFinite(item));
      const array = type.endsWith('[]');
      // Existing member fallback nulls may survive, but plugins cannot create new ones.
      const nulls = (items: unknown[]) => items.filter(item => item === null).length;
      const valid = array ? Array.isArray(next) && Array.from(next).every(item => item === null || matches(item, type.slice(0, -2)))
        && nulls(next) <= nulls(current as JsonValue[]) : matches(next, type);
      if (!valid) throw new PayloadTemplateError({ code: 'INVALID_TRANSFORMER_RESULT', ...issue });
      current = Array.isArray(next) ? [...next] as JsonValue[] : next as JsonValue;
    }
    return current;
  };
  if (!declaration.type.endsWith('[]')) return operations(primitive(value, declaration.type), declaration.valueOperations, declaration.type);
  if (!Array.isArray(value)) return fail(value);
  const output: JsonValue[] = [];
  for (let index = 0; index < value.length; index++) {
    const path = `$[${index}]`;
    const member = fallback(value[index], declaration.memberFallback, declaration, path);
    if (member) {
      if (member.value !== OMIT) output.push(member.value);
    } else output.push(operations(primitive(value[index], declaration.type.slice(0, -2), path),
      declaration.memberOperations, declaration.type.slice(0, -2), path));
  }
  return operations(output, declaration.valueOperations, declaration.type);
}

export function renderContract(contract: Contract, variables: Readonly<Record<string, unknown>>): JsonValue {
  const values = new Map<string, RenderedValue>();
  for (const declaration of contract.declarations.values()) {
    const present = Object.prototype.hasOwnProperty.call(variables, declaration.name);
    if (!present && !declaration.valueFallback) {
      throw new PayloadTemplateError({ code: 'MISSING_VARIABLE', ...details(declaration) });
    }
    values.set(declaration.name, validate(present ? variables[declaration.name] : undefined, declaration, contract.plugins));
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
