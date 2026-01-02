export const langNames = {
  's': ['Sephardic transliterations', null],
  'a': ['Ashkenazic transliterations', null],
  'h': ['עִברִית', 'Hebrew'],
  'he-x-NoNikud': ['עברית', 'Hebrew (no nikud)'],
  'fi': ['Suomalainen', 'Finnish'],
  'fr': ['français', 'French'],
  'de': ['Deutsch', 'German'],
  'hu': ['Magyar nyelv', 'Hungarian'],
  'pl': ['język polski', 'Polish'],
  'pt': ['Português', 'Portuguese'],
  'ro': ['Română', 'Romanian'],
  'ashkenazi_romanian': ['Română (Ashk.)', 'Romanian (Ashk.)'],
  'ru': ['ру́сский язы́к', 'Russian'],
  'es': ['español', 'Spanish'],
  'uk': ['Українська', 'Ukrainian'],
};

export const langTzDefaults = {
  AR: ['es', 'America/Argentina/Buenos_Aires'],
  AT: ['de', 'Europe/Vienna'],
  AU: ['s', 'Australia/Sydney'],
  BE: ['fr', 'Europe/Brussels'],
  BM: ['es', 'Atlantic/Bermuda'],
  BR: ['pt', 'America/Sao_Paulo'],
  CA: ['s', 'America/Toronto'],
  CH: ['de', 'Europe/Zurich'],
  CO: ['es', 'America/Bogota'],
  CN: ['s', 'Asia/Shanghai'],
  DE: ['de', 'Europe/Berlin'],
  ES: ['es', 'Europe/Madrid'],
  FI: ['fi', 'Europe/Helsinki'],
  FR: ['fr', 'Europe/Paris'],
  GB: ['s', 'Europe/London'],
  HU: ['hu', 'Europe/Budapest'],
  IL: ['h', 'Asia/Jerusalem'],
  IT: ['s', 'Europe/Rome'],
  IN: ['s', 'Asia/Kolkata'],
  MX: ['es', 'America/Mexico_City'],
  NL: ['s', 'Europe/Amsterdam'],
  NZ: ['s', 'Pacific/Auckland'],
  PA: ['es', 'America/Panama'],
  PH: ['s', 'Asia/Manila'],
  PL: ['pl', 'Europe/Warsaw'],
  PT: ['pt', 'Europe/Lisbon'],
  RO: ['ro', 'Europe/Bucharest'],
  RU: ['ru', 'Europe/Moscow'],
  US: ['s', 'America/New_York'],
  UA: ['uk', 'Europe/Kiev'],
  VE: ['es', 'America/Caracas'],
  ZA: ['s', 'Africa/Johannesburg'],
};

export const localeMap = {
  'de': 'de',
  'es': 'es',
  'fi': 'fi',
  'fr': 'fr',
  'he': 'he',
  'he-x-NoNikud': 'he',
  'he-x-nonikud': 'he',
  'hu': 'hu',
  'h': 'he',
  'pl': 'pl',
  'pt': 'pt',
  'ru': 'ru',
  'ro': 'ro',
  'ashkenazi_romanian': 'ro',
  'uk': 'uk',
};

export const lgToLocale = {
  h: 'he',
  a: 'ashkenazi',
  ah: 'ashkenazi',
  s: 's',
  sh: 's',
};

const langISOs = ['en', 'he'].concat(Object.keys(langNames).filter((x) => x.length === 2));

/**
 * @param {*} ctx
 * @param {Object.<string,string>} query
 * @param {string} cc
 * @return {string}
 */
export function pickLanguage(ctx, query, cc) {
  if (query.lg) {
    return query.lg;
  }
  const ccDefaults = langTzDefaults[cc];
  if (ccDefaults) {
    return ccDefaults[0];
  }
  const acceptsLangs = ctx.acceptsLanguages(langISOs);
  if (Array.isArray(acceptsLangs)) {
    return acceptsLangs[0] === 'en' ? 's' : acceptsLangs[0];
  } else if (typeof acceptsLangs === 'string') {
    return acceptsLangs === 'en' ? 's' : acceptsLangs;
  }
  return 's';
}
