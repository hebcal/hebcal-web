import {holidayDetail} from './holidayDetail.js';
import {holidayMainIndex} from './holidayIndex.js';
import {holidayYearIndex} from './holidayYearIndex.js';
import {isDigit} from './isDigit.js';

export async function holidayApp(ctx) {
  const rpath = ctx.request.path;
  ctx.state.il = ctx.request.query.i === 'on';
  if (rpath === '/holidays/') {
    await holidayMainIndex(ctx);
  } else if (rpath.endsWith('.pdf')) {
    // Remove /holidays/hebcal-*.pdf rendering from app-www.
    // PDF rendering now served exclusively by https://github.com/hebcal/hebcal-api-go
    ctx.throw(501, 'This service does not render PDFs');
  } else if (isDigit(rpath, 10)) {
    await holidayYearIndex(ctx);
  } else {
    await holidayDetail(ctx);
  }
}
