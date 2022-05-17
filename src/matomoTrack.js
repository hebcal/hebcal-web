import http from 'node:http';
import {getIpAddress} from './common';

/**
 * @param {any} ctx
 * @param {any} params
 */
export function matomoTrack(ctx, params) {
  const args = new URLSearchParams(params);
  for (const p of ['idsite', 'rec', 'apiv']) {
    args.set(p, '1');
  }
  args.set('ua', ctx.get('user-agent'));
  args.set('lang', ctx.get('accept-language'));
  const ref = ctx.get('referer');
  if (ref && ref.length) {
    args.set('urlref', ref);
  }
  if (ctx.state.userId) {
    args.set('uid', ctx.state.userId);
  }
  const postData = args.toString();
  const ip = getIpAddress(ctx);
  const options = {
    hostname: 'www-internal.hebcal.com',
    port: 8080,
    path: '/matomo/matomo.php',
    method: 'POST',
    headers: {
      'X-Forwarded-For': ip,
      'X-Forwarded-Proto': 'https',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
    },
  };
  const req = http.request(options);
  req.on('error', (err) => {
    ctx.logger.error(err);
  });
  req.write(postData);
  req.end();
  plausibleTrack(ctx, params);
}

/**
 * @param {any} ctx
 * @param {any} params
 */
export function plausibleTrack(ctx, params) {
  const body = {
    domain: 'hebcal.com',
    name: 'event',
    url: makeUrl(ctx),
    props: params,
  };
  const ref = ctx.get('referer');
  if (ref && ref.length) {
    body.referrer = ref;
  }
  if (ctx.state.userId) {
    body.props.uid = ctx.state.userId;
  }
  const postData = JSON.stringify(body);
  const ip = getIpAddress(ctx);
  const options = {
    hostname: 'internal.analytics.hebcal.com',
    port: 8000,
    path: '/api/event',
    method: 'POST',
    headers: {
      'User-Agent': ctx.get('user-agent'),
      'X-Forwarded-For': ip,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  };
  const req = http.request(options);
  req.on('error', (err) => {
    ctx.logger.error(err);
  });
  req.write(postData);
  req.end();
}

/**
 * @param {*} ctx
 * @return {string}
 */
function makeUrl(ctx) {
  const rpath = ctx.request.path;
  const proto = ctx.get('x-forwarded-proto') || 'http';
  const host = ctx.get('host') || 'www.hebcal.com';
  const qs = ctx.request.querystring;
  let url = `${proto}://${host}${rpath}`;
  if (qs && qs.length) {
    url += `?${qs}`;
  }
  return url;
}
