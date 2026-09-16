# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**hebcal-web** is a Node.js web server for Hebcal.com — a Hebrew calendar and Jewish holiday service. It runs two separate Koa HTTP servers:
- `www.hebcal.com`: Hebrew date converter, Yahrzeit (memorial dates), Shabbat times, holiday info, Torah portions, daily learning, etc.
- `download.hebcal.com`: Calendar export in iCalendar and CSV formats

All source files use ES modules (`"type": "module"` in package.json). Requires Node.js >= 24.

## Setup

```bash
npm install
node_modules/@hebcal/geo-sqlite/bin/download-and-make-dbs  # download geonames.sqlite3, zips.sqlite3
touch hebcal-dot-com.ini                                     # local config (can be empty for dev)
npm run build                                                # compile PO translations, SCSS, rollup bundles
```

### Bumping `@hebcal/*` dependencies

When `npm install` fails with `ETARGET` / "No matching version found for
`@hebcal/<pkg>@^x.y.z`" shortly after that version was published, the cause is
stale cached registry metadata (npm reuses its on-disk packument without
re-checking the registry until it ages past the freshness window), not a real
missing version. Fix: `npm install --prefer-online` (forces ETag revalidation of
metadata — lightweight, preferred). Heavier fallback: `npm cache clean --force`
then `npm install`. Confirm the registry actually has it first with
`npm view @hebcal/<pkg>@<ver> version --prefer-online`.

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
- **Date conversion**: `converter.js`, `dateUtil.js`. The `?cfg=xml` and
  `?cfg=json` API variants were removed from this app; `/converter?cfg=xml`
  and `?cfg=json` now return 501 and are served exclusively by
  [hebcal-api-go](https://github.com/hebcal/hebcal-api-go) (the removed
  `converter-xml.ejs` template went with them). Date-range batch conversion
  (`start`/`end` and `h2g&ndays`, the old cfg=json batch mode) also moved to
  hebcal-api-go, so `converter.js` returns 501 for those inputs — the
  `convertDateRange()` function and `dateUtil.js`'s `getStartAndEnd()` (with its
  `isoToDayjs`/`MAX_DAYS` helpers) were deleted. `/converter` still renders the
  HTML single-date page here. `/converter/csv` (`dateConverterCsv`) is also kept:
  in production Varnish routes those requests to the hebcal-api-go backend, not
  to this one, but the handler stays here so the CSV export can be exercised in
  local testing.
- **Holidays**: `holidayApp.js`, `getHolidayMeta.js`
- **Shabbat/Zmanim**: `shabbat.js`. Zmanim (`src/zmanim.js`) was removed from
  www.hebcal.com — `/zmanim` and `/geo` on **app-www** now return 501 (see
  `router.js`) and are served by hebcal-api-go. Zmanim on **download.hebcal.com**
  is unchanged: `zmanimDownload.js` (+ shared `zmanimCommon.js`) still serves the
  `.ics`/`.csv` zmanim feeds from app-download.
