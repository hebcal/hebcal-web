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
- **RSS**: `rss.js` (RSS 2.0 generation), `parshaRss.js`, `dafYomiRss.js`, `rssCommon.js`
- **FullCalendar**: `fullcalendar.js` (`/hebcal?cfg=fc` server-side JSON);
  `client-fullcalendar.js` is the separate browser bundle
- **Event memos**: `torahMemo.js` (Torah & Haftarah summaries), `icalCommon.js`
  (assembles the iCalendar `DESCRIPTION`). `@hebcal/icalendar` no longer builds
  the `DESCRIPTION` itself, so routes construct their events with
  `makeIcalEvents()` / `makeIcalendar()`, which pass the memo through the
  per-event `IcalEvent` option. `createMemo()` gathers every piece itself —
  parsha summary, holiday description, Omer count, Torah reading, tracking URL
  — so callers never pre-populate anything. Prose follows `options.locale`:
  Hebrew locales get Hebrew parsha summaries and holiday descriptions
  (`localizedHolidayDescription()`), everything else English. Never write the generated memo back
  onto the event: `@hebcal/core` caches and shares holiday event instances
  across requests, so a memo set here would leak into later calendars, and the
  .csv export wants a different memo on the same event anyway. The .csv side
  follows the same rule: `eventsWithParshaToCsv()` (in `parshaCommon.js`) passes
  the special-Shabbat name to `eventToCsv()` via its per-call `memo` option, so
  every CSV route uses it in place of `eventsToCsv()` and rendering a calendar
  twice yields identical bytes. `kindness.js` and `yahrzeitDownload.js` are the
  exceptions — they never see `flags.PARSHA_HASHAVUA`.
- **Static feeds**: `staticCalendars.js` builds the multi-year .ics/.csv feeds
  served from download.hebcal.com/ical/ as a pure function of `today`, so they
  can be regression-tested (`test/staticCalendars.test.js`);
  `makeStaticCalendars.js` is the weekly cron wrapper that writes and compresses
  them.
- **Torah/Parsha**: `sedrot.js`, `parshaYear.js`, `parshaCommon.js`.
  Each parsha's Sefaria prose summary lives in `drash.json` under
  `sefaria.summaryEn` and `sefaria.summaryHe`, both scraped from sefaria.org.il.
  `getParshaSummary(ev, locale)` picks between them, so the Hebrew RSS feeds
  (`/sedrot/index-he.xml`, `…-he-x-NoNikud.xml`, `lg=h`) and the Hebrew
  iCalendar downloads carry Hebrew prose instead of English. Sefaria edits these
  descriptions over time and now embeds Markdown in some of them; drash.json
  holds plain text, so re-scraping means flattening `[text](url)` and
  `*emphasis*` first.
- **Torah readings**: `leyning.js` (`/leyning?cfg=json`) wraps
  `getLeyningOnDate()`. The optional `&events=on` exists for
  [hebcal-api-go](https://github.com/hebcal/hebcal-api-go), whose `/shabbat`
  renders one reading per calendar event the way
  `eventToClassicApiObject()` does. It labels each holiday reading with the
  `desc` of the events that produce it, and adds back the holiday readings
  `getLeyningOnDate()` drops on a Shabbat that also has a parsha (Rosh
  Chodesh, the special Shabbatot) because their maftir and Haftarah are
  folded into the parsha reading. Those readings are not always
  reconstructable from the parsha item — Shabbat Shuva's own Haftarah has a
  third part the "(with Vayeilech)" variant lacks — so they have to be
  emitted separately. Without `events=on` the response is unchanged.
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
- **MaxMind GeoIP**: IP-based city detection (`GeoLite2-City.mmdb`). The database
  is **not** loaded in-process; lookups go to the standalone
  [hebcal-geoip2](https://github.com/hebcal/hebcal-geoip2) Go microservice over a
  Unix domain socket (see `src/geoipClient.js` / `src/geoip.js`). If the service
  is unreachable, `getLocationFromGeoIp()` falls back to `{geo:'none'}`.

## Testing Notes

Before first test run, create test SQLite databases:
```bash
node_modules/@hebcal/geo-sqlite/bin/make-test-dbs
```

You must also run the **full** build before the tests will pass — not just
`po2json`. Many tests boot the Koa app and render EJS templates, which require
the compiled translations (`src/*.po.js`), the SASS/CSS output, and the rollup
client bundles (`views/partials/*.min.js`, `static/i/*`). Without these, route
tests fail with HTTP 500s that look unrelated to your change:
```bash
npm run build   # po2json + css-compile + css-rename + rollup
```

Tests use Vitest + Supertest. Mock helpers: `test/mock-mysql.js`, `test/zipsMock.js`. All tests must pass before committing or pushing.

### Testing Before Commit/Push

Always run unit tests to confirm everything works without breakage before committing or pushing code.
