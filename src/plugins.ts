import type { BaseType } from './payload-template.types.js';
import { builtInPlugins } from './plugins/index.js';
import { operationIdentifierSource } from './expression-syntax.js';
import { PayloadTemplateError } from './payload-template.error.js';

export type PayloadValidator<T = never> = (value: T) => boolean;
export type PayloadTransformer<T = string> = (value: T) => T;
type RegisteredTransformer = PayloadTransformer<string> | PayloadTransformer<number>
  | PayloadTransformer<boolean> | PayloadTransformer<string[]> | PayloadTransformer<number[]>
  | PayloadTransformer<readonly string[]> | PayloadTransformer<readonly number[]>;

/** Synchronous derived value with runtime-checked inputs and output. */
export interface PayloadFunction {
  argumentTypes: readonly BaseType[];
  resultType: BaseType;
  execute: (...args: never[]) => string | number | boolean | readonly string[] | readonly number[];
}
export function matchesBaseType(value: unknown, type: BaseType): boolean {
  if (type.endsWith('[]')) return Array.isArray(value)
    && Array.from(value).every(item => matchesBaseType(item, type.slice(0, -2) as BaseType));
  return typeof value === type && (type !== 'number' || Number.isFinite(value));
}

export interface PayloadVarsPlugin {
  /** Unique, non-reserved namespace used in references such as custom.trim. */
  name: string;
  functions?: Record<string, PayloadFunction>;
  validators?: Record<string, PayloadValidator>;
  transformers?: Record<string, RegisteredTransformer>;
}
/** Custom extensions. Built-in operations are always available. */
export interface PayloadTemplateOptions { plugins?: readonly PayloadVarsPlugin[] }
export interface PayloadOperation {
  kind: 'validator' | 'transformer';
  name: string;
  /** Conditional validator or alternative transformer; absent for ! and >. */
  operator?: '?' | '~';
}

// Function parameter types are erased only at the runtime registry boundary.
export type PluginFunction = (value: never) => unknown;
const identifierPattern = new RegExp(`^${operationIdentifierSource}$`);
const reservedNamespaces = new Set(builtInPlugins.map(plugin => plugin.name));

export function createRegistries(plugins: readonly PayloadVarsPlugin[] = []) {
  // Built-ins are private core capabilities; custom registrations cannot replace them.
  const registries = {
    validator: new Map<string, PluginFunction>(),
    transformer: new Map<string, PluginFunction>(),
    function: new Map<string, PayloadFunction>(),
  };
  const registerFunctions = (plugin: PayloadVarsPlugin) => {
    for (const [name, fn] of Object.entries(plugin.functions ?? {})) {
      const operation = `${plugin.name}.${name}`;
      if (!identifierPattern.test(name)) throw new PayloadTemplateError({ code: 'INVALID_PLUGIN_OPERATION_NAME', kind: 'function', operation: name, plugin: plugin.name });
      const types = ['string', 'number', 'boolean', 'string[]', 'number[]'];
      if (!fn || !Array.isArray(fn.argumentTypes) || !Array.from(fn.argumentTypes).every(type => types.includes(type))
        || !types.includes(fn.resultType) || typeof fn.execute !== 'function') {
        throw new PayloadTemplateError({ code: 'INVALID_PLUGIN_OPERATION', kind: 'function', operation, plugin: plugin.name });
      }
      registries.function.set(operation, { execute: fn.execute, resultType: fn.resultType, argumentTypes: [...fn.argumentTypes] });
    }
  };
  for (const plugin of builtInPlugins) {
    registerFunctions(plugin);
    for (const [name, fn] of Object.entries(plugin.validators ?? {})) {
      registries.validator.set(`${plugin.name}.${name}`, fn);
    }
    for (const [name, fn] of Object.entries(plugin.transformers ?? {})) {
      registries.transformer.set(`${plugin.name}.${name}`, fn);
    }
  }
  const namespaces = new Set<string>();
  for (const plugin of plugins) {
    if (typeof plugin.name !== 'string' || !identifierPattern.test(plugin.name)) {
      throw new PayloadTemplateError({ code: 'INVALID_PLUGIN_NAME', plugin: plugin.name });
    }
    if (reservedNamespaces.has(plugin.name)) {
      throw new PayloadTemplateError({ code: 'RESERVED_PLUGIN_NAME', plugin: plugin.name });
    }
    if (namespaces.has(plugin.name)) {
      throw new PayloadTemplateError({ code: 'DUPLICATE_PLUGIN_NAME', plugin: plugin.name });
    }
    namespaces.add(plugin.name);
    registerFunctions(plugin);
    for (const kind of ['validator', 'transformer'] as const) {
      for (const [name, fn] of Object.entries((kind === 'validator' ? plugin.validators : plugin.transformers) ?? {})) {
        if (!identifierPattern.test(name)) {
          throw new PayloadTemplateError({ code: 'INVALID_PLUGIN_OPERATION_NAME', kind, operation: name, plugin: plugin.name });
        }
        const operation = `${plugin.name}.${name}`;
        if (typeof fn !== 'function') {
          throw new PayloadTemplateError({ code: 'INVALID_PLUGIN_OPERATION', kind, operation, plugin: plugin.name });
        }
        registries[kind].set(operation, fn);
      }
    }
  }
  return registries;
}
export type PluginRegistries = ReturnType<typeof createRegistries>;
