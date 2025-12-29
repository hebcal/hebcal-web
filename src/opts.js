import {empty, off} from './empty.js';
import {readJSON} from './readJSON.js';

export const dailyLearningConfig = readJSON('./dailyLearningConfig.json');

export const DEFAULT_CANDLE_MINS = 18;

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

export const hebcalFormDefaults = {
  maj: 'on',
  min: 'on',
  nx: 'on',
  mf: 'on',
  ss: 'on',
  mod: 'on',
  i: 'off',
  yt: 'G',
  lg: 's',
  b: 18,
  M: 'on',
  mm: '0',
};

export const lgToLocale = {
  h: 'he',
  a: 'ashkenazi',
  ah: 'ashkenazi',
  s: 's',
  sh: 's',
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

export const negativeOpts = {
  maj: 'noMajor',
  min: 'noMinorHolidays',
  nx: 'noRoshChodesh',
  mod: 'noModern',
  mf: 'noMinorFast',
  ss: 'noSpecialShabbat',
};

export const booleanOpts = {
  d: 'addAlternateDates',
  D: 'addAlternateDatesForEvents',
  o: 'omer',
  a: 'ashkenazi',
  c: 'candlelighting',
  i: 'il',
  s: 'sedrot',
  euro: 'euro',
  M: 'havdalahTzeit',
  ykk: 'yomKippurKatan',
  molad: 'molad',
  yto: 'yomTovOnly',
  ue: 'useElevation',
  yzkr: 'yizkor',
  mvch: 'shabbatMevarchim',
};

export const numberOpts = {
  m: 'havdalahMins',
  b: 'candleLightingMins',
  ny: 'numYears',
};

export const queryToName = {
  maj: 'Major Holidays',
  min: 'Minor Holidays',
  nx: 'Rosh Chodesh',
  mod: 'Modern Holidays',
  mf: 'Minor Fasts',
  ss: 'Special Shabbatot',
  o: 'Days of the Omer',
  ykk: 'Yom Kippur Katan',
  s: 'Torah Readings', // Weekly Torah portion on Saturdays
  d: 'Hebrew Dates', // Show Hebrew date every day of the year
  D: 'Hebrew Dates', // Show Hebrew date for dates with some event
  yzkr: 'Yizkor',
  mvch: 'Shabbat Mevarchim',
};

export const queryLongDescr = {
  ...queryToName,
  s: 'Parashat ha-Shavua - Weekly Torah Portion',
  o: '7 weeks from the second night of Pesach to the day before Shavuot',
  d: 'Daily Hebrew Dates',
  ykk: 'Minor day of atonement occurring monthly on the day preceding each Rosh Chodesh',
  yzkr: 'Ashkenazi Jewish memorial prayer service for the dead recited in synagogue during four holidays yearly',
  mvch: 'Shabbat before the start of Rosh Chodesh',
};

export const dailyLearningOpts = {};
for (const cfg of dailyLearningConfig) {
  const optName = cfg.dailyLearningOptName;
  if (optName) {
    const k = cfg.queryParam;
    dailyLearningOpts[k] = optName;
    queryToName[k] = cfg.settingsName;
    queryLongDescr[k] = cfg.descMedium;
  }
}

export const geoposLegacy = {
  ladeg: 90,
  lamin: 60,
  lodeg: 180,
  lomin: 60,
};

export const primaryGeoKeys = ['geonameid', 'zip', 'city'];
export const geoKeys = primaryGeoKeys.concat(['latitude', 'longitude', 'elev', 'tzid']);
export const allGeoKeys = geoKeys.concat(Object.keys(geoposLegacy)).concat(['city-typeahead']);

/**
 * @param {string} geo
 * @return {string[]}
 */
export function getGeoKeysToRemove(geo) {
  if (empty(geo)) {
    return [];
  }
  switch (geo) {
    case 'pos': return primaryGeoKeys;
    case 'none': return allGeoKeys.concat(['b', 'm', 'M', 'ue']);
    case 'geoname': return allGeoKeys.filter((k) => k !== 'geonameid');
    default: return allGeoKeys.filter((k) => k !== geo);
  }
}

export const geonameIdCandleOffset = {
  '281184': 40, // Jerusalem
  '294801': 30, // Haifa
  '293067': 30, // Zikhron Yaakov
};

/**
 * @param {any} query
 * @return {number}
 */
export function queryDefaultCandleMins(query) {
  const geonameid = query.geonameid;
  if (geonameid) {
    const offset = geonameIdCandleOffset[geonameid];
    if (typeof offset === 'number') {
      return offset;
    }
  }
  return DEFAULT_CANDLE_MINS;
}

/**
 * @param {Location} location
 * @return {number}
 */
export function locationDefaultCandleMins(location) {
  if (location.getIsrael()) {
    const geoid = location.getGeoId();
    const offset = geonameIdCandleOffset[geoid];
    if (typeof offset === 'number') {
      return offset;
    }
  }
  return DEFAULT_CANDLE_MINS;
}

/**
 * @param {Object.<string,string>} query
 * @param {Object.<string,string>} map
 * @return {string}
 */
function queryDescription(query, map) {
  const strs = [];
  for (const [k, v] of Object.entries(map)) {
    if (!off(query[k])) {
      strs.push(v);
    }
  }
  return strs.join(', ');
}

/**
 * If all default holidays are suppressed try to come up with a better name
 * @param {import('@hebcal/core').CalOptions} options
 * @param {Object.<string,string>} query
 * @return {string}
 */
export function makeCalendarSubtitleFromOpts(options, query) {
  const ilOrDiaspora = options.il ? 'Israel' : 'Diaspora';
  if (options.noHolidays || options.noMajor) {
    const name = queryDescription(query, queryToName);
    if (name) {
      return (options.sedrot || !options.noModern) ?
        `${ilOrDiaspora} - ${name}` : name;
    }
  }
  return ilOrDiaspora;
}

/**
 * @private
 * @param {import('@hebcal/core').CalOptions} options
 * @param {Object.<string,string>} query
 * @return {Object.<string,any>}
 */
export function makeIcalOpts(options, query) {
  const icalOpts = {...options};
  const emoji = query.emoji;
  if (emoji === '1' || emoji === 'on') {
    icalOpts.emoji = true;
  } else if (emoji === '0' || emoji === 'off') {
    icalOpts.emoji = false;
  }
  for (const key of ['title', 'caldesc', 'publishedTTL', 'subscribe', 'relcalid']) {
    const value = query[key];
    if (!empty(value)) {
      icalOpts[key] = value;
    }
  }
  const color = query.color;
  if (typeof color === 'string' && color.length) {
    icalOpts.calendarColor = color.toUpperCase();
  }
  if (!icalOpts.title && !icalOpts.yahrzeit && !icalOpts.location && query.subscribe === '1') {
    icalOpts.title = 'Hebcal ' + makeCalendarSubtitleFromOpts(icalOpts, query);
    if (!icalOpts.caldesc && (icalOpts.noHolidays || icalOpts.noMajor)) {
      icalOpts.caldesc = queryDescription(query, queryLongDescr);
    }
  }
  return icalOpts;
}
