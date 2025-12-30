import http from 'node:http';
import {pkg} from './pkg.js';
import {getIpAddress} from './getIpAddress.js';

const knownRobots = {
  'check_http': 1,
  'checkhttp2': 1,
  'curl': 1,
  'Excel': 1,
  'GuzzleHttp': 1,
  'kube-probe': 1,
  'python-requests': 1,
  'Mediapartners-Google': 1,
  'Mozilla/5.0 (compatible; Google-Apps-Script)': 1,
  'Mozilla/5.0 (compatible; GoogleDocs; apps-spreadsheets; +http://docs.google.com)': 1,
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
 * @private
 * @param {string} userAgent
 * @return {boolean}
 */
function isRobot(userAgent) {
  if (typeof userAgent !== 'string' || userAgent.length === 0) {
    return false;
  }
  if (knownRobots[userAgent]) {
    return true;
  }
  const idx = userAgent.indexOf('/');
  if (idx !== -1) {
    const uaPrefix = userAgent.substring(0, idx);
    if (knownRobots[uaPrefix]) {
      return true;
    }
  }
  return false;
}

/**
 * @param {*} ctx
 * @param {string} category
 * @param {string} action
 * @param {string} [name]
 */
export function matomoTrack(ctx, category, action, name=null) {
  const userAgent = ctx.get('user-agent');
  if (isRobot(userAgent)) {
    return;
  }
  const params = {};
  const urlParam = ctx.request.href;
  if (urlParam) {
    const url = new URL(urlParam);
    url.search = ''; // always remove search params
    const pn = url.pathname;
    if (pn.startsWith('/yahrzeit/edit/')) {
      url.pathname = '/yahrzeit/edit/_ID_';
    } else if (pn.startsWith('/yahrzeit/verify/')) {
      url.pathname = '/yahrzeit/verify/_ID_';
    }
    params.url = url.href;
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
  if (lang?.length) {
    args.set('lang', lang);
  }
  const ref = ctx.get('referer');
  if (ref?.length) {
    args.set('urlref', ref);
  }
  if (ctx.state.userId) {
    const uid = ctx.state.userId;
    args.set('uid', uid);
    const vid = uid.substring(0, 4) + uid.substring(24);
    if (vid.length === 16) {
      args.set('_id', vid);
      args.set('cid', vid);
    }
  }
  const utmSource = ctx.request?.query?.utm_source;
  if (utmSource) {
    args.set('_rcn', utmSource);
  }
  const postData = args.toString();
  const postLen = Buffer.byteLength(postData);
  let path = '/ma/matomo.php';
  let sendPostBody = true;
  if (postLen < 4000) {
    path += '?' + postData;
    sendPostBody = false;
  }
  const ipAddress = getIpAddress(ctx);
  const xfwd = ctx.get('x-forwarded-for') || ipAddress;
  const httpHost = 'www.hebcal.com';
  const headers = {
    'Host': httpHost,
    'X-Forwarded-For': xfwd,
    'X-Client-IP': ipAddress,
    'X-Forwarded-Proto': 'https',
    'User-Agent': pkg.name + '/' + pkg.version,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': sendPostBody ? postLen : 0,
  };
  if (ref?.length) {
    headers.Referer = ref;
  }
  const hostname = isProduction ? 'matomo-internal.hebcal.com' : httpHost;
  const port = isProduction ? 8080 : 80;
  const options = {
    hostname: hostname,
    port: port,
    path: path,
    method: 'POST',
    headers: headers,
  };
  if (!isProduction) {
    ctx.logger.info(`matomo: ${postData}&clientIp=${ipAddress}`);
  }
  const req = http.request(options);
  req.on('error', (err) => {
    ctx.logger.error(err);
  });
  req.setTimeout(1000);
  if (sendPostBody) {
    req.write(postData);
  }
  req.end();
}
