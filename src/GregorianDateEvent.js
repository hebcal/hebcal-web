import {Event, flags} from '@hebcal/core';
import {localeMap} from './common.js';
import dayjs from 'dayjs';
import './dayjs-locales.js';

/** Daily Gregorian date event for Hebrew months mode */
export class GregorianDateEvent extends Event {
  /**
   * @param {import('@hebcal/hdate').HDate} hdate - Hebrew date
   */
  constructor(hdate) {
    const gdate = hdate.greg();
    const d = dayjs(gdate);
    const desc = d.format('YYYY-MM-DD');
    super(hdate, desc, flags.USER_EVENT);
    this.d = d;
  }

  /**
   * @param {string} [locale] - Optional locale name (defaults to empty locale)
   */
  render(locale) {
    locale = localeMap[locale] || 'en';
    const d = this.d.locale(locale);
    const template = locale === 'en' ? 'MMM D' : 'D MMM';
    return d.format(template);
  }
  getCategories() {
    return ['gregdate'];
  }
}
