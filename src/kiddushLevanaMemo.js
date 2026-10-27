import {Locale, Zmanim, reformatTimeStr} from '@hebcal/core';

const LABELS = [
  ['Earliest Kiddush Levana (3 days)', 'getTchilasZmanKidushLevana3Days', 'ceil'],
  ['Earliest Kiddush Levana (7 days)', 'getTchilasZmanKidushLevana7Days', 'ceil'],
  ['Latest Kiddush Levana (Maharil)', 'getSofZmanKidushLevanaBetweenMoldos', 'floor'],
  ['Latest Kiddush Levana (15 days)', 'getSofZmanKidushLevana15Days', 'floor'],
];

/**
 * @private
 * @param {string} [locale]
 * @return {string}
 */
function intlLocale(locale) {
  if (!locale || locale === 'en' || locale === 'ashkenazi') {
    return 'en-US';
  }
  if (Locale.isHebrewLocale(locale)) {
    return 'he-IL';
  }
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(locale)[0] ?? 'en-US';
  } catch {
    return 'en-US';
  }
}

const ADJUSTED_TO = {
  alot: 'Alot haShachar',
  candleLighting: 'Candle lighting',
};

/**
 * Lists the unadjusted earliest (3 and 7 days after the molad) and latest
 * (Maharil and 15 days after the molad) times for a `KiddushLevanaEvent`,
 * one per line. Earliest times are rounded up to the minute, latest down.
 *
 * Only the iCalendar `DESCRIPTION` uses this, so it is computed there
 * rather than on every `KiddushLevanaEvent` that `@hebcal/core` generates.
 * @param {import('@hebcal/core').KiddushLevanaEvent} ev
 * @param {any} options `locale` and `hour12` affect the formatted times
 * @return {string}
 */
export function makeKiddushLevanaMemo(ev, options) {
  const location = ev.location;
  const molad = ev.molad;
  if (!location || !molad) {
    return '';
  }
  const locale = options.locale;
  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: location.getTzid(),
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timeFormat = location.getTimeFormatter();
  const opts = {...options, location};
  const evTime = ev.eventTime;
  return LABELS.map(([label, method, roundingMode]) => {
    const zdt = molad[method]().round({smallestUnit: 'minute', roundingMode});
    const dt = new Date(zdt.epochMilliseconds);
    const timeStr = reformatTimeStr(Zmanim.formatTime(dt, timeFormat), 'pm', opts);
    let line = `${Locale.gettext(label, locale)}: ${dateFormat.format(dt)}, ${timeStr}`;
    if (ev.adjustedTo && method === 'getSofZmanKidushLevanaBetweenMoldos') {
      const evStr = reformatTimeStr(Zmanim.formatTime(evTime, timeFormat), 'pm', opts);
      const zman = Locale.gettext(ADJUSTED_TO[ev.adjustedTo], locale);
      line += ` (${Locale.gettext('adjusted to', locale)} ${evStr} ${zman})`;
    }
    return line;
  }).join('\n');
}
