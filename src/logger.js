import pino from 'pino';
import {empty} from './empty.js';
import {getIpAddress} from './getIpAddress.js';
import {matomoTrack} from './matomoTrack.js';

/**
 * @private
 * @param {string} logDir
 * @return {pino.Logger}
 */
export function makeLogger(logDir) {
  const transport = pino.transport({
    target: 'pino/file',
    level: process.env.NODE_ENV == 'production' ? 'info' : 'debug',
    options: {destination: logDir + '/access.log'},
  });
  const logger = pino(transport);

  function handler(err, evt) {
    const msg = `Koa server caught ${evt}; exiting...`;
    console.log(msg);
    logger.info(msg);
    if (err) {
      console.log(err);
      logger.fatal(err, 'error caused exit');
    }
    // eslint-disable-next-line n/no-process-exit
    process.exit(err ? 1 : 0);
  }

  // catch all the ways node might exit
  process.on('beforeExit', () => handler(null, 'beforeExit'));
  process.on('uncaughtException', (err) => handler(err, 'uncaughtException'));
  process.on('unhandledRejection', (err) => handler(err, 'unhandledRejection'));
  process.on('SIGINT', () => handler(null, 'SIGINT'));
  process.on('SIGQUIT', () => handler(null, 'SIGQUIT'));
  process.on('SIGTERM', () => handler(null, 'SIGTERM'));

  return logger;
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 * @return {Object}
 */
export function makeLogInfo(ctx) {
  const status = ctx.response.status;
  const info = {
    status: status,
    length: ctx.response.length,
    duration: Date.now() - ctx.state.startTime,
    ip: getIpAddress(ctx),
    method: ctx.request.method,
    url: ctx.request.originalUrl,
    ua: ctx.get('user-agent'),
  };
  if (typeof info.length !== 'number') {
    delete info.length;
  }
  const ims = ctx.get('if-modified-since');
  if (!empty(ims)) {
    info.ims = ims;
  }
  const lastModified = ctx.lastModified;
  if (lastModified) {
    info.lm = lastModified.toUTCString();
  }
  const inm = ctx.get('if-none-match');
  if (!empty(inm)) info.inm = inm;
  const ref = ctx.get('referer');
  if (!empty(ref)) info.ref = ref;
  const cookie = ctx.get('cookie');
  if (!empty(cookie)) info.cookie = cookie;
  const enc = ctx.response.get('content-encoding');
  if (!empty(enc)) info.enc = enc;
  if (ctx.state.timeout === true) {
    info.timeout = true;
  }
  if (typeof ctx.request.body === 'object' && Object.keys(ctx.request.body).length !== 0) {
    info.postBody = ctx.request.body;
  }
  if (ctx.state.logQuery) {
    const query = ctx.request.query;
    const qkeys = Object.keys(query);
    if (qkeys.length !== 0) {
      const q = {...query};
      for (const key of qkeys) {
        if (q[key].length === 0 || key.startsWith('utm_')) {
          delete q[key];
        }
      }
      info.q = q;
    }
  }
  if (typeof ctx.state.geoip === 'object') {
    const geoip = info.geoip = ctx.state.geoip;
    if (typeof geoip.details === 'object') {
      for (const val of Object.values(geoip.details)) {
        delete val.names;
      }
      if (Array.isArray(geoip.details.subdivisions)) {
        for (const subdivision of geoip.details.subdivisions) {
          delete subdivision.names;
        }
      }
    }
  }
  if (ctx.state.mysqlQuery && status !== 200) {
    info.sql = ctx.state.mysqlQuery;
  }
  return info;
}

/**
 * Middleware for logging requests to access.log
 * @param {pino.Logger} logger
 * @return {function}
 */
export function accessLogger(logger) {
  return async function accessLog(ctx, next) {
    ctx.state.startTime = Date.now();
    await next();
    logger.info(makeLogInfo(ctx));
  };
}

/**
 * Middleware for `app.on('error', errorLogger(logger))`
 * @param {pino.Logger} logger
 * @return {function}
 */
export function errorLogger(logger) {
  return function errorLog(err, ctx) {
    const status = typeof err?.status === 'number' ? err.status : ctx?.status;
    if (status === 200 || status === 404 || !ctx) {
      return;
    }
    const obj = Object.assign(err, makeLogInfo(ctx));
    if (status < 500) {
      logger.warn(obj);
    } else {
      logger.error(obj);
      if (ctx.request.query?.cfg !== 'json') {
        matomoTrack(ctx, 'Error', status, err?.message);
      }
    }
  };
}
