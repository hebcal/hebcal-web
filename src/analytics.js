import ua from 'universal-analytics';
import mmh3 from 'murmurhash3';
import util from 'util';

// return array that have 4 elements of 32bit integer
const murmur128 = util.promisify(mmh3.murmur128);

/**
 * Middleware to track via Google Analytics only if
 * `ctx.state.trackPageview === true && ctx.status === 200`
 * @param {string} tid
 * @return {function}
 */
export function googleAnalytics(tid) {
  return async function googleAnalyticsPageview(ctx, next) {
    const cookieString = ctx.cookies.get('C');
    const cookie = new URLSearchParams(cookieString || '');
    const gaCookie = ctx.cookies.get('_ga');
    const userAgent = ctx.get('user-agent');
    const ipAddress = ctx.get('x-client-ip') || ctx.request.ip;
    let visitorId;
    if (gaCookie) {
      const parts = gaCookie.split('.');
      visitorId = parts[2] + '.' + parts[3];
    } else if (cookie.has('uid')) {
      visitorId = cookie.get('uid');
    } else {
      visitorId = await makeUuid(ipAddress, userAgent, ctx.get('accept-language'));
    }
    ctx.state.visitorId = visitorId;
    const options = {tid: ctx.state.trackingId || tid, cid: visitorId, enableBatching: true};
    const visitor = ctx.state.visitor = ua(options);
    visitor.set('ua', userAgent);
    visitor.set('dr', ctx.get('referrer'));
    visitor.set('uip', ipAddress);
    if (cookie.has('uid')) {
      visitor.set('uid', cookie.get('uid'));
    }
    await next();
    if (ctx.state.trackPageview === true && ctx.status === 200) {
      const rpath = ctx.request.path;
      const proto = ctx.get('x-forwarded-proto') || 'http';
      const host = ctx.get('host') || 'www.hebcal.com';
      const qs = ctx.request.querystring;
      let url = `${proto}://${host}${rpath}`;
      if (qs && qs.length) {
        url += `?${qs}`;
      }
      visitor.pageview({dl: url}).send();
    }
  };
}

/**
 * @private
 * @param {string} ipAddress
 * @param {string} userAgent
 * @param {string} acceptLanguage
 * @return {string}
 */
async function makeUuid(ipAddress, userAgent, acceptLanguage) {
  const raw = await murmur128(ipAddress + userAgent + acceptLanguage);
  const buf32 = new Uint32Array(raw);
  const bytes = new Uint8Array(buf32.buffer);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  let digest = '';
  for (let i = 0; i < 16; i++) {
    digest += bytes[i].toString(16).padStart(2, '0');
    switch (i) {
      case 3:
      case 5:
      case 7:
      case 9:
        digest += '-';
        break;
      default:
        break;
    }
  }
  return digest;
}
