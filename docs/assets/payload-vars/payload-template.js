var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _PayloadTemplate_contract;
import { tokenizePayloadExpression } from './tokenize-payload-expression.js';
import { buildContract } from './template-internal.js';
import { renderContract } from './render-internal.js';
function copyJson(value) {
    if (Array.isArray(value))
        return value.map(copyJson);
    if (value !== null && typeof value === 'object') {
        const result = {};
        for (const key of Object.keys(value)) {
            Object.defineProperty(result, key, { value: copyJson(value[key]),
                enumerable: true, writable: true, configurable: true });
        }
        return result;
    }
    return value;
}
/** A validated, normalized template whose compiled contract can be reused. */
export class PayloadTemplate {
    /** Compile and snapshot the template. Invalid declarations throw PayloadTemplateError. */
    constructor(template, options = {}) {
        _PayloadTemplate_contract.set(this, void 0);
        __classPrivateFieldSet(this, _PayloadTemplate_contract, buildContract(template, options), "f");
    }
    /** Return highlighting tokens for every normalized placeholder occurrence. */
    tokenizePayloadExpression() {
        return Array.from(__classPrivateFieldGet(this, _PayloadTemplate_contract, "f").locations, ([path, { declaration }]) => ({
            path,
            expression: declaration,
            tokens: tokenizePayloadExpression(declaration),
        }));
    }
    /** Return an independent copy of the normalized template. */
    toJSON() {
        return copyJson(__classPrivateFieldGet(this, _PayloadTemplate_contract, "f").template);
    }
    /** Return independent variable contracts in first occurrence order. */
    variables() {
        const declarations = [...__classPrivateFieldGet(this, _PayloadTemplate_contract, "f").declarations.values()];
        const result = declarations.map(({ name, type, declaration, paths, function: fn, memberFallback, valueFallback, memberOperations, valueOperations, allowedValues, interaction }) => ({
            name, type, declaration, paths: [...paths],
            ...(fn ? { derived: true, function: { name: fn.name, arguments: [...fn.arguments] } } : {}),
            ...(fn ? { dependencies: fn.arguments.map(reference => reference.startsWith('$.')
                    ? { source: 'input', name: reference.slice(2) }
                    : { source: 'property', path: reference.startsWith('[') ? `$${reference}` : `$.${reference}` }) } : {}),
            ...(memberOperations ? { memberOperations: memberOperations.map(op => ({ ...op })) } : {}),
            ...(valueOperations ? { valueOperations: valueOperations.map(op => ({ ...op })) } : {}),
            ...(memberFallback ? { memberFallback: { ...memberFallback } } : {}),
            ...(valueFallback ? { valueFallback: { ...valueFallback } } : {}),
            ...(allowedValues ? { allowedValues: [...allowedValues] } : {}),
            ...(interaction ? { interaction } : {}),
        }));
        for (const declaration of declarations) {
            if (!declaration.function)
                continue;
            const fn = __classPrivateFieldGet(this, _PayloadTemplate_contract, "f").plugins.function.get(declaration.function.name);
            declaration.function.arguments.forEach((reference, index) => {
                if (!reference.startsWith('$.'))
                    return;
                const name = reference.slice(2);
                if (declarations.some(item => !item.function && item.name === name))
                    return;
                const previous = result.find(item => item.functionArgument && item.name === name);
                if (previous) {
                    previous.paths = [...new Set([...previous.paths, ...declaration.paths])];
                    return;
                }
                const type = fn.argumentTypes[index];
                result.push({ name, type, declaration: `{{${name}:${type}}}`, functionArgument: true, paths: [...declaration.paths] });
            });
        }
        return result;
    }
    /** Render with fresh runtime values. Unused variables are discarded unless `passthrough` is true. */
    render(variables, options = {}) {
        return renderContract(__classPrivateFieldGet(this, _PayloadTemplate_contract, "f"), variables, options);
    }
}
_PayloadTemplate_contract = new WeakMap();
