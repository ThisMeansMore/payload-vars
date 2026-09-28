export const variableNameSource = '[A-Za-z_][A-Za-z0-9_]*';
export const typeSource = 'string|number|boolean';
export const actionSource = 'null|omit|throw';
export const operatorSource = String.raw`\?\?|\|\|`;
export const operationIdentifierSource = '[A-Za-z_][A-Za-z0-9_]*';
export const operationNameSource = String.raw`${operationIdentifierSource}\.${operationIdentifierSource}`;

// Root-relative template paths; raw inputs deliberately accept only a single input name.
export const propertyReferenceSource = String.raw`(?:${variableNameSource}|\[(?:0|[1-9][0-9]*)\])(?:\.${variableNameSource}|\[(?:0|[1-9][0-9]*)\])*`;
export const argumentReferenceSource = String.raw`(?:\$\.${variableNameSource}|${propertyReferenceSource})`;
