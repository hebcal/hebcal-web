import haversine from 'haversine';

const cityCache = new Map();

/**
 * @return {any}
 * @param {Database} geonamesDb
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} countryCode
 * @param {string} tzid
 */
export function nearestCity(geonamesDb, latitude, longitude, countryCode, tzid) {
  const start = {latitude, longitude};
  let city = cityCache.get(start);
  if (city) {
    return city;
  }
  const stmt = geonamesDb.prepare(
      'SELECT geonameid, name, latitude, longitude FROM geoname WHERE country = ? AND timezone = ?');
  const rows = stmt.all(countryCode, tzid);
  if (!rows || !rows.length) {
    return null;
  }
  let minDistance = Infinity;
  for (const location of rows) {
    const distance = haversine(start, location);
    if (distance < minDistance) {
      city = location;
      minDistance = distance;
    }
  }
  city.distance = minDistance;
  cityCache.set(start, city);
  return city;
}
