import type { PayloadVarsPlugin } from '../plugins.js';

function unique<T>(values: readonly T[]): boolean {
  return Array.isArray(values) && new Set(values).size === values.length;
}
function range(values: readonly string[] | readonly number[]): boolean {
  return Array.isArray(values) && values.length === 2 && typeof values[0] === typeof values[1]
    && (typeof values[0] === 'string' || typeof values[0] === 'number') && values[0] < values[1]!;
}

export const collectionPlugin = {
  name: 'collection',
  validators: { unique, range },
} satisfies PayloadVarsPlugin;
