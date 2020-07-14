import {HDate, greg, HebrewCalendar, Sedra, ParshaEvent} from '@hebcal/core';
import dayjs from 'dayjs';

/**
 * @param {string} val
 * @return {boolean}
 */
function empty(val) {
  return typeof val === 'undefined' || !val.length;
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 * @return {Object}
 */
export function hebrewDateConverterProperties(ctx) {
  const props = parseConverterQuery(ctx);
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
  if (!empty(query.h2g) && !empty(query.hy) && !empty(query.hm) && !empty(query.hd)) {
    const hy = +query.hy;
    const hd = +query.hd;
    const hm = HDate.monthFromName(query.hm);
    if (!hd) {
      ctx.throw(400, 'Hebrew day must be numeric');
    } else if (!hy) {
      ctx.throw(400, 'Hebrew year must be numeric');
    } else if (hy <= 3760) {
      ctx.throw(400, 'Hebrew year must be in the common era (3761 and above)');
    } else if (hd > 30 || hd < 1) {
      ctx.throw(400, 'Hebrew day out of valid range 1-30');
    } else if (hd > HDate.daysInMonth(hm, hy)) {
      ctx.throw(400, `Hebrew day out of valid range 1-29 for ${hm}`);
    }
    const hdate = new HDate(hd, hm, hy);
    const dt = hdate.greg();
    return {type: 'h2g', dt, hdate, gs: false};
  } else {
    const gs = query.gs == 'on' || query.gs == '1';
    if (typeof query.gx === 'string' && query.gx.length === 10) {
      const gx = query.gx;
      const dt = new Date(gx);
      let hdate = new HDate(dt);
      if (gs) {
        hdate = hdate.next();
      }
      return {type: 'g2h', dt, hdate, gs, gx};
    } else if (!empty(query.gy) && !empty(query.gm) && !empty(query.gd)) {
      const gy = +query.gy;
      const gd = +query.gd;
      const gm = +query.gm;
      if (!gd) {
        ctx.throw(400, 'Gregorian day must be numeric');
      } else if (!gm) {
        ctx.throw(400, 'Gregorian month must be numeric');
      } else if (!gy) {
        ctx.throw(400, 'Gregorian year must be numeric');
      } else if (gd > 31 || gd < 1) {
        ctx.throw(400, 'Gregorian day out of valid range 1-31');
      } else if (gm > 12 || gm < 1) {
        ctx.throw(400, 'Gregorian month out of valid range 1-12');
      } else if (gy > 9999 || gy < 1) {
        ctx.throw(400, 'Gregorian year out of valid range 0001-9999');
      } else if (gd > greg.daysInMonth(gm, gy)) {
        ctx.throw(400, `Gregorian day ${gd} out of valid range for ${gm}/${gy}`);
      }
      const dt = new Date(gy, gm - 1, gd);
      let hdate = new HDate(dt);
      if (gs) {
        hdate = hdate.next();
      }
      return {type: 'g2h', dt, hdate, gs};
    } else {
      let dt;
      if (!empty(query.t) && query.t.month.charCodeAt(0) >= 48 && query.t.charCodeAt(0) <= 57) {
        dt = new Date(+query.t * 1000);
      } else {
        dt = new Date();
      }
      const hdate = new HDate(dt);
      return {type: 'g2h', dt, hdate, gs: false};
    }
  }
}
