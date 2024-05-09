import mysql from 'mysql2';
import createError from 'http-errors';

/** Represents a MySQL database pool */
export class MysqlDb {
  /**
   * We let this function throw an error instead of trying to handle ourselves.
   * @param {any} logger
   * @param {Object<string,string>} iniConfig
   */
  constructor(logger, iniConfig) {
    const host = iniConfig['hebcal.mysql.host'];
    const port = +(iniConfig['hebcal.mysql.port']) || 3306;
    const user = iniConfig['hebcal.mysql.user'];
    const password = iniConfig['hebcal.mysql.password'];
    const database = iniConfig['hebcal.mysql.dbname'];
    const connURL = `mysql://${user}@${host}:${port}/${database}`;
    logger.info(`Connecting to ${connURL}`);
    const pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      connectionLimit: 10,
      waitForConnections: true,
      queueLimit: 0,
    });
    pool.getConnection(function(err, connection) {
      if (err) {
        logger.error(err, `Cannot connect to ${connURL}`);
      }
    });
    this.pool = pool.promise();
  }
  /** */
  async query(...params) {
    try {
      const [rows] = await this.pool.query(...params);
      return rows;
    } catch (err) {
      throw createError(503, err, {expose: true});
    }
  }
  /** */
  async execute(...params) {
    try {
      const [rows] = await this.pool.execute(...params);
      return rows;
    } catch (err) {
      throw createError(503, err, {expose: true});
    }
  }
  /** */
  async close() {
  }
}
