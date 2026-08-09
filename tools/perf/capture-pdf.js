// Capture hashes of PDF *content streams* (pdfkit randomizes the /ID trailer,
// so whole-file bytes are never stable between runs).
import fs from 'node:fs';
import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const urls = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n')
    .filter(Boolean).slice(0, Number(process.argv[3] || 300));
const out = process.argv[4];
const port = Number(process.argv[5] || 8080);
const agent = new http.Agent({keepAlive: true, maxSockets: 1});

function get(url) {
  return new Promise((resolve) => {
    http.request({port, path: url, agent,
      headers: {'accept-encoding': 'identity'}}, (res) => {
      const c = [];
      res.on('data', (d) => c.push(d));
      res.on('end', () => resolve({status: res.statusCode, buf: Buffer.concat(c)}));
    }).on('error', () => resolve({status: 0, buf: Buffer.alloc(0)})).end();
  });
}

function streams(buf) {
  const parts = [];
  let i = 0;
  for (;;) {
    const s = buf.indexOf('stream\n', i);
    if (s === -1) break;
    const e = buf.indexOf('\nendstream', s);
    if (e === -1) break;
    const raw = buf.subarray(s + 7, e);
    try {
      parts.push(zlib.inflateSync(raw));
    } catch {
      parts.push(raw);
    }
    i = e + 5;
  }
  // pdfkit stamps the XMP metadata stream with the current time, so two
  // requests for the same URL never match byte-for-byte. Normalize it out.
  return Buffer.from(Buffer.concat(parts).toString('latin1')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g, 'TIMESTAMP')
      .replace(/D:\d{14}/g, 'D:TIMESTAMP'), 'latin1');
}

const res = {};
let empty = 0;
for (const url of urls) {
  const {status, buf} = await get(url);
  const st = streams(buf);
  if (st.length === 0) empty++;
  res[url] = status + ':' + st.length + ':' +
    crypto.createHash('sha256').update(st).digest('hex');
}
fs.writeFileSync(out, JSON.stringify(res));
console.log('captured', Object.keys(res).length, 'empty-stream responses:', empty, '->', out);
