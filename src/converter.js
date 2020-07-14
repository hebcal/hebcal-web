import {HDate, greg} from '@hebcal/core';

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
    return {
      gy: dt.getFullYear(),
      gm: dt.getMonth() + 1,
      gd: dt.getDate(),
      gs: false,
      hy,
      hm,
      hd,
      hleap: hdate.isLeapYear(),
    };
  } else {
    const gs = query.gs == 'on' || query.gs == '1';
    if (typeof query.gx === 'string' && query.gx.length === 10) {
      const gx = query.gx;
      const dt = new Date(gx);
      let hdate = new HDate(dt);
      if (gs) {
        hdate = hdate.next();
      }
      return {
        gx,
        gy: dt.getFullYear(),
        gm: dt.getMonth() + 1,
        gd: dt.getDate(),
        gs,
        hy: hdate.getFullYear(),
        hm: hdate.getMonth(),
        hd: hdate.getDate(),
        hleap: hdate.isLeapYear(),
      };
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
      let hdate = new HDate(new Date(gy, gm - 1, gd));
      if (gs) {
        hdate = hdate.next();
      }
      return {
        gy,
        gm,
        gd,
        gs,
        hy: hdate.getFullYear(),
        hm: hdate.getMonth(),
        hd: hdate.getDate(),
        hleap: hdate.isLeapYear(),
      };
    } else {
      let dt;
      if (!empty(query.t) && query.t.month.charCodeAt(0) >= 48 && query.t.charCodeAt(0) <= 57) {
        dt = new Date(+query.t * 1000);
      } else {
        dt = new Date();
      }
      const hdate = new HDate(dt);
      return {
        gy: dt.getFullYear(),
        gm: dt.getMonth() + 1,
        gd: dt.getDate(),
        gs: false,
        hy: hdate.getFullYear(),
        hm: hdate.getMonth(),
        hd: hdate.getDate(),
        hleap: hdate.isLeapYear(),
      };
    }
  }
}
