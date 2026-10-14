import { PayloadTemplate } from './payload-vars/index.js';
import { generatePayload, parseControlValue } from './playground-contracts.js';
import { highlightJson } from './playground-highlight.js';
import { formatJson, parseJson } from './playground-json.js';
import { createPlaygroundUiForm } from './playground-ui-form.js';

const byId = id => document.getElementById(id);
const playgroundGrid = byId('playground-grid');
const templateEditorShell = byId('template-editor');
const templateEditor = byId('template-json');
const templateHighlight = byId('template-highlight');
const templateError = byId('template-error');
const templateFormatProgress = byId('template-format-progress');
const templateWrapLines = byId('template-wrap-lines');
const templateNote = byId('template-note');
const templateBadge = byId('template-badge');
const uiFormPanel = byId('ui-form-panel');
const uiFormEditorShell = byId('ui-form-editor');
const uiFormEditor = byId('ui-form-json');
const uiFormHighlight = byId('ui-form-highlight');
const uiFormError = byId('ui-form-error');
const uiFormFormatProgress = byId('ui-form-format-progress');
const additionalPayloadEditorShell = byId('additional-payload-editor');
const additionalPayloadEditor = byId('additional-payload-json');
const additionalPayloadHighlight = byId('additional-payload-highlight');
const additionalPayloadError = byId('additional-payload-error');
const additionalPayloadFormatProgress = byId('additional-payload-format-progress');
const payloadEditorShell = byId('payload-editor');
const payloadEditor = byId('payload-json');
const payloadHighlight = byId('payload-highlight');
const payloadError = byId('payload-error');
const payloadFormatProgress = byId('payload-format-progress');
const payloadPassthrough = byId('payload-passthrough');
const headlessForm = byId('headless-form');
const generatedPreview = byId('generated-preview');
const generatedForm = byId('generated-form');
const generatedFields = byId('generated-fields');
const renderedOutput = byId('rendered-json');
const renderErrors = byId('render-errors');
const renderCall = byId('render-call');
const renderedNote = byId('rendered-note');
const renderedStep = byId('rendered-step');
const contractsOutput = byId('variable-contracts');
const contractCards = byId('contract-cards');
const contractsCount = byId('contracts-count');
const contractsHeadingText = byId('contracts-heading-text');
const contractsDescription = byId('contracts-description');
const contractViewButtons = [...document.querySelectorAll('[data-contract-view]')];
const inputHeading = byId('input-heading');
const inputStep = byId('input-step');
const inputBadge = byId('input-badge');
const inputNote = byId('input-note');
const flowDescription = byId('flow-description');
const demoHint = byId('demo-hint');
const playgroundFootnote = byId('playground-footnote');
const flowSwitch = document.querySelector('.playground__flow-switch');
const status = byId('playground-status');
const resetPayload = byId('reset-payload');
const flowButtons = [...document.querySelectorAll('[data-flow]')];
const exampleTemplates = {
  headless: JSON.parse(byId('example-headless-template').textContent),
  ui: JSON.parse(byId('example-ui-template').textContent),
};
const examplePayloads = {
  headless: JSON.parse(byId('example-headless-payload').textContent),
  ui: JSON.parse(byId('example-ui-payload').textContent),
};
const exampleUiForm = JSON.parse(byId('example-ui-form').textContent);
const templateSources = Object.fromEntries(Object.entries(exampleTemplates)
  .map(([name, template]) => [name, formatJson(template)]));
const flowPayloads = {
  headless: { ...examplePayloads.headless },
  ui: { ...examplePayloads.ui },
};
const editorIdleDelay = 3000;

let flow = 'headless';
let compiled;
let uiForm;
let uiFields = [];
let uiFormSource = formatJson(exampleUiForm);
let formValues = {};
let additionalPayload = { ...examplePayloads.ui };
let contracts = [];
let payload = {};
let expressionTokens = new Map();
let templateFeedbackTimer;
let uiFormFeedbackTimer;
let additionalPayloadFeedbackTimer;
let payloadFeedbackTimer;

const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const isRequired = contract => contract.required ?? (!contract.valueFallback || contract.valueFallback.action === 'throw');

