import {send} from '@koa/send';
import {DOCUMENT_ROOT} from './common.js';

export async function sendGif(ctx) {
  ctx.set('Cache-Control', 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0');
  ctx.type = 'image/gif';
  await send(ctx, '/__utm.gif', {root: DOCUMENT_ROOT});
  ctx.remove('Last-Modified');
}

export async function sendMatomoJs(ctx) {
  ctx.set('Cache-Control', 'private, max-age=0');
  ctx.type = 'application/javascript';
  return send(ctx, '/ma/ma.js', {root: DOCUMENT_ROOT});
}
