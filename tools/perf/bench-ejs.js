// Measures how much of a www request is spent executing EJS templates.
//
//   URLS=$'/converter?gd=1&gm=1&gy=2000&g2h=1\n/shabbat?geonameid=5128581' \
//     node tools/perf/bench-ejs.js
//
// A CPU profile cannot answer this on its own: compiled templates are `new
// Function` bodies, so their samples land in an anonymous `(vm)` bucket that
// also holds idle time, GC and V8 internals. Wrapping the compiled function
// gives a direct number instead.
//
// Set MODE=noexists to memoize `fs.existsSync`, which stands in for include
// paths that resolve without touching the filesystem at all — ejs calls it once
// per `include()` per request from `getIncludePath`, ahead of its own template
// cache.
//
// Must be run with the repo root as cwd (see server.js).
import http from 'node:http';
import fs from 'node:fs';
import koaEjs from '@koa/ejs';

const MODE = process.env.MODE || 'base';
const modes = new Set(MODE.split(',').map((s) => s.trim()).filter(Boolean));
const ejs = koaEjs.ejs;
const origCompile = ejs.compile;

// An include runs inside its parent's timer, so the clock is charged once per
// request no matter how deep the template tree goes.
let execNs = 0n;
let execCount = 0;
let depth = 0;
let running = 0n;

if (modes.has('noexists')) {
  const orig = fs.existsSync;
  const memo = new Map();
  fs.existsSync = function(p) {
    let v = memo.get(p);
    if (v === undefined) memo.set(p, v = orig.call(this, p));
    return v;
  };
}

ejs.compile = function(template, opts) {
  const fn = origCompile.call(this, template, opts);
  return function timed(data) {
    if (depth++ === 0) running = process.hrtime.bigint();
    const leave = () => {
      if (--depth === 0) {
        execNs += process.hrtime.bigint() - running;
        execCount++;
      }
    };
    let out;
    try {
      out = fn.call(this, data);
    } catch (err) {
      leave();
      throw err;
    }
    if (out && typeof out.then === 'function') {
      return out.then((v) => {
        leave(); return v;
      }, (err) => {
        leave(); throw err;
      });
    }
    leave();
    return out;
  };
};

const {app} = await import('../../src/app-www.js');
const server = http.createServer(app.callback());
await new Promise((res) => server.listen(0, res));
const port = server.address().port;
const agent = new http.Agent({keepAlive: true, maxSockets: 1});

const urls = process.env.URLS.split('\n').map((s) => s.trim()).filter(Boolean);

function get(url) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const req = http.request({port, path: url, agent,
      headers: {'accept-encoding': 'identity', 'user-agent': 'bench/1.0'}},
    (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({status: res.statusCode,
          ms: Number(process.hrtime.bigint() - t0) / 1e6,
          srvMs: parseFloat(res.headers['x-response-time']) || 0,
          bytes: body.length});
      });
    });
    req.on('error', (e) => resolve({status: 0, ms: 0, bytes: 0, err: e.message}));
    req.end();
  });
}

const ROUNDS = Number(process.env.ROUNDS || 40);
// JIT warm-up is worth about 2x over the first few hundred requests
const WARM = Number(process.env.WARM || 25);

for (let i = 0; i < WARM; i++) {
  for (const u of urls) await get(u);
}

execNs = 0n;
execCount = 0;
const perUrl = new Map();
const t0 = process.hrtime.bigint();
for (let i = 0; i < ROUNDS; i++) {
  for (const u of urls) {
    const r = await get(u);
    let s = perUrl.get(u);
    if (!s) {
      perUrl.set(u, s = {n: 0, tot: 0, srv: 0, status: r.status, bytes: r.bytes});
    }
    s.n++; s.tot += r.ms; s.srv += r.srvMs;
  }
}
const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;
let srvMs = 0;
for (const v of perUrl.values()) srvMs += v.srv;
const execMs = Number(execNs) / 1e6;
const n = ROUNDS * urls.length;

console.log(JSON.stringify({
  mode: MODE, requests: n, topLevelRenders: execCount,
  wallMsPerReq: +(wallMs / n).toFixed(3),
  serverMsPerReq: +(srvMs / n).toFixed(3),
  templateExecMsPerReq: +(execMs / n).toFixed(3),
  templateExecPctOfServer: +(100 * execMs / srvMs).toFixed(1),
  perUrl: Object.fromEntries([...perUrl].map(([k, v]) =>
    [k, {status: v.status, kb: +(v.bytes / 1024).toFixed(1),
      msPerReq: +(v.tot / v.n).toFixed(3),
      srvMsPerReq: +(v.srv / v.n).toFixed(3)}])),
}, null, 1));

server.close();
process.exit(0);
