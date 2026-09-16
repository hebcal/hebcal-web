import dayjs from 'dayjs';
import {getLocationFromQuery} from './location.js';
import {getMaxYahrzeitId, makeCalendarTitle} from './yahrzeitCommon.js';

/**
 * Look up the signed-in user's Shabbat candle-lighting email subscription, if
 * any. There is at most one per address (email_address is the PRIMARY KEY).
 * @param {import('koa').Context} ctx
 * @param {string} email
 * @return {Promise<null|{status: string, locationName: string, emailId: string, updated: Date}>}
 */
export async function getShabbatSubscription(ctx, email) {
  const sql = `SELECT email_id, email_status, email_updated,
      email_candles_zipcode, email_candles_city, email_candles_geonameid
    FROM hebcal_shabbat_email
    WHERE email_address = ?`;
  const rows = await ctx.mysql.query(sql, email);
  const r = rows?.[0];
  if (!r) {
    return null;
  }
  // The `e` param is base64(email); emailForm() decodes it, looks up the row,
  // and pre-fills location/Havdalah/candle-minutes -- the same param the
  // confirmation-email "Update Settings" / "Unsubscribe" links use.
  const eParam = encodeURIComponent(Buffer.from(email).toString('base64'));
  return {
    status: r.email_status,
    locationName: locationNameFromRow(ctx, r),
    emailId: r.email_id,
    updated: r.email_updated,
    manageUrl: '/email?e=' + eParam,
    // Links to the pre-unsubscribe confirmation page (not an immediate
    // unsubscribe), so an accidental click can be undone.
    unsubscribeUrl: '/email?e=' + eParam + '&unsubscribe=1&cfg=html',
  };
}

/**
 * @param {import('koa').Context} ctx
 * @param {Object} r a hebcal_shabbat_email row
 * @return {string}
 */
function locationNameFromRow(ctx, r) {
  let geo;
  if (r.email_candles_zipcode) {
    geo = {zip: r.email_candles_zipcode};
  } else if (r.email_candles_geonameid) {
    geo = {geonameid: String(r.email_candles_geonameid)};
  } else if (r.email_candles_city) {
    geo = {city: r.email_candles_city.replaceAll('+', ' ')};
  } else {
    return '';
  }
  try {
    const location = getLocationFromQuery(ctx.db, geo);
    return location ? location.getName() : '';
  } catch (err) {
    ctx.logger.warn(err, 'account: could not resolve subscription location');
    return '';
  }
}

/**
 * Look up the signed-in user's active Yahrzeit + Anniversary email
 * subscriptions, one entry per distinct calendar.
 * @param {import('koa').Context} ctx
 * @param {string} email
 * @return {Promise<Array<{calendarId: string, title: string, subId: string, updated: Date}>>}
 */
export async function getYahrzeitSubscriptions(ctx, email) {
  const sql = `SELECT e.id, e.calendar_id, y.contents, y.updated
    FROM yahrzeit_email e, yahrzeit y
    WHERE e.email_addr = ? AND e.sub_status = 'active'
      AND e.calendar_id = y.id
    ORDER BY y.updated ASC`;
  const results = await ctx.mysql.query(sql, email);
  const seen = new Set();
  const subs = [];
  for (const row of results || []) {
    if (seen.has(row.calendar_id) || getMaxYahrzeitId(row.contents) === 0) {
      continue;
    }
    seen.add(row.calendar_id);
    subs.push({
      calendarId: row.calendar_id,
      title: makeCalendarTitle(row.contents, 72),
      subId: row.id,
      updated: row.updated,
    });
  }
  return subs;
}

/**
 * Gather every subscription tied to the account's verified email.
 * @param {import('koa').Context} ctx
 * @param {string} email
 * @return {Promise<{shabbat: object|null, yahrzeit: Array}>}
 */
export async function getAccountSubscriptions(ctx, email) {
  if (!email) {
    return {shabbat: null, yahrzeit: []};
  }
  const [shabbat, yahrzeit] = await Promise.all([
    getShabbatSubscription(ctx, email),
    getYahrzeitSubscriptions(ctx, email),
  ]);
  return {shabbat, yahrzeit};
}

/**
 * @param {Date} d
 * @return {string}
 */
export function formatMonthYear(d) {
  return d ? dayjs(d).format('MMMM YYYY') : '';
}
