import http from 'node:http';
import {getIpAddress} from './common';

/**
 * @param {*} ctx
 * @param {string} name
 * @param {*} props
 */
export function plausibleTrack(ctx, name, props) {
  const body = {
    domain: 'hebcal.com',
    name: name,
    url: makeUrl(ctx),
    props: props,
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
  ctx.logger.info({options, body}, 'plausible /api/event');
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
