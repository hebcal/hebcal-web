import {Locale} from '@hebcal/core';
import * as leyning from '@hebcal/leyning';
import {makeAnchor} from '@hebcal/rest-api';
import {bookId, sefariaAliyahHref} from './common';
import drash from './drash.json';

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
    aliyah.href = sefariaAliyahHref(aliyah, !showBook);
    const bid = bookId[aliyah.k];
    aliyah.tikkun = `https://tikkun.io/#/r/${bid}-${begin[0]}-${begin[1]}`;
    const startCV = `${aliyah.k}.${begin[0]}.${begin[1]}`;
    aliyah.pocketTorahAudio = `https://www.sefaria.org/${startCV}?lang=bi&with=Torah%20Readings&lang2=en`;
  });
}

/**
 * @param {string} parshaName
 * @return {any}
 */
export function lookupParsha(parshaName) {
  const parsha0 = leyning.parshiyot[parshaName];
  const parsha = Object.assign({
    name: parshaName,
    bookName: torahBookNames[parsha0.book - 1],
    anchor: makeAnchor(parshaName),
  }, parsha0);
  if (parsha.combined) {
    const [p1, p2] = parshaName.split('-');
    parsha.hebrew = Locale.gettext(p1, 'he') + '־' + Locale.gettext(p2, 'he');
    const n1 = leyning.parshiyot[p1].num;
    parsha.ordinal = Locale.ordinal(n1, 'en') + ' and ' + Locale.ordinal(n1 + 1, 'en');
    parsha.p1 = p1;
    parsha.p2 = p2;
    parsha.p1anchor = makeAnchor(p1);
    parsha.p2anchor = makeAnchor(p2);
    const haftKey = p1 === 'Nitzavim' ? p1 : p2;
    parsha.haft = leyning.parshiyot[haftKey].haft;
  } else {
    parsha.ordinal = Locale.ordinal(parsha.num, 'en');
  }
  const chapVerse = parsha.fullkriyah['1'].b;
  const [chapter, verse] = chapVerse.split(':');
  const book = parsha.book;
  const portion = parsha.combined ? parsha.num1 : parsha.num;
  parsha.ids = {portion, book, chapter, verse};
  parsha.summaryHtml = makeSummaryHtml(parsha);
  return parsha;
}

/**
 * @param {any} parsha
 * @return {any}
 */
function makeSummaryHtml(parsha) {
  let summary;
  let target;
  if (parsha.combined) {
    const [p1, p2] = parsha.name.split('-');
    const s1 = drash[p1].sefaria && drash[p1].sefaria.summary;
    const s2 = drash[p2].sefaria && drash[p2].sefaria.summary;
    if (s1 && s2) {
      summary = s1 + '\n ' + s2;
      target = drash[p1].sefaria.target;
    } else {
      return null;
    }
  } else {
    const sefaria = drash[parsha.name].sefaria;
    if (sefaria && sefaria.summary) {
      summary = sefaria.summary;
      target = sefaria.target;
    } else {
      return null;
    }
  }
  return {
    link: `https://www.sefaria.org/topics/parashat-${target}?tab=sources`,
    title: 'Parashat ' + parsha.name + ' from Sefaria',
    html: summary,
  };
}
