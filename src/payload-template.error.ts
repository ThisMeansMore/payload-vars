import type { PayloadTemplateIssue } from './payload-template.types.js';

export class PayloadTemplateError extends Error {
  constructor(public readonly issue: PayloadTemplateIssue) {
    super(issue.code === 'LEGACY_VALIDATION_SYNTAX'
      ? 'The @ validation operator is no longer supported. Use ! for throwing validation or ? for conditional validation.'
      : issue.code === 'INVALID_FALLBACK_SYNTAX'
        ? 'Invalid expression: use ! validator, ? validator [> transformer] [~ transformer], or > transformer, followed by an optional ?? or || fallback. The ~ operator is only allowed with ?.'
        : issue.code);
    this.name = 'PayloadTemplateError';
  }
}
