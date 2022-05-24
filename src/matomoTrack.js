import http from 'node:http';
import {getIpAddress} from './common';

/**
 * @param {*} ctx
 * @param {string} category
 * @param {string} action
 * @param {string} [name]
 * @param {*} [params={}]
 */
export function matomoTrack(ctx, category, action, name=null, params={}) {
  const args = new URLSearchParams(params);
  for (const p of ['idsite', 'rec', 'apiv']) {
    args.set(p, '1');
  }
  args.set('send_image', '0'); // prefer HTTP 204 instead of a GIF image
  args.set('e_c', category);
  args.set('e_a', action);
  if (name) {
    args.set('e_n', name);
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
    path: '/ma/ma.php',
    method: 'POST',
    headers: {
      'Host': 'www.hebcal.com',
      'X-Forwarded-For': ip,
      'X-Forwarded-Proto': 'https',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
    },
  };
  // ctx.logger.info(`matomo: ${postData}`);
  const req = http.request(options);
  req.on('error', (err) => {
    ctx.logger.error(err);
  });
  req.write(postData);
  req.end();
}
