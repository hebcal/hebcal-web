// Aggregates Content-Encoding usage out of production Pino logs, to decide
// which encodings are worth offering.
//
//   node tools/perf/encstats.js dl19.log dl19-new.log
//   node tools/perf/encstats.js --by=ua w45.log
//
// The `enc` field is the response Content-Encoding; absent means the response
// went out uncompressed. Only 200s carry a body, so everything here filters to
// status 200 -- counting 304s would drown the signal, since they are the
// majority of requests and never compress.
//
// /ping and /metrics are excluded: they are the health check and the Prometheus
// scrape, so they are high-count, machine-only traffic that tells us nothing
// about what real clients negotiate. Pass --all to keep them.
//
// --by=ext     (default) group by URL extension
// --by=ua      group by coarse user-agent family
// --by=family  group by route family (first path segment)
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';

const args = process.argv.slice(2);
const byArg = args.find((a) => a.startsWith('--by='));
const by = byArg ? byArg.slice('--by='.length) : 'ext';
const keepHealth = args.includes('--all');
const files = args.filter((a) => !a.startsWith('--'));

/** Health check and Prometheus scrape -- machine-only, not real clients. */
const HEALTH = /^\/(ping|metrics)(\?|$)/;

if (!files.length) {
  console.error('usage: node tools/perf/encstats.js [--by=ext|ua|family] LOGFILE...');
  process.exit(1);
}

const ENCODINGS = ['zstd', 'br', 'gzip', 'none'];

/** @private */
function ext(url) {
  const path = url.split('?')[0];
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? m[1].toLowerCase() : '(none)';
}

/** @private */
function family(url) {
  const path = url.split('?')[0];
  const seg = path.split('/').filter(Boolean)[0];
  return seg ? '/' + seg : '/';
}

/**
 * Collapses a User-Agent into a coarse client family. The point is to separate
 * automated calendar subscribers from browsers, since they negotiate encodings
 * very differently.
 * @private
 */
function uaFamily(ua) {
  if (!ua) return '(none)';
  if (/Google-Calendar-Importer|Googlebot|Google Calendar/i.test(ua)) return 'Google Calendar';
  if (/dataaccessd|iOS\//i.test(ua)) return 'Apple iOS/macOS calendar';
  if (/Microsoft Exchange|Outlook/i.test(ua)) return 'Microsoft Exchange/Outlook';
  if (/Mozilla\/5\.0 \(.*(Windows|Macintosh|X11|Android|iPhone|iPad)/i.test(ua) &&
      /Chrome|Firefox|Safari|Edg/i.test(ua)) return 'browser';
  if (/bot|crawl|spider|scan/i.test(ua)) return 'bot/crawler';
  if (/curl|wget|python|java|okhttp|go-http|libwww|axios|node-fetch/i.test(ua)) return 'script/library';
  return 'other';
}

/** @private */
function keyFor(o) {
  if (by === 'ua') return uaFamily(o.ua);
  if (by === 'family') return family(o.url);
  return ext(o.url);
}

/** @private */
function pct(n, d) {
  return d ? (n / d * 100).toFixed(1) + '%' : '-';
}

/** @private */
function mb(bytes) {
  return (bytes / 1048576).toFixed(1);
}

const groups = new Map();
const totals = {n: 0, bytes: 0, enc: new Map()};

for (const file of files) {
  const rl = createInterface({input: createReadStream(file)});
  for await (const line of rl) {
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.status !== 200 || !o.url) continue;
    if (!keepHealth && HEALTH.test(o.url)) continue;
    const enc = o.enc || 'none';
    const len = o.length || 0;
    const k = keyFor(o);
    let g = groups.get(k);
    if (!g) {
      g = {n: 0, bytes: 0, enc: new Map()};
      groups.set(k, g);
    }
    for (const t of [g, totals]) {
      t.n++;
      t.bytes += len;
      const e = t.enc.get(enc) || {n: 0, bytes: 0};
      e.n++;
      e.bytes += len;
      t.enc.set(enc, e);
    }
  }
}

console.log(`files: ${files.join(', ')}`);
console.log(`status-200 responses: ${totals.n.toLocaleString()}  ` +
  `bytes on the wire: ${mb(totals.bytes)} MB\n`);

console.log('Overall, by encoding:');
console.log('  enc     responses     share      MB out   avg bytes');
for (const enc of ENCODINGS) {
  const e = totals.enc.get(enc);
  if (!e) continue;
  console.log(`  ${enc.padEnd(6)} ${String(e.n).padStart(10)} ${pct(e.n, totals.n).padStart(9)} ` +
    `${mb(e.bytes).padStart(11)} ${String(Math.round(e.bytes / e.n)).padStart(11)}`);
}

console.log(`\nBy ${by} (rows with >=0.1% of responses), share of that row's responses:`);
const hdr = ENCODINGS.map((e) => e.padStart(9)).join('');
console.log(`  ${'key'.padEnd(26)} ${'responses'.padStart(10)}${hdr}`);
const rows = [...groups].sort((a, b) => b[1].n - a[1].n);
for (const [k, g] of rows) {
  if (g.n / totals.n < 0.001) continue;
  const cells = ENCODINGS
      .map((e) => pct(g.enc.get(e)?.n || 0, g.n).padStart(9))
      .join('');
  console.log(`  ${k.slice(0, 26).padEnd(26)} ${String(g.n).padStart(10)}${cells}`);
}
