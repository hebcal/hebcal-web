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
  const latlong = (q.g === 'on' || q.g == '1');
  const items = ctx.db.autoComplete(qraw, latlong);
  if (items.length) {
    if (!latlong) {
      for (const item of items) {
        delete item.population;
      }
    }
    ctx.body = items;
  } else {
    ctx.status = 404;
    ctx.body = NOTFOUND;
  }
}
