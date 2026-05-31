import {injectGeonamesMock} from './geonamesMock.js';

// The test geonames.sqlite3 only contains a small sample of cities, so geo
// lookups for well-known cities fall back to @hebcal/core's built-in data.
injectGeonamesMock();
