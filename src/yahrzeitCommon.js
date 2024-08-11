import {empty} from './empty.js';
import {makeGregDate} from './dateUtil.js';
import {pad4, pad2} from '@hebcal/hdate';
import dayjs from 'dayjs';

const MIN_YEARS = 2;
const MAX_YEARS = 50;
export const DEFAULT_YEARS = 20;

/**
 * @param {string|number} str
 * @return {number}
 */
export function getNumYears(str) {
  const y = parseInt(str, 10);
  if (isNaN(y)) {
    return DEFAULT_YEARS;
  } else if (y < MIN_YEARS) {
    return MIN_YEARS;
  } else if (y > MAX_YEARS) {
    return MAX_YEARS;
  } else {
    return y;
  }
}

const noSaveFields = ['ulid', 'v', 'ref_url', 'ref_text', 'lastModified'];

function compactJsonItem(obj, num) {
  const yk = 'y' + num;
  const mk = 'm' + num;
  const dk = 'd' + num;
  const yy = obj[yk];
  const mm = obj[mk];
  const dd = obj[dk];
  if (!empty(dd) && !empty(mm) && !empty(yy)) {
    const yy4 = yy.length === 4 ? yy : pad4(+yy);
    const mm2 = mm.length === 2 ? mm : pad2(+mm);
    const dd2 = dd.length === 2 ? dd : pad2(+dd);
    obj['x' + num] = yy4 + '-' + mm2 + '-' + dd2;
    delete obj[yk];
    delete obj[mk];
    delete obj[dk];
  }
  const typeKey = 't' + num;
  const anniversaryType = obj[typeKey];
  if (anniversaryType) {
    obj[typeKey] = anniversaryType[0].toLowerCase();
  }
  const sunsetKey = 's' + num;
  const sunset = obj[sunsetKey];
  if (typeof sunset !== 'undefined') {
    obj[sunsetKey] = (sunset === 'on' || sunset == 1) ? 1 : 0;
  }
}

export function compactJsonToSave(obj) {
  const maxId = getMaxYahrzeitId(obj);
  for (let i = 1; i <= maxId; i++) {
    compactJsonItem(obj, i);
  }
  if (typeof obj.years === 'string') {
    obj.years = getNumYears(obj.years);
  }
  noSaveFields.forEach((key) => delete obj[key]);
  if (empty(obj.em)) {
    delete obj.em;
  }
}

/**
 * @param {*} ctx
 * @param {string} id
 * @return {Promise<Object>}
 */
export async function getYahrzeitDetailsFromDb(ctx, id) {
  const db = ctx.mysql;
  const sql = 'SELECT contents, updated, downloaded FROM yahrzeit WHERE id = ?';
  const results = await db.query2(ctx, {sql, values: [id], timeout: 5000});
  const row = results?.[0];
  if (!row) {
    ctx.remove('Cache-Control');
    ctx.throw(404, `Yahrzeit/Anniversary id not found: ${id}`);
  }
  const obj = row.contents;
  if (!row.downloaded) {
    const sqlUpdate = 'UPDATE yahrzeit SET downloaded = 1, updated = NOW() WHERE id = ?';
    await db.execute2(ctx, {sql: sqlUpdate, values: [id], timeout: 5000});
  }
  const sql2 = 'REPLACE INTO yahrzeit_atime (id, ts) VALUES (?, NOW())';
  try {
    await db.execute2(ctx, {sql: sql2, values: [id], timeout: 1000});
  } catch (err) {
    ctx.logger.warn(err);
  }
  // convert from 'x' fields back into ymd fields
  const maxId = getMaxYahrzeitId(obj);
  for (let i = 1; i <= maxId; i++) {
    const date = obj['x' + i];
    if (typeof date === 'string' && date.length === 10) {
      const {yy, mm, dd} = getDateForId(obj, i);
      obj['y' + i] = yy;
      obj['m' + i] = mm;
      obj['d' + i] = dd;
      delete obj['x' + i];
    }
    obj['t' + i] = getAnniversaryType(obj['t' + i]);
    const sunset = obj['s' + i];
    if (typeof sunset === 'number') {
      obj['s' + i] = sunset ? 'on' : 'off';
    }
  }
  obj.lastModified = row.updated;
  obj.v = 'yahrzeit';
  ctx.state.ulid = id;
  return obj;
}

/**
 * @param {string} k
 * @return {boolean}
 */
export function isNumKey(k) {
  const code = k.charCodeAt(1);
  return code >= 48 && code <= 57;
}

/**
 * @param {Object<string,any>} query
 * @param {boolean} [long]
 * @return {string}
 */
