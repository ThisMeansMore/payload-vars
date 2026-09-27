import type { PayloadVarsPlugin } from '../plugins.js';
import { textPlugin } from './text.js';
import { numberPlugin } from './number.js';
import { booleanPlugin } from './boolean.js';
import { datePlugin } from './date.js';
import { collectionPlugin } from './collection.js';
import { arrayPlugin } from './array.js';
import { emailPlugin } from './email.js';
import { urlPlugin } from './url.js';
import { jsonPlugin } from './json.js';
import { encodingPlugin } from './encoding.js';
import { isoPlugin } from './iso.js';
import { timePlugin } from './time.js';
import { phonePlugin } from './phone.js';
import { networkPlugin } from './network.js';
import { idPlugin } from './id.js';
import { corePlugin } from './core.js';

export const builtInPlugins: readonly PayloadVarsPlugin[] = [
  textPlugin,
  numberPlugin,
  booleanPlugin,
  datePlugin,
  collectionPlugin,
  arrayPlugin,
  emailPlugin,
  urlPlugin,
  jsonPlugin,
  encodingPlugin,
  isoPlugin,
  timePlugin,
  phonePlugin,
  networkPlugin,
  idPlugin,
  corePlugin,
];
