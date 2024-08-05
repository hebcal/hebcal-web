import {holidayDetail} from './holidayDetail.js';
import {holidayMainIndex} from './holidayIndex.js';
import {holidayPdf} from './holidayPdf.js';
import {holidayYearIndex} from './holidayYearIndex.js';

export async function holidayApp(ctx) {
  ctx.lastModified = ctx.launchDate;
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
  const rpath = ctx.request.path;
  ctx.state.il = ctx.request.query.i === 'on';
  if (rpath === '/holidays/') {
    await holidayMainIndex(ctx);
  } else if (rpath.endsWith('.pdf')) {
    await holidayPdf(ctx);
  } else {
    const charCode = rpath.charCodeAt(10);
    if (charCode >= 48 && charCode <= 57) {
      await holidayYearIndex(ctx);
    } else {
      await holidayDetail(ctx);
    }
  }
}
