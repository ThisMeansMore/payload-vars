import { PayloadTemplate, type AllowedValue, type JsonValue, type PayloadRenderOptions } from 'payload-vars';
const template = new PayloadTemplate({ name: '{{name:string}}' });
const payload: JsonValue = template.render({ name: 'Ada' });
void payload;
const allowed: AllowedValue = 'black';
void allowed;
const renderOptions: PayloadRenderOptions = { passthrough: true };
template.render({ name: 'Ada', unused: 1 }, renderOptions);
// @ts-expect-error A string variable cannot receive a number.
template.render({ name: 42 });
