import {ParshaEvent, HDate, getHolidaysOnDate} from '@hebcal/core';
import {getLeyningOnDate, getLeyningForHoliday} from '@hebcal/leyning';
import {getTriennialForParshaHaShavua} from '@hebcal/triennial';
import {isoDateStringToDate} from './dateUtil.js';
import {checkFreshETag} from './etag.js';
import {CACHE_CONTROL_7DAYS} from './cacheControl.js';
import {empty} from './empty.js';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.js';

dayjs.extend(isSameOrBefore);

const MAX_DAYS = 180;

/**
 * @private
 * @param {import('koa').Context} ctx
 */
export async function getLeyning(ctx) {
  ctx.response.type = ctx.request.header['accept'] = 'application/json';
  const q = ctx.request.query;
  if (q.cfg !== 'json') {
    ctx.throw(400, 'Parameter cfg=json is required');
  }
  if (!empty(q.date) && empty(q.start) && empty(q.end)) {
    q.start = q.end = q.date;
  }
  for (const param of ['start', 'end']) {
    if (empty(q[param])) {
      ctx.throw(400, `Parameter '${param}' is required`);
    }
  }
  ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
  if (checkFreshETag(ctx, q, {})) {
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
  const byEvent = q.events === 'on';
  const items = [];
  for (let d = startD; d.isSameOrBefore(endD, 'd'); d = d.add(1, 'd')) {
    const hd = new HDate(d.toDate());
    const readings = getLeyningOnDate(hd, il, true);
    const dayItems = [];
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
      dayItems.push(item);
    }
    if (byEvent) {
      addHolidayEvents(dayItems, d, hd, il);
    }
    items.push(...dayItems);
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

  ctx.body = result;
}

/**
 * Labels each holiday reading with the `desc` of every holiday event that
 * produces it, and appends the holiday readings that `getLeyningOnDate()`
 * leaves out on a Shabbat that also has a parsha (Rosh Chodesh and the
 * special Shabbatot, whose maftir and Haftarah are folded into the parsha
 * reading instead).
 *
 * Enabled by `&events=on`. Callers that render one reading per calendar event
 * — the way `eventToClassicApiObject()` in `@hebcal/rest-api` does, by calling
 * `getLeyningForHoliday()` for each event — need both: a reading for
 * "Shabbat Shekalim" itself, and a way to tell which event each reading
 * belongs to. Readings with no matching event (weekday, Mincha, Erev Simchat
 * Torah) simply come back without a `desc`.
 * @private
 * @param {any[]} dayItems readings already found for this date; appended to
 * @param {dayjs.Dayjs} d
 * @param {HDate} hd
 * @param {boolean} il
 */
function addHolidayEvents(dayItems, d, hd, il) {
  const byName = new Map(dayItems.map((item) => [item.name.en, item]));
  for (const ev of getHolidaysOnDate(hd, il) || []) {
    const reading = getLeyningForHoliday(ev, il);
    if (!reading) {
      continue;
    }
    let item = byName.get(reading.name.en);
    if (!item) {
      item = makeReadingItem(d, hd, reading);
      byName.set(reading.name.en, item);
      dayItems.push(item);
    }
    item.desc ??= [];
    item.desc.push(ev.getDesc());
  }
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
