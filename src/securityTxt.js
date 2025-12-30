import {makeETag} from './etag.js';

export async function securityTxt(ctx) {
  const dt = new Date();
  ctx.response.etag = makeETag(ctx, {}, {
    yy: dt.getFullYear(),
    mm: dt.getMonth(),
    dd: dt.getDate(),
  });
  ctx.type = 'text/plain';
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
  dt.setFullYear(dt.getFullYear() + 1);
  dt.setHours(0, 0, 0, 0);
  const expires = dt.toISOString();
  ctx.body = 'Contact: mailto:security@hebcal.com\n' +
    `Expires: ${expires}\n` +
    'OpenBugBounty: https://openbugbounty.org/bugbounty/HebcalDotCom/\n';
}