function syncEditorScroll(highlight, editor) {
  highlight.scrollTop = editor.scrollTop;
  highlight.scrollLeft = editor.scrollLeft;
}

function highlightTemplate() {
  templateHighlight.innerHTML = `${highlightJson(templateEditor.value, expressionTokens)}\n`;
  syncEditorScroll(templateHighlight, templateEditor);
}

function highlightUiForm() {
  uiFormHighlight.innerHTML = `${highlightJson(uiFormEditor.value)}\n`;
  syncEditorScroll(uiFormHighlight, uiFormEditor);
}

function highlightPayload() {
  payloadHighlight.innerHTML = `${highlightJson(payloadEditor.value)}\n`;
  syncEditorScroll(payloadHighlight, payloadEditor);
}

function highlightAdditionalPayload() {
  additionalPayloadHighlight.innerHTML = `${highlightJson(additionalPayloadEditor.value)}\n`;
  syncEditorScroll(additionalPayloadHighlight, additionalPayloadEditor);
}

function startFormatCountdown(progress) {
  progress.style.setProperty('--playground-format-delay', `${editorIdleDelay}ms`);
  progress.hidden = false;
  progress.classList.remove('is-running');
  void progress.offsetWidth;
  progress.classList.add('is-running');
}

function stopFormatCountdown(progress) {
  progress.classList.remove('is-running');
  progress.hidden = true;
}

function writePayload(value) {
  clearTimeout(payloadFeedbackTimer);
  stopFormatCountdown(payloadFormatProgress);
  payloadEditor.value = formatJson(value);
  highlightPayload();
}

function writeAdditionalPayload(value) {
  clearTimeout(additionalPayloadFeedbackTimer);
  stopFormatCountdown(additionalPayloadFormatProgress);
  additionalPayloadEditor.value = formatJson(value);
  highlightAdditionalPayload();
}

function setStatus(message, state = '') {
  status.textContent = message;
  status.dataset.state = state;
}

function setEditorError(editor, messageElement, message = '') {
  messageElement.textContent = message;
  editor.setAttribute('aria-invalid', String(Boolean(message)));
  editor.classList.toggle('has-error', Boolean(message));
}

function readJsonEditor(editor, shell, errorElement, { format = false } = {}) {
  const result = parseJson(editor.value);
  if (!result.ok) {
    const message = `Invalid JSON: ${result.message}`;
    setEditorError(editor, errorElement, message);
    shell.dataset.state = 'error';
    return { ...result, message };
  }
  if (format) editor.value = formatJson(result.value);
  setEditorError(editor, errorElement);
  delete shell.dataset.state;
  return result;
}

function readTemplateJson(options) {
  const result = readJsonEditor(templateEditor, templateEditorShell, templateError, options);
  if (result.ok && options?.format) highlightTemplate();
  return result;
}

function readUiFormJson(options) {
  const result = readJsonEditor(uiFormEditor, uiFormEditorShell, uiFormError, options);
  if (result.ok && options?.format) highlightUiForm();
  return result;
}

function readPayloadJson({ format = false } = {}) {
  const result = readJsonEditor(payloadEditor, payloadEditorShell, payloadError);
  if (!result.ok) return result;
  if (result.value === null || Array.isArray(result.value) || typeof result.value !== 'object') {
    const message = 'Payload JSON must be an object.';
    setEditorError(payloadEditor, payloadError, message);
    payloadEditorShell.dataset.state = 'error';
    return { ok: false, message };
  }
  if (format) writePayload(result.value);
  return result;
}

function readAdditionalPayloadJson({ format = false } = {}) {
  const result = readJsonEditor(
    additionalPayloadEditor,
    additionalPayloadEditorShell,
    additionalPayloadError,
  );
  if (!result.ok) return result;
  if (result.value === null || Array.isArray(result.value) || typeof result.value !== 'object') {
    const message = 'Additional payload JSON must be an object.';
    setEditorError(additionalPayloadEditor, additionalPayloadError, message);
    additionalPayloadEditorShell.dataset.state = 'error';
    return { ok: false, message };
  }
  if (format) writeAdditionalPayload(result.value);
  return result;
}

