import type { PayloadVarsPlugin } from '../plugins.js';

export const corePlugin = {
  name: 'core',
  // Intercepted by the renderer after value evaluation.
  transformers: { omit: (value: string) => value },
} satisfies PayloadVarsPlugin;
