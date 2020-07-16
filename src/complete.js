import {Location} from '@hebcal/core';

const NOTFOUND = {error: 'Not Found'};

let zipStmt;
const ZIP_SQL = `SELECT ZipCode,CityMixedCase,State,Latitude,Longitude,TimeZone,DayLightSaving
FROM ZIPCodes_Primary
WHERE ZipCode LIKE ?
LIMIT 10`;

let geonameStmt;
const GEONAME_SQL = `SELECT geonameid, asciiname, admin1, country,
population, latitude, longitude, timezone
FROM geoname_fulltext
WHERE longname MATCH ?
GROUP BY geonameid
ORDER BY population DESC
LIMIT 10`;

// eslint-disable-next-line require-jsdoc
export async function geoAutoComplete(ctx) {
  if (ctx.request.header['if-modified-since']) {
    ctx.status = 304;
    ctx.body = {status: 'Not Modified'};
    return;
  }
  const q = ctx.request.query;
  const qraw = typeof q.q === 'string' ? q.q.trim() : '';
  if (qraw.length === 0) {
    ctx.status = 404;
    ctx.body = NOTFOUND;
    return;
  }
  if (qraw.charCodeAt(0) >= 48 && qraw.charCodeAt(0) <= 57) {
    if (!zipStmt) {
      zipStmt = ctx.db.zipsDb.prepare(ZIP_SQL);
    }
    const items = zipStmt.all(qraw + '%').map((res) => {
      return {
        id: String(res.ZipCode),
        value: `${res.CityMixedCase}, ${res.State} ${res.ZipCode}`,
        admin1: res.State,
        asciiname: res.CityMixedCase,
        country: 'United States',
        latitude: res.Latitude,
        longitude: res.Longitude,
        timezone: Location.getUsaTzid(res.State, res.TimeZone, res.DayLightSaving),
        geo: 'zip',
      };
    });
    if (items.length) {
      ctx.body = items;
    } else {
      ctx.status = 404;
      ctx.body = NOTFOUND;
    }
  } else {
    if (!geonameStmt) {
      geonameStmt = ctx.db.geonamesDb.prepare(GEONAME_SQL);
    }
    const items = geonameStmt.all(`"${qraw}*"`).map((res) => {
      const country = res.country || '';
      const admin1 = res.admin1 || '';
      const obj = {
        id: res.geonameid,
        value: Location.geonameCityDescr(res.asciiname, admin1, country),
        asciiname: res.asciiname,
        latitude: res.latitude,
        longitude: res.longitude,
        timezone: res.timezone,
        population: res.population,
        geo: 'geoname',
      };
      if (country) {
        obj.country = country;
      }
      if (admin1) {
        obj.admin1 = admin1;
      }
      obj.tokens = Array.from(new Set(res.asciiname.split(' ').concat(admin1.split(' '), country.split(' '))));
      return obj;
    });
    if (items.length) {
      ctx.body = items;
    } else {
      ctx.status = 404;
      ctx.body = NOTFOUND;
    }
  }
}
