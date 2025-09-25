import {HDate, HebrewCalendar, flags} from '@hebcal/core';
import {icalEventsToString, IcalEvent} from '@hebcal/icalendar';
import {eventsToCsv, getEventCategories} from '@hebcal/rest-api';
import {dailyLearningConfig, makeIcalOpts, localeMap} from './common.js';
import {addIcalParshaMemo, addCsvParshaMemo} from './parshaCommon.js';
import {readJSON} from './readJSON.js';
import {exec} from 'node:child_process';
import util from 'util';
import fs from 'fs';
import {start} from 'node:repl';

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
  const startDt = new Date(TODAY);
  startDt.setDate(startDt.getDate() - 45); // 45 days ago
  const start = new HDate(startDt);
  const year = TODAY.getFullYear();
  const end = new HDate(new Date(year + years - 1, 11, 31));
  return {start, end};
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
      continue;
    }
    if (cfg.dailyLearningOptName && file) {
      await doLearningCalendar(cfg);
    }
  }
})();
