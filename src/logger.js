import pino from 'pino';
import {murmur128Sync} from 'murmurhash3';
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

  // eslint-disable-next-line require-jsdoc
  function handler(err, evt) {
    const msg = `Koa server caught ${evt}; exiting...`;
    console.log(msg);
    logger.info(msg);
    if (err) {
      console.log(err);
      logger.fatal(err, 'error caused exit');
    }
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
  const info = {
    status: ctx.response.status,
    length: ctx.response.length,
    duration: Date.now() - ctx.state.startTime,
    ip: getIpAddress(ctx),
    method: ctx.request.method,
    url: ctx.request.originalUrl,
    ua: ctx.get('user-agent'),
    vid: ctx.state.visitorId,
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
      const q = Object.assign({}, query);
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
  if (ctx.state.mysqlQuery) {
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
    ctx.state.visitorId = getVisitorId(ctx);
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
    }
    if (ctx.request.query?.cfg !== 'json') {
      matomoTrack(ctx, 'Error', status, err?.message, {
        url: ctx.request.href,
      });
    }
  };
}

/**
 * @private
 * @param {any} ctx
 * @return {string}
 */
function getVisitorId(ctx) {
  const str = ctx.cookies.get('C');
  if (str) {
    const cookie = new URLSearchParams(str);
    if (cookie.has('uid')) {
      const uid = cookie.get('uid');
      ctx.state.userId = uid;
      return uid;
    }
  }
  const userAgent = ctx.get('user-agent');
  const ipAddress = ctx.get('x-client-ip') || ctx.request.ip;
  const vid = makeUuid(ipAddress, userAgent, ctx.get('accept-language'));
  return vid;
}

/**
 * @private
 * @param {string} ipAddress
 * @param {string} userAgent
 * @param {string} acceptLanguage
 * @return {string}
 */
function makeUuid(ipAddress, userAgent, acceptLanguage) {
  const raw = murmur128Sync(ipAddress + userAgent + acceptLanguage);
  const buf32 = new Uint32Array(raw);
  const bytes = new Uint8Array(buf32.buffer);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  let digest = '';
  for (let i = 0; i < 16; i++) {
    digest += bytes[i].toString(16).padStart(2, '0');
    switch (i) {
      case 3:
      case 5:
      case 7:
      case 9:
        digest += '-';
        break;
      default:
        break;
    }
  }
  return digest;
}

const units = ['bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];

/**
 * @param {number} num
 * @return {string}
 */
export function niceBytes(num) {
  let l = 0;
  let n = parseInt(num, 10) || 0;
  while (n >= 1024 && ++l) {
    n = n / 1024;
  }
  return (n.toFixed(n < 10 && l > 0 ? 1 : 0) + ' ' + units[l]);
}

/**
 * @param {pino.Logger} logger
 */
export function logMemoryUsage(logger) {
  const memoryUsage = process.memoryUsage();
  const heapTotal = niceBytes(memoryUsage.heapTotal);
  const heapUsed = niceBytes(memoryUsage.heapUsed);
  logger.info(`heap ${heapTotal} total, ${heapUsed} used`);
}
