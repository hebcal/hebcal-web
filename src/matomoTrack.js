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
  const lang = ctx.get('accept-language');
  if (lang && lang.length) {
    args.set('lang', lang);
  }
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
  ctx.logger.info(`matomo: ${postData}`);
  const req = http.request(options);
  req.on('error', (err) => {
    ctx.logger.error(err);
  });
  req.write(postData);
  req.end();
}
