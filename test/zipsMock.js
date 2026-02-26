import Database from 'better-sqlite3';

const INSERT_SQL =
  'INSERT INTO ZIPCodes_Primary' +
  ' (ZipCode,CityMixedCase,State,Latitude,Longitude,Elevation,TimeZone,DayLightSaving,Population)' +
  ' VALUES (?,?,?,?,?,?,?,?,?)';

const SELECT_SQL =
  'SELECT ZipCode,CityMixedCase,State,Latitude,Longitude,Elevation,' +
  'TimeZone,DayLightSaving,Population' +
  ' FROM ZIPCodes_Primary WHERE ZipCode = ?';

const defaultRows = [
  // TimeZone is hours-west (positive integer), e.g. 8 = Pacific, 5 = Eastern
  ['90210', 'Beverly Hills', 'CA', 34.1031, -118.4163, 219, '8', 'Y', 21134],
];

/**
 * Injects an in-memory SQLite ZIPs database into a GeoDb instance.
 * Returns a teardown function that restores the original database.
 *
 * @param {import('@hebcal/geo-sqlite').GeoDb} geoDb
 * @param {Array[]} rows - Optional array of ZIP rows to insert (defaults to 90210 Beverly Hills)
 * @return {Function} teardown - Call in afterAll() to restore the real database
 */
export function injectZipsMock(geoDb, rows = defaultRows) {
  const origZipsDb = geoDb.zipsDb;
  const origZipStmt = geoDb.zipStmt;
  const origZipCache = geoDb.zipCache;

  const mockDb = new Database(':memory:');
  mockDb.exec(`
    CREATE TABLE ZIPCodes_Primary (
      ZipCode TEXT PRIMARY KEY,
      CityMixedCase TEXT NOT NULL,
      State TEXT NOT NULL,
      Latitude REAL NOT NULL,
      Longitude REAL NOT NULL,
      Elevation REAL,
      TimeZone TEXT NOT NULL,
      DayLightSaving TEXT NOT NULL,
      Population INTEGER
    )
  `);
  const insertStmt = mockDb.prepare(INSERT_SQL);
  for (const row of rows) {
    insertStmt.run(row);
  }

  geoDb.zipsDb = mockDb;
  geoDb.zipStmt = mockDb.prepare(SELECT_SQL);
  geoDb.zipCache = new Map();

  return function teardown() {
    geoDb.zipsDb = origZipsDb;
    geoDb.zipStmt = origZipStmt;
    geoDb.zipCache = origZipCache;
    mockDb.close();
  };
}
