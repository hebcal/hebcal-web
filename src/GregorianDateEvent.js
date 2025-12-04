import {Event, flags} from '@hebcal/core';

/** Daily Gregorian date event for Hebrew months mode */
export class GregorianDateEvent extends Event {
  /**
   * @param {import('@hebcal/hdate').HDate} hdate - Hebrew date
   */
  constructor(hdate) {
    const gdate = hdate.greg();
    const desc = formatGregorianDate(gdate);
    super(hdate, desc, flags.HEBREW_DATE); // Use same flag as HebrewDateEvent
  }

  /**
   * @param {string} [locale] - Optional locale name (defaults to empty locale)
   */
  render(locale) {
    return this.getDesc();
  }

  /**
   * @param {string} [locale] - Optional locale name (defaults to empty locale)
   */
  renderBrief(locale) {
    return this.getDesc();
  }
}

/**
 * Format a Gregorian date as "Jan 15" or "15 Jan" depending on locale
 * @param {Date} gdate - Gregorian date
 * @return {string}
 */
function formatGregorianDate(gdate) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = gdate.getDate();
  const month = months[gdate.getMonth()];
  return `${month} ${day}`;
}
