import createError from 'http-errors';
import {basename} from 'node:path';
import probe from 'probe-image-size';
import fs from 'node:fs';
import {holidayMeta} from './holidayMeta.js';
import {DOCUMENT_ROOT} from './common.js';

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
  if (!meta0?.about?.href) {
    throw createError(500, `Internal error; broken configuration for: ${holiday}`);
  }
  const meta = {...meta0};
  meta.about.name = sourceName(meta.about.href);
  if (meta.photo?.fn) {
    const avif = meta.photo.fn.replace(/.webp$/, '.avif');
    const path = DOCUMENT_ROOT + '/i/is/640/' + avif;
    try {
      if (await fs.promises.access(path)) {
        meta.photo.avif = avif;
      }
    } catch {
      // ignore file not found
    }
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
      const path0 = DOCUMENT_ROOT + '/i/' + book.ASIN + '.01.MZZZZZZZ';
      try {
        const path = path0 + '.webp';
        const rs = fs.createReadStream(path);
        book.dimensions = await probe(rs);
        rs.close();
      } catch {
        // ignore file not found
      }
      try {
        const path = path0 + '.avif';
        const rs = fs.createReadStream(path);
        book.avif = await probe(rs);
        rs.close();
      } catch {
        // ignore file not found
      }
    }
  }
  cache.set(holiday, meta);
  return {...meta};
}
