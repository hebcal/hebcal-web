// Replaces `typeof EXPR !== 'undefined'` with `EXPR !== undefined` inside EJS
// code regions only. Reuses the same-length shadow trick as ejs-locals.mjs so
// a match offset in the shadow is a byte offset in the template, and so
// `typeof` inside client-side <script> text is never touched.
import fs from 'node:fs';

function shadow(src) {
  const out = new Array(src.length).fill(' ');
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') out[i] = '\n';
  const openRe = /<%(%|_|=|-|#)?/g;
  let m;
  while ((m = openRe.exec(src))) {
    const kind = m[1];
    const openLen = m[0].length;
    if (kind === '%') continue;
    const closeRe = /(-|_)?%>/g;
    closeRe.lastIndex = m.index + openLen;
    const c = closeRe.exec(src);
    if (!c) break;
    openRe.lastIndex = c.index + c[0].length;
    if (kind === '#') continue;
    for (let i = m.index + openLen; i < c.index; i++) {
      if (src[i] !== '\n') out[i] = src[i];
    }
  }
  return out.join('');
}

const RE = /typeof\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*([!=]==)\s*'undefined'/g;
let total = 0;
for (const f of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const src = fs.readFileSync(f, 'utf8');
  const js = shadow(src);
  const edits = [];
  let m;
  while ((m = RE.exec(js))) {
    edits.push({start: m.index, end: m.index + m[0].length,
      text: `${m[1]} ${m[2]} undefined`});
  }
  if (!edits.length) continue;
  let out = ''; let pos = 0;
  for (const e of edits) {
    out += src.slice(pos, e.start) + e.text;
    pos = e.end;
  }
  out += src.slice(pos);
  total += edits.length;
  console.log(`${edits.length}\t${f}`);
  if (process.argv.includes('--write')) fs.writeFileSync(f, out);
}
console.log(`${total} guards`);
