import { PayloadTemplate, type PayloadValidator, type PayloadTransformer, type PayloadVarsPlugin } from '../../src/index.js';
const positive: PayloadValidator<number> = value => value > 0;
const upper: PayloadTransformer<string> = value => value.toUpperCase();
const reverse: PayloadTransformer<string[]> = values => values.reverse();
const unique: PayloadValidator<readonly string[]> = values => new Set(values).size === values.length;
const custom: PayloadVarsPlugin = { name: 'test', validators: { positive, unique }, transformers: { upper, reverse } };
new PayloadTemplate('{{x:string > test.upper}}', { plugins: [custom] }).render({ x: 'hello' });
// @ts-expect-error Transformers must preserve their type.
const bad: PayloadTransformer<string> = value => value.length;
// @ts-expect-error Validators must return booleans.
const invalid: PayloadValidator<string> = value => value;
const dates = new PayloadTemplate('{{x:string[ @ dateonly > isodatetime ?? omit ] @ range ?? throw}}', { plugins: [] });
dates.render({ x: ['2026-01-01', null] });
// @ts-expect-error Operations do not change inferred member types.
dates.render({ x: [1] });
// @ts-expect-error Whole throw keeps the variable required.
dates.render({});
new PayloadTemplate('{{x:number @ test.positive || null}}', { plugins: [custom] }).render({ x: false });
new PayloadTemplate('{{x:string @ email > domain ?? omit}}').render({});
// @ts-expect-error Plugins preserve scalar input types.
new PayloadTemplate('{{x:string @ email > domain}}').render({ x: 1 });
// @ts-expect-error String array transformer preserves the array input type.
new PayloadTemplate('{{x:string[] > test.reverse}}', { plugins: [custom] }).render({ x: [1] });
void [bad, invalid];

const members = new PayloadTemplate('{{x:string[ > test.upper ?? omit ] @ test.unique > test.reverse}}', { plugins: [custom] });
members.render({ x: ['hello', null] });
// @ts-expect-error Qualified member operations preserve string inputs.
members.render({ x: [1] });
