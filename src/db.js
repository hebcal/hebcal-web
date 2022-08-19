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
    const user = iniConfig['hebcal.mysql.user'];
    const password = iniConfig['hebcal.mysql.password'];
    const database = iniConfig['hebcal.mysql.dbname'];
    logger.info(`Connecting to mysql://${user}@${host}/${database}`);
    const pool = mysql.createPool({
      host,
      user,
      password,
      database,
      connectionLimit: 5,
      waitForConnections: true,
      queueLimit: 0,
    });
    this.pool = pool.promise();
  }
  /** */
  async query(...params) {
    try {
      const [rows, fields] = await this.pool.query(...params);
      return rows;
    } catch (err) {
      throw createError(503, err, {expose: true});
    }
  }
  /** */
  async execute(...params) {
    try {
      const [rows, fields] = await this.pool.execute(...params);
      return rows;
    } catch (err) {
      throw createError(503, err, {expose: true});
    }
  }
  /** */
  async close() {
  }
}
