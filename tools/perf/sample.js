// Sample requests from a production Pino logfile into replayable URL lists.
// Usage: node tools/perf/sample.js <out-dir> [logfile]
import fs from 'node:fs';
import readline from 'node:readline';

const OUT = process.argv[2] || '.';
const LOG = process.argv[3] || 'dl19.log';
const rl = readline.createInterface({input: fs.createReadStream(LOG)});

const buckets = {
  'v4-pdf': [], 'v4-ics': [], 'v4-csv': [],
  'export-ics': [], 'export-csv': [],
  'v3-ics': [], 'v2-ics': [], 'zmanim': [], 'other': [],
};

function classify(o) {
  const p = o.url.split('?')[0];
  const ext = (p.match(/\.(ics|csv|pdf)$/i) ?? ['', ''])[1].toLowerCase();
  if (p.startsWith('/v4/')) return ext ? 'v4-' + ext : null;
  if (p.startsWith('/v3/')) return ext === 'ics' ? 'v3-ics' : null;
  if (p.startsWith('/v2/')) return ext === 'ics' ? 'v2-ics' : null;
  if (p.startsWith('/export/')) return ext === 'ics' ? 'export-ics' : ext === 'csv' ? 'export-csv' : null;
  if (p.startsWith('/zmanim') || p.startsWith('/sunrs')) return 'zmanim';
  return null;
}

rl.on('line', (l) => {
  let o;
  try {
    o = JSON.parse(l);
  } catch {
    return;
  }
  if (!o.url || (o.method !== 'GET' && o.method !== 'HEAD')) return;
  // keep 200 and 304 (304s replay as 200 since we send no conditional headers)
  if (o.status !== 200 && o.status !== 304) return;
  const b = classify(o);
  if (!b) return;
  buckets[b].push(o.url);
});

rl.on('close', () => {
  const counts = {};
  for (const [k, v] of Object.entries(buckets)) counts[k] = v.length;
  console.error('bucket counts', JSON.stringify(counts));

  // dedupe-preserving random shuffle
  const pick = (arr, n) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, n);
  };

  // 1) "mix" = proportional to real traffic among these buckets, 3000 reqs
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const mix = [];
  for (const v of Object.values(buckets)) {
    const n = Math.round(3000 * v.length / total);
    if (n > 0) mix.push(...pick(v, Math.min(n, v.length)));
  }
  fs.writeFileSync(OUT + '/mix.txt', pick(mix, mix.length).join('\n') + '\n');
  console.error('mix.txt', mix.length);

  // 2) per-bucket focused lists for isolated profiling
  for (const [k, v] of Object.entries(buckets)) {
    if (!v.length) continue;
    const n = k === 'v4-pdf' ? 800 : 1500;
    fs.writeFileSync(OUT + '/' + k + '.txt', pick(v, Math.min(n, v.length)).join('\n') + '\n');
    console.error(k + '.txt', Math.min(n, v.length));
  }
});
