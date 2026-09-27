import type { PayloadVarsPlugin } from '../plugins.js';

const trim = (value: string): string => value.trim();
const normalizeSpaces = (value: string): string => value.replace(/\s+/g, ' ');
const unchanged = (transform: (value: string) => string) => (value: string): boolean =>
  typeof value === 'string' && transform(value) === value;

export const textPlugin = {
  name: 'text',
  validators: {
    trim: unchanged(trim),
    normalizeSpaces: unchanged(normalizeSpaces),
  },
  transformers: {
    trim, normalizeSpaces,
  },
} satisfies PayloadVarsPlugin;
