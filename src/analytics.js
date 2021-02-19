import ua from 'universal-analytics';
import querystring from 'querystring';

/**
 * Middleware to track via Google Analytics only if
 * `ctx.state.trackPageview === true && ctx.status === 200`
 * @param {string} tid
 * @return {function}
 */
export function googleAnalytics(tid) {
  return async function(ctx, next) {
    const cookieString = ctx.cookies.get('C');
    const cookie = querystring.parse(cookieString || '');
    const options = {tid, enableBatching: true};
    const gaCookie = ctx.cookies.get('_ga');
    if (gaCookie) {
      const parts = gaCookie.split('.');
      options.cid = parts[2] + '.' + parts[3];
    } else if (cookie.uid) {
      options.cid = cookie.uid;
    }
    const visitor = ctx.state.visitor = ua(options);
    visitor.set('ua', ctx.get('user-agent'));
    visitor.set('dr', ctx.get('referrer'));
    visitor.set('uip', ctx.get('x-client-ip') || ctx.request.ip);
    if (cookie.uid) {
      visitor.set('uid', cookie.uid);
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
