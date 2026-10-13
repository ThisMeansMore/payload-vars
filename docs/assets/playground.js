import { PayloadTemplate } from 'https://cdn.jsdelivr.net/npm/payload-vars@2/dist/index.js';
import { highlightJson } from './playground-highlight.js';

const byId = id => document.getElementById(id);
const templateEditorShell = byId('template-editor');
const templateEditor = byId('template-json');
const templateHighlight = byId('template-highlight');
const generatedForm = byId('generated-form');
const generatedFields = byId('generated-fields');
const renderedOutput = byId('rendered-json');
const contractsOutput = byId('variable-contracts');
const status = byId('playground-status');
const exampleTemplate = JSON.parse(byId('example-template').textContent);
const examplePayload = JSON.parse(byId('example-payload').textContent);

let compiled;
let rawTemplate;
let contracts = [];
let payload = {};
let expressionTokens = new Map();

const formatJson = value => JSON.stringify(value, null, 2);
const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function highlightTemplate() {
  templateHighlight.innerHTML = `${highlightJson(templateEditor.value, expressionTokens)}\n`;
  syncTemplateScroll();
}

function syncTemplateScroll() {
  templateHighlight.scrollTop = templateEditor.scrollTop;
  templateHighlight.scrollLeft = templateEditor.scrollLeft;
}

function setStatus(message, state = '') {
  status.textContent = message;
  status.dataset.state = state;
}

function describeError(error) {
  const code = error?.issue?.code;
  return `${code ? `${code}: ` : ''}${error instanceof Error ? error.message : String(error)}`;
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
  const label = document.createElement('span');
  label.className = 'playground__field-label';
  label.textContent = pathLabel(contract.paths[0], contract.name);
  const meta = document.createElement('span');
  meta.className = 'playground__meta';
  meta.textContent = `${contract.type} · ${isRequired(contract) ? 'required' : 'optional'}${contract.interaction ? ` · @ ${contract.interaction}` : ''}`;
  field.append(label, meta);

  const isArray = contract.type.endsWith('[]');
  if (contract.allowedValues?.length && (isArray || contract.interaction === 'choice' || contract.interaction === 'rating.stars')) {
    const options = document.createElement('div');
    options.className = `playground__options${contract.interaction === 'rating.stars' ? ' playground__rating' : ''}`;
    if (!isArray && !isRequired(contract)) options.append(optionControl(contract, undefined, 0, currentValue, 'radio', true));
    contract.allowedValues.forEach((value, index) => options.append(optionControl(
      contract, value, index + 1, currentValue, isArray ? 'checkbox' : 'radio',
    )));
    field.append(options);
    return field;
  }

  let control;
  if (contract.allowedValues?.length) {
    control = document.createElement('select');
    if (!isRequired(contract)) control.append(new Option('No value', ''));
    contract.allowedValues.forEach(value => control.append(new Option(String(value), JSON.stringify(value))));
    control.value = currentValue === undefined ? '' : JSON.stringify(currentValue);
  } else if (contract.interaction === 'text.multiline') {
    control = document.createElement('textarea');
    control.rows = 4;
    control.value = currentValue ?? '';
  } else if (contract.type === 'boolean') {
    control = document.createElement('select');
    if (!isRequired(contract)) control.append(new Option('No value', ''));
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
  control.required = isRequired(contract);
  label.setAttribute('role', 'presentation');
  const accessibleLabel = document.createElement('label');
  accessibleLabel.className = 'visually-hidden';
  accessibleLabel.htmlFor = control.id;
  accessibleLabel.textContent = label.textContent;
  field.append(accessibleLabel, control);
  return field;
}

function buildForm() {
  generatedFields.replaceChildren();
  const groups = new Map();
  for (const contract of contracts.filter(item => !item.derived)) {
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
  const next = Object.create(null);
  for (const contract of contracts.filter(item => !item.derived)) {
    const value = readField(contract);
    if (value !== undefined) next[contract.name] = value;
  }
  payload = next;
}

function renderPayload() {
  try {
    const rendered = compiled.render(payload);
    renderedOutput.textContent = formatJson(rendered);
    renderedOutput.dataset.state = 'success';
    return true;
  } catch (error) {
    renderedOutput.textContent = describeError(error);
    renderedOutput.dataset.state = 'error';
    return false;
  }
}

function compileTemplate() {
  try {
    rawTemplate = JSON.parse(templateEditor.value);
    compiled = new PayloadTemplate(rawTemplate);
    rawTemplate = compiled.toJSON();
    templateEditor.value = formatJson(rawTemplate);
    expressionTokens = new Map(compiled.tokenizePayloadExpression().map(item => [item.expression, item.tokens]));
    highlightTemplate();
    contracts = compiled.variables();
    contractsOutput.textContent = formatJson(contracts);
    buildForm();
    renderPayload();
    setStatus(`${contracts.length} variable contract${contracts.length === 1 ? '' : 's'} ready.`, 'success');
  } catch (error) {
    compiled = undefined;
    contracts = [];
    expressionTokens = new Map();
    highlightTemplate();
    generatedFields.replaceChildren();
    contractsOutput.textContent = '';
    renderedOutput.textContent = describeError(error);
    setStatus(describeError(error), 'error');
  }
}

function resetExample() {
  templateEditor.value = formatJson(exampleTemplate);
  payload = structuredClone(examplePayload);
  compileTemplate();
}

generatedForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!compiled) {
    setStatus('Generate a valid form first.', 'error');
    return;
  }
  collectForm();
  const rendered = renderPayload();
  setStatus(rendered ? 'Form payload validated, transformed, and rendered.' : 'Form payload failed validation.',
    rendered ? 'success' : 'error');
});
byId('compile-template').addEventListener('click', compileTemplate);
byId('reset-example').addEventListener('click', resetExample);
templateEditor.addEventListener('input', () => {
  expressionTokens = new Map();
  highlightTemplate();
});
templateEditor.addEventListener('scroll', syncTemplateScroll);

templateEditorShell.classList.add('is-highlighted');
resetExample();
