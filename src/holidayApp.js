import {holidayDetail} from './holidayDetail.js';
import {holidayMainIndex} from './holidayIndex.js';
import {holidayPdf} from './holidayPdf.js';
import {holidayYearIndex} from './holidayYearIndex.js';
import {isDigit} from './isDigit.js';

export async function holidayApp(ctx) {
  const rpath = ctx.request.path;
  ctx.state.il = ctx.request.query.i === 'on';
  if (rpath === '/holidays/') {
    await holidayMainIndex(ctx);
  } else if (rpath.endsWith('.pdf')) {
    await holidayPdf(ctx);
  } else if (isDigit(rpath, 10)) {
    await holidayYearIndex(ctx);
  } else {
    await holidayDetail(ctx);
  }
}