function describeError(error) {
  const issue = error?.issue;
  if (!issue?.code) return error instanceof Error ? error.message : String(error);
  const locations = issue.valuePath ? [issue.valuePath]
    : issue.path ? [issue.path]
      : Array.isArray(issue.templatePaths) ? issue.templatePaths : [];
  const summary = `${issue.code}${locations.length ? ` at ${locations.join(', ')}` : ''}`;
  const details = [];
  if (issue.variableName) details.push(`variable ${JSON.stringify(issue.variableName)}`);
  if (issue.declaredType) details.push(`declared type ${JSON.stringify(issue.declaredType)}`);
  if (issue.expectedType) details.push(`expected ${JSON.stringify(issue.expectedType)}`);
  if (issue.actualType) details.push(`received ${JSON.stringify(issue.actualType)}`);
  if (issue.operation) details.push(`operation ${JSON.stringify(issue.operation)}`);
  if (issue.argumentName) details.push(`argument ${JSON.stringify(issue.argumentName)}`);
  if (issue.referencePath) details.push(`reference ${issue.referencePath}`);
  if (issue.placeholder) details.push(`placeholder ${JSON.stringify(issue.placeholder)}`);
  if (issue.declaration) details.push(`declaration ${JSON.stringify(issue.declaration)}`);
  const explanation = error instanceof Error && error.message !== issue.code ? error.message : '';
  return [summary, details.join('; '), explanation].filter(Boolean).join(' — ');
}

function showRendered(value) {
  renderedOutput.innerHTML = highlightJson(formatJson(value));
  renderedOutput.hidden = false;
  renderedOutput.dataset.state = 'success';
  renderErrors.hidden = true;
  renderErrors.replaceChildren();
}

function showErrors(messages) {
  renderErrors.replaceChildren(...messages.map(message => {
    const item = document.createElement('li');
    item.textContent = message;
    return item;
  }));
  renderErrors.hidden = false;
  renderedOutput.hidden = true;
  renderedOutput.textContent = '';
  renderedOutput.dataset.state = 'error';
}

function contractFact(label, value) {
  const wrapper = document.createElement('div');
  const term = document.createElement('dt');
  const detail = document.createElement('dd');
  term.textContent = label;
  detail.textContent = value;
  wrapper.append(term, detail);
  return wrapper;
}

function contractFallback(contract) {
  const descriptions = [];
  if (contract.memberFallback) descriptions.push(`items: ${contract.memberFallback.operator} ${contract.memberFallback.action}`);
  if (contract.valueFallback) {
    descriptions.push(`${contract.type.endsWith('[]') ? 'array' : 'value'}: ${contract.valueFallback.operator} ${contract.valueFallback.action}`);
  }
  return descriptions.join('; ') || 'None';
}

function contractCard(contract) {
  const card = document.createElement('article');
  card.className = 'playground__contract-card';
  const heading = document.createElement('div');
  heading.className = 'playground__contract-card-heading';
  const name = document.createElement('code');
  name.textContent = contract.name;
  const type = document.createElement('span');
  type.textContent = contract.type;
  heading.append(name, type);
  const facts = document.createElement('dl');
  facts.append(
    contractFact('Input', contract.derived ? 'Derived' : isRequired(contract) ? 'Required' : 'Optional'),
    contractFact('Fallback', contractFallback(contract)),
    contractFact('Values', contract.allowedValues?.map(String).join(', ') || 'Any valid value'),
    contractFact('Interaction', contract.interaction ? `@ ${contract.interaction}` : 'None'),
    contractFact('Path', contract.paths.length === 1 ? contract.paths[0] : `${contract.paths[0]} +${contract.paths.length - 1} more`),
  );
  card.title = contract.paths.join('\n');
  card.append(heading, facts);
  return card;
}

function uiFieldCard(field) {
  const card = document.createElement('article');
  card.className = 'playground__contract-card';
  const heading = document.createElement('div');
  heading.className = 'playground__contract-card-heading';
  const label = document.createElement('code');
  label.textContent = field.label;
  const type = document.createElement('span');
  type.textContent = field.ui;
  heading.append(label, type);
  const facts = document.createElement('dl');
  facts.append(
    contractFact('ID', field.id),
    contractFact('Variable', field.variable),
    contractFact('Input', `${field.type} · ${field.required ? 'Required' : 'Optional'}`),
    contractFact('Values', field.allowedValues?.map(String).join(', ') || 'Any valid value'),
  );
  card.append(heading, facts);
  return card;
}

