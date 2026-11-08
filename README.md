# hebcal-web
Web server for Hebcal.com
* www.hebcal.com (Hebrew Date Converter, Yahrzeit, Shabbat, etc)
* download.hebcal.com to export iCalendar and CSV
  (PDF export has moved to [hebcal-api-go](https://github.com/hebcal/hebcal-api-go))

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

6. (Optional) If you want to test `download.hebcal.com` equivalent pages, run:

```bash
npm run dev:download
```

## Regenerating critical CSS (rare)

Four pages (converter, holiday year index, holiday detail, `/hebcal` results)
inline above-the-fold CSS from `views/partials/critical-*.css`. Those files are
checked in and are **not** rebuilt by `npm run build`. Regenerate them only
after changing the SCSS or the above-the-fold markup of those pages.

The tooling (`critical` + Playwright/Chromium) is intentionally not in
`package.json`. `extract-critical.sh` installs it on demand without saving
(Chromium is a one-time download of a few hundred MB), starts a dev server on
:8080 unless one is already running, and runs `extract-critical.js`:

```bash
./extract-critical.sh
```

Review the diff of `views/partials/critical-*.css` before committing. The next
plain `npm install` prunes `critical` and `playwright` again.
