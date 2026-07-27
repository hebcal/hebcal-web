import {greg2abs} from '@hebcal/hdate';
import {HDate, HebrewCalendar, flags, Event, DailyLearning} from '@hebcal/core';
import {icalEventsToString, IcalEvent} from '@hebcal/icalendar';
import {eventsToCsv, getEventCategories, appendIsraelAndTracking} from '@hebcal/rest-api';
import {localeMap} from './lang.js';
import {dailyLearningConfig, makeIcalOpts} from './urlArgs.js';
import {addIcalParshaMemo, addCsvParshaMemo} from './parshaCommon.js';
import {makeIcalEvents} from './icalMemo.js';
import {readJSON} from './readJSON.js';
import '@hebcal/learning';

/**
 * Builds the multi-year .ics and .csv feeds published at
 * download.hebcal.com/ical/, which a weekly cron job regenerates.
 *
 * Everything here is a pure function of `today` — no argv, no filesystem, no
 * logging — so the feeds can be regression-tested. `makeStaticCalendars.js` is
 * the command-line wrapper that writes the results to disk.
 */

export const UTM_SRC = 'hebcal.com';
export const UTM_MED = 'icalendar';

export const staticCalendarConfig = readJSON('./staticCalendars.json');

/**
 * The window each feed covers: 90 days back, then `years` forward less 60 days
 * @param {Date} today
 * @param {number} years
 * @return {{start: HDate, end: HDate}}
 */
export function getStartAndEnd(today, years) {
  const nowAbs = greg2abs(today);
  const start = new HDate(nowAbs - 90); // 90 days ago
  const endAbs = nowAbs + Math.round(365.25 * years) - 60;
  const end = new HDate(endAbs);
  return {start, end};
}

/**
 * Event wrapper around a combo of Chofetz Chaim and Shemirat HaLashon
 */
export class ChofetzChaimShemiratHaLashonEvent extends Event {
  constructor(hd) {
    const ev1 = DailyLearning.lookup('chofetzChaim', hd, false);
    const ev2 = DailyLearning.lookup('shemiratHaLashon', hd, false);
    const desc = ev1.getDesc() + ' / ' + ev2.getDesc();
    super(hd, desc, flags.DAILY_LEARNING);
    this.ev1 = ev1;
    this.ev2 = ev2;
    const hdateStr = hd.getDate() + ' ' + hd.getMonthName();
    this.memo = 'Sefer Chofetz Chaim, ' + hdateStr + '\n' +
      ev1.render('memo') + '\n' +
      appendIsraelAndTracking(ev1.url(), false, UTM_SRC, UTM_MED, 'ical-chofetz-chaim') +
      '\n\n' +
      'Shemirat HaLashon, ' + hdateStr + '\n' +
      ev2.render('memo') + '\n' +
      appendIsraelAndTracking(ev2.url(), false, UTM_SRC, UTM_MED, 'ical-chofetz-chaim') +
      '\n\n';
    this.alarm = false;
    this.category = 'Chofetz Chaim';
    const startDate = IcalEvent.formatYYYYMMDD(hd.greg());
    this.uid = `hebcal-${startDate}-chofetz-chaim`;
  }
  /**
   * Returns name of reading
   * @param {string} [locale] Optional locale name (defaults to active locale).
   * @return {string}
   */
  render(locale) {
    return this.ev1.render(locale) + ' / ' + this.ev2.render(locale);
  }
  /** @return {string} */
  url() {
    return undefined;
  }
  /** @return {string[]} */
  getCategories() {
    return ['chofetzChaim'];
  }
}

/**
 * @param {any} cfg entry from `dailyLearningConfig`
 * @param {Date} today
 * @return {{file: string, events: Event[], icalOpt: any}}
 */
export function buildChofetzChaimCalendar(cfg, today) {
  const {start, end} = getStartAndEnd(today, cfg.years);
  const startAbs = start.abs();
  const endAbs = end.abs();
  const events = [];
  for (let abs = startAbs; abs <= endAbs; abs++) {
    events.push(new ChofetzChaimShemiratHaLashonEvent(new HDate(abs)));
  }
  const icalOpt = {
    ...cfg,
    title: cfg.shortName,
    // eslint-disable-next-line max-len
    caldesc: 'Daily study of the Sefer Chofetz Chaim and Shemirat HaLashon, which deal with the Jewish ethics and laws of speech',
    locale: 'en',
  };
  return {file: cfg.downloadSlug, events, icalOpt};
}

