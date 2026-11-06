const formKeys = new Set(['title', 'sections']);
const sectionKeys = new Set(['title', 'fields']);
const fieldKeys = new Set(['id', 'label', 'variable', 'ui']);
const uiIdPattern = /^ui_[a-z0-9][a-z0-9_-]{2,28}$/;

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function fail(path, message) {
  throw new Error(`Invalid UI form at ${path}: ${message}`);
}

function objectAt(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, 'expected an object');
  }
  return value;
}

function knownKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${path}.${key}`, 'unknown property');
  }
}

function textAt(value, path) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(path, 'expected a non-empty string');
  }
  return value.trim();
}

function arrayAt(value, path) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(path, 'expected a non-empty array');
  }
  return value;
}

function randomUiId() {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(6);
  let suffix = '';

  while (suffix.length < 6) {
    globalThis.crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < 252) suffix += alphabet[byte % 36];
      if (suffix.length === 6) break;
    }
  }

  return `ui_${suffix}`;
}

function nextUiId(used, idGenerator) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = idGenerator();
    if (!uiIdPattern.test(id)) {
      fail('generated id', `expected ${uiIdPattern}`);
    }
    if (!used.has(id)) return id;
  }
  fail('generated id', 'could not create a unique id');
}

function isRequired(contract) {
  return !contract.valueFallback || contract.valueFallback.action === 'throw';
}

function inputContracts(template) {
  return template.variables().filter(contract => !contract.derived && !contract.functionArgument);
}

export class PlaygroundUiForm {
  #template;
  #definition;
  #fields;

  constructor(template, definition, { idGenerator = randomUiId } = {}) {
    this.#template = template;

    const source = objectAt(definition, '$');
    knownKeys(source, formKeys, '$');
    const title = textAt(source.title, '$.title');
    const sections = arrayAt(source.sections, '$.sections');
    const contracts = new Map(inputContracts(template).map(contract => [contract.name, contract]));
    const usedIds = new Set();
    const usedVariables = new Set();
    const fields = [];

    this.#definition = {
      title,
      sections: sections.map((rawSection, sectionIndex) => {
        const sectionPath = `$.sections[${sectionIndex}]`;
        const section = objectAt(rawSection, sectionPath);
        knownKeys(section, sectionKeys, sectionPath);
        const sectionTitle = textAt(section.title, `${sectionPath}.title`);
        const rawFields = arrayAt(section.fields, `${sectionPath}.fields`);

        return {
          title: sectionTitle,
          fields: rawFields.map((rawField, fieldIndex) => {
            const fieldPath = `${sectionPath}.fields[${fieldIndex}]`;
            const field = objectAt(rawField, fieldPath);
            knownKeys(field, fieldKeys, fieldPath);
            const label = textAt(field.label, `${fieldPath}.label`);
            const variable = textAt(field.variable, `${fieldPath}.variable`);
            const ui = textAt(field.ui, `${fieldPath}.ui`);
            const contract = contracts.get(variable);

            if (!contract) fail(`${fieldPath}.variable`, `unknown template variable "${variable}"`);
            if (usedVariables.has(variable)) {
              fail(`${fieldPath}.variable`, `duplicate template variable "${variable}"`);
            }

            let id = field.id === undefined
              ? nextUiId(usedIds, idGenerator)
              : textAt(field.id, `${fieldPath}.id`);
            if (!uiIdPattern.test(id)) {
              fail(`${fieldPath}.id`, `expected ${uiIdPattern}`);
            }
            if (usedIds.has(id)) fail(`${fieldPath}.id`, `duplicate id "${id}"`);

            usedVariables.add(variable);
            usedIds.add(id);

            const normalized = { id, label, variable, ui };
            const enriched = {
              ...normalized,
              type: contract.type,
              required: isRequired(contract),
              paths: copy(contract.paths ?? []),
            };
            if (contract.allowedValues !== undefined) {
              enriched.allowedValues = copy(contract.allowedValues);
            }
            if (contract.valueFallback !== undefined) enriched.valueFallback = copy(contract.valueFallback);
            if (contract.memberFallback !== undefined) enriched.memberFallback = copy(contract.memberFallback);
            fields.push(enriched);
            return normalized;
          }),
        };
      }),
    };

    this.#fields = fields;
  }

  toJSON() {
    return copy(this.#definition);
  }

  fields() {
    return copy(this.#fields);
  }

  submit(payload, options) {
    return this.#template.render(payload, options);
  }
}

export function createPlaygroundUiForm(template, definition, options) {
  return new PlaygroundUiForm(template, definition, options);
}

export { uiIdPattern };
