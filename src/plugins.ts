import { operationIdentifierSource } from './expression-syntax.js';
import { PayloadTemplateError } from './payload-template.error.js';

export type PayloadValidator<T = never> = (value: T) => boolean;
export type PayloadTransformer<T = string> = (value: T) => T;
type RegisteredTransformer = PayloadTransformer<string> | PayloadTransformer<number>
  | PayloadTransformer<boolean> | PayloadTransformer<string[]> | PayloadTransformer<number[]>
  | PayloadTransformer<readonly string[]> | PayloadTransformer<readonly number[]>;

export interface PayloadVarsPlugin {
  /** Unique namespace used in references such as text.trim. */
  name: string;
  validators?: Record<string, PayloadValidator>;
  transformers?: Record<string, RegisteredTransformer>;
}
/** Custom extensions. Built-in operations are always available. */
export interface PayloadTemplateOptions { plugins?: readonly PayloadVarsPlugin[] }
export interface PayloadOperation { kind: 'validator' | 'transformer'; name: string }

function dateonly(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function isodatetime(value: string): boolean {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  return !!match && dateonly(match[1]!) && +match[2]! < 24 && +match[3]! < 60 && +match[4]! < 60
    && (match[5] === 'Z' || (+match[6]! < 24 && +match[7]! < 60)) && Number.isFinite(Date.parse(value));
}
function toIsoDateTime(value: string): string {
  if (!dateonly(value) && !isodatetime(value)) throw new Error('Invalid date');
  return new Date(value).toISOString();
}
function domain(value: string): boolean {
  return typeof value === 'string' && value.length <= 253 && value.includes('.')
    && value.split('.').every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}
function email(value: string): boolean {
  if (typeof value !== 'string' || value.length > 254) return false;
  const parts = value.split('@');
  const local = parts[0]!;
  return parts.length === 2 && local.length <= 64 && /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local)
    && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..') && domain(parts[1]!);
}
function extractDomain(value: string): string {
  if (!email(value)) throw new Error('Invalid email');
  return value.slice(value.indexOf('@') + 1).toLowerCase();
}
function unique<T>(values: readonly T[]): boolean {
  return Array.isArray(values) && new Set(values).size === values.length;
}
function range(values: readonly string[] | readonly number[]): boolean {
  return Array.isArray(values) && values.length === 2 && typeof values[0] === typeof values[1]
    && (typeof values[0] === 'string' || typeof values[0] === 'number') && values[0] < values[1]!;
}
// Function parameter types are erased only at the runtime registry boundary.
export type PluginFunction = (value: never) => unknown;
const identifierPattern = new RegExp(`^${operationIdentifierSource}$`);

export function createRegistries(plugins: readonly PayloadVarsPlugin[] = []) {
  // Built-ins are private core capabilities; custom registrations cannot replace them.
  const registries = {
    validator: new Map<string, PluginFunction>(Object.entries({ dateonly, isodatetime, email, domain, unique, range })),
    transformer: new Map<string, PluginFunction>(Object.entries({ isodatetime: toIsoDateTime, domain: extractDomain })),
  };
  const namespaces = new Set<string>();
  for (const plugin of plugins) {
    if (typeof plugin.name !== 'string' || !identifierPattern.test(plugin.name)) {
      throw new PayloadTemplateError({ code: 'INVALID_PLUGIN_NAME', plugin: plugin.name });
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
