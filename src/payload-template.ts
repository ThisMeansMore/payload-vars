import type { PayloadTemplateOptions } from './plugins.js';
import { tokenizePayloadExpression } from './tokenize-payload-expression.js';
import type { PayloadTemplateVariables } from './payload-template-input.types.js';
import type { JsonValue, JsonTemplateValue, PayloadVariable, TokenizedPayloadExpression } from './payload-template.types.js';
import { validateTemplate, type Contract } from './template-internal.js';
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
export class PayloadTemplate<const T extends JsonTemplateValue = JsonTemplateValue> {
  readonly #contract: Contract;

  /** Validate and snapshot the template. Invalid declarations throw PayloadTemplateError. */
  constructor(template: T, options: PayloadTemplateOptions = {}) {
    this.#contract = validateTemplate(template, options);
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
  extractVariables(): PayloadVariable[] {
    return Array.from(this.#contract.declarations.values(), ({ name, type, declaration, memberFallback, valueFallback, memberOperations, valueOperations }) => ({
      name, type, declaration,
      ...(memberOperations ? { memberOperations: memberOperations.map(op => ({ ...op })) } : {}),
      ...(valueOperations ? { valueOperations: valueOperations.map(op => ({ ...op })) } : {}),
      ...(memberFallback ? { memberFallback: { ...memberFallback } } : {}),
      ...(valueFallback ? { valueFallback: { ...valueFallback } } : {}),
    }));
  }

  /** Render with fresh runtime values using the already validated contract. */
  render(variables: PayloadTemplateVariables<T>): JsonValue {
    return renderContract(this.#contract, variables);
  }
}
