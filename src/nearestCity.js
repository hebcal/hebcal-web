import haversine from 'haversine';

/**
 * @return {any}
 * @param {Database} geonamesDb
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} countryCode
 * @param {string} tzid
 */
export function nearestCity(geonamesDb, latitude, longitude, countryCode, tzid) {
  const stmt = geonamesDb.prepare(
      'SELECT geonameid, name, latitude, longitude FROM geoname WHERE country = ? AND timezone = ?');
  const rows = stmt.all(countryCode, tzid);
  if (!rows || !rows.length) {
    return null;
  }
  const start = {latitude, longitude};
  let minDistance = Infinity;
  let city = {};
  for (const location of rows) {
    const distance = haversine(start, location);
    if (distance < minDistance) {
      city = location;
      minDistance = distance;
    }
  }
  city.distance = minDistance;
  return city;
}
