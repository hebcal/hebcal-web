// Inclusive (total) time attributed to frames matching patterns.
// Each pattern reported independently (nested patterns overlap - that's intended).
import fs from 'node:fs';

const p = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const patterns = process.argv.slice(3);
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);

function label(n) {
  const cf = n.callFrame;
  const url = (cf.url || '').replace(/^.*\/node_modules\//, '').replace(/^.*\/hebcal-web\//, '');
  return `${cf.functionName || '(anon)'} @ ${url}:${cf.lineNumber + 1}`;
}

// memoize matched-pattern-set per node id (union of self + ancestors)
const memo = new Map();
function matches(id) {
  if (memo.has(id)) return memo.get(id);
  const n = byId.get(id);
  if (!n) return new Set();
  const par = parent.get(id);
  const s = new Set(par != null ? matches(par) : []);
  const l = label(n);
  for (const pat of patterns) if (l.includes(pat)) s.add(pat);
  memo.set(id, s);
  return s;
}

const agg = new Map();
let total = 0;
for (let i = 0; i < p.samples.length; i++) {
  const dt = p.timeDeltas[i] || 0;
  total += dt;
  for (const pat of matches(p.samples[i])) agg.set(pat, (agg.get(pat) || 0) + dt);
}

console.log(`total ${(total / 1000).toFixed(0)}ms`);
for (const [k, v] of [...agg.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${(v / 1000).toFixed(1).padStart(9)}ms ${(100 * v / total).toFixed(2).padStart(6)}%  ${k}`);
}
for (const pat of patterns) if (!agg.has(pat)) console.log(`      0.0ms   0.00%  ${pat}`);