// Avoid "Ignoring unrecognized HebrewCalendar option: caldesc"
// warnings from HebrewCalendar.calendar()
const ignoreOpts = ['downloadSlug', 'years', 'noMajor', 'noMinorHolidays',
  'emoji', 'title', 'caldesc', 'relcalid', 'color', 'calendarColor',
  'ordinal', 'emojiStr', 'titleName', 'name', 'summary', 'he',
  'feedLength', 'noCSV', 'moreInfo', 'hasNoEmojiVersion',
  'shortName', 'descLong',
];

/**
 * @param {any} cfg entry from `staticCalendars.json`
 * @param {Date} today
 * @return {{file: string, events: Event[], icalOpt: any}}
 */
export function buildRegularCalendar(cfg, today) {
  const {start, end} = getStartAndEnd(today, cfg.years);
  const options = {...cfg, start, end};
  for (const opt of ignoreOpts) {
    delete options[opt];
  }
  let events = HebrewCalendar.calendar(options);
  if (cfg.noMinorHolidays) {
    events = events.filter((ev) => {
      const categories = getEventCategories(ev);
      return categories.length < 2 || categories[1] !== 'minor';
    });
  }
  return {file: cfg.downloadSlug, events, icalOpt: cfg};
}

/**
 * @param {any} cfg entry from `dailyLearningConfig`
 * @param {Date} today
 * @return {{file: string, events: Event[], icalOpt: any}}
 */
export function buildLearningCalendar(cfg, today) {
  const {start, end} = getStartAndEnd(today, cfg.years);
  const dlOpts = {};
  dlOpts[cfg.dailyLearningOptName] = true;
  const options = {
    start,
    end,
    il: false,
    locale: 'en',
    noHolidays: true,
    dailyLearning: dlOpts,
  };
  const events = HebrewCalendar.calendar(options);
  const query = {
    title: cfg.shortName,
    caldesc: cfg.descMedium,
  };
  const color = cfg.color;
  if (color) {
    query.color = color;
  }
  const icalOpt = makeIcalOpts(options, query);
  const relcalid = cfg.relcalid;
  if (relcalid) {
    icalOpt.relcalid = relcalid;
  }
  return {file: cfg.downloadSlug, events, icalOpt};
}

/**
 * Every feed published to download.hebcal.com/ical/. This is a generator so
 * the cron job can render and discard one calendar's events at a time.
 * @param {Date} today
 * @yields {{file: string, events: Event[], icalOpt: any}}
 */
export function* buildAllCalendars(today) {
  for (const cfg of staticCalendarConfig) {
    yield buildRegularCalendar(cfg, today);
  }
  for (const cfg of dailyLearningConfig) {
    const file = cfg.downloadSlug;
    if (file === 'chofetz-chaim') {
      yield buildChofetzChaimCalendar(cfg, today);
    } else if (cfg.dailyLearningOptName && file) {
      yield buildLearningCalendar(cfg, today);
    }
  }
}

/**
 * Renders one calendar to the two file bodies we publish.
 *
 * CAUTION: for a calendar with Torah readings this replaces `ev.memo` on the
 * Parsha events — the .ics carries the parsha summary while the .csv carries
 * the special-Shabbat name — so a calendar can only be rendered once.
 * @param {{file: string, events: Event[], icalOpt: any}} calendar
 * @param {string} dtstamp
 * @return {Promise<{ics: string, csv: string}>}
 */
export async function renderCalendar({file, events, icalOpt}, dtstamp) {
  if (icalOpt.sedrot) {
    events.forEach(addIcalParshaMemo);
  }
  icalOpt.dtstamp = dtstamp;
  icalOpt.utmSource = UTM_SRC;
  icalOpt.utmMedium = UTM_MED;
  icalOpt.utmCampaign = 'ical-' + file;
  icalOpt.publishedTTL = 'P7D';
  const ics = await icalEventsToString(makeIcalEvents(events, icalOpt), icalOpt);

  if (icalOpt.sedrot) {
    const il = icalOpt.il;
    const locale = icalOpt.locale;
    for (const ev of events.filter((ev) => ev.getFlags() & flags.PARSHA_HASHAVUA)) {
      delete ev.memo;
      addCsvParshaMemo(ev, il, locale);
    }
  }
  const locale = localeMap[icalOpt.locale] || 'en';
  // Write BOM for UTF-8
  const byteOrderMark = locale === 'en' ? '' : '\uFEFF';
  const csv = byteOrderMark + eventsToCsv(events, {});
  return {ics, csv};
}
