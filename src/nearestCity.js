import haversine from 'haversine';

const cityCache = new Map();

/**
 * @return {any}
 * @param {Database} geonamesDb
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} tzid
 */
export function nearestCity(geonamesDb, latitude, longitude, tzid) {
  const key = latitude + '|' + longitude;
  let city = cityCache.get(key);
  if (typeof city !== 'undefined') {
    return city;
  }
  const stmt = geonamesDb.prepare(
      'SELECT geonameid, name, latitude, longitude FROM geoname WHERE timezone = ?');
  const rows = stmt.all(tzid);
  if (!rows || !rows.length) {
    cityCache.set(key, null);
    return null;
  }
  let minDistance = Infinity;
  for (const location of rows) {
    const start = {latitude, longitude};
    const distance = haversine(start, location);
    if (distance < minDistance) {
      city = location;
      minDistance = distance;
    }
  }
  city.distance = minDistance;
  cityCache.set(key, city);
  return city;
}
