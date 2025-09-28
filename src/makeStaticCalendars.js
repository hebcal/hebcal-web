import {greg2abs} from '@hebcal/hdate';
import {HDate, HebrewCalendar, flags, Event} from '@hebcal/core';
import {chofetzChaim, ChofetzChaimEvent, shemiratHaLashon, ShemiratHaLashonEvent} from '@hebcal/learning';
import {icalEventsToString, IcalEvent} from '@hebcal/icalendar';
import {eventsToCsv, getEventCategories} from '@hebcal/rest-api';
import {dailyLearningConfig, makeIcalOpts, localeMap} from './common.js';
import {addIcalParshaMemo, addCsvParshaMemo} from './parshaCommon.js';
import {readJSON} from './readJSON.js';
import {exec} from 'node:child_process';
import util from 'util';
import fs from 'fs';

const execPromise = util.promisify(exec);
const TODAY = new Date();
TODAY.setSeconds(0, 0);
const DTSTAMP = IcalEvent.makeDtstamp(TODAY);

async function runCommand(cmd) {
  console.log(cmd);
  try {
    const {stdout, stderr} = await execPromise(cmd);
    if (stderr) {
      console.error(stderr);
    }
    if (stdout) {
      console.error(stdout);
    }
  } catch (error) {
    console.error('Error: ', error);
    // eslint-disable-next-line n/no-process-exit
    process.exit(1);
  }
}

function removeCompressed(file) {
  for (const format of ['br', 'gz']) {
    const f = `${file}.${format}`;
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
    }
  }
}

function getStartAndEnd(years) {
  const nowAbs = greg2abs(TODAY);
  const start = new HDate(nowAbs - 45); // 45 days ago
  const endAbs = nowAbs + Math.floor(365.25 * years);
  const end = new HDate(endAbs);
  return {start, end};
}

/**
 * Event wrapper around a combo of Chofetz Chaim and Shemirat HaLashon
 */
class ChofetzChaimShemiratHaLashonEvent extends Event {
  /**
   * @param {HDate} hd
   * @param {any} reading1
   * @param {any} reading2
   */
  constructor(hd, reading1, reading2) {
    const ev1 = new ChofetzChaimEvent(hd, reading1);
    const ev2 = new ShemiratHaLashonEvent(hd, reading2);
    const desc = ev1.getDesc() + ' / ' + ev2.getDesc();
    super(hd, desc, flags.USER_EVENT);
    this.ev1 = ev1;
    this.ev2 = ev2;
    const hdateStr = hd.getDate() + ' ' + hd.getMonthName();
    this.memo = 'Sefer Chofetz Chaim, ' + hdateStr + '\n' +
      ev1.render('memo') + '\n' + ev1.url() + '\n\n' +
      'Shemirat HaLashon, ' + hdateStr + '\n' +
      ev2.render('memo') + '\n' + ev2.url();
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

async function doChofetzChaim(cfg) {
  const file = cfg.downloadSlug;
  const {start, end} = getStartAndEnd(cfg.years);
  const startAbs = start.abs();
  const endAbs = end.abs();
  const events = [];
  for (let abs = startAbs; abs <= endAbs; abs++) {
    const hd = new HDate(abs);
    const reading1 = chofetzChaim(hd);
    const reading2 = shemiratHaLashon(hd);
    const ev = new ChofetzChaimShemiratHaLashonEvent(hd, reading1, reading2);
    events.push(ev);
  }
  const icalOpt = {
    ...cfg,
    title: cfg.shortName,
    // eslint-disable-next-line max-len
    caldesc: 'Daily study of the Sefer Chofetz Chaim and Shemirat HaLashon, which deal with the Jewish ethics and laws of speech',
    dtstamp: DTSTAMP,
    publishedTTL: 'PT7D',
    locale: 'en',
  };
  console.log(file, events.length);
  await writeEventsToFile(events, icalOpt, file);
}

async function doRegularCalendar(cfg) {
  const file = cfg.downloadSlug;
  console.log(file);
  const {start, end} = getStartAndEnd(cfg.years);
  const options = {
    ...cfg,
    start: start,
    end: end,
  };
  let events = HebrewCalendar.calendar(options);
  if (options.noMinorHolidays) {
    events = events.filter((ev) => {
      const categories = getEventCategories(ev);
      return categories.length < 2 || categories[1] !== 'minor';
    });
  }
  console.log(file, events.length);
  const icalOpt = {
    ...cfg,
    dtstamp: DTSTAMP,
    publishedTTL: 'PT14D',
  };
  await writeEventsToFile(events, icalOpt, file);
}

async function doLearningCalendar(cfg) {
  const file = cfg.downloadSlug;
  console.log(file);
  const {start, end} = getStartAndEnd(cfg.years);
  const dlOpts = {};
  dlOpts[cfg.dailyLearningOptName] = true;
  const options = {
    start: start,
    end: end,
    il: false,
    locale: 'en',
    noHolidays: true,
    dailyLearning: dlOpts,
  };
  const events = HebrewCalendar.calendar(options);
  console.log(file, events.length);
  const query = {
    dtstamp: DTSTAMP,
    title: cfg.shortName,
    caldesc: cfg.descMedium,
    publishedTTL: 'PT14D',
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
  icalOpt.utmSource = 'hebcal.com';
  icalOpt.utmMedium = 'icalendar';
  icalOpt.utmCampaign = 'ical-' + file;
  await writeEventsToFile(events, icalOpt, file);
}

async function writeEventsToFile(events, icalOpt, file) {
  if (icalOpt.sedrot) {
    events.forEach(addIcalParshaMemo);
  }
  const icals = events.map((ev) => new IcalEvent(ev, icalOpt));
  const icalFilename = `ical/${file}.ics`;
  const icalStream = fs.createWriteStream(icalFilename);
  const str = await icalEventsToString(icals, icalOpt);
  icalStream.write(str);
  icalStream.close();

  if (icalOpt.sedrot) {
    const il = icalOpt.il;
    const locale = icalOpt.locale;
    for (const ev of events.filter((ev) => ev.getFlags() & flags.PARSHA_HASHAVUA)) {
      delete ev.memo;
      addCsvParshaMemo(ev, il, locale);
    }
  }
  const csvFilename = `ical/${file}.csv`;
  const csvStream = fs.createWriteStream(csvFilename);
  const locale = localeMap[icalOpt.locale] || 'en';
  if (locale !== 'en') {
    // Write BOM for UTF-8
    csvStream.write('\uFEFF');
  }
  csvStream.write(eventsToCsv(events, {}));
  csvStream.close();

  removeCompressed(icalFilename);
  removeCompressed(csvFilename);
  await runCommand(`nice brotli --keep --best ${icalFilename} ${csvFilename}`);
  await runCommand(`nice gzip --keep --best ${icalFilename} ${csvFilename}`);
}

(async function() {
  if (!fs.existsSync('ical')) {
    fs.mkdirSync('ical');
  }
  const staticCalendars = readJSON('./staticCalendars.json');
  for (const cfg of staticCalendars) {
    await doRegularCalendar(cfg);
  }
  for (const cfg of dailyLearningConfig) {
    const file = cfg.downloadSlug;
    if (file === 'chofetz-chaim') {
      await doChofetzChaim(cfg);
      continue;
    }
    if (cfg.dailyLearningOptName && file) {
      await doLearningCalendar(cfg);
    }
  }
})();
