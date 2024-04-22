import send from 'koa-send';

const DOCUMENT_ROOT = '/var/www/html';

export async function sendGif(ctx) {
  ctx.set('Cache-Control', 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0');
  ctx.type = 'image/gif';
  return send(ctx, '/__utm.gif', {root: DOCUMENT_ROOT});
}
