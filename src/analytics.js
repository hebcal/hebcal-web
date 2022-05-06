import ua from 'universal-analytics';

const knownRobots = {
  'Mediapartners-Google': 1,
  'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)': 1,
  'Mozilla/5.0 (compatible; BLEXBot/1.0; +http://webmeup-crawler.com/)': 1,
  'Mozilla/5.0 (compatible; DotBot/1.2; +https://opensiteexplorer.org/dotbot; help@moz.com)': 1,
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)': 1,
  'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)': 1,
  'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)': 1,
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)': 1,
  'Rainmeter WebParser plugin': 1,
  'Varnish Health Probe': 1,
  'check_http/v2.2 (monitoring-plugins 2.2)': 1,
};

/**
 * Middleware to track via Google Analytics only if
 * `ctx.state.trackPageview === true && ctx.status === 200`
 * @param {string} tid
 * @return {function}
 */
export function googleAnalytics(tid) {
  return async function googleAnalyticsPageview(ctx, next) {
    const gaCookie = ctx.cookies.get('_ga');
    if (gaCookie) {
      const parts = gaCookie.split('.');
      ctx.state.visitorId = parts[2] + '.' + parts[3];
    }
    const options = {
      tid: ctx.state.trackingId || tid,
      cid: ctx.state.visitorId,
      enableBatching: true,
      http: true,
    };
    if (ctx.state.userId) {
      options.uid = ctx.state.userId;
    }
    const visitor = ctx.state.visitor = ua(options);
    const userAgent = ctx.get('user-agent');
    visitor.set('ua', userAgent);
    visitor.set('dr', ctx.get('referrer'));
    const ipAddress = ctx.get('x-client-ip') || ctx.request.ip;
    visitor.set('uip', ipAddress);
    await next();
    let trackPageview = Boolean(ctx.state.trackPageview && ctx.status === 200);
    if (trackPageview && knownRobots[userAgent]) {
      trackPageview = false;
    }
    if (trackPageview) {
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
