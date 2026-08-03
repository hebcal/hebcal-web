import {GeoDb} from '@hebcal/geo-sqlite';
import fs from 'node:fs';
import ini from 'ini';
import Koa from 'koa';
import compress from 'koa-compress';
import timeout from 'koa-timeout-v2';
import xResponseTime from 'koa-better-response-time';
import zlib from 'node:zlib';
import os from 'node:os';
import {join} from 'node:path';
import {makeLogger, errorLogger, accessLogger, makeLogInfo} from './logger.js';
import {MysqlDb} from './db.js';
import promClient from 'prom-client';

// Collect Node.js default metrics (event-loop lag percentiles, the
// nodejs_gc_duration_seconds histogram, heap usage, etc.) into the default
// registry. Done once at module load: this module is cached, and in production
// www and download run as separate processes so each gets its own collector.
promClient.collectDefaultMetrics();

/**
 * Directory for log files (and the koa.pid file) in production.
 */
export const logDir = process.env.NODE_ENV === 'production' ? '/var/log/hebcal' : '.';

/**
 * Creates a Koa app and attaches the shared logger, parsed INI config,
 * GeoDb and MySQL connection pool to `app.context`.
 * @return {Koa}
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

  return app;
}

const HOSTNAME = os.hostname();

/**
 * Sets an `X-Backend` response header naming the host that served the
 * request, so a response can be traced back to a specific backend server.
 * Register this first so the header is present even on responses that
 * short-circuit later middleware (errors, redirects, /metrics).
 * @param {Koa} app
 */
export function useBackendHostname(app) {
  app.use(async function backendHostname(ctx, next) {
    ctx.set('X-Backend', HOSTNAME);
    try {
      await next();
    } catch (err) {
      // Koa's default error handler removes every response header before it
      // writes the error body, then re-applies `err.headers`. Stash the
      // hostname there so it survives on uncaught-error responses too.
      err.headers = {...err.headers, 'X-Backend': HOSTNAME};
      throw err;
    }
  });
}

/**
 * Registers response-time tracking, access/error logging, and Prometheus
 * HTTP request metrics.
 * @param {Koa} app
 */
export function useObservability(app) {
  const logger = app.context.logger;
  app.use(xResponseTime());
  app.use(accessLogger(logger));
  app.on('error', errorLogger(logger));

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
  app.use(async function metricsEndpoint(ctx, next) {
    if (ctx.path === '/metrics' && ctx.method === 'GET') {
      ctx.set('Content-Type', promClient.register.contentType);
      ctx.body = await promClient.register.metrics();
      return;
    }
    await next();
  });
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
 * Avoids setting Vary: Accept-Encoding for uncompressed responses.
 * @param {Koa} app
 * @param {{brotliQuality: number, zstdLevel: number}} opts
 */
export function useCompression(app, {brotliQuality, zstdLevel}) {
  app.use(async function noVaryOnUncompressed(ctx, next) {
    await next();
    const vary = ctx.response.get('Vary');
    const enc = ctx.response.get('Content-Encoding');
    const type = ctx.response.type;
    if (vary && !enc && type === 'application/json' &&
        vary.toLowerCase().includes('accept-encoding')) {
      // Filter out 'Accept-Encoding' and rejoin the remaining headers
      const headers = vary.split(',').map((h) => h.trim())
          .filter((h) => h.toLowerCase() !== 'accept-encoding');
      if (headers.length) {
        ctx.set('Vary', headers.join(', '));
      } else {
        ctx.remove('Vary');
      }
    }
  });

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
 * @param {number} defaultPort
 */
export function startServer(app, defaultPort) {
  const logger = app.context.logger;
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
