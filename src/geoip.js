import {makeGeoipClient} from './geoipClient.js';

/**
 * Configures the GeoIP client used by getLocationFromGeoIp().
 *
 * Historically we opened GeoLite2-City.mmdb in-process via the `maxmind`
 * package, which held the entire ~63 MB database in the heap for the life of
 * the process even though fewer than ~1 in 500 requests need a GeoIP lookup.
 * We now delegate the lookup to the standalone hebcal-geoip2 microservice
 * (which mmaps the database, so its resident memory is a few MB) and talk to
 * it over a Unix domain socket. See src/geoipClient.js.
 *
 * Config (hebcal-dot-com.ini):
 *   hebcal.geoip.socket   path to the unix socket
 *                         (default /run/hebcal-geoip2/geoip2.sock)
 *   hebcal.geoip.host     optional TCP host instead of a socket (e.g. for a
 *                         service running on another host in the VPC)
 *   hebcal.geoip.port     optional TCP port (default 8090) when host is set
 *
 * @param {import('koa').Application} app
 */
export function setupGeoIp(app) {
  const logger = app.context.logger;
  const iniConfig = app.context.iniConfig;
  const socketPath = iniConfig['hebcal.geoip.socket'] || '/run/hebcal-geoip2/geoip2.sock';
  const host = iniConfig['hebcal.geoip.host'];
  const port = iniConfig['hebcal.geoip.port'];
  app.context.geoipClient = makeGeoipClient({socketPath, host, port, logger});
  if (host) {
    logger.info(`GeoIP lookups via hebcal-geoip2 at ${host}:${port || 8090}`);
  } else {
    logger.info(`GeoIP lookups via hebcal-geoip2 at ${socketPath}`);
  }
}
