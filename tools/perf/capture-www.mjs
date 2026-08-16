// Hashes normalized www responses so a before/after comparison can prove the
// rendered bytes did not change. Per-request nonces, timestamps and the stack
// trace on an error page are the only legitimately varying parts.
//
//   URLS_FILE=urls.txt OUT=before.json node tools/perf/capture-www.mjs
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
const {app} = await import('../../src/app-www.js');
const server = http.createServer(app.callback());
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const urls = fs.readFileSync(process.env.URLS_FILE, 'utf8').trim().split('\n');
const out = {};
for (const u of urls) {
  const {status, body} = await new Promise((res) => {
    http.get({port, path: u.trim(), headers: {'accept-encoding': 'identity'}},
        (r) => {
          const c = [];
          r.on('data', (x) => c.push(x));
          r.on('end', () => res({status: r.statusCode,
            body: Buffer.concat(c).toString('utf8')}));
        });
  });
  const norm = body
      .replace(/nonce="[^"]*"/g, 'nonce="X"')
      .replace(/g\.nonce='[^']*'/g, "g.nonce='X'")
      .replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'TS')
      .replace(/<!-- \S+ TS -->/g, '<!-- HOST TS -->')
      // RSS pubDate/lastBuildDate, the error page's Date() string, and the
      // source line numbers in a 500/404 stack trace
      .replace(/\w{3}, \d\d \w{3} \d{4} [\d:]+ GMT/g, 'RFC822')
      .replace(/\w{3} \w{3} \d\d \d{4} [\d:]+ GMT\+\d+ \([^)]*\)/g, 'DATESTR')
      .replace(/(app-www\.js):\d+:\d+/g, '$1:L:C');
  out[u] = status + ' ' + norm.length + ' ' +
    crypto.createHash('sha256').update(norm).digest('hex').slice(0, 16);
}
fs.writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
process.exit(0);
