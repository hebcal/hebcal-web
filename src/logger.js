import pino from 'pino';
import mmh3 from 'murmurhash3';
import util from 'util';
import {matomoTrack} from './matomoTrack';

// return array that have 4 elements of 32bit integer
const murmur128 = util.promisify(mmh3.murmur128);

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
 * @param {string} val
 * @return {boolean}
 */
function empty(val) {
  return typeof val !== 'string' || val.length === 0;
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 * @return {Object}
 */
function makeLogInfo(ctx) {
  const info = {
    status: ctx.response.status,
    length: ctx.response.length,
    duration: Date.now() - ctx.state.startTime,
    ip: ctx.get('x-client-ip') || ctx.request.ip,
    method: ctx.request.method,
    url: ctx.request.originalUrl,
    ua: ctx.get('user-agent'),
    vid: ctx.state.visitorId,
  };
  if (typeof info.length !== 'number') {
    delete info.length;
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
    ctx.state.visitorId = await getVisitorId(ctx);
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
    if (ctx && ctx.status != 404 && ctx.status != 200) {
      const obj = Object.assign(err, makeLogInfo(ctx));
      if (ctx.status < 500) {
        logger.warn(obj);
      } else {
        logger.error(obj);
      }
    }
    if (ctx && ctx.status && ctx.status != 200) {
      matomoTrack(ctx, 'Error', ctx.status, ctx.request.path);
    }
  };
}

/**
 * @private
 * @param {any} ctx
 * @return {string}
 */
async function getVisitorId(ctx) {
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
  const vid = await makeUuid(ipAddress, userAgent, ctx.get('accept-language'));
  return vid;
}

/**
 * @private
 * @param {string} ipAddress
 * @param {string} userAgent
 * @param {string} acceptLanguage
 * @return {string}
 */
async function makeUuid(ipAddress, userAgent, acceptLanguage) {
  const raw = await murmur128(ipAddress + userAgent + acceptLanguage);
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
