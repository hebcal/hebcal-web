import {Locale} from '@hebcal/core/dist/esm/locale';
import poHe from './he.po.js';
import poEs from './es.po.js';
import poPt from './pt.po.js';

Locale.addTranslations('es', poEs);
Locale.addTranslations('pt', poPt);

Locale.addTranslations('he', poHe);
Locale.addTranslations('h', poHe);

const poHeNoNikud = Locale.copyLocaleNoNikud(poHe);
Locale.addTranslations('he-x-NoNikud', poHeNoNikud);
