# hebcal-web
Web server for Hebcal.com
* www.hebcal.com (Hebrew Date Converter, Yahrzeit, Shabbat, etc)
* download.hebcal.com to export iCalendar, PDF and CSV

## Running dev server

1. First install the dependencies
```bash
npm install
```

2. Then, make sure you have geonames.sqlite3 and zips.sqlite3 dbs in path.
You can get it by cloning following cloning and following the instructions at:
https://github.com/hebcal/hebcal-geo-sqlite

or just:

```bash
npm install @hebcal/geo-sqlite
./node_modules/.bin/download-and-make-dbs
```

Then, make sure to have the geonames.sqlite3 and zips.sqlite3 in path.


3. Make sure you have hebcal-dot-com.ini in path as well. You can just create an empty file

```bash
touch hebcal-dot-com.ini
```

4. Generate PO files:

```bash
npm run build
```

5. Run the dev server

```bash
npm run dev
```
