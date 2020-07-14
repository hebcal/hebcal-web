import {HDate, greg, HebrewCalendar, Sedra, ParshaEvent} from '@hebcal/core';
import dayjs from 'dayjs';
import pino from 'pino';

const logger = pino();

/**
 * @param {string} val
 * @return {boolean}
 */
function isset(val) {
  return typeof val === 'string';
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 * @return {Object}
 */
export function hebrewDateConverterProperties(ctx) {
  let props;
  try {
    props = parseConverterQuery(ctx);
  } catch (err) {
    logger.warn(err);
    const tmpDt = new Date();
    props = {
      type: 'g2h',
      dt: tmpDt,
      hdate: new HDate(tmpDt),
      gs: false,
      message: err.message,
    };
  }
  const dt = props.dt;
  const d = dayjs(dt);
  const dateStr = d.format('ddd, D MMMM YYYY');
  const afterSunset = props.gs ? ' (after sunset)' : '';
  const hdate = props.hdate;
  const hdateStr = hdate.render();
  const sedra = new Sedra(hdate.getFullYear(), false);
  const parsha = sedra.get(hdate);
  const pe = new ParshaEvent(hdate, parsha);
  const holidays = HebrewCalendar.getHolidaysOnDate(hdate) || [];
  const events = holidays.filter((ev) => ev.observedInDiaspora()).concat(pe);
  return {
    message: props.message,
    events,
    title: `Hebrew Date Converter - ${hdateStr} | Hebcal Jewish Calendar`,
    first: (props.type === 'g2h') ? dateStr + afterSunset : hdateStr,
    second: (props.type === 'g2h') ? hdateStr : dateStr + afterSunset,
    hebrew: hdate.renderGematriya(),
    gs: props.gs,
    gy: dt.getFullYear(),
    gm: dt.getMonth() + 1,
    gd: dt.getDate(),
    hy: hdate.getFullYear(),
    hm: hdate.getMonth(),
    hmStr: hdate.getMonthName(),
    hd: hdate.getDate(),
    hleap: hdate.isLeapYear(),
  };
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 * @return {Object}
 */
export function parseConverterQuery(ctx) {
  const query = ctx.request.query;
  if (isset(query.h2g) && isset(query.hy) && isset(query.hm) && isset(query.hd)) {
    const hy = +query.hy;
    const hd = +query.hd;
    if (isNaN(hd)) {
      throw new Error('Hebrew day must be numeric');
    } else if (isNaN(hy)) {
      throw new Error('Hebrew year must be numeric');
    } else if (hy <= 3761) {
      throw new RangeError('Hebrew year must be in the common era (3762 and above)');
    }
    const hm = HDate.monthFromName(query.hm);
    const maxDay = HDate.daysInMonth(hm, hy);
    if (hd < 1 || hd > maxDay) {
      const monthName = HDate.getMonthName(hm, hy);
      throw new RangeError(`Hebrew day out of valid range 1-${maxDay} for ${monthName} ${hy}`);
    }
    const hdate = new HDate(hd, hm, hy);
    const dt = hdate.greg();
    return {type: 'h2g', dt, hdate, gs: false};
  } else {
    const gs = query.gs === 'on' || query.gs === '1';
    if (typeof query.gx === 'string' && query.gx.length === 10) {
      const gx = query.gx;
      const dt = new Date(gx);
      let hdate = new HDate(dt);
      if (gs) {
        hdate = hdate.next();
      }
      return {type: 'g2h', dt, hdate, gs, gx};
    } else if (isset(query.gy) && isset(query.gm) && isset(query.gd)) {
      const gy = +query.gy;
      const gd = +query.gd;
      const gm = +query.gm;
      if (isNaN(gd)) {
        throw new Error('Gregorian day must be numeric');
      } else if (isNaN(gm)) {
        throw new Error('Gregorian month must be numeric');
      } else if (isNaN(gy)) {
        throw new Error('Gregorian year must be numeric');
      } else if (gm > 12 || gm < 1) {
        throw new Error('Gregorian month out of valid range 1-12');
      } else if (gy > 9999 || gy < 1) {
        throw new Error('Gregorian year out of valid range 0001-9999');
      }
      const maxDay = greg.daysInMonth(gm, gy);
      if (gd < 1 || gd > maxDay) {
        throw new Error(`Gregorian day ${gd} out of valid range for ${gm}/${gy}`);
      }
      const dt = new Date(gy, gm - 1, gd);
      if (gy < 100) {
        dt.setFullYear(gy);
      }
      let hdate = new HDate(dt);
      if (gs) {
        hdate = hdate.next();
      }
      return {type: 'g2h', dt, hdate, gs};
    } else {
      let dt;
      if (isset(query.t) && query.t.length && query.t.charCodeAt(0) >= 48 && query.t.charCodeAt(0) <= 57) {
        dt = new Date(+query.t * 1000);
      } else {
        dt = new Date();
      }
      const hdate = new HDate(dt);
      return {type: 'g2h', dt, hdate, gs: false};
    }
  }
}
