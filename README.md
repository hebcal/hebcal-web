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

Then, make sure to copy the geonames.sqlite3 and zips.sqlite3 into path.


3. Make sure you have hebcal-dot-com.ini in path as well. You can just create an empty file

```bash
touch hebcal-dot-com.ini
```

4. Run the dev server

```bash
npm run dev
```
