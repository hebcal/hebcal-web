import mysql from 'mysql2';
import util from 'util';

/**
 * Wraps a MySQL connection in promises
 * @param {Object} iniConfig
 * @return {Object}
 */
export function makeDb(iniConfig) {
  const connection = mysql.createConnection({
    host: iniConfig['hebcal.mysql.host'],
    user: iniConfig['hebcal.mysql.user'],
    password: iniConfig['hebcal.mysql.password'],
    database: iniConfig['hebcal.mysql.dbname'],
  });
  connection.connect(function(err) {
    if (err) {
      throw err;
    }
  });
  const connQuery = util.promisify(connection.query);
  const connEnd = util.promisify(connection.end);
  return {
    query(sql, args) {
      return connQuery.call(connection, sql, args);
    },
    close() {
      return connEnd.call(connection);
    },
  };
}
