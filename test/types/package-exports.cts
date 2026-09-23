import api = require('payload-vars');
const template = new api.PayloadTemplate({ name: '{{name:string}}' });
const payload: api.JsonValue = template.render({ name: 'Ada' });
void payload;
// @ts-expect-error A string variable cannot receive a number.
template.render({ name: 42 });
