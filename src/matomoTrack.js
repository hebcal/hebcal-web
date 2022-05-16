import https from 'node:https';

/**
 * @param {any} ctx
 * @param {any} params
 */
export function matomoTrack(ctx, params) {
  const args = new URLSearchParams(params);
  for (const p of ['idsite', 'rec', 'apiv']) {
    args.set(p, '1');
  }
  const ipAddress = ctx.get('x-client-ip') || ctx.request.ip;
  args.set('ua', ctx.get('user-agent'));
  args.set('cip', ipAddress);
  const ref = ctx.get('referer');
  if (ref && ref.length) {
    args.set('urlref', ref);
  }
  if (ctx.state.userId) {
    args.set('uid', ctx.state.userId);
  }
  const postData = args.toString();
  const options = {
    hostname: 'www.hebcal.com',
    port: 443,
    path: '/matomo/matomo.php',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
    },
  };
  const req = https.request(options);
  req.on('error', (err) => {
    ctx.logger.error(err);
  });
  req.write(postData);
  req.end();
}
