import type { PayloadVarsPlugin } from '../plugins.js';

function words(value: string): string[] | undefined {
  if (typeof value !== 'string' || /[^A-Za-z0-9\s_-]/.test(value)) return;
  const tokens = value
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/).filter(Boolean);
  return tokens.length ? tokens.map(word => word.toLowerCase()) : undefined;
}

const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);
const styles = {
  camelCase: (tokens: string[]) => tokens.map((word, index) => index ? capitalize(word) : word).join(''),
  pascalCase: (tokens: string[]) => tokens.map(capitalize).join(''),
  snakeCase: (tokens: string[]) => tokens.join('_'),
  kebabCase: (tokens: string[]) => tokens.join('-'),
};

function style(format: (tokens: string[]) => string) {
  return {
    validate: (value: string): boolean => {
      const tokens = words(value);
      return !!tokens && format(tokens) === value;
    },
    transform: (value: string): string => {
      const tokens = words(value);
      if (!tokens) throw new Error('Invalid text case input');
      return format(tokens);
    },
  };
}

const camelCase = style(styles.camelCase);
const pascalCase = style(styles.pascalCase);
const snakeCase = style(styles.snakeCase);
const kebabCase = style(styles.kebabCase);

const upperCase = (value: string): string => value.toUpperCase();
const lowerCase = (value: string): string => value.toLowerCase();
const trim = (value: string): string => value.trim();
const normalizeSpaces = (value: string): string => value.replace(/\s+/g, ' ');
const unchanged = (transform: (value: string) => string) => (value: string): boolean =>
  typeof value === 'string' && transform(value) === value;

export const textPlugin = {
  name: 'text',
  validators: {
    camelCase: camelCase.validate,
    pascalCase: pascalCase.validate,
    snakeCase: snakeCase.validate,
    kebabCase: kebabCase.validate,
    knownCase: (value: string): boolean => [camelCase, pascalCase, snakeCase, kebabCase]
      .some(operation => operation.validate(value)),
    upperCase: unchanged(upperCase),
    lowerCase: unchanged(lowerCase),
    trim: unchanged(trim),
    normalizeSpaces: unchanged(normalizeSpaces),
  },
  transformers: {
    camelCase: camelCase.transform,
    pascalCase: pascalCase.transform,
    snakeCase: snakeCase.transform,
    kebabCase: kebabCase.transform,
    upperCase, lowerCase, trim, normalizeSpaces,
  },
} satisfies PayloadVarsPlugin;
