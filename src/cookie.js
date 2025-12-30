import {randomUUID} from 'node:crypto';
import {isoDateStringToDate} from './dateUtil.js';
import {empty, off} from './empty.js';
import {
  DEFAULT_CANDLE_MINS,
  booleanOpts,
  numberOpts,
  negativeOpts,
  geoKeys,
  getGeoKeysToRemove,
  queryDefaultCandleMins,
  dailyLearningOpts,
} from './urlArgs.js';

/**
 * @param {any} ctx
 * @return {boolean}
 */
export function doesCookieNeedRefresh(ctx) {
  if (!empty(ctx.request.query.cfg)) {
    return false;
  }
  const prevCookie = ctx.cookies.get('C');
  if (!prevCookie) {
    return true;
  } else if (prevCookie === 'opt_out') {
    return false;
  }
  const prev0 = prevCookie.substring(prevCookie.indexOf('&'));
  const prevExp = prev0.indexOf('&exp=');
  if (prevExp === -1) {
    return true;
  }
  const expDt = isoDateStringToDate(prev0.substring(prevExp + 5));
  const expMillis = expDt.getTime();
  const now = Date.now();
  const diff = (expMillis - now) / (24 * 60 * 60 * 1000);
  return diff < 180;
}

/**
 * @param {any} ctx
 * @param {string} newCookie
 */
function setCookie(ctx, newCookie) {
  const prevCookie = ctx.cookies.get('C');
  const expires = new Date();
  expires.setDate(expires.getDate() + 399);
  newCookie += '&exp=' + expires.toISOString().substring(0, 10);
  const headerStr = 'C=' + newCookie + '; path=/; expires=' +
    expires.toUTCString();
  ctx.append('Set-Cookie', headerStr);
  if (empty(prevCookie)) {
    ctx.state.cookieBanner = true;
  }
}

const cookieOpts = geoKeys.concat(['lg'], Object.keys(numberOpts));

/**
 * @param {any} ctx
 * @param {Object.<string,string>} query
 * @param {string} uid
 * @return {string | boolean}
 */
function makeCookie(ctx, query, uid) {
  const ck = {};
  for (const key of Object.keys(negativeOpts)) {
    ck[key] = off(query[key]) ? 'off' : 'on';
  }
  for (const key of Object.keys(booleanOpts)) {
    if (key === 'euro' || key === 'yto' || key === 'a') {
      continue;
    }
    const value = query[key];
    ck[key] = (value === 'on' || value == '1') ? 'on' : 'off';
  }
  for (const key of Object.keys(dailyLearningOpts)) {
    const value = query[key];
    if (value === 'on' || value == '1') {
      ck[key] = 'on';
    }
  }
  if (!empty(query.h12)) {
    ck.h12 = off(query.h12) ? '0' : '1';
  }
  if (query.geo === 'pos') {
    ck.geo = 'pos';
  } else if (query.geo === 'none') {
    for (const key of getGeoKeysToRemove('none')) {
      delete query[key];
      delete ck[key];
    }
  }
  for (const key of cookieOpts) {
    const value = query[key];
    if (typeof value === 'number' ||
      (typeof value === 'string' && value.length > 0)) {
      ck[key] = value;
    }
  }
  // don't persist candle lighting minutes if it's default val.
  // use double-equals instead of triple-equals deliberately
  // so strings will match numbers
  if (ck.b &&
    ((ck.zip && ck.b == DEFAULT_CANDLE_MINS) ||
      (ck.geonameid && ck.b == queryDefaultCandleMins(ck)))) {
    delete ck.b;
  }
  if (Object.keys(ck).length === 0) {
    return false;
  }
  uid = uid || randomUUID();
  ctx.state.userId = uid;
  return 'uid=' + uid + '&' + new URLSearchParams(ck).toString();
}

/**
 * @param {any} ctx
 * @param {Object.<string,string>} query
 * @return {boolean}
 */
export function setHebcalCookie(ctx, query) {
  if (!empty(ctx.request.query.cfg)) {
    return false;
  }
  const prevCookie = ctx.cookies.get('C') || '';
  if (prevCookie === 'opt_out') {
    return false;
  }
  const uid = prevCookie.startsWith('uid=') && prevCookie.substring(4, 40);
  const newCookie = makeCookie(ctx, query, uid);
  if (newCookie === false) {
    return false;
  }
  if (prevCookie) {
    const prev0 = prevCookie.substring(prevCookie.indexOf('&'));
    const prevExp = prev0.indexOf('&exp=');
    const prev = prevExp === -1 ? prev0 : prev0.substring(0, prevExp);
    const ampersand = newCookie.indexOf('&');
    const current = newCookie.substring(ampersand);
    if (prev === current && !doesCookieNeedRefresh(ctx)) {
      return false;
    }
  }
  setCookie(ctx, newCookie);
  return true;
}

/**
 * @param {any} ctx
 * @param {Object.<string,string>} query
 * @return {boolean}
 */
export function possiblySetCookie(ctx, query) {
  if (ctx.status >= 301) {
    return false;
  }
  return setHebcalCookie(ctx, query);
}
