// Replay a list of URLs against the local download server, sequentially
// (concurrency 1 by default) so wall-clock per request is meaningful.
import fs from 'node:fs';
import http from 'node:http';

const file = process.argv[2];
const conc = Number(process.argv[3] || 1);
const limit = Number(process.argv[4] || Infinity);
const PORT = Number(process.env.PORT || 8080);

const urls = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).slice(0, limit);
const agent = new http.Agent({keepAlive: true, maxSockets: conc});

const stats = new Map();

function get(url) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const req = http.request({
      port: PORT, path: url, agent,
      headers: {'accept-encoding': 'identity', 'user-agent': 'replay/1.0'},
    }, (res) => {
      let bytes = 0;
      res.on('data', (c) => bytes += c.length);
      res.on('end', () => {
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        resolve({status: res.statusCode, ms, bytes});
      });
    });
    req.on('error', (e) => resolve({status: 0, ms: 0, bytes: 0, err: e.message}));
    req.end();
  });
}

function bucket(url) {
  const p = url.split('?')[0];
  const ext = (p.match(/\.(ics|csv|pdf)$/i) ?? ['', '-'])[1].toLowerCase();
  const fam = p.startsWith('/v4/') ? 'v4' : p.startsWith('/v3/') ? 'v3' :
    p.startsWith('/v2/') ? 'v2' : p.startsWith('/export') ? 'export' : 'other';
  return fam + '.' + ext;
}

let idx = 0;
async function worker() {
  while (idx < urls.length) {
    const url = urls[idx++];
    const r = await get(url);
    const k = bucket(url) + ' ' + r.status;
    let s = stats.get(k);
    if (!s) stats.set(k, s = {n: 0, tot: 0, durs: [], bytes: 0});
    s.n++; s.tot += r.ms; s.durs.push(r.ms); s.bytes += r.bytes;
  }
}

const t0 = Date.now();
await Promise.all(Array.from({length: conc}, worker));
const wall = Date.now() - t0;

const rows = [...stats.entries()].sort((a, b) => b[1].tot - a[1].tot);
let grand = 0;
for (const [, v] of rows) grand += v.tot;
console.log(`# ${file}  n=${urls.length}  wall=${wall}ms  sumMs=${grand.toFixed(0)}  rps=${(urls.length / (wall / 1000)).toFixed(1)}`);
console.log(['key', 'n', 'totalMs', '%', 'avg', 'p50', 'p95', 'p99', 'max', 'avgKB'].join('\t'));
for (const [k, v] of rows) {
  v.durs.sort((a, b) => a - b);
  const q = (p) => v.durs[Math.min(v.durs.length - 1, Math.floor(v.durs.length * p))];
  console.log([k, v.n, v.tot.toFixed(0), (100 * v.tot / grand).toFixed(1),
    (v.tot / v.n).toFixed(1), q(.5).toFixed(1), q(.95).toFixed(1), q(.99).toFixed(1),
    v.durs.at(-1).toFixed(1), (v.bytes / v.n / 1024).toFixed(1)].join('\t'));
}
