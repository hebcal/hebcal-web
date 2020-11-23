import {empty, getIpAddress} from './common';
import dayjs from 'dayjs';
import nodemailer from 'nodemailer';

/**
 * @param {Object<string,any>} iniConfig
 * @return {nodemailer.Transporter}
 */
export function makeEmailTransport(iniConfig) {
  const transporter = nodemailer.createTransport({
    host: iniConfig['hebcal.email.shabbat.host'],
    port: 465,
    secure: true,
    auth: {
      user: iniConfig['hebcal.email.shabbat.user'],
      pass: iniConfig['hebcal.email.shabbat.password'],
    },
  });
  return transporter;
}

/**
 * @param {any} ctx
 * @param {any} message
 * @return {Promise}
 */
export async function mySendMail(ctx, message) {
  message.from = 'Hebcal <shabbat-owner@hebcal.com>';
  message.replyTo = 'no-reply@hebcal.com';
  const ip = getIpAddress(ctx);
  message.headers = message.headers || {};
  message.headers['X-Originating-IP'] = `[${ip}]`;
  // console.log(message);
  const transporter = makeEmailTransport(ctx.iniConfig);
  await transporter.sendMail(message);
  // return Promise.resolve({response: '250 OK', messageId: 'foo'});
}

/**
 * @param {*} ctx
 * @param {*} db
 * @param {string} id
 */
export async function getYahrzeitDetailsFromDb(ctx, db, id) {
  const sql = 'SELECT contents, downloaded FROM yahrzeit WHERE id = ?';
  const results = await db.query(sql, id);
  if (!results || !results[0]) {
    await db.close();
    ctx.throw(404, `Download key ${id} not found`);
  }
  const row = results[0];
  const obj = row.contents;
  if (!row.downloaded) {
    const sqlUpdate = 'UPDATE yahrzeit SET downloaded = 1 WHERE id = ?';
    await db.query(sqlUpdate, id);
  }
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
 * @param {any} query
 * @param {boolean} [long]
 * @return {string}
 */
export function summarizeAnniversaryTypes(query, long=false) {
  const types0 = Object.entries(query)
      .filter(([k, val]) => k[0] == 't' && isNumKey(k))
      .map((x) => x[1]);
  const types = Array.from(new Set(types0));
  const anniversaryType = types.length === 1 ? types[0] : 'Anniversary';
  if (long) {
    switch (anniversaryType) {
      case 'Anniversary': return 'Hebrew Anniversaries';
      case 'Birthday': return 'Hebrew Birthdays';
      default: break;
    }
  }
  return anniversaryType;
}

/**
 * @param {any} query
 * @return {number}
 */
export function getMaxYahrzeitId(query) {
  const ids = Object.keys(query)
      .filter((k) => k[0] == 'y' && isNumKey(k))
      .map((k) => +(k.substring(1)))
      .map((id) => empty(query['y' + id]) ? 0 : id);
  const max = Math.max(...ids);
  const valid = [];
  for (let i = 1; i <= max; i++) {
    if (!empty(query['d' + i]) && !empty(query['m' + i]) && !empty(query['y' + i])) {
      valid.push(i);
    }
  }
  return valid.length === 0 ? 0 : Math.max(...valid);
}

/**
 * @param {*} query
 * @param {number} id
 * @return {*}
 */
export function getYahrzeitDetailForId(query, id) {
  const dd = query[`d${id}`];
  const mm = query[`m${id}`];
  const yy = query[`y${id}`];
  if (empty(dd) || empty(mm) || empty(yy)) {
    return null;
  }
  const type = query[`t${id}`] || 'Yahrzeit';
  const sunset = query[`s${id}`];
  const name = query[`n${id}`] ? query[`n${id}`].trim() : `Person${id}`;
  let day = dayjs(new Date(yy, mm - 1, dd));
  if (sunset === 'on') {
    day = day.add(1, 'day');
  }
  return {dd, mm, yy, sunset, type, name, day};
}
