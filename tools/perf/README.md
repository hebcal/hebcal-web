# Download-server profiling harness

Replays real production traffic against a local server and profiles it. Written
for `download.hebcal.com`, where PDF and iCalendar rendering dominate; also
drives `app-www.js` via `server.js www`.

Synthetic URLs badly misrepresent the work mix, so everything here starts from a
production Pino logfile (one JSON object per request, with `duration`, `status`
and `url`).

## Workflow

Run everything from the repo root — `createBaseApp()` reads
`hebcal-dot-com.ini` relative to cwd and the process exits if it is missing.
This is the easiest thing to get wrong: a server started from the wrong
directory dies, every request returns nothing, and a before/after comparison
silently "passes".

```bash
# 1. sample URLs out of a production log, weighted by real traffic
node tools/perf/sample.js /path/to/out /path/to/dl19.log

# 2. boot the app with profiling control on port 9099
node tools/perf/server.js download &

# 3. warm up, then profile a replay
node tools/perf/replay.js /path/to/out/v4-pdf.txt 1 150 > /dev/null
curl -s localhost:9099/start
node tools/perf/replay.js /path/to/out/v4-pdf.txt 1
curl -s "localhost:9099/stop?out=/tmp/pdf.cpuprofile"

# 4. analyze
node tools/perf/analyze.js /tmp/pdf.cpuprofile          # self time
node tools/perf/incl.js /tmp/pdf.cpuprofile renderPdf foldLine   # inclusive
```

`replay.js <file> [concurrency] [limit]` defaults to concurrency 1 so per-request
wall time is meaningful. Always warm up first — JIT warm-up is worth about 2x
over the first few hundred requests.

## Reading the profiles

`analyze.js` gives self time by package, file and function — good for finding
hot leaves. `incl.js` gives inclusive time for named frames — good for
attributing cost to a phase. Use both: the PDF font-parsing cost, for instance,
shows up under `layout` rather than under `open`, because fontkit decodes
GSUB/GPOS lazily.

## Checking that an optimization changed nothing

These routes are ETag-cached, so byte-identical output is the bar.

- `capture.js` hashes text responses with `DTSTAMP`/`LAST-MODIFIED` normalized.
- `capture-pdf.js` hashes the **inflated content streams** of a PDF, with
  timestamps normalized. Never compare whole PDF files: pdfkit writes a random
  `/ID` in the trailer and stamps the XMP metadata stream with the current time,
  so two runs of unmodified code never match.

Both take `<urls-file> <limit> <out.json> [port]`. Capture before and after,
then diff the JSON. Sanity-check the method first by capturing twice against
unchanged code — that must come out 100% identical, otherwise the normalization
is incomplete and any comparison built on it is meaningless.

## www

`bench-ejs.js` measures the share of a www request spent executing EJS
templates. A CPU profile cannot answer that on its own: compiled templates are
`new Function` bodies whose samples land in an anonymous `(vm)` bucket that
also holds idle time, GC and V8 internals, so the number has to come from
wrapping the compiled function.

```bash
URLS=$'/converter?gd=1&gm=1&gy=2000&g2h=1\n/holidays/2026-2027' \
  node tools/perf/bench-ejs.js
```

`capture-www.mjs` is the www counterpart of `capture.js`: it hashes normalized
HTML/XML responses so a before/after comparison can prove the rendered bytes
did not change. Nonces, timestamps and the stack trace on an error page are the
only parts it normalizes away.

```bash
URLS_FILE=urls.txt OUT=before.json node tools/perf/capture-www.mjs
```
