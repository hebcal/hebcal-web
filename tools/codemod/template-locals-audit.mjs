// Cross-checks the names tools/codemod/ejs-locals.mjs treats as locally bound
// against the data keys each template actually receives, which is the one
// failure mode that codemod cannot detect on its own (see its header).
//
//   URLS=$'/converter?gd=1&gm=1&gy=2000&g2h=1\n/holidays/' \
//     node tools/codemod/template-locals-audit.mjs
//
// Boots the www app, renders the given URLs, and reports any template where a
// bound name collides with a passed-in local. Coverage is only as good as the
// URL list: templates never rendered are listed separately. Run it against the
// pre-codemod sources, and widen coverage by hooking the same ejs.compile
// patch into a vitest setupFile if a route is hard to reach by URL.
//
// Must be run with the repo root as cwd (see tools/perf/server.js).
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import koaEjs from '@koa/ejs';

const ejs = koaEjs.ejs;
const orig = ejs.compile;
const keys = new Map();
ejs.compile = function(template, opts) {
  const fn = orig.call(this, template, opts);
  return function(data) {
    const f = opts.filename.replace(process.cwd() + '/', '');
    let s = keys.get(f);
    if (!s) keys.set(f, s = new Set());
    for (const k of Object.keys(data || {})) s.add(k);
    return fn.call(this, data);
  };
};

const {app} = await import('../../src/app-www.js');
const server = http.createServer(app.callback());
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
for (const u of process.env.URLS.split('\n')) {
  if (!u.trim()) continue;
  await new Promise((r) => http.get({port, path: u.trim()}, (res) => {
    res.resume();
    res.on('end', r);
  }));
}

const files = [...keys.keys()].sort();
const declared = execFileSync(process.execPath,
    ['tools/codemod/ejs-locals.mjs', '--declared', ...files], {encoding: 'utf8'});

let risks = 0;
for (const line of declared.trim().split('\n')) {
  const [f, names] = line.split('\t');
  const bound = (names || '').split(' ').filter(Boolean);
  const passed = keys.get(f);
  const both = bound.filter((n) => passed.has(n));
  if (both.length) {
    risks++;
    console.log(`SHADOWED  ${f}  ->  ${both.join(' ')}`);
  }
}
if (!risks) console.log(`no shadowing across ${files.length} rendered templates`);
process.exit(0);
