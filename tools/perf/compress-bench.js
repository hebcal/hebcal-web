// Measures the CPU cost and the compression ratio of gzip, brotli and zstd
// over a corpus of real response bodies, so encoding choices and levels can be
// argued from numbers instead of defaults.
//
//   node tools/perf/capture-bodies.js urls.txt 200 /tmp/corpus/ics
//   node tools/perf/compress-bench.js /tmp/corpus/ics
//   node tools/perf/compress-bench.js /tmp/corpus/ics --levels=br:3,br:6,zstd:3
//
// Reports, per encoding and level, the median and mean per-body compression
// time, throughput, and the resulting size as a percentage of the identity
// body. The "vs best" column is the extra bytes over the smallest configuration
// tested, which is what a Vary: Accept-Encoding variant buys the client.
//
// Compression here is synchronous (zlib.gzipSync and friends), which is what
// koa-compress ends up doing per response for bodies it buffers. What matters
// for comparison is the relative cost, and sync avoids attributing thread-pool
// scheduling to the codec.
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const dirs = args.filter((a) => !a.startsWith('--'));
const levelsArg = args.find((a) => a.startsWith('--levels='));
const repsArg = args.find((a) => a.startsWith('--reps='));
const reps = Number(repsArg ? repsArg.slice('--reps='.length) : 3);

if (!dirs.length) {
  console.error('usage: node tools/perf/compress-bench.js CORPUS_DIR... [--levels=..] [--reps=N]');
  process.exit(1);
}

/** Default sweep: the levels worth considering for a live web server. */
const DEFAULT_LEVELS = [
  ['gzip', 1], ['gzip', 6], ['gzip', 9],
  ['br', 2], ['br', 3], ['br', 4], ['br', 5], ['br', 6], ['br', 9],
  ['zstd', 1], ['zstd', 3], ['zstd', 6], ['zstd', 10], ['zstd', 12], ['zstd', 15],
];

const levels = levelsArg ?
  levelsArg.slice('--levels='.length).split(',').map((s) => {
    const [enc, lvl] = s.split(':');
    return [enc, Number(lvl)];
  }) :
  DEFAULT_LEVELS;

/** @private */
function compressor(enc, level) {
  if (enc === 'gzip') {
    return (buf) => zlib.gzipSync(buf, {level});
  }
  if (enc === 'br') {
    return (buf) => zlib.brotliCompressSync(buf, {
      params: {
        [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
        [zlib.constants.BROTLI_PARAM_QUALITY]: level,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
      },
    });
  }
  if (enc === 'zstd') {
    return (buf) => zlib.zstdCompressSync(buf, {
      params: {
        // eslint-disable-next-line n/no-unsupported-features/node-builtins
        [zlib.constants.ZSTD_c_compressionLevel]: level,
      },
    });
  }
  throw new Error('unknown encoding ' + enc);
}

/** @private */
function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

for (const dir of dirs) {
  const files = readdirSync(dir).sort();
  const bodies = files.map((f) => readFileSync(join(dir, f)));
  const raw = bodies.reduce((s, b) => s + b.length, 0);
  console.log(`\n=== ${dir} ===`);
  console.log(`${bodies.length} bodies, ${(raw / 1048576).toFixed(1)} MB identity, ` +
    `avg ${Math.round(raw / bodies.length).toLocaleString()} bytes\n`);

  const results = [];
  for (const [enc, level] of levels) {
    const fn = compressor(enc, level);
    let out = 0;
    const times = [];
    // Warm up so the first configuration is not charged for JIT.
    fn(bodies[0]);
    for (const body of bodies) {
      let best = Infinity;
      let size = 0;
      for (let r = 0; r < reps; r++) {
        const t0 = process.hrtime.bigint();
        const c = fn(body);
        const dt = Number(process.hrtime.bigint() - t0) / 1e6;
        if (dt < best) best = dt;
        size = c.length;
      }
      times.push(best);
      out += size;
    }
    const total = times.reduce((s, t) => s + t, 0);
    results.push({
      enc, level, out,
      med: median(times),
      mean: total / times.length,
      mbps: raw / 1048576 / (total / 1000),
    });
  }

  const bestOut = Math.min(...results.map((r) => r.out));
  console.log('  enc   level   med ms   mean ms    MB/s   size%   vs best   MB out');
  for (const r of results) {
    const vsBest = ((r.out - bestOut) / bestOut * 100);
    console.log(
        `  ${r.enc.padEnd(5)} ${String(r.level).padStart(5)} ` +
        `${r.med.toFixed(2).padStart(8)} ${r.mean.toFixed(2).padStart(9)} ` +
        `${r.mbps.toFixed(0).padStart(7)} ` +
        `${(r.out / raw * 100).toFixed(2).padStart(7)} ` +
        `${(vsBest === 0 ? '-' : '+' + vsBest.toFixed(1) + '%').padStart(9)} ` +
        `${(r.out / 1048576).toFixed(1).padStart(8)}`,
    );
  }
}
