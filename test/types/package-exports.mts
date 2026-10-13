import { PayloadTemplate, type AllowedValue, type JsonValue } from 'payload-vars';
const template = new PayloadTemplate({ name: '{{name:string}}' });
const payload: JsonValue = template.render({ name: 'Ada' });
void payload;
const allowed: AllowedValue = 'black';
void allowed;
// @ts-expect-error A string variable cannot receive a number.
template.render({ name: 42 });
