import {Locale} from '@hebcal/core/dist/esm/locale';
import poHe from './he.po.js';
import poPt from './pt.po.js';

Locale.addTranslations('pt', poPt);

Locale.addTranslations('he', poHe);
Locale.addTranslations('h', poHe);

const heStrs = poHe.contexts[''];
const heNoNikud = {};
for (const [key, val] of Object.entries(heStrs)) {
  heNoNikud[key] = [Locale.hebrewStripNikkud(val[0])];
}
const poHeNoNikud = {
  headers: poHe.headers,
  contexts: {'': heNoNikud},
};
Locale.addTranslations('he-x-NoNikud', poHeNoNikud);
