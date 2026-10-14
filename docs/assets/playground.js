import { PayloadTemplate } from './payload-vars/index.js';
import { generatePayload, uiContracts } from './playground-contracts.js';
import { highlightJson } from './playground-highlight.js';
import { formatJson, parseJson } from './playground-json.js';

const byId = id => document.getElementById(id);
const templateEditorShell = byId('template-editor');
const templateEditor = byId('template-json');
const templateHighlight = byId('template-highlight');
const templateError = byId('template-error');
const templateFormatProgress = byId('template-format-progress');
const templateWrapLines = byId('template-wrap-lines');
const payloadEditorShell = byId('payload-editor');
const payloadEditor = byId('payload-json');
const payloadHighlight = byId('payload-highlight');
const payloadError = byId('payload-error');
const payloadFormatProgress = byId('payload-format-progress');
const payloadPassthrough = byId('payload-passthrough');
const headlessForm = byId('headless-form');
const generatedForm = byId('generated-form');
const generatedFields = byId('generated-fields');
const renderedOutput = byId('rendered-json');
const renderErrors = byId('render-errors');
const renderCall = byId('render-call');
const contractsOutput = byId('variable-contracts');
const contractCards = byId('contract-cards');
const contractsCount = byId('contracts-count');
const contractViewButtons = [...document.querySelectorAll('[data-contract-view]')];
const inputHeading = byId('input-heading');
const inputBadge = byId('input-badge');
const inputNote = byId('input-note');
const flowDescription = byId('flow-description');
const status = byId('playground-status');
const resetPayload = byId('reset-payload');
const flowButtons = [...document.querySelectorAll('[data-flow]')];
const exampleTemplates = {
  headless: JSON.parse(byId('example-headless-template').textContent),
  ui: JSON.parse(byId('example-ui-template').textContent),
};
const examplePayloads = {
  headless: JSON.parse(byId('example-headless-payload').textContent),
  ui: {},
};
const templateSources = Object.fromEntries(Object.entries(exampleTemplates)
  .map(([name, template]) => [name, formatJson(template)]));
const flowPayloads = { headless: {}, ui: {} };
const editorIdleDelay = 3000;

let flow = 'headless';
let compiled;
let rawTemplate;
let contracts = [];
let payload = {};
let expressionTokens = new Map();
let templateFeedbackTimer;
let payloadFeedbackTimer;

const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function highlightTemplate() {
  templateHighlight.innerHTML = `${highlightJson(templateEditor.value, expressionTokens)}\n`;
  syncTemplateScroll();
}

function syncTemplateScroll() {
  templateHighlight.scrollTop = templateEditor.scrollTop;
  templateHighlight.scrollLeft = templateEditor.scrollLeft;
}

function highlightPayload() {
  payloadHighlight.innerHTML = `${highlightJson(payloadEditor.value)}\n`;
  syncPayloadScroll();
}

function syncPayloadScroll() {
  payloadHighlight.scrollTop = payloadEditor.scrollTop;
  payloadHighlight.scrollLeft = payloadEditor.scrollLeft;
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

function setStatus(message, state = '') {
  status.textContent = message;
  status.dataset.state = state;
}

function setEditorError(editor, messageElement, message = '') {
  messageElement.textContent = message;
  editor.setAttribute('aria-invalid', String(Boolean(message)));
  editor.classList.toggle('has-error', Boolean(message));
}

function readTemplateJson({ format = false } = {}) {
  const result = parseJson(templateEditor.value);
  if (!result.ok) {
    const message = `Invalid JSON: ${result.message}`;
    setEditorError(templateEditor, templateError, message);
    templateEditorShell.dataset.state = 'error';
    return { ...result, message };
  }
  if (format) {
    templateEditor.value = formatJson(result.value);
    highlightTemplate();
  }
  setEditorError(templateEditor, templateError);
  delete templateEditorShell.dataset.state;
  return result;
}

function readPayloadJson({ format = false } = {}) {
  const result = parseJson(payloadEditor.value);
  if (!result.ok) {
    const message = `Invalid JSON: ${result.message}`;
    setEditorError(payloadEditor, payloadError, message);
    payloadEditorShell.dataset.state = 'error';
    return { ...result, message };
  }
  if (result.value === null || Array.isArray(result.value) || typeof result.value !== 'object') {
    const message = 'Payload JSON must be an object.';
    setEditorError(payloadEditor, payloadError, message);
    payloadEditorShell.dataset.state = 'error';
    return { ok: false, message };
  }
  if (format) writePayload(result.value);
  setEditorError(payloadEditor, payloadError);
  delete payloadEditorShell.dataset.state;
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
  if (contract.memberFallback) {
    descriptions.push(`items: ${contract.memberFallback.operator} ${contract.memberFallback.action}`);
  }
  if (contract.valueFallback) {
    const scope = contract.type.endsWith('[]') ? 'array' : 'value';
    descriptions.push(`${scope}: ${contract.valueFallback.operator} ${contract.valueFallback.action}`);
  }
  return descriptions.join('; ') || 'None';
}

function createContractCard(contract) {
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
    contractFact('Path', contract.paths.length === 1 ? contract.paths[0]
      : `${contract.paths[0]} +${contract.paths.length - 1} more`),
  );
  card.title = contract.paths.join('\n');
  card.append(heading, facts);
  return card;
}

