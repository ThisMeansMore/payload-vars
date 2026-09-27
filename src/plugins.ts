import { builtInPlugins } from './plugins/index.js';
import { operationIdentifierSource } from './expression-syntax.js';
import { PayloadTemplateError } from './payload-template.error.js';

export type PayloadValidator<T = never> = (value: T) => boolean;
export type PayloadTransformer<T = string> = (value: T) => T;
type RegisteredTransformer = PayloadTransformer<string> | PayloadTransformer<number>
  | PayloadTransformer<boolean> | PayloadTransformer<string[]> | PayloadTransformer<number[]>
  | PayloadTransformer<readonly string[]> | PayloadTransformer<readonly number[]>;

export interface PayloadVarsPlugin {
  /** Unique, non-reserved namespace used in references such as custom.trim. */
  name: string;
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
  };
  for (const plugin of builtInPlugins) {
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
