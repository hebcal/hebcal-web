import {Locale, parshiot} from '@hebcal/core';
import {formatAliyahShort, lookupParsha} from '@hebcal/leyning';
import {makeAnchor} from '@hebcal/rest-api';
import {bookId, sefariaAliyahHref, langNames} from './common';
import drash from './drash.json';
import {transliterate} from 'transliteration';
import {distance, closest} from 'fastest-levenshtein';

export const torahBookNames = 'Genesis Exodus Leviticus Numbers Deuteronomy DoubledParshiyot'.split(' ');
export const parshaByBook = new Map();
for (const book of torahBookNames) {
  parshaByBook.set(book, new Map());
}

export const sedrot = new Map();
export const doubled = new Map();
export const parshaNum = new Map();
const parshaAlias = new Map();
const allLangs = Object.keys(langNames);
export const parshiot54 = [].concat(parshiot, 'Vezot Haberakhah');
for (let i = 0; i < parshiot54.length; i++) {
  const parshaName = parshiot54[i];
  parshaNum.set(parshaName, i + 1);
  addParshaToMeta(parshaName);
}
export const doubledParshiyot = [
  'Vayakhel-Pekudei',
  'Tazria-Metzora',
  'Achrei Mot-Kedoshim',
  'Behar-Bechukotai',
  'Chukat-Balak',
  'Matot-Masei',
  'Nitzavim-Vayeilech',
];
for (const parshaName of doubledParshiyot) {
  const [p1, p2] = parshaName.split('-');
  doubled.set(p1, parshaName);
  doubled.set(p2, parshaName);
  addParshaToMeta(parshaName);
}

/**
 * @private
 * @param {string} parshaName
 */
function addParshaToMeta(parshaName) {
  const anchor = makeAnchor(parshaName);
  sedrot.set(anchor, parshaName);
  sedrot.set(anchor.replace(/-/g, ''), parshaName);
  const meta = lookupParsha(parshaName);
  const bookId = meta.combined ? 'DoubledParshiyot' : torahBookNames[meta.book - 1];
  parshaByBook.get(bookId).set(anchor, parshaName);
  for (const lang of allLangs) {
    const str = Locale.lookupTranslation(parshaName, lang);
    if (str) {
      const str2 = makeAnchor(transliterate(str));
      parshaAlias.set(str2, anchor);
    }
  }
  for (const obj of Object.values(drash[parshaName])) {
    if (typeof obj === 'string') {
      const target = makeAnchor(obj);
      parshaAlias.set(target, anchor);
    } else if (typeof obj === 'object' && obj !== null && obj.target) {
      const target = makeAnchor(obj.target);
      parshaAlias.set(target, anchor);
    }
  }
}

const allParshaAnchors = Array.from(sedrot.keys());
// const allAliases = Array.from(parshaAlias.keys());

/**
 * @param {string} str
 * @return {string}
 */
export function lookupParshaAlias(str) {
  const str1 = makeAnchor(transliterate(str));
  const alias1 = parshaAlias.get(str1);
  if (alias1) {
    return alias1;
  }
  const candidate = closest(str1, allParshaAnchors);
  const editDist = distance(str1, candidate);
  if (editDist < 2) {
    return candidate;
  }
  /*
  const candidate2 = closest(str1, allAliases);
  const editDist2 = distance(str1, candidate2);
  if (editDist2 < 2) {
    return parshaAlias.get(candidate2);
  }
  */
}

/**
 * Makes Sefaria links by adding `href` and Tikkun.io link by adding `tikkun`.
 * Also adds `verses` and `num` attributes to each aliyah.
 * CAUTION: Modifies the `aliyot` parameter instead of making a copy.
 * @param {Object<string,Aliyah>} aliyot aliyah map to decorate
 * @param {boolean} showBook display the book name in the `verses` field (e.g. for special Maftir)
 */
export function addLinksToLeyning(aliyot, showBook) {
  const book1 = aliyot['1']?.k;
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
    if (typeof bid === 'number') {
      aliyah.tikkun = `https://tikkun.io/#/r/${bid}-${begin[0]}-${begin[1]}`;
      const startCV = `${aliyah.k}.${begin[0]}.${begin[1]}`;
      aliyah.pocketTorahAudio = `https://www.sefaria.org/${startCV}?lang=bi&with=Torah%20Readings&lang2=en`;
    }
  });
}

/**
 * @param {string} parshaName
 * @return {any}
 */
export function lookupParshaMeta(parshaName) {
  const parsha0 = lookupParsha(parshaName);
  const parsha = Object.assign({
    name: parshaName,
    bookName: torahBookNames[parsha0.book - 1],
    anchor: makeAnchor(parshaName),
    verses: parsha0.fullkriyah['1'][0] + '-' + parsha0.fullkriyah['7'][1],
  }, parsha0);
  if (parsha.combined) {
    const [p1, p2] = parshaName.split('-');
    parsha.hebrew = Locale.gettext(p1, 'he') + '־' + Locale.gettext(p2, 'he');
    const n1 = parshaNum.get(p1);
    parsha.ordinal = Locale.ordinal(n1, 'en') + ' and ' + Locale.ordinal(n1 + 1, 'en');
    parsha.p1 = p1;
    parsha.p2 = p2;
    parsha.p1anchor = makeAnchor(p1);
    parsha.p2anchor = makeAnchor(p2);
    const haftKey = p1 === 'Nitzavim' ? p1 : p2;
    parsha.haft = lookupParsha(haftKey).haft;
  } else {
    parsha.ordinal = Locale.ordinal(parsha.num, 'en');
  }
  const chapVerse = parsha.fullkriyah['1'][0];
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
    const s1 = drash[p1]?.sefaria?.summary;
    const s2 = drash[p2]?.sefaria?.summary;
    if (s1 && s2) {
      summary = s1 + '\n ' + s2;
      target = drash[p1].sefaria.target;
    } else {
      return null;
    }
  } else {
    const sefaria = drash[parsha.name].sefaria;
    if (sefaria?.summary) {
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

/**
 * @param {any[]} parts
 * @param {boolean} outbound
 * @return {string}
 */
export function makeLeyningHtmlFromParts(parts, outbound) {
  if (!Array.isArray(parts)) {
    parts = [parts];
  }
  let prev = {k: 'Bogus'};
  let summary = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const showBook = (part.k !== prev.k);
    const delim = i === 0 ? '' : showBook ? '; ' : ', ';
    const outboundHtml = outbound ? ' class="outbound"' : '';
    summary += delim + `<a${outboundHtml} href="` +
      sefariaAliyahHref(part, false) + '">' +
      formatAliyahShort(part, showBook) + '</a>';
    prev = part;
  }
  return summary;
}
