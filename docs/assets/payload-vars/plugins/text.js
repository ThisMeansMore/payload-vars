const trim = (value) => value.trim();
const normalizeSpaces = (value) => value.replace(/\s+/g, ' ');
const unchanged = (transform) => (value) => typeof value === 'string' && transform(value) === value;
export const textPlugin = {
    name: 'text',
    validators: {
        trim: unchanged(trim),
        normalizeSpaces: unchanged(normalizeSpaces),
    },
    transformers: {
        trim, normalizeSpaces,
    },
};
