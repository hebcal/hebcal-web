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

## Compression

Two questions come up together: which content encodings are worth offering, and
what level each should run at. `encstats.js` answers the first from production
logs, `compress-bench.js` the second from real response bodies.

```bash
# what clients actually negotiate, by extension / user-agent / route family
node tools/perf/encstats.js dl19.log dl19-new.log dl16.log
node tools/perf/encstats.js --by=ua w45.log w46.log

# CPU vs ratio, over real bodies rather than synthetic text
node tools/perf/server.js download &
node tools/perf/capture-bodies.js /path/to/out/v4-ics.txt 250 /tmp/corpus/ics
node tools/perf/compress-bench.js /tmp/corpus/ics
node tools/perf/compress-bench.js /tmp/corpus/ics --levels=zstd:3,zstd:10 --reps=5
```

`encstats.js` reads the `enc` field, which is the response `Content-Encoding`;
absent means the response went out uncompressed. Two filters matter and are on
by default: only status 200 counts, because 304s have no body and would
otherwise show up as a phantom "uncompressed" majority; and `/ping` and
`/metrics` are dropped, since the health check and the Prometheus scrape are
high-count machine traffic that says nothing about real clients. `--all` keeps
them.

`capture-bodies.js` fetches with `Accept-Encoding: identity`, so the corpus is
what the compressor is actually handed. Benchmark against real bodies —
`.ics` is extremely repetitive and compresses to ~6%, `.csv` to ~11%, and HTML
to ~23%, so a conclusion drawn from one does not transfer to the others.

When reading the output, the column that matters is **vs best**: the extra bytes
a configuration costs over the smallest one tested. Ratio differences of under a
percentage point are not worth multiples of CPU, and the levels sit on a sharp
knee — see the findings in `CLAUDE.md`.
