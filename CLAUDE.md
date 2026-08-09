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

## Performance Profiling

The harness lives in `tools/perf/` — see `tools/perf/README.md` for the
commands. It drives either app (`node tools/perf/server.js www|download`).
What follows is why it works the way it does.

### Method

Production Pino logs (one JSON object per request, with `duration`, `status`,
`url`) replay directly, which is the only realistic way to profile this app —
synthetic URLs badly misrepresent the work mix. The approach that worked:

1. Aggregate a production logfile by route family × extension × status,
   weighting by **total** `duration` rather than request count. Request counts
   are dominated by 304s and `/ping`; time is dominated by a few `.pdf` routes.
2. Sample URLs per family into flat lists (`.ics`/`.csv`/`.pdf` behave nothing
   alike, so profile them separately as well as mixed).
3. Boot the app via a wrapper that imports `{app}` from `src/app-download.js`
   (it only self-starts when run directly) and drives
   `inspector` `Profiler.start`/`stop` from a second admin port, so the profile
   covers just the replay window and not module loading. **Run the wrapper with
   cwd = repo root** — `createBaseApp()` reads `hebcal-dot-com.ini` relative to
   cwd and the process exits if it is missing.
4. Replay sequentially (concurrency 1) so per-request wall time is meaningful,
   after a warm-up pass — JIT warm-up is worth ~2x on the first few hundred.
5. Analyze the `.cpuprofile` two ways: **self** time by package/file/function to
   find hot leaves, and **inclusive** time for named frames to attribute cost to
   a phase. Inclusive attribution needs care — match the outermost frame per
   sample or nested patterns double-count.

Varnish sits in front, so the log's distinct-URL ratio is ~1.0. There is no
app-level response-caching win available; only per-render cost matters.

### Where the time goes on download.hebcal.com (Aug 2026 baseline)

`.pdf` was ~51% of total server time, `.ics` ~30%, `.csv` ~10%.

- **PDF — pdfkit re-parses fonts and discards its layout cache every request.**
  `PDFFontFactory.open()` does `readFileSync` + `fontkit.create` per document,
  and pdfkit's word-level `layoutCache` lives on `EmbeddedFont`, which is
  per-document. fontkit decodes GSUB/GPOS lazily, so the re-parse cost surfaces
  under `layout` (57% of PDF CPU), not under `open` (5%) — don't be misled by
  the self-time profile alone. Across 253 real PDFs there were only ~2,000
  unique (font, word) pairs, i.e. ~97% of shaping is redundant across requests.
  **Do not try to fix this by sharing the shaped-word cache across documents.**
  `src/pdfFontCache.js` did exactly that (63 → 32 ms/request, byte-identical
  output) and was reverted on 2026-08-09 after it exhausted memory in
  production: every `download.hebcal.com` worker was OOM-killed after ~189 PDFs,
  restarting every ~20 minutes on a 990 MB box.

  The cache was bounded at 20,000 entries per font, which bounds *entries* but
  not *bytes*. Its values are fontkit `GlyphRun`s, and every `Glyph` in a run
  holds `_font` — the whole parsed font, with its cmap processor, layout engine
  and glyph cache. So each entry pins the entire font of whichever document
  first shaped that word, and entries are only ever written on a miss, never
  overwritten. Rendered text is *not* fixed vocabulary — the calendar subtitle
  carries city names, ZIP codes and years — so nearly every request contributed
  a new word, and with it a new pinned font: 60 documents pinned 60 distinct
  fonts, and a local replay of real production URLs retained ~2.8 MB per PDF
  with the heap climbing linearly and no plateau. Reverting made the same
  replay flat at ~40 MB across 400 PDFs.

  Any future attempt here has to keep cached values free of references back
  into per-document state, and cannot simply share the parsed font either: that
  is ~1.5x on its own, but fontkit caches `Glyph` objects by id along with the
  code points from whichever call created them first, and pdfkit copies
  `glyph.codePoints` into the PDF's ToUnicode CMap — which measurably changed
  the CMap in ~4% of a 250-PDF sample, silently degrading copy/paste, search
  and accessibility.
