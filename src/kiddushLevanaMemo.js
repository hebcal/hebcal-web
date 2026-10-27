import {HDate, Locale, Zmanim, reformatTimeStr} from '@hebcal/core';

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

/**
 * Names the zman that `ev` was moved to when its time differs from the
 * Maharil's time: alot haShachar, tzeit the night before, or candle lighting
 * before a Shabbat or Yom Tov. Matches on the same minute `@hebcal/core` floors to.
 * @private
 * @param {import('@hebcal/core').KiddushLevanaEvent} ev
 * @param {any} options
 * @return {string}
 */
function adjustedTo(ev, options) {
  const location = ev.location;
  const useElevation = Boolean(options.useElevation);
  const evMin = Math.floor(ev.eventTime.getTime() / 60000);
  const sameMinute = (dt) => Math.floor(dt.getTime() / 60000) === evMin;
  const hd = ev.getDate();
  const zmanim = new Zmanim(location, hd, useElevation);
  if (sameMinute(zmanim.alotHaShachar())) {
    return 'Alot haShachar';
  }
  const prevZmanim = new Zmanim(location, new HDate(hd.abs() - 1), useElevation);
  if (sameMinute(zmanim.tzeit()) || sameMinute(prevZmanim.tzeit())) {
    return 'Tzeit HaKochavim';
  }
  return 'Candle lighting';
}

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
  const maharilMin = Math.floor(
      new Date(molad.getSofZmanKidushLevanaBetweenMoldos().epochMilliseconds).getTime() / 60000);
  const evTime = ev.eventTime;
  const adjusted = evTime && Math.floor(evTime.getTime() / 60000) !== maharilMin;
  return LABELS.map(([label, method, roundingMode]) => {
    const zdt = molad[method]().round({smallestUnit: 'minute', roundingMode});
    const dt = new Date(zdt.epochMilliseconds);
    const timeStr = reformatTimeStr(Zmanim.formatTime(dt, timeFormat), 'pm', opts);
    let line = `${Locale.gettext(label, locale)}: ${dateFormat.format(dt)}, ${timeStr}`;
    if (adjusted && method === 'getSofZmanKidushLevanaBetweenMoldos') {
      const evStr = reformatTimeStr(Zmanim.formatTime(evTime, timeFormat), 'pm', opts);
      const zman = Locale.gettext(adjustedTo(ev, options), locale);
      line += ` (${Locale.gettext('adjusted to', locale)} ${evStr} ${zman})`;
    }
    return line;
  }).join('\n');
}
