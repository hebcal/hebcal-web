import send from 'koa-send';

const DOCUMENT_ROOT = '/var/www/html';

// eslint-disable-next-line require-jsdoc
export async function emailOpen(ctx) {
  ctx.state.trackPageview = false;
  ctx.set('Cache-Control', 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0');
  ctx.type = 'image/gif';
  const visitor = ctx.state.visitor;
  if (visitor) {
    const params = {
      ec: 'email-open',
      ea: ctx.request.query['utm_campaign'],
      el: ctx.request.query['loc'],
      p: ctx.request.path,
      dh: ctx.get('host') || 'www.hebcal.com',
    };
    visitor.event(params).send();
  }
  return send(ctx, '/__utm.gif', {root: DOCUMENT_ROOT});
}
