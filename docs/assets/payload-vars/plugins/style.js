function words(value) {
    if (typeof value !== 'string' || /[^A-Za-z0-9\s_-]/.test(value))
        return;
    const tokens = value
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[\s_-]+/).filter(Boolean);
    return tokens.length ? tokens.map(word => word.toLowerCase()) : undefined;
}
const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1);
const styles = {
    camelCase: (tokens) => tokens.map((word, index) => index ? capitalize(word) : word).join(''),
    pascalCase: (tokens) => tokens.map(capitalize).join(''),
    snakeCase: (tokens) => tokens.join('_'),
    kebabCase: (tokens) => tokens.join('-'),
};
function style(format) {
    return {
        validate: (value) => {
            const tokens = words(value);
            return !!tokens && format(tokens) === value;
        },
        transform: (value) => {
            const tokens = words(value);
            if (!tokens)
                throw new Error('Invalid text case input');
            return format(tokens);
        },
    };
}
const camelCase = style(styles.camelCase);
const pascalCase = style(styles.pascalCase);
const snakeCase = style(styles.snakeCase);
const kebabCase = style(styles.kebabCase);
const upperCase = (value) => value.toUpperCase();
const lowerCase = (value) => value.toLowerCase();
const unchanged = (transform) => (value) => typeof value === 'string' && transform(value) === value;
export const stylePlugin = {
    name: 'style',
    validators: {
        camelCase: camelCase.validate,
        pascalCase: pascalCase.validate,
        snakeCase: snakeCase.validate,
        kebabCase: kebabCase.validate,
        knownCase: (value) => [camelCase, pascalCase, snakeCase, kebabCase]
            .some(operation => operation.validate(value)),
        upperCase: unchanged(upperCase),
        lowerCase: unchanged(lowerCase),
    },
    transformers: {
        camelCase: camelCase.transform,
        pascalCase: pascalCase.transform,
        snakeCase: snakeCase.transform,
        kebabCase: kebabCase.transform,
        upperCase, lowerCase,
    },
};
