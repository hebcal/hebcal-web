import Koa from 'koa';
import fs from 'fs';
import util from 'util';
import path from 'path';
import pino from 'pino';
import {yahrzeitDownload} from './yahrzeit';
import {hebcalDownload} from './hebcal';

const stat = util.promisify(fs.stat);
const logger = pino();

const app = new Koa();

// Fix up querystring so we can later use ctx.request.query
app.use(async (ctx, next) => {
  if (ctx.request.path.startsWith('/export')) {
    const semi = ctx.request.querystring.indexOf(';');
    if (semi != -1) {
      ctx.request.querystring = ctx.request.querystring.replace(/;/g, '&');
    }
  } else if (ctx.request.path.startsWith('/v2')) {
    const slash = ctx.request.path.indexOf('/', 6);
    if (slash != -1) {
      const data = ctx.request.path.substring(6, slash);
      const filename = ctx.request.path.substring(slash + 1);
      const buff = Buffer.from(data, 'base64');
      const qs = buff.toString('ascii');
      ctx.request.url = '/export/' + filename + '?' + qs;
    }
  }
  return next();
});

app.use(async (ctx, next) => {
  console.log(ctx.request.url);
  if (ctx.request.path == '/robots.txt') {
    ctx.body = 'User-agent: BadBot\nDisallow: /\n';
  } else if (ctx.request.path == '/favicon.ico' || ctx.request.path.startsWith('/ical')) {
    const fpath = path.join(__dirname, ctx.request.path);
    const fstat = await stat(fpath);
    if (fstat.isFile()) {
      ctx.type = path.extname(fpath);
      ctx.body = fs.createReadStream(fpath);
    }
  } else if (ctx.request.path.startsWith('/export')) {
    if (ctx.request.query.v == 'yahrzeit') {
      yahrzeitDownload(ctx);
    } else if (ctx.request.query.v == '1') {
      hebcalDownload(ctx);
    }
  }
  return next();
});

app.use(async (ctx) => {
  logger.info({
    ip: ctx.request.ip,
    method: ctx.request.method,
    url: ctx.request.url,
    ua: ctx.request.header['user-agent'],
    cookie: ctx.request.header['cookie'],
    status: ctx.response.status,
    length: ctx.response.length,
  });
});

app.listen(3000);