function renderContracts(items, kind = 'variables') {
  contractsCount.textContent = `· ${items.length}`;
  contractsOutput.textContent = formatJson(items);
  contractCards.replaceChildren(...items.map(kind === 'fields' ? uiFieldCard : contractCard));
}

function inputId(field, index) {
  return index ? `${field.id}-${index}` : field.id;
}

function optionControl(field, value, index, currentValue, mode, optionalEmpty = false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'playground__option';
  const input = document.createElement('input');
  const id = inputId(field, index);
  input.id = id;
  input.type = mode;
  input.name = field.variable;
  input.dataset.variable = field.variable;
  input.dataset.value = optionalEmpty ? '' : JSON.stringify(value);
  input.checked = optionalEmpty ? currentValue === undefined
    : mode === 'checkbox' ? Array.isArray(currentValue) && currentValue.some(item => sameValue(item, value))
      : sameValue(currentValue, value);
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = optionalEmpty ? 'No value' : field.ui === 'rating.stars'
    ? `${'★'.repeat(Number(value))} (${value})` : String(value);
  wrapper.append(input, label);
  return wrapper;
}

function createField(field, currentValue) {
  const wrapper = document.createElement('div');
  wrapper.className = 'playground__field';
  wrapper.dataset.contract = field.variable;
  const label = document.createElement('span');
  label.className = 'playground__field-label';
  label.id = `label-${field.id}`;
  label.textContent = field.label;
  if (field.required) {
    const marker = document.createElement('span');
    marker.className = 'playground__required';
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = '*';
    label.append(marker);
  }
  const meta = document.createElement('span');
  meta.className = 'playground__meta';
  meta.textContent = `${field.type} · ${field.required ? 'required' : 'optional'} · ${field.ui} · id ${field.id}`;
  wrapper.append(label, meta);
  const isArray = field.type.endsWith('[]');
  if (field.allowedValues?.length && (isArray || field.ui === 'choice' || field.ui === 'rating.stars')) {
    const options = document.createElement('div');
    options.className = `playground__options${field.ui === 'rating.stars' ? ' playground__rating' : ''}`;
    options.setAttribute('role', isArray ? 'group' : 'radiogroup');
    options.setAttribute('aria-labelledby', label.id);
    if (!isArray && !field.required) options.append(optionControl(field, undefined, 1, currentValue, 'radio', true));
    field.allowedValues.forEach((value, index) => options.append(optionControl(
      field, value, index + 2, currentValue, isArray ? 'checkbox' : 'radio',
    )));
    wrapper.append(options);
    return wrapper;
  }
  let control;
  if (field.allowedValues?.length) {
    control = document.createElement('select');
    if (!field.required) control.append(new Option('No value', ''));
    field.allowedValues.forEach(value => control.append(new Option(String(value), JSON.stringify(value))));
    control.value = currentValue === undefined ? '' : JSON.stringify(currentValue);
  } else if (field.ui === 'text.multiline') {
    control = document.createElement('textarea');
    control.rows = 4;
    control.value = currentValue ?? '';
  } else if (field.type === 'boolean') {
    control = document.createElement('select');
    if (!field.required) control.append(new Option('No value', ''));
    control.append(new Option('True', 'true'), new Option('False', 'false'));
    control.value = currentValue === undefined ? '' : String(currentValue);
  } else {
    control = document.createElement('input');
    control.type = field.ui === 'date.picker' ? 'date' : field.type === 'number' ? 'number' : 'text';
    control.value = isArray && Array.isArray(currentValue) ? currentValue.join(', ') : currentValue ?? '';
    if (field.type === 'number') control.step = 'any';
  }
  control.id = field.id;
  control.name = field.variable;
  control.dataset.variable = field.variable;
  control.required = field.required;
  label.setAttribute('role', 'presentation');
  const accessibleLabel = document.createElement('label');
  accessibleLabel.className = 'visually-hidden';
  accessibleLabel.htmlFor = control.id;
  accessibleLabel.textContent = `${field.label}${field.required ? ' (required)' : ''}`;
  wrapper.append(accessibleLabel, control);
  return wrapper;
}

