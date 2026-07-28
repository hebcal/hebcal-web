import {flags} from '@hebcal/core';
import {getLeyningForParshaHaShavua, getLeyningForHoliday} from '@hebcal/leyning';
import {LEARNING_MASK, getHolidayDescription} from '@hebcal/rest-api';
import QuickLRU from 'quick-lru';
import {formatHaftarahTheme} from './haftarahTheme.js';

/**
 * Bitmask of event types that never have a Torah reading of their own
 */
const HOLIDAY_IGNORE_MASK =
  flags.OMER_COUNT |
  flags.SHABBAT_MEVARCHIM |
  flags.MOLAD |
  flags.USER_EVENT |
  flags.HEBREW_DATE |
  LEARNING_MASK;

// Looking up a reading is the expensive part of building a memo, and a
// multi-year feed asks for the same date/desc repeatedly.
const cache = new QuickLRU({maxSize: 5000});

/**
 * Makes multi-line text that summarizes Torah & Haftarah
 * for Shabbat (ParshaEvent) or holiday (HolidayEvent)
 * @param {Event} ev
 * @param {boolean} il
 * @return {string}
 */
export function makeTorahMemoText(ev, il) {
  const mask = ev.getFlags();
  if (mask & HOLIDAY_IGNORE_MASK || ev.eventTime !== undefined) {
    return '';
  }
  const hd = ev.getDate();
  const key = [
    hd.getFullYear(), hd.getMonth(), hd.getDate(),
    il ? '1' : '0', ev.getDesc(),
  ].join('-');
  const cached = cache.get(key);
  if (typeof cached === 'string') {
    return cached;
  }
  const reading = mask & flags.PARSHA_HASHAVUA ?
    getLeyningForParshaHaShavua(ev, il) :
    getLeyningForHoliday(ev, il);
  let memo = '';
  if (reading && (reading.summary || reading.haftara)) {
    if (reading.summary) {
      memo += `Torah: ${reading.summary}`;
    }
    if (reading.summary && reading.haftara) {
      memo += '\n';
    }
    if (reading.haftara) {
      memo += 'Haftarah: ' + reading.haftara;
      if (reading.reason?.haftara) {
        memo += ' | ' + reading.reason.haftara;
      }
      // one of the Haftarot of Admonition or Consolation around Tish'a B'Av
      const haftThemeStr = formatHaftarahTheme(reading);
      if (haftThemeStr) {
        memo += ' | ' + haftThemeStr;
      }
    }
  }
  if (reading?.sephardic) {
    memo += '\nHaftarah for Sephardim: ' + reading.sephardic;
  }
  cache.set(key, memo);
  return memo;
}

/**
 * Returns the holiday description in `locale`. `@hebcal/rest-api` carries
 * Hebrew translations for every holiday it describes in English, but falls
 * back to English rather than nothing if one is ever missing.
 * @param {Event} ev
 * @param {string} [locale]
 * @return {string}
 */
export function localizedHolidayDescription(ev, locale) {
  return getHolidayDescription(ev, false, locale) ||
    getHolidayDescription(ev, false, 'en');
}