- **iCalendar — `foldLine` was ~29% of `.ics` CPU** and ~57% of `/v3` yahrzeit
  CPU, essentially all of it `Intl.Segmenter`. Fixed upstream in
  `@hebcal/icalendar` by folding on code-point boundaries and consulting the
  Segmenter only at candidate break offsets via `Segments.containing()`.
- **`@hebcal/noaa` `getDateFromTime`** is ~11% of `.csv` CPU: a
  `PlainTime`→`toZonedDateTime`→`withTimeZone` round-trip whose result
  `@hebcal/core`'s `zdtToDate` immediately reduces to `epochMilliseconds`.
  `withTimeZone` does not change the instant, so that leg is dead weight.
  Node 26 has **native** Temporal, so this cost shows as self time in the
  calling frame rather than in `temporal-polyfill`.

### Response compression (Aug 2026)

`useCompression()` in `app-common.js` offers gzip, brotli and zstd on both
servers. koa-compress negotiates in the fixed order
`['zstd', 'br', 'gzip', 'deflate', 'identity']`, so **zstd wins whenever the
client offers it** and disabling it falls through to brotli. Measure with
`tools/perf/encstats.js` and `tools/perf/compress-bench.js`.

- **Who uses what is split by client type, not by route.** On download, zstd is
  23% of 200s but comes almost entirely from browsers (72% of browser
  responses, mostly `.csv`). The automated subscribers use brotli and never
  zstd at all: Google Calendar 99.6% br, Apple iOS/macOS 99.5% br, Exchange and
  script clients 99% gzip. PDFs are never compressed — `application/pdf` does
  not match koa-compress's content-type filter — so PDF is irrelevant here.
- **Dropping an encoding to reduce Varnish variants does not pay off on
  download, because the URLs that repeat and the URLs that use zstd are
  disjoint sets.** Of ~7,000 URLs fetched more than once, 6,076 are served as
  brotli only, and just **81 would lose a variant if zstd were removed** — the
  repeated URLs are subscription feeds polled by calendar clients, while zstd
  is browsers doing one-off downloads that never repeat. Against that, those
  responses grow ~19% (`.ics`) to ~24% (`.csv`). Weigh any future "drop an
  encoding" proposal against `encsets`-style analysis, not against the raw
  share of responses.
- **Count only status 200 when analyzing this.** A 304 has no body and no
  `Content-Encoding`, so counting 304s makes uncompressed responses look like a
  majority and invents a `br+none` variant pair that does not exist. Exclude
  `/ping` and `/metrics` too.
- **The zstd levels are the real mistuning, and both are far past the knee.**
  zstd is very fast at levels 1–3 and falls off a cliff above ~6:

  | corpus | `zstd:3` | `zstd:10` | `zstd:12` |
  |---|---|---|---|
  | `.ics` | 0.04 ms / 7.06% | 0.24 ms / 6.14% | 0.65 ms / 6.10% |
  | `.csv` | 0.15 ms / 14.08% | 1.44 ms / 11.06% | 3.62 ms / 10.60% |
  | www HTML | 0.09 ms / 26.50% | 0.62 ms / 24.30% | 1.23 ms / 24.23% |

  Both servers now run `zstdLevel: 6`, down from 12 on www and 10 on download.
  Level 12 cost 2x the CPU of level 10 for 0.07 percentage points of size.
  Charging every logged 200 at the level actually used, compression was 26.9%
  of total request time on www and 12.3% on download; the retune cuts 14.4% of
  total www request time for +1.1% bytes on the wire, and 2.3% of download for
  +0.8%. Do not raise these again without re-running the sweep. Brotli, by
  contrast, is tuned about right: `br:6` on www is within 0.6pp of `br:9`, and
  `br:3` on download is a reasonable speed pick.
