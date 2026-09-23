import { PayloadTemplate, type PayloadExpressionToken, type PayloadExpressionTokenKind,
  type TokenizedPayloadExpression } from '../../src/index.js';

const expressions: TokenizedPayloadExpression[] = new PayloadTemplate('{{x:string}}').tokenizePayloadExpression();
for (const expression of expressions) {
  const path: string = expression.path;
  const normalized: string = expression.expression;
  const tokens: PayloadExpressionToken[] = expression.tokens;
  for (const token of tokens) {
    const kind: PayloadExpressionTokenKind = token.kind;
    const text: string = token.text;
    const start: number = token.start;
    const end: number = token.end;
    void [kind, text, start, end];
  }
  void [path, normalized];
}
// @ts-expect-error Input is supplied only at construction.
new PayloadTemplate(null).tokenizePayloadExpression('{{x:string}}');
// @ts-expect-error Token kinds are a closed union.
const invalid: PayloadExpressionTokenKind = 'json';
