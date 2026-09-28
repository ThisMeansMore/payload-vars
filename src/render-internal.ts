import { matchesBaseType } from './plugins.js';
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
    const steps = ops ?? [];
    for (let index = 0; index < steps.length; index++) {
      const op = steps[index]!;
      if (op.name === 'core.omit') continue;
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
        if (op.operator === '?') {
          let success: PayloadOperation | undefined;
          let alternative: PayloadOperation | undefined;
          if (steps[index + 1]?.kind === 'transformer' && steps[index + 1]?.operator !== '~') success = steps[++index];
          if (steps[index + 1]?.operator === '~') alternative = steps[++index];
          const selected = next === true ? success : alternative;
          if (selected) current = operations(current, [selected], type, valuePath);
          continue;
        }
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
  function render(value: JsonValue, path: string): RenderedValue {
    const declaration = contract.locations.get(path);
    if (declaration) {
      let source: unknown;
      if (declaration.function) {
        const fn = contract.plugins.function.get(declaration.function.name)!;
        const issue = { ...details(declaration), operation: declaration.function.name };
        const args = declaration.function.arguments.map((name, index) => {
          const input = Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : undefined;
          if (!matchesBaseType(input, fn.argumentTypes[index]!)) throw new PayloadTemplateError({
            code: 'INVALID_FUNCTION_ARGUMENT', ...issue, argumentName: name, argumentIndex: index,
          });
          return Array.isArray(input) ? [...input] : input;
        });
        const execute = fn.execute;
        try { source = execute(...args as never[]); }
        catch { throw new PayloadTemplateError({ code: 'PLUGIN_EXECUTION_FAILED', kind: 'function', ...issue }); }
        // Async callbacks are unsupported; consume rejections before reporting the invalid result.
        if (source instanceof Promise) void source.catch(() => {});
        if (!matchesBaseType(source, fn.resultType)) throw new PayloadTemplateError({ code: 'INVALID_FUNCTION_RESULT', ...issue });
      } else {
        const present = Object.prototype.hasOwnProperty.call(variables, declaration.name);
        if (!present && !declaration.valueFallback) throw new PayloadTemplateError({ code: 'MISSING_VARIABLE', ...details(declaration) });
        source = present ? variables[declaration.name] : undefined;
      }
      const result = validate(source, declaration, contract.plugins);
      return declaration.valueOperations?.some(op => op.name === 'core.omit') ? OMIT : result;
    }
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