export function summarizeAnniversaryTypes(query, long=false) {
  const typesSet = getAnniversaryTypes(query);
  const types = Array.from(typesSet);
  const anniversaryType = types.length === 0 ? YAHRZEIT :
    types.length === 1 ? types[0] : ANNIVERSARY;
  if (long) {
    switch (anniversaryType) {
      case ANNIVERSARY:
        return types.length === 1 ? 'Hebrew Anniversary' : 'Hebrew Anniversaries';
      case BIRTHDAY:
        return types.length === 1 ? 'Hebrew Birthday' : 'Hebrew Birthdays';
      default: break;
    }
  }
  return anniversaryType;
}

/**
 * @param {Object<string,any>} query
 * @return {Set<string>}
 */
export function getAnniversaryTypes(query) {
  const types0 = Object.entries(query)
      .filter(([k, val]) => k[0] == 't' && isNumKey(k))
      .map((x) => getAnniversaryType(x[1]))
      .map((x) => x === OTHER ? ANNIVERSARY : x);
  return new Set(types0);
}

/**
 * @param {Object<string,any>} query
 * @return {number[]}
 */
export function getYahrzeitIds(query) {
  const set = new Set();
  const numKeys = Object.keys(query).filter(isNumKey);
  for (const key of numKeys) {
    const id = +(key.substring(1));
    if (key[0] === 'x' && !empty(query[key])) {
      set.add(id);
    } else if (!empty(query['y' + id]) && !empty(query['m' + id]) && !empty(query['d' + id])) {
      set.add(id);
    }
  }
  return Array.from(set.values());
}

/**
 * @param {Object<string,any>} query
 * @return {number}
 */
export function getMaxYahrzeitId(query) {
  const ids = getYahrzeitIds(query);
  if (ids.length === 0) {
    return 0;
  }
  return Math.max(...ids);
}

export const YAHRZEIT = 'Yahrzeit';
export const BIRTHDAY = 'Birthday';
export const ANNIVERSARY = 'Anniversary';
export const OTHER = 'Other';

/**
 * @private
 * @param {string} str
 * @return {string}
 */
function getAnniversaryType(str) {
  if (typeof str === 'string') {
    const s = str.toLowerCase();
    switch (s[0]) {
      case 'y': return YAHRZEIT;
      case 'b': return BIRTHDAY;
      case 'a': return ANNIVERSARY;
      case 'o': return OTHER;
    }
  }
  return YAHRZEIT;
}

/**
 * @param {Object<string,any>} query
 * @param {number} id
 * @return {*}
 */
export function getYahrzeitDetailForId(query, id) {
  const {yy, mm, dd} = getDateForId(query, id);
  if (empty(dd) || empty(mm) || empty(yy)) {
    return null;
  }
  const type = getAnniversaryType(query['t' + id]);
  const sunset = query[`s${id}`];
  const name = getAnniversaryName(query, id, type);
  // TODO: try/catch for invalid dates like December 32
  const dt = makeGregDate(yy, mm, dd);
  let day = dayjs(dt);
  if (sunset === 'on' || sunset == 1) {
    day = day.add(1, 'day');
  }
  return {yy, mm, dd, sunset, type, name, day};
}

/**
 * @param {Object<string,any>} query
 * @param {number} id
 * @param {string} type
 * @return {string}
 */
function getAnniversaryName(query, id, type) {
  const name0 = query[`n${id}`] && query[`n${id}`].trim();
  if (name0) {
    return name0;
  }
  const prefix = type === OTHER ? 'Untitled' : 'Person';
  return prefix + id;
}

/**
 * @private
 * @param {Object<string,string>} query
 * @param {number} id
 * @return {any}
 */
function getDateForId(query, id) {
  const date = query['x' + id];
  if (typeof date === 'string' && date.length === 10) {
    const yy = date.substring(0, 4);
    const gm = date.substring(5, 7);
    const mm = gm[0] === '0' ? gm[1] : gm;
    const gd = date.substring(8, 10);
    const dd = gd[0] === '0' ? gd[1] : gd;
    return {yy, mm, dd};
  }
  const yy = query['y' + id];
  const mm = query['m' + id];
  const dd = query['d' + id];
  return {yy, mm, dd};
}

/**
 * @param {any} query
 * @return {string[]}
 */
export function getCalendarNames(query) {
  return Object.entries(query)
      .filter(([k, val]) => k[0] == 'n' && isNumKey(k))
      .map((x) => x[1])
      .filter((str) => str.length > 0);
}

/**
 * @param {any} query
 * @param {number} maxlen
 * @return {string}
 */
export function makeCalendarTitle(query, maxlen) {
  const names = getCalendarNames(query);
  const calendarType = summarizeAnniversaryTypes(query, true);
  let title = calendarType;
  if (names.length > 0) {
    title += ': ' + names.join(', ');
  }
  if (title.length > maxlen) {
    title = title.substring(0, maxlen - 3) + '...';
  }
  return title;
}
