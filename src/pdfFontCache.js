import QuickLRU from 'quick-lru';

/**
 * Process-wide reuse of pdfkit's shaped-word cache.
 *
 * pdfkit shapes text with fontkit and memoizes the result per space-delimited
 * word, but that cache lives on the per-document `EmbeddedFont`, so every
 * request re-shapes every word from cold. Across a sample of 253 production
 * calendars there were only ~2,000 distinct (font, word) pairs, i.e. ~97% of
 * shaping was redundant. Sharing the cache across documents halves the time to
 * render a calendar (63ms to 32ms for a typical `/v4/....pdf` request) and
 * leaves the PDF content streams byte-for-byte unchanged.
 *
 * Note on what is deliberately *not* shared: the parsed fontkit font object.
 * Sharing it is roughly another 1.5x, because fontkit decodes GSUB/GPOS lazily
 * and would then do it once per process rather than once per document. But
 * fontkit caches `Glyph` objects by id together with the code points from
 * whichever call first created them, and pdfkit copies `glyph.codePoints` into
 * the PDF's ToUnicode CMap. Sharing the font therefore makes ToUnicode depend
 * on process history rather than on the document's own text: a glyph reachable
 * from two code points (U+2019 and U+02BC share one apostrophe glyph), or a
 * composite's bare component (subsetting `Ç` materializes `C` with no code
 * points at all), gets whichever came first. That measurably changed the
 * ToUnicode CMap in ~4% of a 250-PDF sample, which silently degrades
 * copy/paste, search and accessibility in the finished document. Not worth
 * 1.5x.
 *
 * This reaches into pdfkit internals, so every step is feature-detected; if
 * anything is not shaped as expected we fall back to stock pdfkit behavior.
 */

export const FONT_FILES = {
  'plain': './fonts/Source_Sans_Pro/SourceSansPro-Regular.ttf',
  'semi': './fonts/Source_Sans_Pro/SourceSansPro-SemiBold.ttf',
  'bold': './fonts/Source_Sans_Pro/SourceSansPro-Bold.ttf',
  'hebrew': './fonts/Adobe_Hebrew/adobehebrew-regular.otf',
  'hebrew-bold': './fonts/Adobe_Hebrew/adobehebrew-bold.otf',
};

/**
 * Shaped-word caches, keyed by PostScript name. Bounded because rendered text
 * is not entirely fixed vocabulary — the calendar subtitle can include query
 * parameters — so an unbounded cache would be a slow memory leak.
 */
const layoutCaches = new Map();
const LAYOUT_CACHE_MAX = 20000;

/**
 * @private
 * @param {string} postscriptName
 * @return {QuickLRU}
 */
function getLayoutCache(postscriptName) {
  let cache = layoutCaches.get(postscriptName);
  if (!cache) {
    cache = new QuickLRU({maxSize: LAYOUT_CACHE_MAX});
    layoutCaches.set(postscriptName, cache);
  }
  return cache;
}

/**
 * Points a font's shaped-word lookups at the process-wide cache.
 *
 * pdfkit's own `layoutCached()` reads `this.layoutCache[text]` as a plain
 * property, so handing it an LRU instance would silently bypass eviction and
 * grow without bound. Overriding the method keeps the cache bounded.
 * @private
 * @param {Object} font
 * @return {boolean}
 */
function useSharedLayoutCache(font) {
  if (typeof font?.layoutRun !== 'function' ||
      typeof font.layoutCached !== 'function' ||
      typeof font.name !== 'string') {
    return false;
  }
  const cache = getLayoutCache(font.name);
  font.layoutCached = function(text) {
    const hit = cache.get(text);
    if (hit !== undefined) {
      return hit;
    }
    const run = font.layoutRun(text);
    cache.set(text, run);
    return run;
  };
  return true;
}

/**
 * Makes a single document reuse the process-wide shaped-word cache. Scoped to
 * this instance — `PDFDocument.prototype` is left alone, so any other pdfkit
 * user in the process is unaffected.
 * @param {import('pdfkit')} doc
 * @return {boolean} true if sharing was installed
 */
export function installSharedFonts(doc) {
  if (typeof doc?.font !== 'function') {
    return false;
  }
  const origFont = doc.font.bind(doc);
  doc.font = function(src, family, size) {
    const before = this._font;
    const ret = origFont(src, family, size);
    const font = this._font;
    // Only newly opened embedded fonts need wiring up; pdfkit returns the
    // same instance for repeat calls, and standard PDF fonts do no shaping.
    if (font !== before && font && !Object.hasOwn(font, 'layoutCached')) {
      useSharedLayoutCache(font);
    }
    return ret;
  };
  return true;
}
