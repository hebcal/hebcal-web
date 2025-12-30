import createError from 'http-errors';
import {basename} from 'node:path';
import probe from 'probe-image-size';
import fs from 'node:fs';
import {holidayMeta} from './holidayMeta.js';

const primarySource = {
  'hebcal.com': 'Hebcal',
  'jewfaq.org': 'Judaism 101',
  'en.wikipedia.org': 'Wikipedia',
};

/**
 * @private
 * @param {string} href
 * @return {string}
 */
function sourceName(href) {
  const slashslash = href.indexOf('//');
  const endSlash = href.indexOf('/', slashslash + 2);
  const domain0 = href.substring(slashslash + 2, endSlash);
  const domain = domain0.startsWith('www.') ? domain0.substring(4) : domain0;
  return primarySource[domain] || domain;
}

const cache = new Map();

/**
 * @param {string} holiday
 * @return {Promise<any>}
 */
export async function getHolidayMeta(holiday) {
  const prev = cache.get(holiday);
  if (prev) {
    return {...prev};
  }
  const meta0 = holidayMeta[holiday];
  if (typeof meta0 === 'undefined' || typeof meta0.about.href === 'undefined') {
    throw createError(500, `Internal error; broken configuration for: ${holiday}`);
  }
  const meta = {...meta0};
  meta.about.name = sourceName(meta.about.href);
  if (meta.photo?.fn) {
    meta.photo.webp = meta.photo.fn.replace(/.jpg$/, '.webp');
  }
  if (meta.wikipedia?.href) {
    meta.wikipedia.title = decodeURIComponent(basename(meta.wikipedia.href)).replace(/_/g, ' ');
    const anchorIdx = meta.wikipedia.title.indexOf('#');
    if (anchorIdx !== -1) {
      meta.wikipedia.title = meta.wikipedia.title.substring(anchorIdx + 1);
    }
  }
  if (!meta.israelOnly && !Array.isArray(meta.books)) {
    meta.books = [{
      'ASIN': '0062720082',
      'author': 'Michael Strassfeld',
      'text': 'The Jewish Holidays: A Guide & Commentary',
    }];
  }
  if (Array.isArray(meta.books)) {
    for (const book of meta.books) {
      const colon = book.text.indexOf(':');
      book.shortTitle = colon === -1 ? book.text.trim() : book.text.substring(0, colon).trim();
      const path0 = '/var/www/html/i/' + book.ASIN + '.01.MZZZZZZZ';
      try {
        const path = path0 + '.jpg';
        const rs = fs.createReadStream(path);
        book.dimensions = await probe(rs);
      // eslint-disable-next-line no-unused-vars
      } catch (err) {
        // ignore file not found
      }
      try {
        const path = path0 + '.webp';
        const rs = fs.createReadStream(path);
        book.webp = await probe(rs);
      // eslint-disable-next-line no-unused-vars
      } catch (err) {
        // ignore file not found
      }
    }
  }
  /*
  if (meta.photo) {
    meta.photo.dimensions = {};
    const a = {};
    for (const size of [400, 640, 800, 1024, '1x1', '4x3', '16x9']) {
      try {
        const path = '/var/www/html/i/is/' + size + '/' + meta.photo.fn;
        const rs = fs.createReadStream(path);
        meta.photo.dimensions[size] = await probe(rs);
        a[size] = {width: meta.photo.dimensions[size].width, height: meta.photo.dimensions[size].height};
      } catch (err) {
      // ignore file not found
      }
    }
    console.log(holiday);
    console.log(JSON.stringify(a, null, 1));
  }
  */
  cache.set(holiday, meta);
  return {...meta};
}
