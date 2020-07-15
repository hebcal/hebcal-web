import {HebrewCalendar, Locale, HDate, flags, months} from '@hebcal/core';
import {getLocationFromQuery} from './common';
import '@hebcal/locales';
import dayjs from 'dayjs';

// eslint-disable-next-line require-jsdoc
export async function shabbatApp(ctx) {
  const p = makeProperties(ctx);
  return ctx.render('shabbat', p);
}

/**
 * Gets start and end days for filtering relevant hebcal events
 * @param {Date} now
 * @return {dayjs.Dayjs[]}
 */
function getStartAndEnd(now) {
  const midnight = dayjs(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const dow = midnight.day();
  const saturday = midnight.add(6 - dow, 'day');
  const fiveDaysAhead = midnight.add(5, 'day');
  const endOfWeek = fiveDaysAhead.isAfter(saturday) ? fiveDaysAhead : saturday;
  return [midnight, endOfWeek];
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 * @return {Object}
 */
function makeProperties(ctx) {
  console.log(ctx.cookies.get('C'));
  const q = ctx.request.query;
  let location;
  try {
    location = getLocationFromQuery(ctx.db, q, q.i === 'on');
  } catch (err) {
    ctx.throw(400, err.message);
  }
  const [midnight, endOfWeek] = getStartAndEnd(new Date());
  const options = {
    start: midnight.toDate(),
    end: endOfWeek.toDate(),
    location: location,
    candlelighting: true,
    havdalahMins: typeof q.m === 'string' ? +q.m : undefined,
    il: location.getIsrael(),
    sedrot: true,
  };
  const events = HebrewCalendar.calendar(options);
  return {
    location,
    q,
    events,
    locale: Locale.getLocaleName(),
    title: Locale.gettext('Shabbat') + ' Times for ' + location.getName(),
    rss_href: '',
  };
}
