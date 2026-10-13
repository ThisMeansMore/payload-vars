import type { PayloadTemplateIssue } from './payload-template.types.js';

export class PayloadTemplateError extends Error {
  constructor(public readonly issue: PayloadTemplateIssue) {
    super(issue.code === 'INVALID_INTERACTION_SYNTAX'
      ? 'Invalid interaction: place one @ name suffix at the end, using lowercase category or category.style syntax.'
      : issue.code === 'INVALID_ALLOWED_VALUES_SYNTAX'
        ? 'Invalid allowed values: use a non-empty comma-separated list whose values match the declared type.'
      : issue.code === 'INVALID_FALLBACK_SYNTAX'
        ? 'Invalid expression: use ! validator, ? validator [> transformer] [~ transformer], or > transformer, followed by an optional ?? or || fallback. The ~ operator is only allowed with ?.'
        : issue.code);
    this.name = 'PayloadTemplateError';
  }
}
