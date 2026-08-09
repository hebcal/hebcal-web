// Boots one of the Koa apps and exposes CPU-profile control on a second port,
// so a profile covers only the replay window and not module loading.
//
//   node tools/perf/server.js [download|www]
//
// Must be run with the repo root as cwd: createBaseApp() reads
// hebcal-dot-com.ini relative to cwd and the process exits if it is missing.
import http from 'node:http';
import fs from 'node:fs';
import inspector from 'node:inspector/promises';

const which = process.argv[2] === 'www' ? 'www' : 'download';
const {app} = await import(`../../src/app-${which}.js`);

const PORT = Number(process.env.PORT || 8080);
const ADMIN = Number(process.env.ADMIN_PORT || 9099);

const server = http.createServer(app.callback());
server.keepAliveTimeout = 30000;
server.listen(PORT, () => console.error(`${which} app on ${PORT}`));

const session = new inspector.Session();
session.connect();

http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/start')) {
      await session.post('Profiler.enable');
      await session.post('Profiler.setSamplingInterval', {interval: 200});
      await session.post('Profiler.start');
      res.end('started\n');
    } else if (req.url.startsWith('/stop')) {
      const {profile} = await session.post('Profiler.stop');
      const out = new URL('http://x' + req.url).searchParams.get('out') ||
        'profile.cpuprofile';
      fs.writeFileSync(out, JSON.stringify(profile));
      res.end('wrote ' + out + '\n');
    } else if (req.url.startsWith('/quit')) {
      res.end('bye\n');
      setTimeout(() => process.exit(0), 100);
    } else {
      res.end('usage: /start | /stop?out=FILE | /quit\n');
    }
  } catch (err) {
    res.statusCode = 500;
    res.end(String(err?.stack) + '\n');
  }
}).listen(ADMIN, () => console.error('admin on', ADMIN));
