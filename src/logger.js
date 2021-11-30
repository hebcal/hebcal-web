import pino from 'pino';

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
  if (typeof ctx.state.geoip === 'object') {
    const geoip = info.geoip = ctx.state.geoip;
    if (typeof geoip.details === 'object') {
      for (const val of Object.values(geoip.details)) {
        delete val.names;
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
