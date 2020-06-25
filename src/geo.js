import Database from 'better-sqlite3';
import {Location} from '@hebcal/core';
import city2geonameid from './city2geonameid.json';

const GEONAME_SQL = `SELECT
  g.name as name,
  g.asciiname as asciiname,
  g.country as cc,
  c.country as country,
  a.asciiname as admin1,
  g.latitude as latitude,
  g.longitude as longitude,
  g.timezone as timezone
FROM geoname g
LEFT JOIN country c on g.country = c.iso
LEFT JOIN admin1 a on g.country||'.'||g.admin1 = a.key
WHERE g.geonameid = ?
`;

const ZIPCODE_SQL = `SELECT CityMixedCase,State,Latitude,Longitude,TimeZone,DayLightSaving
FROM ZIPCodes_Primary WHERE ZipCode = ?`;

/** Wrapper around sqlite databases */
export class GeoDb {
  /**
   * @param {any} logger
   * @param {string} zipsFilename
   * @param {string} geonamesFilename
   */
  constructor(logger, zipsFilename, geonamesFilename) {
    this.logger = logger;
    logger.info(`Opening ${zipsFilename}...`);
    this.zipsDb = new Database(zipsFilename, {fileMustExist: true});
    logger.info(`Opening ${geonamesFilename}...`);
    this.geonamesDb = new Database(geonamesFilename, {fileMustExist: true});
    this.zipStmt = this.zipsDb.prepare(ZIPCODE_SQL);
    this.geonamesStmt = this.geonamesDb.prepare(GEONAME_SQL);
  }

  /** Closes database handles */
  close() {
    this.zipsDb.close();
    this.geonamesDb.close();
  }

  /**
   * @param {string} zip
   * @return {Location}
   */
  lookupZip(zip) {
    const result = this.zipStmt.get(zip);
    if (!result) {
      this.logger.warn(`unknown zipcode=${zip}`);
      return null;
    } else if (!result.Latitude && !result.Longitude) {
      this.logger.warn(`zero lat/long zipcode=${zip}`);
      return null;
    }
    const tzid = Location.getUsaTzid(result.State, result.TimeZone, result.DayLightSaving);
    const cityDescr = `${result.CityMixedCase}, ${result.State} ${zip}`;
    return new Location(result.Latitude, result.Longitude, false, tzid, cityDescr, 'US', zip);
  }

  /**
   * @param {number} geonameid
   * @return {Location}
   */
  lookupGeoname(geonameid) {
    const result = this.geonamesStmt.get(geonameid);
    if (!result) {
      this.logger.warn(`unknown geonameid=${geonameid}`);
      return null;
    }
    const country = result.country || '';
    const admin1 = result.admin1 || '';
    const cityDescr = Location.geonameCityDescr(result.asciiname, admin1, country);
    const location = new Location(
        result.latitude,
        result.longitude,
        result.cc == 'IL',
        result.timezone,
        cityDescr,
        result.cc,
        geonameid,
    );
    if (result.cc == 'IL' && admin1.startsWith('Jerusalem') && result.name.startsWith('Jerualem')) {
      location.jersualem = true;
    }
    return location;
  }

  /**
   * @param {string} cityName
   * @return {Location}
   */
  lookupLegacyCity(cityName) {
    cityName = cityName.replace(/\+/g, ' ');
    const geonameid = city2geonameid[cityName];
    if (geonameid) {
      return this.lookupGeoname(geonameid);
    } else {
      this.logger.warn(`unknown city=${cityName}`);
      return null;
    }
  }
}