- **On `.ics`, zstd at level 3 strictly dominates brotli at quality 3** — 0.04 ms
  vs 0.14 ms *and* 7.06% vs 7.28%. `.ics` is repetitive enough that zstd's
  cheap levels give brotli-quality ratios, which is not true of HTML.

### Where the time goes on www.hebcal.com (Aug 2026 baseline)

By share of total request time: `/hebcal` ~38%, `/converter` ~20%,
`/shabbat` ~17%, `/holidays` ~14%. `/holidays/*.pdf` is only ~1%, so the PDF
work above is a download-side concern only.

The profile is **not** template-bound, despite first appearances. A CPU
profile shows a large `(vm)` bucket that is tempting to read as compiled EJS;
it is mostly `(idle)`, GC and V8 internals. Instrumenting `ejs.compile`
directly puts template execution at ~8% of wall time. The real weight is in
`@hebcal/hdate` primitives (~16%: `abs2greg`, `hebrew2abs`, `getPseudoISO`,
`fixMonth`), `@hebcal/core` `calendar()` (~7%), and dayjs (~6%, mostly
`isValid` from constructing many dayjs objects). Those are the places worth
looking next; the template layer has already been picked over.

Two traps specific to www:

- **There are two copies of `ejs` installed, deliberately.** `@koa/ejs`
  declares `ejs@^3.1.8` and gets a nested `node_modules/ejs` (3.1.10) that
  renders every normal page; the top-level `ejs` (6.x) is reached by
  `koa-error` → `consolidate`, which lazily `require('ejs')`, and renders
  `error.ejs`. Patch or profile the wrong one and you will see nothing. An
  `overrides` entry forcing everything to 6.x works and is byte-identical,
  but is *slower*: ejs 6 shallow-copies the locals object on every render
  (and every include) as prototype-pollution mitigation, and this app passes
  ~15 locals through `ctx.state`.
- **`fs.existsSync()` runs once per `include()` per request** from ejs's
  `getIncludePath`, ahead of the compiled-template cache. It looks alarming
  in a self-time profile but memoizing it end-to-end is worth ~0.3%; the
  dentry cache is warm and it is ~0.7us a call. Not worth the fragility.

### A slow request blocks every other request on that process

Node is single-threaded, so a synchronous handler stalls the whole event
loop. This is not theoretical here: one scanner sending
`/hebcal?year=5787&yt=G` with every daily-learning option enabled blocked
w46 for 10.2 seconds, and the matching 10206ms entry is in the access log.

Three consequences worth remembering:

- `useTimeout()` **cannot** fire during that window — it is a `setTimeout`
  macrotask. See its JSDoc in `app-common.js`; it bounds slow I/O only.
- Varnish `first_byte_timeout` (10s for www and api, 15s for dl) is what
  actually served the 503s. The node.js logs show none.
- The fix is to bound the input, not to add a timeout. Daily-learning
  calendars walk forward from a cycle epoch, so their cost grew linearly
  with distance from it; `dropDailyLearningOutsideRange()` in `calendar.js`
  drops them outside the supported year range. `@hebcal/learning` later made
  the walk O(1), which removes the cliff at the root — the bound is now
  belt-and-braces rather than load-bearing.

`prom-client`'s `nodejs_eventloop_lag_max_seconds` is the metric that
surfaces this; `hebcal-devops` has `NodeEventLoopStalled` (>2s) and
`NodeEventLoopLagHigh` (p99 >250ms for 10m) alerting on it.

### Verifying an optimization did not change output

These routes are cached by ETag, so byte-identical output is the bar. Compare
normalized response bodies before/after (strip `DTSTAMP`/`LAST-MODIFIED`, which
vary per request). For PDFs, compare **inflated content streams**, not whole
files: pdfkit writes a random `/ID` in the trailer via `crypto.getRandomValues`,
so two runs of unmodified code never produce identical bytes.