function buildForm() {
  generatedFields.replaceChildren();
  if (!uiForm || !uiFields.length) return;
  const fieldsById = new Map(uiFields.map(field => [field.id, field]));
  const definition = uiForm.toJSON();
  const title = document.createElement('h3');
  title.className = 'playground__form-title';
  title.textContent = definition.title;
  generatedFields.append(title);
  for (const group of definition.sections) {
    const section = document.createElement('fieldset');
    section.className = 'playground__section';
    const legend = document.createElement('legend');
    legend.textContent = group.title;
    section.append(legend, ...group.fields.map(item => {
      const field = fieldsById.get(item.id);
      return createField(field, payload[field.variable]);
    }));
    generatedFields.append(section);
  }
}

function readField(field) {
  const controls = [...generatedForm.querySelectorAll(`[data-variable="${field.variable}"]`)];
  if (controls[0]?.type === 'checkbox') {
    return controls.filter(control => control.checked).map(control => JSON.parse(control.dataset.value));
  }
  if (controls[0]?.type === 'radio') {
    const selected = controls.find(control => control.checked);
    return selected?.dataset.value ? JSON.parse(selected.dataset.value) : undefined;
  }
  return parseControlValue(field, controls[0]?.value ?? '');
}

function collectForm() {
  if (!uiForm) return;
  const next = {};
  for (const field of uiFields) {
    const value = readField(field);
    if (value === undefined) delete next[field.variable];
    else next[field.variable] = value;
  }
  formValues = next;
  payload = { ...additionalPayload, ...formValues };
  writePayload(payload);
}

function renderPayload() {
  const token = (text, className) => {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  };
  const instance = flow === 'ui' ? 'form' : 'template';
  const method = flow === 'ui' ? '.submit' : '.render';
  renderCall.replaceChildren(
    token(instance, 'playground__call-instance'), token(method, 'playground__call-method'),
    '( ', token('payload', 'playground__call-payload'), ', { ',
    token('passthrough', 'playground__call-options'), ': ',
    token(String(payloadPassthrough.checked), `playground__call-boolean is-${payloadPassthrough.checked}`), ' } )',
  );
  try {
    const result = flow === 'ui'
      ? uiForm.submit(payload, { passthrough: payloadPassthrough.checked })
      : compiled.render(payload, { passthrough: payloadPassthrough.checked });
    showRendered(result);
    return true;
  } catch (error) {
    showErrors([describeError(error)]);
    return false;
  }
}

function refreshInput() {
  writePayload(payload);
  setEditorError(payloadEditor, payloadError);
  delete payloadEditorShell.dataset.state;
  if (flow === 'ui') buildForm();
}

function clearCompiled(message) {
  compiled = undefined;
  uiForm = undefined;
  uiFields = [];
  contracts = [];
  expressionTokens = new Map();
  generatedFields.replaceChildren();
  renderContracts([], flow === 'ui' ? 'fields' : 'variables');
  showErrors([message]);
  setStatus(message, 'error');
}

function compileUiForm({ format = true } = {}) {
  clearTimeout(uiFormFeedbackTimer);
  stopFormatCountdown(uiFormFormatProgress);
  if (!compiled) return false;
  const parsed = readUiFormJson();
  if (!parsed.ok) {
    uiForm = undefined;
    uiFields = [];
    generatedFields.replaceChildren();
    renderContracts([], 'fields');
    showErrors([parsed.message]);
    setStatus(parsed.message, 'error');
    return false;
  }
  try {
    uiForm = createPlaygroundUiForm(compiled, parsed.value);
    uiFields = uiForm.fields();
    if (format) {
      uiFormEditor.value = formatJson(uiForm.toJSON());
      uiFormSource = uiFormEditor.value;
      highlightUiForm();
    }
    setEditorError(uiFormEditor, uiFormError);
    delete uiFormEditorShell.dataset.state;
    renderContracts(uiFields, 'fields');
    const fieldContracts = uiFields.map(field => ({ ...field, name: field.variable }));
    const currentValues = Object.fromEntries(uiFields
      .filter(field => Object.hasOwn(formValues, field.variable))
      .map(field => [field.variable, formValues[field.variable]]));
    formValues = generatePayload(fieldContracts, currentValues);
    payload = { ...additionalPayload, ...formValues };
    flowPayloads.ui = payload;
    refreshInput();
    renderPayload();
    setStatus(`${uiFields.length} UI field contract${uiFields.length === 1 ? '' : 's'} ready.`, 'success');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setEditorError(uiFormEditor, uiFormError, message);
    uiFormEditorShell.dataset.state = 'error';
    uiForm = undefined;
    uiFields = [];
    generatedFields.replaceChildren();
    renderContracts([], 'fields');
    showErrors([message]);
    setStatus(message, 'error');
    return false;
  }
}

