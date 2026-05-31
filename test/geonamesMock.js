import {GeoDb} from '@hebcal/geo-sqlite';
import {Location} from '@hebcal/core';

// The ~60 "classic" Hebcal city names recognized by Location.lookup() in
// @hebcal/core. The test geonames.sqlite3 only contains a tiny sample of
// cities, so lookups for these well-known cities (and their geonameids)
// would otherwise return null. We bridge that gap by falling back to the
// hardcoded data baked into @hebcal/core.
const CLASSIC_CITIES = [
  'Ashdod', 'Atlanta', 'Austin', 'Baghdad', 'Beer Sheva',
  'Berlin', 'Baltimore', 'Bogota', 'Boston', 'Budapest',
  'Buenos Aires', 'Buffalo', 'Chicago', 'Cincinnati', 'Cleveland',
  'Dallas', 'Denver', 'Detroit', 'Eilat', 'Gibraltar', 'Haifa',
  'Hawaii', 'Helsinki', 'Houston', 'Jerusalem', 'Johannesburg',
  'Kiev', 'La Paz', 'Livingston', 'Las Vegas', 'London', 'Los Angeles',
  'Marseilles', 'Miami', 'Minneapolis', 'Melbourne', 'Mexico City',
  'Montreal', 'Moscow', 'New York', 'Omaha', 'Ottawa', 'Panama City',
  'Paris', 'Pawtucket', 'Petach Tikvah', 'Philadelphia', 'Phoenix',
  'Pittsburgh', 'Providence', 'Portland', 'Saint Louis', 'Saint Petersburg',
  'San Diego', 'San Francisco', 'Sao Paulo', 'Seattle', 'Sydney',
  'Tel Aviv', 'Tiberias', 'Toronto', 'Vancouver', 'White Plains',
  'Washington DC', 'Worcester',
];

/**
 * Builds (and caches on the instance) a Map of geonameid => classic city name
 * by munging each classic city name and looking up its geonameid in the
 * GeoDb's built-in legacy city table.
 * @param {GeoDb} db
 * @return {Map<number, string>}
 */
function id2nameFor(db) {
  if (db._testId2Name) {
    return db._testId2Name;
  }
  const map = new Map();
  for (const name of CLASSIC_CITIES) {
    const key = GeoDb.munge(name);
    let id = db.legacyCities.get(key);
    if (!id) {
      // Some classic cities are only stored under a country/state-qualified
      // key, e.g. 'br-saopaulo' or 'us-lasvegas-nv'. Match those too.
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`^[a-z]{2}-${escaped}(-.+)?$`);
      for (const [k, v] of db.legacyCities) {
        if (re.test(k)) {
          id = v;
          break;
        }
      }
    }
    if (id) {
      map.set(id, name);
    }
  }
  db._testId2Name = map;
  return map;
}

let patched = false;

/**
 * Patches GeoDb so that lookupGeoname() and lookupLegacyCity() fall back to
 * Location.lookup() from @hebcal/core when the (intentionally minimal) test
 * SQLite database has no row for the requested city. Idempotent.
 */
export function injectGeonamesMock() {
  if (patched) {
    return;
  }
  patched = true;

  const origLookupGeoname = GeoDb.prototype.lookupGeoname;
  GeoDb.prototype.lookupGeoname = function(geonameid) {
    const loc = origLookupGeoname.call(this, geonameid);
    if (loc) {
      return loc;
    }
    let id = +geonameid;
    if (id === 293396) {
      id = 293397; // same alias GeoDb.lookupGeoname() applies internally
    }
    const name = id2nameFor(this).get(id);
    const found = name ? Location.lookup(name) : null;
    if (!found) {
      return null;
    }
    // Location.lookup() returns a shared cached instance with no geonameid.
    // Clone it and stamp the geoname identity, matching real lookupGeoname().
    const clone = Object.assign(
        Object.create(Object.getPrototypeOf(found)), found);
    clone.geo = 'geoname';
    clone.geonameid = id;
    clone.geoid = id;
    return clone;
  };

  const origLookupLegacyCity = GeoDb.prototype.lookupLegacyCity;
  GeoDb.prototype.lookupLegacyCity = function(cityName) {
    const loc = origLookupLegacyCity.call(this, cityName);
    if (loc) {
      return loc;
    }
    return Location.lookup(cityName) ?? null;
  };
}
