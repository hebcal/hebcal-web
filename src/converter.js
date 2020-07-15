import {HDate, greg, HebrewCalendar, Sedra, ParshaEvent, Locale} from '@hebcal/core';
import dayjs from 'dayjs';
import gematriya from 'gematriya';

const heInStr = 'בְּ';
const monthInPrefix = {
  'Tamuz': 'בְּתַמּוּז',
  'Elul': 'בֶּאֱלוּל',
  'Tishrei': 'בְּתִשְׁרֵי',
  'Kislev': 'בְּכִסְלֵו',
  'Sh\'vat': 'בִּשְׁבָט',
  'Adar': 'בַּאֲדָר',
  'Adar I': 'בַּאֲדָר א׳',
  'Adar II': 'בַּאֲדָר ב׳',
};

/**
 * @param {HDate} hdate
 * @return {string}
 */
function gematriyaDate(hdate) {
  const d = hdate.getDate();
  const monthName = hdate.getMonthName();
  const m = monthInPrefix[monthName] || heInStr + Locale.gettext(monthName, 'he');
  const y = hdate.getFullYear();
  return gematriya(d) + ' ' + m + ' ' + gematriya(y, {limit: 3});
}

/**
 * @param {string} val
 * @return {boolean}
 */
function isset(val) {
  return typeof val === 'string';
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function hebrewDateConverter(ctx) {
  const p = makeProperties(ctx);
  if (p.message) {
    ctx.status = 400;
  }
  const q = ctx.request.query;
  if (q.cfg === 'json') {
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.type = 'json';
    if (p.message) {
      ctx.body = {error: p.message};
    } else {
      if (!p.noCache) {
        ctx.set('Cache-Control', 'max-age=63072000');
      }
      let result = {
        gy: p.gy,
        gm: p.gm,
        gd: p.gd,
        afterSunset: Boolean(p.gs),
        hy: p.hy,
        hm: p.hmStr,
        hd: p.hd,
        hebrew: p.hebrew,
      };
      if (p.events.length) {
        result.events = p.events.map((ev) => ev.render());
      }
      const cb = q.callback;
      if (typeof cb === 'string' && cb.length) {
        result = cb + '(' + JSON.stringify(result) + ')\n';
      }
      ctx.body = result;
    }
  } else if (q.cfg === 'xml') {
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.type = 'text/xml';
    if (p.message) {
      ctx.body = `<?xml version="1.0" ?>\n<error message="${p.message}" />\n`;
    } else {
      p.writeResp = false;
      ctx.body = await ctx.render('converter-xml', p);
    }
  } else {
    return ctx.render('converter', p);
  }
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 * @return {Object}
 */
function makeProperties(ctx) {
  let props;
  try {
    props = parseConverterQuery(ctx);
  } catch (err) {
    const tmpDt = new Date();
    props = {
      type: 'g2h',
      dt: tmpDt,
      hdate: new HDate(tmpDt),
      gs: false,
      message: err.message,
      noCache: true,
    };
  }
  const dt = props.dt;
  const d = dayjs(dt);
  const dateStr = d.format('ddd, D MMMM ') + String(dt.getFullYear()).padStart(4, '0');
  const afterSunset = props.gs ? ' (after sunset)' : '';
  const hdate = props.hdate;
  const hdateStr = hdate.render();
  const hy = hdate.getFullYear();
  let pe = [];
  if (hy >= 3762) {
    const sedra = new Sedra(hy, false);
    const parsha = sedra.get(hdate);
    pe = new ParshaEvent(hdate, parsha);
  }
  const holidays = HebrewCalendar.getHolidaysOnDate(hdate) || [];
  const events = holidays.filter((ev) => ev.observedInDiaspora()).concat(pe);
  return {
    message: props.message,
    noCache: Boolean(props.noCache),
    events,
    title: `Hebrew Date Converter - ${hdateStr} | Hebcal Jewish Calendar`,
    first: (props.type === 'g2h') ? dateStr + afterSunset : hdateStr,
    second: (props.type === 'g2h') ? hdateStr : dateStr + afterSunset,
    hebrew: gematriyaDate(hdate),
    gs: props.gs,
    gy: dt.getFullYear(),
    gm: dt.getMonth() + 1,
    gd: dt.getDate(),
    hy,
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
function parseConverterQuery(ctx) {
  const query = ctx.request.query;
  if (isset(query.h2g) && isset(query.hy) && isset(query.hm) && isset(query.hd)) {
    const hy = +query.hy;
    const hd = +query.hd;
    if (isNaN(hd)) {
      throw new Error('Hebrew day must be numeric');
    } else if (isNaN(hy)) {
      throw new Error('Hebrew year must be numeric');
    } else if (hy < 3761) {
      throw new RangeError('Hebrew year must be in the common era (3761 and above)');
    }
    const hm = HDate.monthFromName(query.hm);
    const maxDay = HDate.daysInMonth(hm, hy);
    if (hd < 1 || hd > maxDay) {
      const monthName = HDate.getMonthName(hm, hy);
      throw new RangeError(`Hebrew day out of valid range 1-${maxDay} for ${monthName} ${hy}`);
    }
    const hdate = new HDate(hd, hm, hy);
    if (hdate.abs() < 1) {
      throw new RangeError('Hebrew date must be in the common era');
    }
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
      return {type: 'g2h', dt, hdate, gs: false, noCache: true};
    }
  }
}
