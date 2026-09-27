import type { PayloadVarsPlugin } from '../plugins.js';

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

export const datePlugin = {
  name: 'date',
  validators: { dateonly, isodatetime },
  transformers: { isodatetime: toIsoDateTime },
} satisfies PayloadVarsPlugin;
