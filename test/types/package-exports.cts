import api = require('payload-vars');
const template = new api.PayloadTemplate({ name: '{{name:string}}' });
const payload: api.JsonValue = template.render({ name: 'Ada' });
void payload;
const allowed: api.AllowedValue = 'black';
void allowed;
const renderOptions: api.PayloadRenderOptions = { passthrough: true };
template.render({ name: 'Ada', unused: 1 }, renderOptions);
// @ts-expect-error A string variable cannot receive a number.
template.render({ name: 42 });
