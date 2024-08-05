import {Event, flags, HDate, HebrewCalendar, months} from '@hebcal/core';
import {getHolidayDescription} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import createError from 'http-errors';
import {basename} from 'path';
import {getHolidayMeta} from './getHolidayMeta.js';
import {
  categories,
  eventToHolidayItem,
  getFirstOcccurences,
  makeQueryAndDownloadProps,
  OMER_TITLE,
} from './holidayCommon.js';

const SHMINI_ATZERET = 'Shmini Atzeret';
const SIMCHAT_TORAH = 'Simchat Torah';
const SHMINI_SIMCHAT = `${SHMINI_ATZERET} & ${SIMCHAT_TORAH}`;

const groupings = {
  'Asara B\'Tevet': null,
  'Tu BiShvat': null,
  'Purim': [
    'Ta\'anit Esther',
    'Shushan Purim',
  ],
  'Pesach': [
    'Pesach Sheni',
  ],
  'Lag BaOmer': [
    OMER_TITLE,
  ],
  'Shavuot': null,
  'Tish\'a B\'Av': [
    'Tzom Tammuz',
  ],
  'Tu B\'Av': null,
  'Rosh Hashana': [
    'Tzom Gedaliah',
  ],
  'Yom Kippur': null,
  'Sukkot': null,
  'Chanukah': null,
};

groupings[SHMINI_SIMCHAT] = [
  SHMINI_ATZERET,
  SIMCHAT_TORAH,
];

async function makeHolidayItem(holiday, ev, il) {
  let item = eventToHolidayItem(ev, il);
  let name = ev.basename();
  if (holiday === SHMINI_SIMCHAT) {
    const origHref = item.href;
    const tmp = new Event(ev.getDate(), holiday, ev.getFlags());
    item = eventToHolidayItem(tmp, il);
    item.href = origHref;
    name = il ? SHMINI_ATZERET : SIMCHAT_TORAH;
  }
  const descrMedium = getHolidayDescription(ev, false) || ev.memo || '';
  const sentences = descrMedium.split(/\.\s+/).slice(0, 3);
  const firstTwo = sentences.join('. ');
  item.descrMedium = firstTwo + '.';
  item.meta = await getHolidayMeta(name);
  return item;
}

async function makeItems(events, il) {
  const items = [];
  for (const [holiday, related] of Object.entries(groupings)) {
    const name = holiday === SHMINI_SIMCHAT ? SHMINI_ATZERET : holiday;
    const evts = events.filter((ev) => ev.basename() === name);
    for (const ev of evts) {
      const item = await makeHolidayItem(holiday, ev, il);
      item.name = holiday;
      if (related) {
        const r = [];
        for (const relatedName of related) {
          const relatedEv = events.find((ev) => ev.basename() === relatedName);
          if (relatedEv) {
            r.push(eventToHolidayItem(relatedEv, il));
          }
        }
        item.related = r;
      }
      items.push(item);
    }
  }
  items.sort((a, b) => a.hd.abs() - b.hd.abs());
  return items;
}

export async function holidayYearIndex(ctx) {
  const rpath = ctx.request.path;
  const year = basename(rpath);
  const yearNum = parseInt(year, 10);
  if (isNaN(yearNum)) {
    throw createError(404, `Sorry, year ${year} is not numeric`);
  } else if (yearNum < 1 || yearNum > 9999) {
    throw createError(400, `Sorry, can't display holidays for year ${year}`);
  }
  const isHebrewYear = yearNum >= 3761 || year.indexOf('-') !== -1;
  const calendarYear = isHebrewYear ? (yearNum >= 3761 ? yearNum : yearNum + 3761): yearNum;
  const il = ctx.state.il;
  const options = {
    year: calendarYear,
    isHebrewYear,
    il,
    // shabbatMevarchim: true,
  };
  let events0 = HebrewCalendar.calendar(options);
  if (!il) {
    const eventsIlModern = HebrewCalendar.calendar({
      il: true,
      year: calendarYear,
      isHebrewYear,
    }).filter((ev) => ev.getFlags() === (flags.IL_ONLY | flags.MODERN_HOLIDAY));
    events0 = eventsIlModern.concat(events0);
    events0.sort((a, b) => a.getDate().abs() - b.getDate().abs());
  }

  const hyear = events0[0].getDate().getFullYear();
  const omerEv = new Event(new HDate(16, months.NISAN, hyear),
      OMER_TITLE, flags.OMER_COUNT, {emoji: '㊾'});
  events0 = events0.concat(omerEv);

  const events = getFirstOcccurences(events0);
  const items = await makeItems(events, il);

  const roshChodesh = events
      .filter((ev) => ev.getFlags() & flags.ROSH_CHODESH)
      .map((ev) => eventToHolidayItem(ev, il));

  const modernHolidays = events
      .filter((ev) => ev.getFlags() & flags.MODERN_HOLIDAY)
      .map((ev) => eventToHolidayItem(ev, il));

  const roshHashana = events.find((ev) => ev.basename() === 'Rosh Hashana');
  const q = makeQueryAndDownloadProps(ctx, {...options, numYears: 5});
  const greg1 = isHebrewYear ? calendarYear - 3761 : yearNum;
  const greg2 = isHebrewYear ? calendarYear - 3760 : yearNum;
  await ctx.render('holiday-year-index', {
    today: dayjs(),
    year: year.padStart(4, '0'),
    greg1,
    greg2,
    prev: isHebrewYear ? `${greg1 - 1}-${greg1}` : yearNum - 1,
    next: isHebrewYear ? `${greg2}-${greg2 + 1}` : yearNum + 1,
    isHebrewYear,
    calendarYear,
    categories,
    items,
    RH: dayjs(roshHashana.getDate().greg()),
    il,
    locationName: il ? 'Israel' : 'the Diaspora',
    iSuffix: il ? '?i=on' : '',
    q,
    isoDateStart: dayjs(events0[0].getDate().greg()).format('YYYY-MM') + '-01',
    options,
    amp: (q.amp === '1') ? true : undefined,
    roshChodesh,
    modernHolidays,
  });
}
