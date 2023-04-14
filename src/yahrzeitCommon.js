import {empty, makeGregDate} from './common';
import dayjs from 'dayjs';

/**
 * @param {*} ctx
 * @param {string} id
 * @return {Promise<Object>}
 */
export async function getYahrzeitDetailsFromDb(ctx, id) {
  const db = ctx.mysql;
  const sql = 'SELECT contents, updated, downloaded FROM yahrzeit WHERE id = ?';
  const results = await db.query({sql, values: [id], timeout: 5000});
  if (!results || !results[0]) {
    ctx.throw(404, `Yahrzeit/Anniversary id not found: ${id}`);
  }
  const row = results[0];
  const obj = row.contents;
  if (!row.downloaded) {
    const sqlUpdate = 'UPDATE yahrzeit SET downloaded = 1, updated = NOW() WHERE id = ?';
    await db.execute({sql: sqlUpdate, values: [id], timeout: 5000});
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
  const types0 = Object.entries(query)
      .filter(([k, val]) => k[0] == 't' && isNumKey(k))
      .map((x) => getAnniversaryType(x[1]))
      .map((x) => x === 'Other' ? 'Anniversary' : x);
  const types = Array.from(new Set(types0));
  const anniversaryType = types.length === 0 ? 'Yahrzeit' :
    types.length === 1 ? types[0] : 'Anniversary';
  if (long) {
    switch (anniversaryType) {
      case 'Anniversary':
        return types.length === 1 ? 'Hebrew Anniversary' : 'Hebrew Anniversaries';
      case 'Birthday':
        return types.length === 1 ? 'Hebrew Birthday' : 'Hebrew Birthdays';
      default: break;
    }
  }
  return anniversaryType;
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
  return Math.max(...ids);
}

/**
 * @private
 * @param {string} str
 * @return {string}
 */
function getAnniversaryType(str) {
  if (typeof str === 'string') {
    const s = str.toLowerCase();
    switch (s[0]) {
      case 'y': return 'Yahrzeit';
      case 'b': return 'Birthday';
      case 'a': return 'Anniversary';
      case 'o': return 'Other';
    }
  }
  return 'Yahrzeit';
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
  let day = dayjs(makeGregDate(yy, mm, dd));
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
  const prefix = type === 'Other' ? 'Untitled' : 'Person';
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
