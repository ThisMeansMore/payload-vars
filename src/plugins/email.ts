import type { PayloadVarsPlugin } from '../plugins.js';

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

export const emailPlugin = {
  name: 'email',
  validators: { email, domain },
  transformers: { domain: extractDomain },
} satisfies PayloadVarsPlugin;
