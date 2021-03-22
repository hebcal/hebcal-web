import mysql from 'mysql2';

/** Represents a MySQL database pool */
export class MysqlDb {
  /**
   * We let this function throw an error instead of trying to handle ourselves.
   * @param {any} logger
   * @param {any} iniConfig
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
    const [rows, fields] = await this.pool.query(...params);
    return rows;
  }
  /** */
  async execute(...params) {
    const [rows, fields] = await this.pool.execute(...params);
    return rows;
  }
  /** */
  async close() {
  }
}
