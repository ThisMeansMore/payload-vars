import type { PayloadOperation } from './plugins.js';
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue }

/** JSON template input, including deeply readonly literal templates. */
export type JsonTemplateValue = JsonPrimitive | { readonly [key: string]: JsonTemplateValue } | readonly JsonTemplateValue[];

export type BaseType = 'string' | 'number' | 'boolean' | 'string[]' | 'number[]';
export type PayloadVariableType = BaseType;
export interface FallbackExpression {
  operator: '??' | '||';
  action: 'null' | 'omit' | 'throw';
}
export interface ParsedVariableExpression {
  name: string;
  type: BaseType;
  memberOperations?: PayloadOperation[];
  valueOperations?: PayloadOperation[];
  memberFallback?: FallbackExpression;
  valueFallback?: FallbackExpression;
}
export interface PayloadVariable extends ParsedVariableExpression {
  /** Complete canonical placeholder, including its name and fallback expressions. */
  declaration: string;
}
interface RuntimeIssue {
  variableName: string;
  declaration: string;
  expectedType: BaseType;
  templatePaths: string[];
}
export type PayloadTemplateIssue =
  | { code: 'INVALID_PLUGIN_NAME'; plugin: unknown }
  | { code: 'DUPLICATE_PLUGIN_NAME'; plugin: string }
  | { code: 'INVALID_PLUGIN_OPERATION_NAME' | 'INVALID_PLUGIN_OPERATION'; kind: PayloadOperation['kind']; operation: string; plugin: string }
  | { code: 'UNKNOWN_PLUGIN_OPERATION'; kind: PayloadOperation['kind']; operation: string; path: string; variableName: string }
  | (RuntimeIssue & { code: 'VALIDATION_FAILED' | 'PLUGIN_EXECUTION_FAILED' | 'INVALID_TRANSFORMER_RESULT'; kind: PayloadOperation['kind']; operation: string; valuePath?: string })
  | { code: 'INVALID_PLACEHOLDER'; path: string; placeholder: string }
  | { code: 'UNSUPPORTED_TYPE'; path: string; variableName: string; declaredType: string }
  | { code: 'INVALID_FALLBACK_SYNTAX'; path: string; variableName: string; placeholder: string }
  | { code: 'VARIABLE_EXPRESSION_CONFLICT'; variableName: string; declaration: string; declaredAt: string; conflictingDeclaration: string; conflictingAt: string }
  | (RuntimeIssue & { code: 'MISSING_VARIABLE' })
  | (RuntimeIssue & { code: 'INVALID_VARIABLE_TYPE'; actualType: string; valuePath?: string })
  | (RuntimeIssue & { code: 'FALLBACK_THROW'; operator: FallbackExpression['operator']; valuePath?: string })
  | (RuntimeIssue & { code: 'CANNOT_OMIT_ROOT' });

export type PayloadExpressionTokenKind =
  | 'delimiter' | 'variable' | 'punctuation' | 'type'
  | 'validator' | 'transformer' | 'operator' | 'action' | 'whitespace' | 'unknown';

export interface PayloadExpressionToken {
  kind: PayloadExpressionTokenKind;
  text: string;
  /** Inclusive UTF-16 offset into the normalized expression. */
  start: number;
  /** Exclusive UTF-16 offset into the normalized expression. */
  end: number;
}

export interface TokenizedPayloadExpression {
  /** JSON path of this placeholder occurrence, using the same format as errors. */
  path: string;
  /** Complete normalized placeholder, including mustache delimiters. */
  expression: string;
  tokens: PayloadExpressionToken[];
}
