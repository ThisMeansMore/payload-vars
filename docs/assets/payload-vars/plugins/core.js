export const corePlugin = {
    name: 'core',
    // Intercepted by the renderer after value evaluation.
    transformers: { omit: (value) => value },
};
