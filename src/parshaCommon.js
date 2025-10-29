import {HebrewCalendar, Locale, parshiot, flags} from '@hebcal/core';
import {formatAliyahShort, lookupParsha, makeSummaryFromParts} from '@hebcal/leyning';
import {makeAnchor} from '@hebcal/rest-api';
import {langNames} from './common.js';
import {transliterate} from 'transliteration';
import {distance, closest} from 'fastest-levenshtein';
import {readJSON} from './readJSON.js';

export const drash = readJSON('./drash.json');

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
for (let i = 0; i < parshiot.length; i++) {
  const parshaName = parshiot[i];
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

export const bookId = {
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
 * @param {boolean} pocketTorahAudio add a link to pocket torah audio
 */
export function addLinksToLeyning(aliyot, showBook, pocketTorahAudio=true) {
  const book1 = aliyot['1']?.k;
  Object.keys(aliyot).forEach((num) => {
    const aliyah = aliyot[num];
    const isMaftir = num === 'M';
    aliyah.num = isMaftir ? 'maf' : num;
    const begin = aliyah.b.split(':');
    const end = aliyah.e.split(':');
    const endChapVerse = begin[0] === end[0] ? end[1] : aliyah.e;
    const verses = `${aliyah.b}-${endChapVerse}`;
    aliyah.verses = showBook || (book1 != aliyah.k) ? `${aliyah.k} ${verses}` : verses;
    const sefAliyot = !showBook && !isMaftir;
    aliyah.href = sefariaAliyahHref(aliyah, sefAliyot);
    const bid = bookId[aliyah.k];
    if (typeof bid === 'number') {
      aliyah.tikkun = `https://tikkun.io/#/r/${bid}-${begin[0]}-${begin[1]}`;
      if (pocketTorahAudio) {
        const startCV = `${aliyah.k}.${begin[0]}.${begin[1]}`;
        aliyah.pocketTorahAudio = `https://www.sefaria.org/${startCV}?lang=bi&with=Torah%20Readings&lang2=en`;
      }
    }
  });
}

const parshaMetaCache = new Map();

/**
 * @param {string} parshaName
 * @return {any}
 */
export function lookupParshaMeta(parshaName) {
  const meta = parshaMetaCache.get(parshaName);
  if (typeof meta === 'object') {
    return meta;
  }
  const parsha0 = lookupParsha(parshaName);
  const parsha = {
    name: parshaName,
    bookName: torahBookNames[parsha0.book - 1],
    anchor: makeAnchor(parshaName),
    verses: parshaVerses(parsha0),
    ...parsha0,
  };
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
    const p1meta = lookupParsha(p1);
    parsha.p1verses = parshaVerses(p1meta);
  } else {
    parsha.ordinal = Locale.ordinal(parsha.num, 'en');
  }
  parsha.haftara = makeSummaryFromParts(parsha.haft);
  const chapVerse = parsha.fullkriyah['1'][0];
  const [chapter, verse] = chapVerse.split(':');
  const book = parsha.book;
  const portion = parsha.combined ? parsha.num1 : parsha.num;
  parsha.ids = {portion, book, chapter, verse};
  parsha.summaryHtml = makeSummaryHtml(parsha);
  parshaMetaCache.set(parshaName, parsha);
  return parsha;
}

function parshaVerses(parshaMeta) {
  const fk = parshaMeta.fullkriyah;
  return fk['1'][0] + '-' + fk['7'][1];
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

/**
 * @private
 * @param {Aliyah|Aliyah[]} aliyah
 * @param {boolean} sefAliyot
 * @return {string}
 */
export function sefariaAliyahHref(aliyah, sefAliyot) {
  if (Array.isArray(aliyah)) {
    aliyah = aliyah[0];
  }
  const beginStr = aliyah.b.replace(':', '.');
  const cv1 = beginStr.split('.');
  const end = aliyah.e.replace(':', '.');
  const cv2 = end.split('.');
  const endStr = beginStr === end ? '' : cv1[0] === cv2[0] ? '-' + cv2[1] : '-' + end;
  if (aliyah.reason) {
    sefAliyot = false;
  }
  const suffix = bookId[aliyah.k] ? `&aliyot=${sefAliyot ? 1 : 0}` : '';
  const book = aliyah.k.replace(/ /g, '_');
  return `https://www.sefaria.org/${book}.${beginStr}${endStr}?lang=bi${suffix}`;
}

/**
 * Sets ev.memo if the event is a Parsha Hashavua
 * @param {Event} ev
 */
export function addIcalParshaMemo(ev) {
  if (ev.getFlags() & flags.PARSHA_HASHAVUA) {
    const parshaName = ev.getDesc().substring(9);
    const meta = lookupParshaMeta(parshaName);
    const memo = meta.summaryHtml?.html;
    if (memo) {
      ev.memo = memo;
    }
  }
}

const PARSHA_SPECIAL_MASK = flags.SPECIAL_SHABBAT | flags.ROSH_CHODESH;

function getCsvParshaMemo(ev, il, locale) {
  if (ev.getFlags() & flags.PARSHA_HASHAVUA) {
    const hd = ev.getDate();
    const holidays0 = HebrewCalendar.getHolidaysOnDate(hd, il) || [];
    const holidays1 = holidays0.filter((ev) => Boolean(ev.getFlags() & PARSHA_SPECIAL_MASK));
    if (holidays1.length) {
      return holidays1.map((ev) => ev.render(locale)).join(' + ');
    } else {
      const tommorow = hd.next().getDate();
      if (tommorow === 30 || tommorow === 1) {
        return 'Machar Chodesh';
      }
    }
  }
  return undefined;
}

export function addCsvParshaMemo(ev, il, locale) {
  const memo = getCsvParshaMemo(ev, il, locale);
  if (memo) {
    ev.memo = memo;
  }
}
