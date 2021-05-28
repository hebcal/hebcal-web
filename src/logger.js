import pino from 'pino';

/**
 * @typedef {Object} MakeLoggerResult
 * @property {pino.Logger} logger
 * @property {SonicBoom} dest
 * @private
 */

/**
 * @private
 * @param {string} logDir
 * @return {MakeLoggerResult}
 */
export function makeLogger(logDir) {
  const dest = pino.destination({
    dest: logDir + '/access.log',
    minLength: 8192, // Buffer before writing
    sync: false, // Asynchronous logging
  });
  const logger = pino({
    level: process.env.NODE_ENV == 'production' ? 'info' : 'debug',
  }, dest);

  // asynchronously flush every 2 seconds to keep the buffer empty
  // in periods of low activity
  setInterval(() => {
    logger.flush();
  }, 2000).unref();

  // use pino.final to create a special logger that
  // guarantees final tick writes
  const handler = pino.final(logger, (err, finalLogger, evt) => {
    const msg = `Koa server caught ${evt}; exiting...`;
    console.log(msg);
    if (err) {
      console.log(err);
    }
    finalLogger.info(msg);
    if (err) finalLogger.fatal(err, 'error caused exit');
    process.exit(err ? 1 : 0);
  });

  // catch all the ways node might exit
  process.on('beforeExit', () => handler(null, 'beforeExit'));
  process.on('uncaughtException', (err) => handler(err, 'uncaughtException'));
  process.on('unhandledRejection', (err) => handler(err, 'unhandledRejection'));
  process.on('SIGINT', () => handler(null, 'SIGINT'));
  process.on('SIGQUIT', () => handler(null, 'SIGQUIT'));
  process.on('SIGTERM', () => handler(null, 'SIGTERM'));

  return {logger, dest};
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
  const ref = ctx.get('referer');
  if (!empty(ref)) info.ref = ref;
  const cookie = ctx.get('cookie');
  if (!empty(cookie)) info.cookie = cookie;
  const enc = ctx.response.get('content-encoding');
  if (!empty(enc)) info.enc = enc;
  if (ctx.state.timeout === true) {
    info.timeout = true;
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
    if (ctx && ctx.status != 404 && ctx.status != 200) {
      const visitor = ctx.state.visitor;
      const obj = Object.assign(err, makeLogInfo(ctx));
      const message = err.message || err.msg;
      const params = {
        ec: ctx.status < 500 ? 'warning' : 'error',
        ea: `http${ctx.status}`,
        ev: ctx.status,
        el: message,
        p: ctx.request.path,
      };
      if (ctx.status < 500) {
        logger.warn(obj);
        if (visitor) {
          visitor.event(params).send();
        }
      } else {
        logger.error(obj);
        if (visitor) {
          visitor.event(params).exception(message).send();
        }
      }
    }
  };
}
