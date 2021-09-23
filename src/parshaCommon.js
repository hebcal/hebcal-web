import * as leyning from '@hebcal/leyning';
import {makeAnchor} from '@hebcal/rest-api';

export const torahBookNames = 'Genesis Exodus Leviticus Numbers Deuteronomy DoubledParshiyot'.split(' ');
export const parshaByBook = new Map();
for (const book of torahBookNames) {
  parshaByBook.set(book, new Map());
}

export const sedrot = new Map();
export const doubled = new Map();
for (const [parshaName, reading] of Object.entries(leyning.parshiyot)) {
  const anchor = makeAnchor(parshaName);
  sedrot.set(anchor, parshaName);
  sedrot.set(anchor.replace(/-/g, ''), parshaName);
  if (reading.combined) {
    const [p1, p2] = parshaName.split('-');
    doubled.set(p1, parshaName);
    doubled.set(p2, parshaName);
  }
  const bookId = reading.combined ? 'DoubledParshiyot' : torahBookNames[reading.book - 1];
  parshaByBook.get(bookId).set(anchor, parshaName);
}

const bookId = {
  Genesis: 1,
  Exodus: 2,
  Leviticus: 3,
  Numbers: 4,
  Deuteronomy: 5,
};

/**
 * Makes Sefaria links by adding `href` and Tikkun.io link by adding `tikkun`.
 * Also adds `verses` and `num` attributes to each aliyah.
 * CAUTION: Modifies the `aliyot` parameter instead of making a copy.
 * @param {Object<string,Aliyah>} aliyot aliyah map to decorate
 * @param {boolean} showBook display the book name in the `verses` field (e.g. for special Maftir)
 */
export function addLinksToLeyning(aliyot, showBook) {
  const book1 = aliyot['1'] && aliyot['1'].k;
  Object.keys(aliyot).forEach((num) => {
    const aliyah = aliyot[num];
    aliyah.num = num == 'M' ? 'maf' : num;
    const begin = aliyah.b.split(':');
    const end = aliyah.e.split(':');
    const endChapVerse = begin[0] === end[0] ? end[1] : aliyah.e;
    const verses = `${aliyah.b}-${endChapVerse}`;
    aliyah.verses = showBook || (book1 != aliyah.k) ? `${aliyah.k} ${verses}` : verses;
    const sefariaVerses = verses.replace(/:/g, '.');
    const sefAliyot = showBook ? '0' : '1';
    const url = `https://www.sefaria.org/${aliyah.k}.${sefariaVerses}?lang=bi&aliyot=${sefAliyot}`;
    aliyah.href = url;
    const bid = bookId[aliyah.k];
    aliyah.tikkun = `https://tikkun.io/#/r/${bid}-${begin[0]}-${begin[1]}`;
  });
}