function compileTemplate({ format = true } = {}) {
  clearTimeout(templateFeedbackTimer);
  stopFormatCountdown(templateFormatProgress);
  if (compiled && flow === 'headless') {
    const currentPayload = readPayloadJson();
    if (currentPayload.ok) payload = currentPayload.value;
  } else if (compiled && uiForm) collectForm();
  const parsed = readTemplateJson({ format });
  if (!parsed.ok) {
    clearCompiled(parsed.message);
    return;
  }
  try {
    compiled = new PayloadTemplate(parsed.value);
    const normalizedTemplate = compiled.toJSON();
    const tokenized = compiled.tokenizePayloadExpression();
    if (format) {
      templateEditor.value = formatJson(normalizedTemplate);
      expressionTokens = new Map(tokenized.map(item => [item.expression, item.tokens]));
    } else expressionTokens = new Map();
    templateSources[flow] = templateEditor.value;
    highlightTemplate();
    contracts = compiled.variables();
    payload = generatePayload(contracts, payload);
    flowPayloads[flow] = payload;
    if (flow === 'ui') {
      compileUiForm();
      return;
    }
    renderContracts(contracts);
    refreshInput();
    renderPayload();
    setStatus(`${contracts.length} variable contract${contracts.length === 1 ? '' : 's'} ready.`, 'success');
  } catch (error) {
    const message = `Invalid template: ${describeError(error)}`;
    setEditorError(templateEditor, templateError, message);
    templateEditorShell.dataset.state = 'error';
    clearCompiled(message);
  }
}

function configureFlowCopy(isHeadless) {
  flowSwitch.classList.toggle('is-form-designer', !isHeadless);
  byId('flow-headless').classList.toggle('is-complete', !isHeadless);
  playgroundGrid.classList.toggle('is-ui-flow', !isHeadless);
  uiFormPanel.hidden = isHeadless;
  headlessForm.hidden = !isHeadless;
  generatedPreview.hidden = isHeadless;
  resetPayload.hidden = !isHeadless;
  demoHint.hidden = !isHeadless;
  templateEditor.readOnly = !isHeadless;
  templateEditorShell.classList.toggle('is-readonly', !isHeadless);
  templateBadge.textContent = isHeadless ? 'Editable' : 'Existing template';
  inputStep.textContent = isHeadless ? '02' : '03';
  renderedStep.textContent = isHeadless ? '03' : '04';
  inputHeading.textContent = isHeadless ? 'Payload' : 'Controls';
  inputBadge.textContent = isHeadless ? 'JSON input' : 'form.fields()';
  inputNote.innerHTML = isHeadless
    ? 'Testing values are preserved as the template changes, while newly declared variables are appended automatically. Changes render automatically.'
    : 'The consumer renders controls from enriched field contracts. Each control uses its UI <code>id</code> and payload-variable <code>name</code>.';
  templateNote.innerHTML = isHeadless
    ? 'Validated by <code>PayloadTemplate</code> after editing pauses.'
    : 'Immutable input created in Template Designer. Return to Step 1 to change its payload rules.';
  renderedNote.innerHTML = isHeadless
    ? 'The active input and passthrough option are passed directly to <code>render()</code>. Failed rendering is shown as an error list.'
    : 'The form collects values by variable name, then <code>submit()</code> delegates validation and transformation to its template.';
  flowDescription.textContent = isHeadless
    ? 'Step 1 — Create and test a reusable template with validations and transformations.'
    : 'Step 2 — Use the existing template to design a strict, consumer-owned UI form.';
  contractsHeadingText.textContent = isHeadless ? 'Variable contracts' : 'UI field contracts';
  contractsDescription.innerHTML = isHeadless
    ? 'Metadata returned by <code>variables()</code>, summarized for quick inspection.'
    : 'Proposed metadata returned by <code>form.fields()</code>, including stable UI IDs and template validation rules.';
  playgroundFootnote.innerHTML = isHeadless
    ? 'Template Designer focuses on payload validation, transformation, fallbacks, and rendering.'
    : '<strong>Design mock:</strong> <code>createUiForm()</code>, <code>fields()</code>, and <code>submit()</code> illustrate a possible future API; they are not package APIs yet.';
}

