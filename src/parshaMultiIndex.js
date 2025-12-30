import {HDate, ParshaEvent, parshiot} from '@hebcal/core';
import {parshaYear} from '@hebcal/core/dist/esm/parshaYear';
import {getLeyningForParshaHaShavua} from '@hebcal/leyning';
import {parshaByBook, torahBookNames, VEZOT_HABERAKHAH} from './parshaCommon.js';
import {getDefaultHebrewYear, simchatTorahDate, yearIsOutsideHebRange} from './dateUtil.js';
import {makeETag} from './etag.js';
import {throw410} from './common.js';
import dayjs from 'dayjs';

export async function parshaMultiYearIndex(ctx) {
  const dt = new Date();
  const hd = new HDate(dt);
  const todayHebYear = hd.getFullYear();
  const q = ctx.request.query;
  const hyear0 = parseInt(q?.year, 10);
  const hyear = hyear0 || getDefaultHebrewYear(hd);
  if (hyear < 2 || hyear > 32000) {
    ctx.throw(400, 'Hebrew year must be in range 2-32000');
  } else if (yearIsOutsideHebRange(hyear)) {
    throw410(ctx);
  }
  ctx.response.etag = makeETag(ctx, q, {hyear});
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
  const il = q.i === 'on';
  const byParsha = new Map();
  for (const parshaName of parshiot) {
    byParsha.set(parshaName, new Map());
  }
  for (let yr = hyear - 1; yr <= hyear + 4; yr++) {
    const events = parshaYear(yr, il);
    const pe = new ParshaEvent({
      hdate: simchatTorahDate(yr, il),
      parsha: [VEZOT_HABERAKHAH],
      il,
    });
    events.push(pe);
    for (const ev of events) {
      const reading = getLeyningForParshaHaShavua(ev, il);
      const d = dayjs(ev.greg());
      const item = {ev, reading, d};
      const parsha = ev.p.parsha;
      // either 1- or 2-element array
      for (const parshaName of parsha) {
        const map = byParsha.get(parshaName);
        const prev = map.get(yr);
        if (prev) {
          prev.push(item);
        } else {
          map.set(yr, [item]);
        }
      }
    }
  }
  const canonical = new URL('https://www.hebcal.com/sedrot/grid');
  const inverse = new URL(canonical);
  const yearOverride = Boolean(hyear0);
  if (il) {
    canonical.searchParams.set('i', 'on');
  } else {
    inverse.searchParams.set('i', 'on');
  }
  if (yearOverride) {
    canonical.searchParams.set('year', hyear0);
    inverse.searchParams.set('year', hyear0);
  }
  const prev = new URL(canonical);
  prev.searchParams.set('year', hyear - 5);
  const next = new URL(canonical);
  next.searchParams.set('year', hyear + 5);
  const noIndex = hyear < todayHebYear - 20 || hyear > todayHebYear + 100;
  await ctx.render('parsha-multi-year-index', {
    il,
    hyear,
    parshaByBook,
    torahBookNames,
    byParsha,
    yearOverride,
    canonical,
    inverse,
    todayHebYear,
    noIndex,
    prev: prev.href,
    next: next.href,
  });
}
