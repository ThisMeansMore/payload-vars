import { variableNameSource, operationNameSource, typeSource, actionSource, operatorSource } from './expression-syntax.js';
import type { PayloadExpressionToken, PayloadExpressionTokenKind } from './payload-template.types.js';

const variablePattern = new RegExp(`^${variableNameSource}$`);
const operationPattern = new RegExp(`^${operationNameSource}$`);
const typePattern = new RegExp(`^(${typeSource})$`);
const actionPattern = new RegExp(`^(${actionSource})$`);
const operatorPattern = new RegExp(`^(${operatorSource})$`);
type Position = 'function' | 'call' | 'argument' | 'argumentEnd' | 'outside' | 'variable' | 'colon' | 'type' | 'tail'
  | 'memberValidator' | 'memberTransformer' | 'valueValidator' | 'valueTransformer'
  | 'member' | 'memberAction' | 'memberEnd' | 'arrayEnd' | 'valueAction' | 'end';

export function tokenizePayloadExpression(expression: string): PayloadExpressionToken[] {
  const tokens: PayloadExpressionToken[] = [];
  let position: Position = 'outside';
  let conditional: 'validator' | 'success' | undefined;
  // Whole word/operator runs avoid highlighting valid prefixes of invalid text.
  // The final alternative consumes any code point, including lone surrogates.
  const pieces = /\s+|\{\{|\}\}|[A-Za-z0-9_$.]+|[?|]+|[^]/gu;
  for (const match of expression.matchAll(pieces)) {
    const text = match[0];
    const start = match.index!;
    let kind: PayloadExpressionTokenKind = 'unknown';
    if (/^\s+$/.test(text)) {
      kind = 'whitespace';
    } else if (text === '{{' || text === '}}') {
      kind = 'delimiter';
      position = text === '{{' ? 'variable' : 'outside';
      conditional = undefined;
    } else if (position !== 'outside') {
      if (text === '=' && (position === 'tail' || position === 'arrayEnd')) {
        kind = 'operator'; position = 'function';
      } else if (position === 'function' && operationPattern.test(text)) {
        kind = 'function'; position = 'call';
      } else if (position === 'call' && text === '(') {
        kind = 'punctuation'; position = 'argument';
      } else if (position === 'argument' && variablePattern.test(text)) {
        kind = 'variable'; position = 'argumentEnd';
      } else if (position === 'argumentEnd' && text === ',') {
        kind = 'punctuation'; position = 'argument';
      } else if ((position === 'argument' || position === 'argumentEnd') && text === ')') {
        kind = 'punctuation'; position = 'arrayEnd';
      } else if (text === ':' || text === '[' || text === ']') {
        kind = 'punctuation';
        conditional = undefined;
        if (text === ':' && (position === 'colon' || position === 'variable')) position = 'type';
        else if (text === '[' && position === 'tail') position = 'member';
        else if (text === ']' && (position === 'member' || position === 'memberAction' || position === 'memberEnd')) position = 'arrayEnd';
      } else if (position === 'variable' && variablePattern.test(text)) {
        kind = 'variable';
        position = 'colon';
      } else if (position === 'type' && /^[A-Za-z0-9_$]+$/.test(text)) {
        if (typePattern.test(text)) kind = 'type';
        position = 'tail';
      } else if ((text === '!' || text === '?' || text === '>' || (text === '~' && conditional !== undefined)) && (position === 'tail' || position === 'arrayEnd' || position === 'member')) {
        kind = 'operator';
        conditional = text === '?' ? 'validator' : text === '>' && conditional === 'validator' ? 'success' : undefined;
        const validator = text === '!' || text === '?';
        position = position === 'member' ? (validator ? 'memberValidator' : 'memberTransformer')
          : (validator ? 'valueValidator' : 'valueTransformer');
      } else if (operationPattern.test(text) && (position === 'memberValidator' || position === 'memberTransformer'
        || position === 'valueValidator' || position === 'valueTransformer')) {
        kind = position.endsWith('Validator') ? 'validator' : 'transformer';
        position = position.startsWith('member') ? 'member' : 'arrayEnd';
      } else if (operatorPattern.test(text) && (position === 'tail' || position === 'arrayEnd' || position === 'member')) {
        kind = 'operator';
        position = position === 'member' ? 'memberAction' : 'valueAction';
        conditional = undefined;
      } else if (actionPattern.test(text) && (position === 'memberAction' || position === 'valueAction')) {
        kind = 'action';
        position = position === 'memberAction' ? 'memberEnd' : 'end';
      }
    }
    tokens.push({ kind, text, start, end: start + text.length });
  }
  return tokens;
}
