# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**hebcal-web** is a Node.js web server for Hebcal.com — a Hebrew calendar and Jewish holiday service. It runs two separate Koa HTTP servers:
- `www.hebcal.com`: Hebrew date converter, Yahrzeit (memorial dates), Shabbat times, holiday info, Torah portions, daily learning, etc.
- `download.hebcal.com`: Calendar export in iCalendar, PDF, and CSV formats

All source files use ES modules (`"type": "module"` in package.json). Requires Node.js >= 24.

## Setup

```bash
npm install
node_modules/@hebcal/geo-sqlite/bin/download-and-make-dbs  # download geonames.sqlite3, zips.sqlite3
touch hebcal-dot-com.ini                                     # local config (can be empty for dev)
npm run build                                                # compile PO translations, SCSS, rollup bundles
```

## Commands

```bash
npm test                   # run all Vitest unit tests
npm run test:coverage      # with v8 coverage report
npm run test:watch         # watch mode

npm run dev                # start www.hebcal.com server
npm run dev:download       # start download.hebcal.com server (port 8081)

npm run build              # full build: po2json + css-compile + css-rename + rollup
npm run css-compile        # compile SCSS → CSS (Sass + PostCSS + PurgeCSS)
npm run po2json            # convert gettext .po translation files → JSON
```

## Running a single test file

```bash
npx vitest run test/converter.test.js
```

## Architecture

### Dual-server structure
- `src/app-www.js` — Koa app for www.hebcal.com, mounts all routes via `src/router.js`
- `src/app-download.js` — separate Koa app for download.hebcal.com

### Key shared modules
- `src/db.js` — MySQL connection pool (credentials from `hebcal-dot-com.ini`)
- `src/common.js` — shared HTTP utilities (redirects, error handling, response helpers)
- `src/logger.js` — Pino structured logging

### Feature modules (`src/`)
Each feature is typically one or a few files handling routing, business logic, and EJS template rendering:
- **Date conversion**: `converter.js`, `dateUtil.js`
- **Holidays**: `holidayApp.js`, `getHolidayMeta.js`
- **Shabbat/Zmanim**: `shabbat.js`, `zmanim.js`
- **Yahrzeit**: `yahrzeit.js`, `yahrzeit-email.js`, `yahrzeitCommon.js`
- **Downloads/export**: `hebcal-download.js`, `pdf.js`, `makeDownloadProps.js`, `deserializeDownload.js`
- **Torah/Parsha**: `sedrot.js`, `parshaYear.js`
- **Daily learning**: `dailyLearning.js` (Daf Yomi, etc.)
- **Email subscriptions**: `email.js`, `emailCommon.js`
- **Geolocation**: `location.js`, `nearestCity.js`, `defaultLangTz.js`

### Data files (`src/`)
JSON files used at runtime: `holidays.json`, `drash.json`, `dailyLearningConfig.json`, `staticCalendars.json`, `redirect.json`, `redirectDownload.json`

### Templates
EJS server-side templates live in `views/` (main pages) and `views/partials/` (reusable components).

### Client-side JS
`rollup.config.cjs` bundles 8 separate entry points from `src/client-*.js` files → `static/i/`.

### Localization
Gettext `.po` files in `po/` (Hebrew, Portuguese, Spanish, French, Dutch, Ashkenazi) are compiled to JSON via `npm run po2json` and loaded at runtime.

### Databases
- **MySQL**: user accounts, yahrzeit subscriptions, email lists — requires `hebcal-dot-com.ini` config
- **SQLite** (`geonames.sqlite3`, `zips.sqlite3`): geolocation lookup via `@hebcal/geo-sqlite`
- **MaxMind GeoIP**: `GeoLite2-Country.mmdb`, `GeoLite2-City.mmdb` for IP-based city detection

## Testing Notes

Before first test run, create test SQLite databases:
```bash
node_modules/@hebcal/geo-sqlite/bin/make-test-dbs
```

Tests use Vitest + Supertest. Mock helpers: `test/mock-mysql.js`, `test/zipsMock.js`. All tests must pass before committing or pushing.

### Testing Before Commit/Push

Always run unit tests to confirm everything works without breakage before committing or pushing code.
