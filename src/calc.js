import {HDate} from '@hebcal/core';
import {empty, makeHebDate} from './common.js';

// eslint-disable-next-line require-jsdoc
function makeHebDateOrToday(hyStr, hmStr, hdStr) {
  if (!empty(hyStr) && !empty(hmStr) && !empty(hdStr)) {
    return makeHebDate(hyStr, hmStr, hdStr);
  }
  return new HDate();
}

// eslint-disable-next-line require-jsdoc
export async function hebrewDateCalc(ctx) {
  ctx.state.title = 'Hebrew Date Calculator';
  const q = ctx.state.q = ctx.request.query;

  const hd1 = makeHebDateOrToday(q.hy1, q.hm1, q.hd1);
  q.hy1 = hd1.getFullYear();
  q.hm1 = hd1.getMonthName();
  q.hd1 = hd1.getDate();
  ctx.state.hm1 = hd1.getMonth();
  ctx.state.hleap1 = hd1.isLeapYear();

  const hd2 = makeHebDateOrToday(q.hy2, q.hm2, q.hd2);
  q.hy2 = hd2.getFullYear();
  q.hm2 = hd2.getMonthName();
  q.hd2 = hd2.getDate();
  ctx.state.hm2 = hd2.getMonth();
  ctx.state.hleap2 = hd2.isLeapYear();

  return ctx.render('calc');
}
