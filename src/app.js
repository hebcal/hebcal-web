import Koa from 'koa';
import compress from 'koa-compress';
import conditional from 'koa-conditional-get';
import etag from 'koa-etag';
import render from 'koa-ejs';
import path from 'path';
import pino from 'pino';
import fs from 'fs';
import util from 'util';

/*
const logDir = process.env.NODE_ENV == 'production' ? '/var/log/hebcal' : '.';
const dest = pino.destination(logDir + '/access.log');
const logger = pino(dest);
*/
const logger = pino();

const app = new Koa();

app.use(async (ctx, next) => {
  ctx.state = ctx.state || {};
  ctx.state.ip = ctx.request.ip;
  ctx.state.rpath = ctx.request.path;
  ctx.state.startTime = Date.now();
  try {
    // don't allow compress middleware to assume that a missing accept-encoding header implies 'accept-encoding: *'
    if (typeof ctx.request.header['accept-encoding'] == 'undefined') {
      ctx.request.header['accept-encoding'] = 'identity';
    }
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = err.message;
    ctx.app.emit('error', err, ctx);
  }
});

app.on('error', (err, ctx) => {
  logger.error(Object.assign(err, {
    ip: ctx.request.header['x-client-ip'] || ctx.request.ip,
    url: ctx.request.originalUrl,
  }));
});

app.use(conditional());
app.use(etag());
app.use(compress({
  threshold: 2048,
  gzip: true,
  deflate: true,
  br: true,
}));

render(app, {
  root: path.join(__dirname, 'views'),
  layout: 'layout',
  viewExt: 'ejs',
  debug: false,
  async: true,
});

const stat = util.promisify(fs.stat);

app.use(async (ctx, next) => {
  const rpath = ctx.request.path;
  if (rpath == '/favicon.ico' || rpath == '/robots.txt') {
    const fpath = path.join('/var/www/html', rpath);
    const fstat = await stat(fpath);
    if (fstat.isFile()) {
      ctx.set('Cache-Control', 'max-age=5184000');
      ctx.type = path.extname(fpath);
      ctx.length = fstat.size;
      ctx.lastModified = fstat.mtime;
      ctx.body = fs.createReadStream(fpath);
    }
  } else {
    const users = [{name: 'Dead Horse'}, {name: 'Jack'}, {name: 'Tom'}];
    await ctx.render('content', {
      users,
      title: 'foo ' + new Date(),
      last_updated_text: '',
      xtra_html: '',
      xtra_stylesheet: '',
      xtra_head: '',
    });
  }
  return next();
});

// logger
app.use(async (ctx) => {
  const duration = Date.now() - ctx.state.startTime;
  logger.info({
    ip: ctx.request.header['x-client-ip'] || ctx.request.ip,
    method: ctx.request.method,
    url: ctx.request.originalUrl,
    ua: ctx.request.header['user-agent'],
    cookie: ctx.request.header['cookie'],
    status: ctx.response.status,
    length: ctx.response.length,
    duration,
  });
});

const port = process.env.NODE_PORT || 8080;
app.listen(port, () => console.log('Koa server listening on port ' + port));
