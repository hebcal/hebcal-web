import {empty, getIpAddress, makeGregDate} from './common';
import dayjs from 'dayjs';
import nodemailer from 'nodemailer';
import {htmlToText} from 'nodemailer-html-to-text';

/**
 * @param {Object<string,any>} iniConfig
 * @return {nodemailer.Transporter}
 */
export function makeEmailTransport(iniConfig) {
  if (process.env.NODE_ENV === 'production') {
    return nodemailer.createTransport({host: 'localhost', port: 25});
  }
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
  if (message.html && !message.text) {
    transporter.use('compile', htmlToText({
      wordwrap: 74,
      ignoreImage: true,
      ignoreHref: true,
      selectors: [
        {selector: 'img', format: 'skip'},
        {selector: 'a', options: {ignoreHref: true}},
      ],
    }));
  }
  await transporter.sendMail(message);
  // return Promise.resolve({response: '250 OK', messageId: 'foo'});
}

/**
 * @param {string} msgid
 * @param {string} loc
 * @param {string} utmCampaign
 * @return {string}
 */
export function getImgOpenHtml(msgid, loc, utmCampaign) {
  // eslint-disable-next-line max-len
  return `<img src="https://www.hebcal.com/email/open?msgid=${msgid}&amp;loc=${loc}&amp;utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=${utmCampaign}" alt="" width="1" height="1" border="0" style="height:1px!important;width:1px!important;border-width:0!important;margin-top:0!important;margin-bottom:0!important;margin-right:0!important;margin-left:0!important;padding-top:0!important;padding-bottom:0!important;padding-right:0!important;padding-left:0!important">`;
}

/**
 * @param {*} ctx
 * @param {string} id
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
      .map((x) => x[1]);
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
 * @return {number}
 */
export function getMaxYahrzeitId(query) {
  let max = 0;
  for (const k of Object.keys(query)) {
    const k0 = k[0];
    if ((k0 === 'y' || k0 === 'x') && isNumKey(k)) {
      let id = +(k.substring(1));
      if (empty(query[k])) {
        id = 0;
      } else if (k0 === 'y' && (empty(query['d' + id]) || empty(query['m' + id]))) {
        id = 0;
      }
      if (id > max) {
        max = id;
      }
    }
  }
  return max;
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
  const type = query[`t${id}`] || 'Yahrzeit';
  const sunset = query[`s${id}`];
  const name0 = query[`n${id}`] && query[`n${id}`].trim();
  const name = name0 || `Person${id}`;
  let day = dayjs(makeGregDate(yy, mm, dd));
  if (sunset === 'on') {
    day = day.add(1, 'day');
  }
  return {yy, mm, dd, sunset, type, name, day};
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
