import {Locale} from '@hebcal/core/dist/esm/locale';
import poHe from './he.po.js';
import poEs from './es.po.js';
import poFr from './fr.po.js';
import poNl from './nl.po.js';
import poPt from './pt.po.js';
import poAshkenazi from './ashkenazi.po.js';

Locale.addTranslations('es', poEs);
Locale.addTranslations('fr', poFr);
Locale.addTranslations('nl', poNl);
Locale.addTranslations('pt', poPt);
Locale.addTranslations('ashkenazi', poAshkenazi);

Locale.addTranslations('he', poHe);

const poHeNoNikud = Locale.copyLocaleNoNikud(poHe);
Locale.addTranslations('he-x-NoNikud', poHeNoNikud);
