export const langNames = {
  's': ['Sephardic transliterations', null],
  'a': ['Ashkenazic transliterations', null],
  'h': ['עִברִית', 'Hebrew'],
  'he-x-NoNikud': ['עברית', 'Hebrew (no nikud)'],
  'fi': ['Suomalainen', 'Finnish'],
  'fr': ['français', 'French'],
  'de': ['Deutsch', 'German'],
  'hu': ['Magyar nyelv', 'Hungarian'],
  'nl': ['Nederlands', 'Dutch'],
  'pl': ['język polski', 'Polish'],
  'pt': ['Português', 'Portuguese'],
  'ro': ['Română', 'Romanian'],
  'ashkenazi_romanian': ['Română (Ashk.)', 'Romanian (Ashk.)'],
  'ru': ['ру́сский язы́к', 'Russian'],
  'es': ['español', 'Spanish'],
  'uk': ['Українська', 'Ukrainian'],
};

export const langTzDefaults = {
  AD: ['es', 'Europe/Andorra'],
  AE: ['s', 'Asia/Dubai'],
  AL: ['s', 'Europe/Tirane'],
  AO: ['pt', 'Africa/Luanda'],
  AR: ['es', 'America/Argentina/Buenos_Aires'],
  AS: ['s', 'Pacific/Pago_Pago'],
  AT: ['de', 'Europe/Vienna'],
  AU: ['s', 'Australia/Sydney'],
  BA: ['s', 'Europe/Sarajevo'],
  BB: ['s', 'America/Barbados'],
  BE: ['fr', 'Europe/Brussels'],
  BG: ['s', 'Europe/Sofia'],
  BM: ['s', 'Atlantic/Bermuda'],
  BO: ['es', 'America/La_Paz'],
  BR: ['pt', 'America/Sao_Paulo'],
  BS: ['s', 'America/Nassau'],
  BY: ['ru', 'Europe/Minsk'],
  BZ: ['s', 'America/Belize'],
  CA: ['s', 'America/Toronto'],
  CH: ['de', 'Europe/Zurich'],
  CL: ['es', 'America/Santiago'],
  CN: ['s', 'Asia/Shanghai'],
  CO: ['es', 'America/Bogota'],
  CR: ['es', 'America/Costa_Rica'],
  CU: ['es', 'America/Havana'],
  CY: ['s', 'Asia/Nicosia'],
  CZ: ['s', 'Europe/Prague'],
  DE: ['de', 'Europe/Berlin'],
  DK: ['s', 'Europe/Copenhagen'],
  DO: ['es', 'America/Santo_Domingo'],
  DZ: ['fr', 'Africa/Algiers'],
  EC: ['es', 'America/Guayaquil'],
  EE: ['s', 'Europe/Tallinn'],
  ES: ['es', 'Europe/Madrid'],
  FI: ['fi', 'Europe/Helsinki'],
  FO: ['s', 'Atlantic/Faroe'],
  FR: ['fr', 'Europe/Paris'],
  GB: ['s', 'Europe/London'],
  GF: ['fr', 'America/Cayenne'],
  GH: ['s', 'Africa/Accra'],
  GI: ['s', 'Europe/Gibraltar'],
  GR: ['s', 'Europe/Athens'],
  GT: ['es', 'America/Guatemala'],
  GY: ['s', 'America/Guyana'],
  HK: ['s', 'Asia/Hong_Kong'],
  HN: ['es', 'America/Tegucigalpa'],
  HR: ['s', 'Europe/Zagreb'],
  HU: ['hu', 'Europe/Budapest'],
  IE: ['s', 'Europe/Dublin'],
  IL: ['h', 'Asia/Jerusalem'],
  IN: ['s', 'Asia/Kolkata'],
  IS: ['s', 'Atlantic/Reykjavik'],
  IT: ['s', 'Europe/Rome'],
  JM: ['s', 'America/Jamaica'],
  KE: ['s', 'Africa/Nairobi'],
  LB: ['fr', 'Asia/Beirut'],
  LI: ['de', 'Europe/Vaduz'],
  LT: ['s', 'Europe/Vilnius'],
  LU: ['fr', 'Europe/Luxembourg'],
  LV: ['s', 'Europe/Riga'],
  MA: ['fr', 'Africa/Casablanca'],
  MC: ['fr', 'Europe/Monaco'],
  MD: ['ro', 'Europe/Chisinau'],
  ME: ['s', 'Europe/Podgorica'],
  MK: ['s', 'Europe/Skopje'],
  MT: ['s', 'Europe/Malta'],
  MX: ['es', 'America/Mexico_City'],
  NG: ['s', 'Africa/Lagos'],
  NI: ['es', 'America/Managua'],
  NL: ['nl', 'Europe/Amsterdam'],
  NO: ['s', 'Europe/Oslo'],
  NZ: ['s', 'Pacific/Auckland'],
  PA: ['es', 'America/Panama'],
  PE: ['es', 'America/Lima'],
  PF: ['fr', 'Pacific/Tahiti'],
  PG: ['s', 'Pacific/Port_Moresby'],
  PH: ['s', 'Asia/Manila'],
  PL: ['pl', 'Europe/Warsaw'],
  PM: ['fr', 'America/Miquelon'],
  PR: ['es', 'America/Puerto_Rico'],
  PT: ['pt', 'Europe/Lisbon'],
  PY: ['es', 'America/Asuncion'],
  RO: ['ro', 'Europe/Bucharest'],
  RS: ['s', 'Europe/Belgrade'],
  RU: ['ru', 'Europe/Moscow'],
  SE: ['s', 'Europe/Stockholm'],
  SG: ['s', 'Asia/Singapore'],
  SI: ['s', 'Europe/Ljubljana'],
  SK: ['s', 'Europe/Bratislava'],
  SV: ['es', 'America/El_Salvador'],
  TR: ['s', 'Europe/Istanbul'],
  TT: ['s', 'America/Port_of_Spain'],
  UA: ['uk', 'Europe/Kiev'],
  UG: ['s', 'Africa/Kampala'],
  US: ['s', 'America/New_York'],
  UY: ['es', 'America/Montevideo'],
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
  'nl': 'nl',
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
