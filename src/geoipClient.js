import http from 'node:http';

/**
 * Client for the hebcal-geoip2 microservice (https://github.com/hebcal/hebcal-geoip2).
 *
 * The service memory-maps GeoLite2-City.mmdb and answers
 * `GET /lookup?ip=<addr>` with the same subset of the MaxMind City record that
 * the in-process `maxmind` library used to return. We keep this out of the
 * Node.js process so we don't hold the ~63 MB database in the heap; the
 * trade-off is a ~0.2-0.5 ms loopback round-trip on the few routes that need
 * GeoIP (homepage, bare /shabbat, etc.).
 *
 * By default we talk to the service over a Unix domain socket. If the service
 * is slow to accept a connection (or down), we fail fast and the caller falls
 * back to {geo:'none'}.
 */

/**
 * @typedef {Object} GeoipClientOptions
 * @property {string} [socketPath] Unix domain socket path (default
 *   /run/hebcal-geoip2/geoip2.sock). Ignored when host is set.
 * @property {string} [host] TCP host (use instead of a socket, e.g. a service
 *   on another host in the same VPC).
 * @property {number} [port] TCP port (default 8090) when host is set.
 * @property {number} [connectTimeout] ms to wait for the connection to be
 *   established before giving up (default 20).
 * @property {number} [requestTimeout] ms overall guard once connected, in case
 *   the service accepts but stalls (default 250).
 * @property {any} [logger] optional pino-style logger for debug diagnostics.
 */

/**
 * @param {GeoipClientOptions} [opts]
 * @return {{lookup: (ip: string) => Promise<any>, agent: http.Agent}}
 */
export function makeGeoipClient(opts = {}) {
  const {
    socketPath = '/run/hebcal-geoip2/geoip2.sock',
    host,
    port = 8090,
    connectTimeout = 20,
    requestTimeout = 250,
    logger,
  } = opts;
  const useTcp = typeof host === 'string' && host.length > 0;
  const agent = new http.Agent({keepAlive: true, maxSockets: 64, maxFreeSockets: 16});

  /**
   * Look up an IP address. Resolves to the MaxMind record subset, or null when
   * the address is unknown, the input is empty, or the service is unreachable /
   * too slow. Never rejects: GeoIP is best-effort.
   * @param {string} ip
   * @return {Promise<any>}
   */
  function lookup(ip) {
    return new Promise((resolve) => {
      if (!ip) {
        resolve(null);
        return;
      }
      const reqOpts = {
        agent,
        method: 'GET',
        path: `/lookup?ip=${encodeURIComponent(ip)}`,
        headers: {host: 'geoip', connection: 'keep-alive'},
        timeout: requestTimeout,
      };
      if (useTcp) {
        reqOpts.host = host;
        reqOpts.port = port;
      } else {
        reqOpts.socketPath = socketPath;
      }

      let settled = false;
      const finish = (val) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(connectTimer);
        resolve(val);
      };

      const req = http.request(reqOpts, (res) => {
        if (res.statusCode !== 200) {
          // 204 (not found), 4xx, 5xx -> treat as no result
          res.resume();
          finish(null);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            finish(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (err) {
            logger?.debug?.({err}, 'geoip: bad JSON from service');
            finish(null);
          }
        });
        res.on('error', () => finish(null));
      });

      // Connect timeout: arm a short timer, cleared once the socket is
      // actually connected. A reused keep-alive socket is already connected.
      const connectTimer = setTimeout(() => {
        logger?.debug?.('geoip: connect timeout');
        req.destroy(new Error('geoip connect timeout'));
        finish(null);
      }, connectTimeout);

      req.on('socket', (socket) => {
        if (socket.connecting) {
          socket.once('connect', () => clearTimeout(connectTimer));
        } else {
          clearTimeout(connectTimer);
        }
      });
      req.on('timeout', () => {
        req.destroy(new Error('geoip request timeout'));
        finish(null);
      });
      req.on('error', (err) => {
        // ECONNREFUSED, ENOENT (socket missing), aborts, etc.
        logger?.debug?.({err}, 'geoip: request error');
        finish(null);
      });
      req.end();
    });
  }

  return {lookup, agent};
}
