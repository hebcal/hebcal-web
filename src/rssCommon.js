import {Locale} from '@hebcal/core';
import {basename} from 'path';
import createError from 'http-errors';

export const RSS_CONTENT_TYPE = 'application/rss+xml; charset=utf-8';

/**
 * @param {any} ctx
 * @param {Date} dt
 */
export function expires(ctx, dt) {
  const exp = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1, 0, 0, 0);
  ctx.set('Expires', exp.toUTCString());
}

/**
 * @param {string} rpath
 * @return {string}
 */
export function getLang(rpath) {
  const bn = basename(rpath);
  const dash = bn.indexOf('-');
  const lang = dash === -1 ? 'en' : bn.substring(dash + 1, bn.indexOf('.'));
  const locales = Locale.getLocaleNames();
  if (locales.indexOf(lang) === -1) {
    throw createError(404, `Unknown locale: ${lang}`);
  }
  return lang;
}