function renderContracts(items) {
  contractsCount.textContent = `· ${items.length}`;
  contractsOutput.textContent = formatJson(items);
  contractCards.replaceChildren(...items.map(createContractCard));
}

function pathLabel(path, fallback) {
  const quoted = path.match(/\[("(?:\\.|[^"\\])*")\]$/);
  if (quoted) return JSON.parse(quoted[1]);
  return path.match(/\.([A-Za-z_$][\w$]*)$/)?.[1] ?? fallback;
}

function sectionTitle(path) {
  const index = Number(path.match(/^\$\.sections\[(\d+)\]/)?.[1]);
  return Number.isInteger(index) && typeof rawTemplate?.sections?.[index]?.title === 'string'
    ? rawTemplate.sections[index].title : 'Variables';
}

function isRequired(contract) {
  return !contract.valueFallback || contract.valueFallback.action === 'throw';
}

function inputId(name, index) {
  return `field-${name.replace(/[^A-Za-z0-9_-]/g, '-')}-${index}`;
}

function optionControl(contract, value, index, currentValue, mode, optionalEmpty = false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'playground__option';
  const input = document.createElement('input');
  const id = inputId(contract.name, index);
  input.id = id;
  input.type = mode;
  input.name = `field-${contract.name}`;
  input.dataset.variable = contract.name;
  input.dataset.value = optionalEmpty ? '' : JSON.stringify(value);
  input.checked = optionalEmpty ? currentValue === undefined
    : mode === 'checkbox' ? Array.isArray(currentValue) && currentValue.some(item => sameValue(item, value))
      : sameValue(currentValue, value);
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = optionalEmpty ? 'No value' : contract.interaction === 'rating.stars'
    ? `${'★'.repeat(Number(value))} (${value})` : String(value);
  wrapper.append(input, label);
  return wrapper;
}

function createField(contract, currentValue) {
  const field = document.createElement('div');
  field.className = 'playground__field';
  field.dataset.contract = contract.name;
  const labelText = pathLabel(contract.paths[0], contract.name);
  const required = isRequired(contract);
  const label = document.createElement('span');
  label.className = 'playground__field-label';
  label.id = `label-${inputId(contract.name, 0)}`;
  label.textContent = labelText;
  if (required) {
    const marker = document.createElement('span');
    marker.className = 'playground__required';
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = '*';
    label.append(marker);
  }
  const meta = document.createElement('span');
  meta.className = 'playground__meta';
  meta.textContent = `${contract.type} · ${required ? 'required' : 'optional'} · @ ${contract.interaction}`;
  field.append(label, meta);

  const isArray = contract.type.endsWith('[]');
  if (contract.allowedValues?.length && (isArray || contract.interaction === 'choice' || contract.interaction === 'rating.stars')) {
    const options = document.createElement('div');
    options.className = `playground__options${contract.interaction === 'rating.stars' ? ' playground__rating' : ''}`;
    options.setAttribute('role', isArray ? 'group' : 'radiogroup');
    options.setAttribute('aria-labelledby', label.id);
    if (!isArray && !required) options.append(optionControl(contract, undefined, 0, currentValue, 'radio', true));
    contract.allowedValues.forEach((value, index) => options.append(optionControl(
      contract, value, index + 1, currentValue, isArray ? 'checkbox' : 'radio',
    )));
    field.append(options);
    return field;
  }

  let control;
  if (contract.allowedValues?.length) {
    control = document.createElement('select');
    if (!required) control.append(new Option('No value', ''));
    contract.allowedValues.forEach(value => control.append(new Option(String(value), JSON.stringify(value))));
    control.value = currentValue === undefined ? '' : JSON.stringify(currentValue);
  } else if (contract.interaction === 'text.multiline') {
    control = document.createElement('textarea');
    control.rows = 4;
    control.value = currentValue ?? '';
  } else if (contract.type === 'boolean') {
    control = document.createElement('select');
    if (!required) control.append(new Option('No value', ''));
    control.append(new Option('True', 'true'), new Option('False', 'false'));
    control.value = currentValue === undefined ? '' : String(currentValue);
  } else {
    control = document.createElement('input');
    control.type = contract.interaction === 'date.picker' ? 'date' : contract.type === 'number' ? 'number' : 'text';
    control.value = isArray && Array.isArray(currentValue) ? currentValue.join(', ') : currentValue ?? '';
    if (contract.type === 'number') control.step = 'any';
  }
  control.id = inputId(contract.name, 0);
  control.dataset.variable = contract.name;
  control.required = required;
  label.setAttribute('role', 'presentation');
  const accessibleLabel = document.createElement('label');
  accessibleLabel.className = 'visually-hidden';
  accessibleLabel.htmlFor = control.id;
  accessibleLabel.textContent = `${labelText}${required ? ' (required)' : ''}`;
  field.append(accessibleLabel, control);
  return field;
}

function buildForm() {
  generatedFields.replaceChildren();
  const visibleContracts = uiContracts(contracts);
  if (!visibleContracts.length) {
    const empty = document.createElement('p');
    empty.className = 'playground__empty';
    empty.textContent = 'No UI controls. Add an @ interaction to a template variable.';
    generatedFields.append(empty);
    return;
  }
  const groups = new Map();
  for (const contract of visibleContracts) {
    const title = sectionTitle(contract.paths[0]);
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(contract);
  }
  for (const [title, fields] of groups) {
    const section = document.createElement('fieldset');
    section.className = 'playground__section';
    const legend = document.createElement('legend');
    legend.textContent = title;
    section.append(legend, ...fields.map(contract => createField(contract, payload[contract.name])));
    generatedFields.append(section);
  }
}

function readField(contract) {
  const controls = [...generatedForm.querySelectorAll(`[data-variable="${contract.name}"]`)];
  const isArray = contract.type.endsWith('[]');
  if (controls[0]?.type === 'checkbox') {
    return controls.filter(control => control.checked).map(control => JSON.parse(control.dataset.value));
  }
  if (controls[0]?.type === 'radio') {
    const selected = controls.find(control => control.checked);
    return selected?.dataset.value ? JSON.parse(selected.dataset.value) : undefined;
  }
  const value = controls[0]?.value ?? '';
  if (value === '') return undefined;
  if (contract.allowedValues || contract.type === 'boolean') return JSON.parse(value);
  if (contract.type === 'number') return Number(value);
  if (isArray) {
    const values = value.split(',').map(item => item.trim()).filter(Boolean);
    return contract.type === 'number[]' ? values.map(Number) : values;
  }
  return value;
}

function collectForm() {
  const next = { ...payload };
  for (const contract of uiContracts(contracts)) {
    const value = readField(contract);
    if (value === undefined) delete next[contract.name];
    else next[contract.name] = value;
  }
  payload = next;
  writePayload(payload);
}

function renderPayload() {
  const token = (text, className) => {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  };
  renderCall.replaceChildren(
    token('template', 'playground__call-instance'),
    token('.render', 'playground__call-method'),
    '( ', token('payload', 'playground__call-payload'),
    ', { ', token('passthrough', 'playground__call-options'), ': ',
    token(String(payloadPassthrough.checked), `playground__call-boolean is-${payloadPassthrough.checked}`), ' } )',
  );
  try {
    showRendered(compiled.render(payload, { passthrough: payloadPassthrough.checked }));
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
  buildForm();
}

function clearCompiled(message) {
  compiled = undefined;
  contracts = [];
  expressionTokens = new Map();
  generatedFields.replaceChildren();
  renderContracts([]);
  showErrors([message]);
  setStatus(message, 'error');
}

function compileTemplate({ format = true } = {}) {
  clearTimeout(templateFeedbackTimer);
  stopFormatCountdown(templateFormatProgress);
  if (compiled && flow === 'headless') {
    const currentPayload = readPayloadJson();
    if (currentPayload.ok) payload = currentPayload.value;
  } else if (compiled) collectForm();
  const parsed = readTemplateJson({ format });
  if (!parsed.ok) {
    clearCompiled(parsed.message);
    return;
  }
  try {
    rawTemplate = parsed.value;
    compiled = new PayloadTemplate(rawTemplate);
    rawTemplate = compiled.toJSON();
    const tokenized = compiled.tokenizePayloadExpression();
    if (format) {
      templateEditor.value = formatJson(rawTemplate);
      expressionTokens = new Map(tokenized.map(item => [item.expression, item.tokens]));
    } else {
      expressionTokens = new Map();
    }
    templateSources[flow] = templateEditor.value;
    highlightTemplate();
    contracts = compiled.variables();
    renderContracts(contracts);
    payload = generatePayload(contracts, payload);
    flowPayloads[flow] = payload;
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

function setFlow(nextFlow) {
  if (nextFlow === flow) return;
  clearTimeout(templateFeedbackTimer);
  stopFormatCountdown(templateFormatProgress);
  templateSources[flow] = templateEditor.value;
  if (flow === 'headless') {
    clearTimeout(payloadFeedbackTimer);
    stopFormatCountdown(payloadFormatProgress);
    const parsed = readPayloadJson();
    if (parsed.ok) payload = parsed.value;
  } else if (compiled) collectForm();
  flowPayloads[flow] = payload;
  flow = nextFlow;
  const isHeadless = flow === 'headless';
  for (const button of flowButtons) button.setAttribute('aria-pressed', String(button.dataset.flow === flow));
  headlessForm.hidden = !isHeadless;
  generatedForm.hidden = isHeadless;
  resetPayload.hidden = !isHeadless;
  inputHeading.textContent = 'Payload';
  inputBadge.textContent = isHeadless ? 'JSON input' : 'Consumer UI';
  inputNote.innerHTML = isHeadless
    ? 'Testing values are preserved as the template changes, while newly declared variables are appended automatically. Changes render automatically.'
    : 'Testing controls for contracts carrying an <code>@ interaction</code>. Changes render automatically.';
  flowDescription.textContent = isHeadless
    ? 'Test validation and transformation by editing a generated payload directly.'
    : 'Test the template through consumer-owned controls generated from interaction metadata.';
  payload = flowPayloads[flow];
  compiled = undefined;
  rawTemplate = undefined;
  contracts = [];
  expressionTokens = new Map();
  templateEditor.value = templateSources[flow];
  highlightTemplate();
  compileTemplate();
}

function resetExample() {
  templateSources[flow] = formatJson(exampleTemplates[flow]);
  templateEditor.value = templateSources[flow];
  payload = { ...examplePayloads[flow] };
  flowPayloads[flow] = payload;
  compiled = undefined;
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
  setStatus(rendered ? 'Testing payload reset.' : 'Reset testing payload failed validation.',
    rendered ? 'success' : 'error');
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
  setStatus(rendered ? 'Testing payload validated, transformed, and rendered.' : 'Testing payload failed validation.',
    rendered ? 'success' : 'error');
  return rendered;
}

function applyGeneratedForm() {
  if (!compiled) {
    setStatus('Enter a valid template first.', 'error');
    return false;
  }
  collectForm();
  flowPayloads[flow] = payload;
  const rendered = renderPayload();
  setStatus(rendered ? 'Testing form payload validated, transformed, and rendered.' : 'Testing form payload failed validation.',
    rendered ? 'success' : 'error');
  return rendered;
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
  for (const option of contractViewButtons) {
    option.setAttribute('aria-pressed', String(option === button));
  }
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
templateEditor.addEventListener('scroll', syncTemplateScroll);
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
payloadEditor.addEventListener('scroll', syncPayloadScroll);
payloadPassthrough.addEventListener('change', () => {
  if (flow === 'headless') applyHeadlessPayload();
  else applyGeneratedForm();
});

templateEditorShell.classList.add('is-highlighted');
payloadEditorShell.classList.add('is-highlighted');
resetExample();
