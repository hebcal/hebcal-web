// Default candle-lighting minutes before sundown. Dependency-free so the
// browser bundle (client-autocomplete.js) can share it with the server.

export const DEFAULT_CANDLE_MINS = 18;

export const geonameIdCandleOffset = {
  '281184': 40, // Jerusalem
  '294801': 30, // Haifa
  '293067': 30, // Zikhron Yaakov
};

/**
 * Like `queryDefaultCandleMins()` for a geonameid whose country is already
 * known, without a database lookup (GeoDb's `getIsrael()` is just
 * `cc === 'IL'`). For pages that list thousands of cities at once.
 * @param {number|string} geonameid
 * @param {string} countryCode ISO 3166 code
 * @return {number}
 */
export function geonameIdDefaultCandleMins(geonameid, countryCode) {
  const offset = geonameIdCandleOffset[geonameid];
  if (typeof offset === 'number') {
    return offset;
  }
  return countryCode === 'IL' ? 20 : DEFAULT_CANDLE_MINS;
}
