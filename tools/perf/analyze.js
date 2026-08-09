// Summarize a .cpuprofile: self time by function, by file, and by package.
import fs from 'node:fs';

const p = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const self = new Map();
let totalTicks = 0;

// deltas[i] is the time between samples[i-1] and samples[i]
for (let i = 0; i < p.samples.length; i++) {
  const dt = p.timeDeltas[i] || 0;
  totalTicks += dt;
  const id = p.samples[i];
  self.set(id, (self.get(id) || 0) + dt);
}

const totalMs = totalTicks / 1000;

function pkg(url) {
  if (!url) return '(vm)';
  const m = url.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (m) return m[1];
  if (url.startsWith('node:')) return 'node:core';
  if (url.includes('/hebcal-web/src/')) return 'hebcal-web/src';
  return url || '(vm)';
}

const fnAgg = new Map();
const fileAgg = new Map();
const pkgAgg = new Map();

for (const [id, ms] of self) {
  const n = byId.get(id);
  if (!n) continue;
  const cf = n.callFrame;
  const url = cf.url || '';
  const short = url.replace(/^.*\/node_modules\//, '').replace(/^.*\/hebcal-web\//, '');
  const fname = cf.functionName || '(anonymous)';
  const key = `${fname} @ ${short}:${cf.lineNumber + 1}`;
  fnAgg.set(key, (fnAgg.get(key) || 0) + ms);
  fileAgg.set(short || '(vm)', (fileAgg.get(short || '(vm)') || 0) + ms);
  const pk = pkg(url);
  pkgAgg.set(pk, (pkgAgg.get(pk) || 0) + ms);
}

function dump(title, m, n) {
  console.log(`\n### ${title}  (total ${totalMs.toFixed(0)}ms)`);
  const rows = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  for (const [k, ms] of rows) {
    console.log(`${(ms / 1000).toFixed(1).padStart(8)}ms ${(100 * ms / totalTicks).toFixed(2).padStart(6)}%  ${k}`);
  }
}

dump('SELF TIME BY PACKAGE', pkgAgg, 20);
dump('SELF TIME BY FILE', fileAgg, 25);
dump('SELF TIME BY FUNCTION', fnAgg, 40);
