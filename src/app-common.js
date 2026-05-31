import {GeoDb} from '@hebcal/geo-sqlite';
import fs from 'node:fs';
import ini from 'ini';
import Koa from 'koa';
import compress from 'koa-compress';
import timeout from 'koa-timeout-v2';
import xResponseTime from 'koa-better-response-time';
import zlib from 'node:zlib';
import {join} from 'node:path';
import {makeLogger, errorLogger, accessLogger, makeLogInfo} from './logger.js';
import {MysqlDb} from './db.js';
import prometheus from '@echo-health/koa-prometheus-exporter';

/**
 * Directory for log files (and the koa.pid file) in production.
 */
export const logDir = process.env.NODE_ENV === 'production' ? '/var/log/hebcal' : '.';

/**
 * Creates a Koa app and attaches the shared logger, parsed INI config,
 * GeoDb and MySQL connection pool to `app.context`.
 * @return {{app: Koa, logger: any}}
 */
export function createBaseApp() {
  const app = new Koa();

  const logger = makeLogger(logDir);
  logger.info('Koa server: starting up');
  app.context.logger = logger;

  const iniDir = process.env.NODE_ENV === 'production' ? '/etc' : '.';
  const iniPath = join(iniDir, 'hebcal-dot-com.ini');
  app.context.iniConfig = ini.parse(fs.readFileSync(iniPath, 'utf-8'));

  app.context.db = new GeoDb(logger, 'zips.sqlite3', 'geonames.sqlite3');
  app.context.mysql = new MysqlDb(logger, app.context.iniConfig);

  return {app, logger};
}

/**
 * Registers response-time tracking, access/error logging, and Prometheus
 * HTTP request metrics.
 * @param {Koa} app
 * @param {any} logger
 */
export function useObservability(app, logger) {
  app.use(xResponseTime());
  app.use(accessLogger(logger));
  app.on('error', errorLogger(logger));

  const promClient = prometheus.client;
  const httpRequestsTotal = new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'status'],
  });
  app.use(async function httpMetricMiddleware(ctx, next) {
    await next();
    httpRequestsTotal
        .labels(ctx.request.method, ctx.response.status)
        .inc();
  });
  app.use(prometheus.middleware({}));
}

/**
 * Registers the 8-second request timeout middleware.
 * @param {Koa} app
 */
export function useTimeout(app) {
  app.use(timeout(8000, {
    status: 503,
    message: 'Service Unavailable',
    callback: function(ctx) {
      const logInfo = makeLogInfo(ctx);
      logInfo.status = 503;
      ctx.logger.warn(logInfo);
    },
  }));
}

/**
 * Registers gzip/brotli/zstd response compression.
 * @param {Koa} app
 * @param {{brotliQuality: number, zstdLevel: number}} opts
 */
export function useCompression(app, {brotliQuality, zstdLevel}) {
  app.use(compress({
    gzip: true,
    deflate: false,
    br: {
      params: {
        [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
        [zlib.constants.BROTLI_PARAM_QUALITY]: brotliQuality,
      },
    },
    zstd: {
      params: {
        // eslint-disable-next-line n/no-unsupported-features/node-builtins
        [zlib.constants.ZSTD_c_compressionLevel]: zstdLevel,
      },
    },
  }));
}

/**
 * Records the response body length on `ctx.state.responseLength` for
 * successful (200) responses.
 * @param {Koa} app
 */
export function useResponseLength(app) {
  app.use(async function responseLength(ctx, next) {
    await next();
    const length = ctx.length;
    if (ctx.status === 200 && typeof length === 'number') {
      ctx.state.responseLength = length;
    }
  });
}

/**
 * Writes the PID file (in production), ignores SIGHUP, and starts listening.
 * Call this from inside the `import.meta.url === file://...` guard of the
 * entry-point file so the server only starts when run directly.
 * @param {Koa} app
 * @param {any} logger
 * @param {number} defaultPort
 */
export function startServer(app, logger, defaultPort) {
  if (process.env.NODE_ENV === 'production') {
    fs.writeFileSync(logDir + '/koa.pid', String(process.pid));
    process.on('SIGHUP', () => logger.info('Ignoring SIGHUP'));
  }

  const port = process.env.NODE_PORT || defaultPort;
  app.listen(port, () => {
    const msg = 'Koa server listening on port ' + port;
    logger.info(msg);
    console.log(msg);
  });
}

export function stopIfTimedOut() {
  return async function stopIfTimedOut0(ctx, next) {
    if (!ctx.state.timeout) {
      await next();
    }
  };
}
