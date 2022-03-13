const NOTFOUND = {error: 'Not Found'};

// eslint-disable-next-line require-jsdoc
export async function geoAutoComplete(ctx) {
  if (ctx.get('if-modified-since')) {
    ctx.status = 304;
    ctx.body = {status: 'Not Modified'};
    return;
  }
  const q = ctx.request.query;
  const qraw = typeof q.q === 'string' ? q.q.trim() : '';
  if (qraw.length === 0) {
    ctx.status = 404;
    ctx.body = NOTFOUND;
    return;
  }
  const items = ctx.db.autoComplete(qraw, false);
  if (items.length) {
    ctx.body = items;
  } else {
    ctx.status = 404;
    ctx.body = NOTFOUND;
  }
}
