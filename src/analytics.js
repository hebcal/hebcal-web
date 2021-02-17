import ua from 'universal-analytics';
import querystring from 'querystring';

// eslint-disable-next-line require-jsdoc
export function googleAnalytics(tid) {
  return async function(ctx, next) {
    const persistentParams = {
      ua: ctx.get('user-agent'),
      dr: ctx.get('referrer'),
      uip: ctx.get('x-client-ip') || ctx.request.ip,
    };

    const cookieString = ctx.cookies.get('C');
    const ck = querystring.parse(cookieString || '');
    const cid = ck.uid;
    ctx.state.visitor = ua(tid, cid, null, null, persistentParams);
    return next();
  };
}
