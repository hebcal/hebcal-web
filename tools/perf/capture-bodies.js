// Fetches uncompressed response bodies into a corpus directory, so that
// compress-bench.js can measure compression against real payloads rather than
// synthetic text.
//
//   node tools/perf/server.js download &
//   node tools/perf/capture-bodies.js /path/to/out/v4-ics.txt 200 /tmp/corpus/ics
//
// Requests go out with `Accept-Encoding: identity`, so what lands on disk is
// what the compressor would actually be handed.
import {mkdirSync, writeFileSync} from 'node:fs';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const [urlsFile, limitArg, outDir, portArg] = process.argv.slice(2);
if (!urlsFile || !outDir) {
  console.error('usage: node tools/perf/capture-bodies.js URLS_FILE LIMIT OUT_DIR [PORT]');
  process.exit(1);
}
const port = Number(portArg || 8080);
const urls = readFileSync(urlsFile, 'utf8').split('\n').filter(Boolean);
const limit = Math.min(Number(limitArg || 100), urls.length);

mkdirSync(outDir, {recursive: true});

let saved = 0;
let skipped = 0;
let bytes = 0;
for (let i = 0; i < limit; i++) {
  const u = urls[i];
  try {
    const res = await fetch(`http://localhost:${port}${u}`, {
      headers: {'accept-encoding': 'identity'},
    });
    if (res.status !== 200) {
      skipped++;
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) {
      skipped++;
      continue;
    }
    writeFileSync(join(outDir, String(i).padStart(5, '0')), buf);
    saved++;
    bytes += buf.length;
  } catch {
    skipped++;
  }
}
console.log(`saved ${saved} bodies (${(bytes / 1048576).toFixed(1)} MB, ` +
  `avg ${Math.round(bytes / Math.max(saved, 1)).toLocaleString()} bytes) to ${outDir}` +
  (skipped ? `, skipped ${skipped}` : ''));