function setFlow(nextFlow) {
  if (nextFlow === flow) return;
  clearTimeout(templateFeedbackTimer);
  clearTimeout(uiFormFeedbackTimer);
  clearTimeout(additionalPayloadFeedbackTimer);
  stopFormatCountdown(templateFormatProgress);
  stopFormatCountdown(uiFormFormatProgress);
  stopFormatCountdown(additionalPayloadFormatProgress);
  templateSources[flow] = templateEditor.value;
  templateSources[nextFlow] = templateEditor.value;
  if (flow === 'headless') {
    clearTimeout(payloadFeedbackTimer);
    stopFormatCountdown(payloadFormatProgress);
    const parsed = readPayloadJson();
    if (parsed.ok) payload = parsed.value;
  } else if (compiled && uiForm) {
    collectForm();
    uiFormSource = uiFormEditor.value;
  }
  flowPayloads[flow] = payload;
  flow = nextFlow;
  const isHeadless = flow === 'headless';
  for (const button of flowButtons) button.setAttribute('aria-pressed', String(button.dataset.flow === flow));
  configureFlowCopy(isHeadless);
  payload = flowPayloads[flow];
  compiled = undefined;
  uiForm = undefined;
  uiFields = [];
  contracts = [];
  expressionTokens = new Map();
  templateEditor.value = templateSources[flow];
  if (!isHeadless) {
    uiFormEditor.value = uiFormSource;
    writeAdditionalPayload(additionalPayload);
  }
  highlightTemplate();
  highlightUiForm();
  compileTemplate();
}

function resetExample() {
  templateSources[flow] = formatJson(exampleTemplates[flow]);
  templateEditor.value = templateSources[flow];
  if (flow === 'ui') {
    uiFormSource = formatJson(exampleUiForm);
    uiFormEditor.value = uiFormSource;
    formValues = {};
    additionalPayload = { ...examplePayloads.ui };
    writeAdditionalPayload(additionalPayload);
    highlightUiForm();
  }
  payload = { ...examplePayloads[flow] };
  flowPayloads[flow] = payload;
  compiled = undefined;
  uiForm = undefined;
  compileTemplate();
}

function resetVariablePayload() {
  if (!compiled) {
    setStatus('Enter a valid template first.', 'error');
    return;
  }
  payload = generatePayload(contracts, examplePayloads[flow]);
  flowPayloads[flow] = payload;
  refreshInput();
  const rendered = renderPayload();
  setStatus(rendered ? 'Testing payload reset.' : 'Reset testing payload failed validation.', rendered ? 'success' : 'error');
}

function applyHeadlessPayload() {
  if (!compiled) {
    setStatus('Enter a valid template first.', 'error');
    return false;
  }
  const parsed = readPayloadJson({ format: true });
  if (!parsed.ok) {
    showErrors([parsed.message]);
    setStatus('Testing payload JSON is invalid.', 'error');
    return false;
  }
  payload = parsed.value;
  flowPayloads[flow] = payload;
  const rendered = renderPayload();
  setStatus(rendered ? 'Testing payload validated, transformed, and rendered.' : 'Testing payload failed validation.', rendered ? 'success' : 'error');
  return rendered;
}

function applyGeneratedForm() {
  if (!compiled || !uiForm) {
    setStatus('Enter a valid template and UI form first.', 'error');
    return false;
  }
  collectForm();
  flowPayloads[flow] = payload;
  const rendered = renderPayload();
  setStatus(rendered ? 'Form payload validated, transformed, and rendered.' : 'Form payload failed validation.', rendered ? 'success' : 'error');
  return rendered;
}

