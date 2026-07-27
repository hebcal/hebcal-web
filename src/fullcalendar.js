import {Zmanim, flags, holidayDesc as hdesc} from '@hebcal/core';
import {isoDateString} from '@hebcal/hdate';
import {
  LEARNING_MASK,
  getEventCategories,
  shouldRenderBrief,
  appendIsraelAndTracking,
} from '@hebcal/rest-api';
import {makeMemo} from './torahMemo.js';

/**
 * Converts a Hebcal event to a FullCalendar.io object
 * @param {Event} ev
 * @param {string} tzid
 * @param {import('@hebcal/core').CalOptions} options
 * @return {any}
 */
export function eventToFullCalendar(ev, tzid, options) {
  const classes = getEventCategories(ev).slice();
  const mask = ev.getFlags();
  const isChag = Boolean(mask & flags.CHAG);
  if (isChag && classes[0] === 'holiday') {
    classes.push('yomtov');
  }
  if (mask & LEARNING_MASK) {
    classes.push('learning');
  }
  const eventTime = ev.eventTime;
  const timed = Boolean(eventTime);
  const title = shouldRenderBrief(ev) ?
    ev.renderBrief(options.locale) :
    ev.render(options.locale);
  const start = timed ?
    Zmanim.formatISOWithTimeZone(tzid, eventTime) :
    isoDateString(ev.greg());
  const result = {
    title,
    start,
    allDay: !timed,
    className: classes.join(' '),
  };
  const hebrew = ev.renderBrief('he-x-NoNikud');
  if (hebrew) {
    result.hebrew = hebrew;
  }
  const url = ev.url();
  const il = Boolean(options.il);
  if (url) {
    const u = new URL(url);
    const utmSource = u.host === 'www.hebcal.com' ? 'js' : undefined;
    result.url = appendIsraelAndTracking(url, il, utmSource, 'fc');
  }
  const desc = ev.getDesc();
  const candles = desc === hdesc.HAVDALAH || desc === hdesc.CANDLE_LIGHTING;
  if (!candles) {
    const memo = makeMemo(ev, il);
    if (memo) {
      result.description = memo;
    } else if (ev.linkedEvent !== undefined) {
      result.description = ev.linkedEvent.render(options.locale);
    }
  }
  return result;
}
