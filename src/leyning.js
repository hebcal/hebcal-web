import {ParshaEvent} from '@hebcal/core';
import {getLeyningOnDate} from '@hebcal/leyning';
import {getTriennialForParshaHaShavua} from '@hebcal/triennial';
import {isoDateStringToDate} from './dateUtil.js';
import {makeETag} from './etag.js';
import {CACHE_CONTROL_7DAYS} from './cacheControl.js';
import {empty} from './empty.js';
import createError from 'http-errors';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.js';
import {HDate} from '@hebcal/core';

dayjs.extend(isSameOrBefore);

const MAX_DAYS = 180;

/**
 * @private
 * @param {any} ctx
 */
export async function getLeyning(ctx) {
  ctx.response.type = ctx.request.header['accept'] = 'application/json';
  const q = ctx.request.query;
  if (q.cfg !== 'json') {
    throw createError(400, 'Parameter cfg=json is required');
  }
  if (!empty(q.date) && empty(q.start) && empty(q.end)) {
    q.start = q.end = q.date;
  }
  for (const param of ['start', 'end']) {
    if (empty(q[param])) {
      throw createError(400, `Parameter '${param}' is required`);
    }
  }
  ctx.response.etag = makeETag(ctx, q, {});
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
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
  const doTriennial = q.triennial !== 'off' && startHd.getFullYear() >= 5745;
  const items = [];
  for (let d = startD; d.isSameOrBefore(endD, 'd'); d = d.add(1, 'd')) {
    const hd = new HDate(d.toDate());
    const readings = getLeyningOnDate(hd, il, true);
    for (const reading of readings) {
      const item = makeReadingItem(d, hd, reading);
      if (doTriennial && reading.parsha && hd.getDay() === 6) {
        const ev = new ParshaEvent({hdate: hd, parsha: reading.parsha, il});
        const triReading = getTriennialForParshaHaShavua(ev, il);
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

  ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
  ctx.body = result;
}

/**
 * @private
 * @param {dayjs.Dayjs} d
 * @param {HDate} hd
 * @param {Leyning} reading
 * @return {any}
 */
function makeReadingItem(d, hd, reading) {
  const item = {
    date: d.format('YYYY-MM-DD'),
    hdate: hd.toString(),
    ...reading,
  };
  delete item.parsha;
  delete item.haftaraNumV;
  return item;
}
