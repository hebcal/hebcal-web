import { flags } from '@hebcal/core';
import { localizedHolidayDescription, makeTorahMemoText } from './torahMemo.js';

/**
 * Returns the memo to use for an event: Torah reading for a Parsha
 * ha-Shavua, otherwise `ev.memo` or the holiday description.
 * @param {Event} ev
 * @param {boolean} il
 * @param {string} [locale] language for the holiday description
 * @return {string}
 */
export function makeEventMemo(ev, il, locale) {
  if (ev.getFlags() & flags.PARSHA_HASHAVUA) {
    try {
      const memo = makeTorahMemoText(ev, il);
      if (memo) {
        return memo;
      }
    } catch {
      // fallthru
    }
  }
  if (ev.memo) {
    return ev.memo;
  }
  return localizedHolidayDescription(ev, locale);
}
