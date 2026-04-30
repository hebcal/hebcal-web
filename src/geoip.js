import maxmind from 'maxmind';

const openOpts = {
  watchForUpdates: true,
  watchForUpdatesNonPersistent: false,
};

export function openGeoIpDbs(app) {
  const logger = app.context.logger;
  const iniConfig = app.context.iniConfig;
  // On Linux the GeoIP databases are installed in /var/lib/GeoIP
  // but on macOS, they are installed by Homebrew in /opt/homebrew/var/GeoIP
  // Allow the location to be overridden by the ini file
  const geoipDir = iniConfig['hebcal.geoip.dir'] || '/var/lib/GeoIP';
  setImmediate(async () => {
    const geoipCountryMmdbPath = `${geoipDir}/GeoLite2-Country.mmdb`;
    logger.info(`Opening ${geoipCountryMmdbPath}`);
    try {
      app.context.geoipCountry = await maxmind.open(geoipCountryMmdbPath, openOpts);
    } catch (err) {
      logger.error(err, `while opening ${geoipCountryMmdbPath}`);
    }
  });

  setImmediate(async () => {
    const geoipCityMmdbPath = `${geoipDir}/GeoLite2-City.mmdb`;
    logger.info(`Opening ${geoipCityMmdbPath}`);
    try {
      app.context.geoipCity = await maxmind.open(geoipCityMmdbPath, openOpts);
    } catch (err) {
      logger.error(err, `while opening ${geoipCityMmdbPath}`);
    }
  });
}
