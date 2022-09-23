import {ParshaEvent} from '@hebcal/core';
import {getLeyningOnDate} from '@hebcal/leyning';
import {getTriennialForParshaHaShavua} from '@hebcal/triennial';
import {isoDateStringToDate, empty} from './common';
import createError from 'http-errors';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import {HDate} from '@hebcal/core';

dayjs.extend(isSameOrBefore);

const MAX_DAYS = 180;

/**
 * @private
 * @param {any} ctx
 */
export async function getLeyning(ctx) {
  if (ctx.method === 'POST') {
    ctx.set('Allow', 'GET');
    ctx.throw(405, 'POST not allowed; try using GET instead');
  }
  ctx.response.type = ctx.request.header['accept'] = 'application/json';
  const q = ctx.request.query;
  if (q.cfg !== 'json') {
    throw createError(400, 'Parameter cfg=json is required');
  }
  for (const param of ['start', 'end']) {
    if (empty(q[param])) {
      throw createError(400, `Parameter '${param}' is required`);
    }
  }

  const il = q.i === 'on';
  const startD = dayjs(isoDateStringToDate(q.start));
  let endD = dayjs(isoDateStringToDate(q.end));
  if (endD.isBefore(startD, 'd')) {
    endD = startD;
  } else if (endD.diff(startD, 'd') > MAX_DAYS) {
    endD = startD.add(MAX_DAYS, 'd');
  }

  const startHd = new HDate(startD.toDate());
  const doTriennial = !il && q.triennial !== 'off' && startHd.getFullYear() >= 5745;
  const items = [];
  for (let d = startD; d.isSameOrBefore(endD, 'd'); d = d.add(1, 'd')) {
    const hd = new HDate(d.toDate());
    const reading = getLeyningOnDate(hd, il);
    if (reading) {
      const item = {
        date: d.format('YYYY-MM-DD'),
        hdate: hd.toString(),
      };
      Object.assign(item, reading);
      delete item.parsha;
      delete item.haftaraNumV;
      if (doTriennial && reading.parsha && hd.getDay() === 6) {
        const ev = new ParshaEvent(hd, reading.parsha, il);
        const triReading = getTriennialForParshaHaShavua(ev);
        item.triennial = triReading.aliyot;
        item.triYear = triReading.yearNum + 1;
        item.triHaftara = triReading.haftara;
        item.triHaft = triReading.haft;
      }
      items.push(item);
    }
  }

  const result = {
    date: new Date().toISOString(),
    location: il ? 'Israel' : 'Diaspora',
    range: {
      start: startD.format('YYYY-MM-DD'),
      end: endD.format('YYYY-MM-DD'),
    },
    items,
  };

  // ctx.set('Cache-Control', 'max-age=2592000');
  ctx.lastModified = new Date();
  ctx.body = result;
}
