import type { PayloadTemplateOptions } from './plugins.js';
import { tokenizePayloadExpression } from './tokenize-payload-expression.js';
import type { PayloadTemplateVariables } from './payload-template-input.types.js';
import type { JsonValue, JsonTemplateValue, PayloadVariable, TokenizedPayloadExpression } from './payload-template.types.js';
import { buildContract, type Contract } from './template-internal.js';
import { renderContract } from './render-internal.js';

function copyJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(copyJson);
  if (value !== null && typeof value === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value)) {
      Object.defineProperty(result, key, { value: copyJson(value[key]!),
        enumerable: true, writable: true, configurable: true });
    }
    return result;
  }
  return value;
}

/** A validated, normalized template whose compiled contract can be reused. */
export class PayloadTemplate<const T extends JsonTemplateValue = JsonTemplateValue, const P extends PayloadTemplateOptions = PayloadTemplateOptions> {
  readonly #contract: Contract;

  /** Compile and snapshot the template. Invalid declarations throw PayloadTemplateError. */
  constructor(template: T, options: P = {} as P) {
    this.#contract = buildContract(template, options);
  }

  /** Return highlighting tokens for every normalized placeholder occurrence. */
  tokenizePayloadExpression(): TokenizedPayloadExpression[] {
    return Array.from(this.#contract.locations, ([path, { declaration }]) => ({
      path,
      expression: declaration,
      tokens: tokenizePayloadExpression(declaration),
    }));
  }

  /** Return an independent copy of the normalized template. */
  toJSON(): JsonValue {
    return copyJson(this.#contract.template);
  }

  /** Return independent variable contracts in first occurrence order. */
  variables(): PayloadVariable[] {
    const declarations = [...this.#contract.declarations.values()];
    const result: PayloadVariable[] = declarations.map(({ name, type, declaration, paths, function: fn, memberFallback, valueFallback, memberOperations, valueOperations }) => ({
      name, type, declaration,
      ...(fn ? { derived: true as const, function: { name: fn.name, arguments: [...fn.arguments] }, paths: [...paths] } : {}),
      ...(declarations.filter(item => item.name === name).length > 1 ? { paths: [...paths] } : {}),
      ...(memberOperations ? { memberOperations: memberOperations.map(op => ({ ...op })) } : {}),
      ...(valueOperations ? { valueOperations: valueOperations.map(op => ({ ...op })) } : {}),
      ...(memberFallback ? { memberFallback: { ...memberFallback } } : {}),
      ...(valueFallback ? { valueFallback: { ...valueFallback } } : {}),
    }));
    for (const declaration of declarations) {
      if (!declaration.function) continue;
      const fn = this.#contract.plugins.function.get(declaration.function.name)!;
      declaration.function.arguments.forEach((name, index) => {
        if (declarations.some(item => !item.function && item.name === name)) return;
        const previous = result.find(item => item.functionArgument && item.name === name);
        if (previous) { previous.paths = [...new Set([...previous.paths!, ...declaration.paths])]; return; }
        const type = fn.argumentTypes[index]!;
        result.push({ name, type, declaration: `{{${name}:${type}}}`, functionArgument: true, paths: [...declaration.paths] });
      });
    }
    return result;
  }

  /** Render with fresh runtime values using the already validated contract. */
  render(variables: PayloadTemplateVariables<T, P>): JsonValue {
    return renderContract(this.#contract, variables);
  }
}
