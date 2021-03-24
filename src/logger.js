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