function applyAdditionalPayload() {
  if (!compiled || !uiForm) {
    setStatus('Enter a valid template and UI form first.', 'error');
    return false;
  }
  const parsed = readAdditionalPayloadJson({ format: true });
  if (!parsed.ok) {
    showErrors([parsed.message]);
    setStatus('Additional payload JSON is invalid.', 'error');
    return false;
  }
  additionalPayload = parsed.value;
  return applyGeneratedForm();
}

headlessForm.addEventListener('submit', event => {
  event.preventDefault();
  applyHeadlessPayload();
});
generatedForm.addEventListener('submit', event => {
  event.preventDefault();
  applyGeneratedForm();
});
generatedForm.addEventListener('input', applyGeneratedForm);
byId('reset-demo').addEventListener('click', resetExample);
resetPayload.addEventListener('click', resetVariablePayload);
contractViewButtons.forEach(button => button.addEventListener('click', () => {
  const showRaw = button.dataset.contractView === 'raw';
  contractsOutput.hidden = !showRaw;
  contractCards.hidden = showRaw;
  for (const option of contractViewButtons) option.setAttribute('aria-pressed', String(option === button));
}));
flowButtons.forEach(button => button.addEventListener('click', () => setFlow(button.dataset.flow)));
templateEditor.addEventListener('input', () => {
  templateSources[flow] = templateEditor.value;
  expressionTokens = new Map();
  highlightTemplate();
  clearTimeout(templateFeedbackTimer);
  startFormatCountdown(templateFormatProgress);
  templateFeedbackTimer = setTimeout(() => compileTemplate({ format: true }), editorIdleDelay);
});
templateEditor.addEventListener('scroll', () => syncEditorScroll(templateHighlight, templateEditor));
uiFormEditor.addEventListener('input', () => {
  uiFormSource = uiFormEditor.value;
  highlightUiForm();
  clearTimeout(uiFormFeedbackTimer);
  startFormatCountdown(uiFormFormatProgress);
  uiFormFeedbackTimer = setTimeout(() => compileUiForm({ format: true }), editorIdleDelay);
});
uiFormEditor.addEventListener('scroll', () => syncEditorScroll(uiFormHighlight, uiFormEditor));
additionalPayloadEditor.addEventListener('input', () => {
  highlightAdditionalPayload();
  clearTimeout(additionalPayloadFeedbackTimer);
  startFormatCountdown(additionalPayloadFormatProgress);
  additionalPayloadFeedbackTimer = setTimeout(() => {
    stopFormatCountdown(additionalPayloadFormatProgress);
    applyAdditionalPayload();
  }, editorIdleDelay);
});
additionalPayloadEditor.addEventListener('scroll', () => {
  syncEditorScroll(additionalPayloadHighlight, additionalPayloadEditor);
});
templateWrapLines.addEventListener('change', () => {
  const wrapped = templateWrapLines.checked;
  templateEditorShell.classList.toggle('is-wrapped', wrapped);
  templateEditor.setAttribute('wrap', wrapped ? 'soft' : 'off');
  if (wrapped) {
    templateEditor.scrollLeft = 0;
    templateHighlight.scrollLeft = 0;
  }
  highlightTemplate();
});
payloadEditor.addEventListener('input', () => {
  highlightPayload();
  clearTimeout(payloadFeedbackTimer);
  startFormatCountdown(payloadFormatProgress);
  payloadFeedbackTimer = setTimeout(() => {
    stopFormatCountdown(payloadFormatProgress);
    applyHeadlessPayload();
  }, editorIdleDelay);
});
payloadEditor.addEventListener('scroll', () => syncEditorScroll(payloadHighlight, payloadEditor));
payloadPassthrough.addEventListener('change', () => {
  if (flow === 'headless') applyHeadlessPayload();
  else applyGeneratedForm();
});

templateEditorShell.classList.add('is-highlighted');
uiFormEditorShell.classList.add('is-highlighted');
additionalPayloadEditorShell.classList.add('is-highlighted');
payloadEditorShell.classList.add('is-highlighted');
configureFlowCopy(true);
resetExample();
