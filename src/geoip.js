import maxmind from 'maxmind';

export function openGeoIpDbs(app) {
  const logger = app.context.logger;
  const iniConfig = app.context.iniConfig;
  const geoipDir = iniConfig['hebcal.geoip.dir'] || '/var/lib/GeoIP';
  setImmediate(async () => {
    const geoipCountryMmdbPath = `${geoipDir}/GeoLite2-Country.mmdb`;
    logger.info(`Opening ${geoipCountryMmdbPath}`);
    try {
      app.context.geoipCountry = await maxmind.open(geoipCountryMmdbPath);
    } catch (err) {
      logger.error(err, `while opening ${geoipCountryMmdbPath}`);
    }
  });

  setImmediate(async () => {
    const geoipCityMmdbPath = `${geoipDir}/GeoLite2-City.mmdb`;
    logger.info(`Opening ${geoipCityMmdbPath}`);
    try {
      app.context.geoipCity = await maxmind.open(geoipCityMmdbPath);
    } catch (err) {
      logger.error(err, `while opening ${geoipCityMmdbPath}`);
    }
  });
}
