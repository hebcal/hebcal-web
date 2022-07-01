import http from 'node:http';

const knownRobots = {
  'check_http/v2.2 (monitoring-plugins 2.2)': 1,
  'GuzzleHttp/7': 1,
  'kube-probe/1.21': 1,
  'Mediapartners-Google': 1,
  'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)': 1,
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)': 1,
  'Mozilla/5.0 (compatible; BLEXBot/1.0; +http://webmeup-crawler.com/)': 1,
  'Mozilla/5.0 (compatible; DotBot/1.2; +https://opensiteexplorer.org/dotbot; help@moz.com)': 1,
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)': 1,
  'Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)': 1,
  'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)': 1,
  'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)': 1,
  'Rainmeter WebParser plugin': 1,
  'Varnish Health Probe': 1,
};

const isProduction = process.env.NODE_ENV === 'production';

/**
 * @param {*} ctx
 * @param {string} category
 * @param {string} action
 * @param {string} [name]
 * @param {*} [params={}]
 */
export function matomoTrack(ctx, category, action, name=null, params={}) {
  const userAgent = ctx.get('user-agent');
  if (userAgent && knownRobots[userAgent]) {
    return;
  }
  const args = new URLSearchParams(params);
  args.set('rec', '1');
  args.set('apiv', '1');
  const idsite = ctx.request.hostname === 'download.hebcal.com' ? '3' : '1';
  args.set('idsite', idsite);
  args.set('send_image', '0'); // prefer HTTP 204 instead of a GIF image
  args.set('e_c', category);
  args.set('e_a', action);
  if (name) {
    args.set('e_n', name);
  }
  args.set('ua', userAgent);
  const lang = ctx.get('accept-language');
  if (lang && lang.length) {
    args.set('lang', lang);
  }
  const ref = ctx.get('referer');
  if (ref && ref.length) {
    args.set('urlref', ref);
  }
  if (ctx.state.userId) {
    const uid = ctx.state.userId;
    const vid = uid.substring(0, 4) + uid.substring(24);
    args.set('uid', uid);
    args.set('_id', vid);
    args.set('cid', vid);
  }
  const postData = args.toString();
  const ipAddress = ctx.get('x-client-ip') || ctx.request.ip;
  const xfwd = ctx.get('x-forwarded-for') || ipAddress;
  const options = {
    hostname: 'www-internal.hebcal.com',
    port: 8080,
    path: '/ma/ma.php',
    method: 'POST',
    headers: {
      'Host': 'www.hebcal.com',
      'X-Forwarded-For': xfwd,
      'X-Client-IP': ipAddress,
      'X-Forwarded-Proto': 'https',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
    },
  };
  if (!isProduction) {
    ctx.logger.info(`matomo: ${postData}&clientIp=${ipAddress}`);
  }
  const req = http.request(options);
  req.on('error', (err) => {
    ctx.logger.error(err);
  });
  req.setTimeout(1000);
  req.write(postData);
  req.end();
}
