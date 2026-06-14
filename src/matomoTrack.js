import http from 'node:http';
import {pkg} from './pkg.js';
import {getIpAddress} from './getIpAddress.js';
import {isRobot} from './isRobot.js';

const isProduction = process.env.NODE_ENV === 'production';

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
  const options = {
    hostname: httpHost,
    port: 80,
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
