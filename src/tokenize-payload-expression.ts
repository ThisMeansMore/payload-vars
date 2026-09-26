import { variableNameSource, typeSource, actionSource, operatorSource } from './expression-syntax.js';
import type { PayloadExpressionToken, PayloadExpressionTokenKind } from './payload-template.types.js';

const variablePattern = new RegExp(`^${variableNameSource}$`);
const typePattern = new RegExp(`^(${typeSource})$`);
const actionPattern = new RegExp(`^(${actionSource})$`);
const operatorPattern = new RegExp(`^(${operatorSource})$`);
type Position = 'outside' | 'variable' | 'colon' | 'type' | 'tail'
  | 'memberValidator' | 'memberTransformer' | 'valueValidator' | 'valueTransformer'
  | 'member' | 'memberAction' | 'memberEnd' | 'arrayEnd' | 'valueAction' | 'end';

export function tokenizePayloadExpression(expression: string): PayloadExpressionToken[] {
  const tokens: PayloadExpressionToken[] = [];
  let position: Position = 'outside';
  // Whole word/operator runs avoid highlighting valid prefixes of invalid text.
  // The final alternative consumes any code point, including lone surrogates.
  const pieces = /\s+|\{\{|\}\}|[A-Za-z0-9_$]+|[?|]+|[^]/gu;
  for (const match of expression.matchAll(pieces)) {
    const text = match[0];
    const start = match.index!;
    let kind: PayloadExpressionTokenKind = 'unknown';
    if (/^\s+$/.test(text)) {
      kind = 'whitespace';
    } else if (text === '{{' || text === '}}') {
      kind = 'delimiter';
      position = text === '{{' ? 'variable' : 'outside';
    } else if (position !== 'outside') {
      if (text === ':' || text === '[' || text === ']') {
        kind = 'punctuation';
        if (text === ':' && (position === 'colon' || position === 'variable')) position = 'type';
        else if (text === '[' && position === 'tail') position = 'member';
        else if (text === ']' && (position === 'member' || position === 'memberAction' || position === 'memberEnd')) position = 'arrayEnd';
      } else if (position === 'variable' && variablePattern.test(text)) {
        kind = 'variable';
        position = 'colon';
      } else if (position === 'type' && /^[A-Za-z0-9_$]+$/.test(text)) {
        if (typePattern.test(text)) kind = 'type';
        position = 'tail';
      } else if ((text === '@' || text === '>') && (position === 'tail' || position === 'arrayEnd' || position === 'member')) {
        kind = 'operator';
        position = position === 'member' ? (text === '@' ? 'memberValidator' : 'memberTransformer')
          : (text === '@' ? 'valueValidator' : 'valueTransformer');
      } else if (variablePattern.test(text) && (position === 'memberValidator' || position === 'memberTransformer'
        || position === 'valueValidator' || position === 'valueTransformer')) {
        kind = position.endsWith('Validator') ? 'validator' : 'transformer';
        position = position.startsWith('member') ? 'member' : 'arrayEnd';
      } else if (operatorPattern.test(text) && (position === 'tail' || position === 'arrayEnd' || position === 'member')) {
        kind = 'operator';
        position = position === 'member' ? 'memberAction' : 'valueAction';
      } else if (actionPattern.test(text) && (position === 'memberAction' || position === 'valueAction')) {
        kind = 'action';
        position = position === 'memberAction' ? 'memberEnd' : 'end';
      }
    }
    tokens.push({ kind, text, start, end: start + text.length });
  }
  return tokens;
}