- **Yahrzeit**: `yahrzeit.js`, `yahrzeit-email.js`, `yahrzeitCommon.js`
- **Downloads/export**: `hebcal-download.js`, `makeDownloadProps.js`, `deserializeDownload.js`.
  PDF rendering was removed from this app; `.pdf` download requests now return
  501 and PDFs are served exclusively by
  [hebcal-api-go](https://github.com/hebcal/hebcal-api-go).
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
- **Daily learning**: `dailyLearning.js` (Daf Yomi, etc.)
- **Email subscriptions**: `email.js`, `emailCommon.js`
- **Login / accounts** (`login.js`, `session.js`, `oauthGoogle.js`,
  `userAccount.js`): "Sign in with Google" via OpenID Connect (Authorization
  Code + PKCE, using `openid-client`). This is the app's *only* notion of an
  authenticated user — everything else (Yahrzeit, email) is identified by
  unguessable capability tokens, not accounts. `session.js` holds DB-backed
  sessions (the `user_session` table) behind a signed, `httpOnly` `S` cookie;
  a store must be shared because each www host is one process and several w
  servers sit behind Varnish. `loadSession()` runs as middleware in
  `app-www.js` and sets `ctx.state.user` — it early-returns with no DB hit when
  no `S` cookie is present, so anonymous requests (the vast majority) pay
  nothing. `userAccount.js` maps a provider login to a `user` row via
  `user_identity`, merging accounts across providers **only** on a
  provider-verified email. All routes (`/login`, `/login/google`,
  `/login/google/callback`, `/logout`, `/account`) set
  `Cache-Control: private, no-store`. **Config**: `hebcal.google.oauth.*` and
  `hebcal.session.secret` in `hebcal-dot-com.ini`; login self-disables (`/login`
  shows nothing, `/login/google` 404s) when the Google keys are absent, so dev
  hosts and tests without secrets are unaffected. A
  `hebcal.google.oauth.disabled` flag (1/true/yes/on) is an explicit kill switch
  so the feature can ship to main but be turned off in production without
  removing the credentials; `isGoogleLoginConfigured()` is the single gate, and
  `app-www.js` exposes its result as `ctx.state.googleLoginEnabled` for the
  templates. **Redirect URI**: `googleRedirectUri()` derives it from the request
  host for loopback addresses (so `localhost` and `127.0.0.1` each redirect back
  to themselves in dev -- both must be registered on the OAuth client), and uses
  the configured `redirect_uri` (or the www.hebcal.com default) otherwise. The
  chosen URI is recorded in the signed transaction cookie so the callback's
  token exchange uses the exact same value. **Varnish caveat**: do not
  personalize otherwise-cacheable pages (e.g. a "signed in as…" navbar)
  server-side — a cached anonymous copy would leak to logged-in users and vice
  versa. Render login state client-side instead. Apple ("Sign in with Apple")
  is intended as a second provider later; the `user_identity.provider` column
  and the merge-by-verified-email logic already accommodate it.
  **`/email` integration**: `email.js` pre-fills a signed-in user's email and,
  when the subscribed address equals their provider-verified `user.email`,
  activates the Shabbat subscription immediately via `subscribeVerifiedUser()`
  instead of the pending + confirm-by-email round-trip (`insertSub()` is the
  shared writer for both). The signed-in `/email` page is marked
  `Cache-Control: private`. The reusable `views/partials/google-signin-button.ejs`
  is included by `login.ejs`, `email.ejs`, and the (cache-safe, non-personalized)
  `email-candles-modal.ejs`. No account/subscription migration was needed for
  pre-existing subscribers: the old flows never created `user` rows, subscriptions
  are keyed by email address, and re-subscribing while signed in reuses the same
  email-keyed row -- so nothing is duplicated, and old subscriptions surface by an
  email join once an account page lists them.
- **Geolocation**: `location.js`, `nearestCity.js`, `defaultLangTz.js`. The
  standalone `/geo` JSON lookup route on app-www was removed (now 501 → served by
  hebcal-api-go); `getLocationFromQuery()` from `location.js` is still used
  in-process by other routes.

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

### Test harness isolation

- **Route tests share one listening server per file.** `test/testServer.js`
  `makeServer(app)` does one `http.createServer(app.callback())` +
  `server.listen(0)` in `beforeAll` and `server.close()` in `afterAll`; every
  route test uses `request(server)`, never `request(app.callback())`. This was
  the fix (2026-07-15) for a ~15–20% flake rate where a route returned the
  wrong HTTP status (e.g. `PUT / → 400` instead of 405, stray `404`/`503`). Bare
  `app.callback()` makes supertest `listen(0)`+`close()` a fresh ephemeral
  server per request, and under ~20 parallel worker processes an occasional
  connection lands on a wrong/closing server. `vitest.config.js` carries
  `retry: 2` for the rare residual. It was **not** a Node version regression.
  Keep new route tests on `makeServer`.
- **Don't run the full suite concurrently with another run.**
  `test/imageFormats.test.js` writes fixture images to a fixed shared path
  (`DOCUMENT_ROOT/i/is/{16x9-768,800,640,400}/112151899.{webp,avif}`, with
  `DOCUMENT_ROOT` = `./static` outside production) in `beforeAll` and `rmSync`s
  them in `afterAll`. Two simultaneous `npx vitest run` invocations race —
  typically `expect(srcset).toContain('800w')` fails. A single run is reliable.
  If it ever needs a real fix, make the fixture name unique per run (e.g.
  `process.pid` in the stem). The rest of the harness is isolation-safe (HTTP
  servers `listen(0)`, the geoip test uses `mkdtemp`).

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
   are dominated by 304s and `/ping`.
2. Sample URLs per family into flat lists (`.ics` and `.csv` behave nothing
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

At the time of this baseline `.pdf` was ~51% of total server time, `.ics` ~30%,
`.csv` ~10%. **PDF rendering has since been removed from this app** (it is now
served by [hebcal-api-go](https://github.com/hebcal/hebcal-api-go)), so the
pdfkit/fontkit costs that dominated this profile no longer apply here; `.ics`
and `.csv` are now the work that matters.

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
  script clients 99% gzip.
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
`/shabbat` ~17%, `/holidays` ~14%.

The profile is **not** template-bound, despite first appearances. A CPU
profile shows a large `(vm)` bucket that is tempting to read as compiled EJS;
it is mostly `(idle)`, GC and V8 internals. Instrumenting `ejs.compile`
directly puts template execution at ~8% of wall time. The real weight is in
`@hebcal/hdate` primitives (~16%: `abs2greg`, `hebrew2abs`, `getPseudoISO`,
`fixMonth`), `@hebcal/core` `calendar()` (~7%), and dayjs (~6%, mostly
`isValid` from constructing many dayjs objects). Those are the places worth
looking next; the template layer has already been picked over.

Template execution is ~23% of server time on the HTML routes, measured by
wrapping the compiled function (`tools/perf/bench-ejs.js`) rather than by
reading the profile, because compiled templates are `new Function` bodies
whose samples land in that same `(vm)` bucket.

Traps specific to www:

- **Templates say `locals.foo`, not `foo`, and must keep saying it.**
  `render()` in `app-www.js` passes `_with: false`, so ejs does not wrap the
  compiled body in `with (locals || {})`. Inside a `with`, every identifier
  resolves dynamically — V8 probes the locals object first even for ejs's own
  `__append` — which cost ~23% of template execution, ~7% of server time.
  A bare identifier now throws ReferenceError at render time instead of
  silently resolving, so the tests catch a regression immediately.
  `tools/codemod/ejs-locals.mjs` converts a batch of new templates;
  `tools/codemod/template-locals-audit.mjs` catches the case it cannot see,
  where a name is both a passed-in local and a loop variable in the same file.
- **`strict: true` buys nothing on top of that** — measured identical — and
  `@koa/ejs` does not forward the option anyway (it passes a fixed subset of
  compile options: no `strict`, `root`, `destructuredLocals`, `includer` or
  `unsafePrototypeLocals`). It is still worth compiling with it once by hand
  as a lint: it is what found `logoHtml` in `navbar.ejs` being assigned
  without a declaration, i.e. leaking onto `globalThis` on every request.
- **There are two copies of `ejs` installed, deliberately.** `@koa/ejs`
  declares `ejs@^3.1.8` and gets a nested `node_modules/ejs` (3.1.10) that
  renders every normal page; the top-level `ejs` (6.x) is reached by
  `koa-error` → `consolidate`, which lazily `require('ejs')`, and renders
  `error.ejs`. Patch or profile the wrong one and you will see nothing. An
  `overrides` entry forcing everything to 6.x dedupes cleanly and is
  byte-identical, but costs ~20% of template execution: ejs 6 shallow-copies
  the locals into a null-prototype object on every render as
  prototype-pollution mitigation, and since every `include()` then copies
  *from* a dictionary-mode object, the cost compounds down a tree that is
  ~34 template calls deep per request.
- **`fs.existsSync()` runs once per `include()` per request** from ejs's
  `getIncludePath`, ahead of the compiled-template cache. Setting
  `options.includer` does **not** avoid it — ejs calls the includer *after*
  `getIncludePath` has already resolved and stat-ed the path. What does avoid
  it is an absolute include path (`/partials/footer.ejs`), which takes the
  `options.root` branch and resolves with `path.resolve` alone — but
  `@koa/ejs` never passes `root` down to ejs, so that needs the ~40 lines of
  `@koa/ejs` replaced with a local render helper first. Worth ~2% of server
  time (`MODE=noexists node tools/perf/bench-ejs.js` for the ceiling).

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
vary per request).
