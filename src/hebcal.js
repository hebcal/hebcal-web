import {hebcal} from '@hebcal/core';
import {eventsToIcalendar, eventsToCsv} from '@hebcal/icalendar';
import Database from 'better-sqlite3';

const negativeOpts = {
  'maj': 'noHolidays',
  'mod': 'noModern',
  'mf': 'noMinorFast',
  'ss': 'noSpecialShabbat',
};

const booleanOpts = {
  'd': 'addHebrewDates',
  'D': 'addHebrewDatesForEvents',
  'o': 'omer',
  'a': 'ashkenazi',
//  'c': 'candlelighting',
  'i': 'il',
  's': 'sedrot',
  'F': 'dafyomi',
  'euro': 'euro',
};

const numberOpts = {
  'year': 'year',
  'm': 'havdalahMins',
  'b': 'candleLightingMins',
  'ny': 'numYears',
};

const zipsFilename = 'zips.sqlite3';
const zipsDb = new Database(zipsFilename, {fileMustExist: true});

const geonamesFilename = 'geonames.sqlite3';
const geonamesDb = new Database(geonamesFilename, {fileMustExist: true});

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function hebcalDownload(ctx) {
  if (ctx.request.query.v !== '1') {
    return;
  }
  const options = {};
  for (const [key, val] of Object.entries(booleanOpts)) {
    if (typeof ctx.request.query[key] == 'string' &&
      (ctx.request.query[key] == 'on' || ctx.request.query[key] == '1')) {
      options[val] = true;
    }
  }
  for (const [key, val] of Object.entries(negativeOpts)) {
    if (typeof ctx.request.query[key] == 'undefined' ||
        ctx.request.query[key] == 'off' || ctx.request.query[key] == '0') {
      options[val] = false;
    }
  }
  for (const [key, val] of Object.entries(numberOpts)) {
    if (typeof ctx.request.query[key] == 'string' && ctx.request.query[key].length) {
      options[val] = +ctx.request.query[key];
    }
  }
  if (ctx.request.query.yt) {
    options.isHebrewDate = Boolean(ctx.request.query.yt == 'H');
  }
  if (ctx.request.query.month) {
    const month = +ctx.request.query.month;
    if (month >= 1 && month <= 12) {
      options.month = month;
    }
  }
  if (ctx.request.query.lg) {
    options.locale = ctx.request.query.lg;
  }
  const events = hebcal.hebrewCalendar(options);
  if (ctx.request.path.endsWith('.ics')) {
    const ical = eventsToIcalendar(events, options);
    ctx.response.type = 'text/calendar; charset=utf-8';
    ctx.body = ical;
  } else if (ctx.request.path.endsWith('.csv')) {
    const ical = eventsToCsv(events, options);
    ctx.response.type = 'text/x-csv; charset=utf-8';
    ctx.body = ical;
  }
}
