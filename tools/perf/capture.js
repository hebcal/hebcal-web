// Capture normalized ICS response bodies for before/after comparison.
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';

const urls = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n')
    .filter(Boolean).slice(0, Number(process.argv[3] || 400));
const out = process.argv[4];
const agent = new http.Agent({keepAlive: true, maxSockets: 1});

function get(url) {
  return new Promise((resolve) => {
    http.request({port: 8080, path: url, agent,
      headers: {'accept-encoding': 'identity'}}, (res) => {
      const c = [];
      res.on('data', (d) => c.push(d));
      res.on('end', () => resolve(Buffer.concat(c).toString('utf8')));
    }).on('error', () => resolve('')).end();
  });
}

const hashes = {};
for (const url of urls) {
  let body = await get(url);
  // DTSTAMP and the truncation-notice UID vary per request
  body = body.replace(/^DTSTAMP:.*$/gm, 'DTSTAMP:X')
      .replace(/^LAST-MODIFIED:.*$/gm, 'LAST-MODIFIED:X');
  hashes[url] = crypto.createHash('sha256').update(body).digest('hex');
}
fs.writeFileSync(out, JSON.stringify(hashes));
console.log('captured', Object.keys(hashes).length, '->', out);
