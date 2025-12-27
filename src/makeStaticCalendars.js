import {greg2abs} from '@hebcal/hdate';
import {HDate, HebrewCalendar, flags, Event, DailyLearning} from '@hebcal/core';
import {icalEventsToString, IcalEvent} from '@hebcal/icalendar';
import {eventsToCsv, getEventCategories, appendIsraelAndTracking} from '@hebcal/rest-api';
import {dailyLearningConfig, makeIcalOpts, localeMap} from './common.js';
import {addIcalParshaMemo, addCsvParshaMemo} from './parshaCommon.js';
import {readJSON} from './readJSON.js';
import {exec} from 'node:child_process';
import util from 'util';
import fs from 'fs';
import {basename} from 'path';
import minimist from 'minimist';
import pino from 'pino';

const argv = minimist(process.argv.slice(2), {
  boolean: ['help', 'quiet', 'verbose', 'nocompress'],
  alias: {h: 'help', q: 'quiet', v: 'verbose', c: 'nocompress'},
});

if (argv.help) {
  const usage = `Usage: ${basename(process.argv[1])} [options]
  --help           Help
  --quiet          Only emit warnings and errors
  --verbose        Extra debugging information
  --nocompress    Skip compressing .ics and .csv files
`;
  console.log(usage);
  // eslint-disable-next-line n/no-process-exit
  process.exit(0);
}

const logger = pino({
  level: argv.verbose ? 'debug' : argv.quiet ? 'warn' : 'info',
});

const execPromise = util.promisify(exec);
const TODAY = new Date();
TODAY.setSeconds(0, 0);
const DTSTAMP = IcalEvent.makeDtstamp(TODAY);
const UTM_SRC = 'hebcal.com';
const UTM_MED = 'icalendar';

async function runCommand(cmd) {
  logger.debug(cmd);
  try {
    const {stdout, stderr} = await execPromise(cmd);
    if (stderr) {
      logger.warn(stderr);
    }
    if (stdout) {
      logger.info(stdout);
    }
  } catch (error) {
    logger.fatal(error);
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
  const start = new HDate(nowAbs - 90); // 90 days ago
  const endAbs = nowAbs + Math.round(365.25 * years) - 60;
  const end = new HDate(endAbs);
  return {start, end};
}

/**
 * Event wrapper around a combo of Chofetz Chaim and Shemirat HaLashon
 */
class ChofetzChaimShemiratHaLashonEvent extends Event {
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

async function doChofetzChaim(cfg) {
  const file = cfg.downloadSlug;
  const {start, end} = getStartAndEnd(cfg.years);
  const startAbs = start.abs();
  const endAbs = end.abs();
  const events = [];
  for (let abs = startAbs; abs <= endAbs; abs++) {
    const hd = new HDate(abs);
    const ev = new ChofetzChaimShemiratHaLashonEvent(hd);
    events.push(ev);
  }
  const icalOpt = {
    ...cfg,
    title: cfg.shortName,
    // eslint-disable-next-line max-len
    caldesc: 'Daily study of the Sefer Chofetz Chaim and Shemirat HaLashon, which deal with the Jewish ethics and laws of speech',
    locale: 'en',
  };
  logger.info(`${file}: ${events.length}`);
  await writeEventsToFile(events, icalOpt, file);
}

// Avoid "Ignoring unrecognized HebrewCalendar option: caldesc"
// warnings from HebrewCalendar.calendar()
const ignoreOpts = ['downloadSlug', 'years', 'noMajor', 'noMinorHolidays',
  'emoji', 'title', 'caldesc', 'relcalid', 'color', 'calendarColor',
  'ordinal', 'emojiStr', 'titleName', 'name', 'summary', 'he',
  'feedLength', 'noCSV', 'moreInfo', 'hasNoEmojiVersion',
];

async function doRegularCalendar(cfg) {
  const file = cfg.downloadSlug;
  logger.debug(file);
  const {start, end} = getStartAndEnd(cfg.years);
  const options = {
    ...cfg,
    start: start,
    end: end,
  };
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
  logger.info(`${file}: ${events.length}`);
  await writeEventsToFile(events, cfg, file);
}

async function doLearningCalendar(cfg) {
  const file = cfg.downloadSlug;
  logger.debug(file);
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
  logger.info(`${file}: ${events.length}`);
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
  await writeEventsToFile(events, icalOpt, file);
}

function makeFilename(file, ext) {
  return `ical/${file}.${ext}`;
}

async function writeEventsToFile(events, icalOpt, file) {
  if (icalOpt.sedrot) {
    events.forEach(addIcalParshaMemo);
  }
  icalOpt.dtstamp = DTSTAMP;
  icalOpt.utmSource = UTM_SRC;
  icalOpt.utmMedium = UTM_MED;
  icalOpt.utmCampaign = 'ical-' + file;
  icalOpt.publishedTTL = 'P7D';
  const icals = events.map((ev) => new IcalEvent(ev, icalOpt));
  const icalFilename = makeFilename(file, 'ics');
  const icalStream = fs.createWriteStream(icalFilename);
  icalStream.on('close', () => {
    fs.utimesSync(icalFilename, TODAY, TODAY);
  });
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
  const csvFilename = makeFilename(file, 'csv');
  const csvStream = fs.createWriteStream(csvFilename);
  csvStream.on('close', () => {
    fs.utimesSync(csvFilename, TODAY, TODAY);
  });
  const locale = localeMap[icalOpt.locale] || 'en';
  if (locale !== 'en') {
    // Write BOM for UTF-8
    csvStream.write('\uFEFF');
  }
  csvStream.write(eventsToCsv(events, {}));
  csvStream.close();
}

async function compressFiles(files) {
  logger.info(`Compressing ${files.length} files`);
  for (const file of files) {
    const icalFilename = makeFilename(file, 'ics');
    const csvFilename = makeFilename(file, 'csv');
    removeCompressed(icalFilename);
    removeCompressed(csvFilename);
    await runCommand(`nice brotli --keep --best ${icalFilename} ${csvFilename}`);
    await runCommand(`nice gzip --keep --best ${icalFilename} ${csvFilename}`);
  }
}

(async function() {
  if (!fs.existsSync('ical')) {
    fs.mkdirSync('ical');
  }
  const staticCalendars = readJSON('./staticCalendars.json');
  const files = [];
  for (const cfg of staticCalendars) {
    await doRegularCalendar(cfg);
    files.push(cfg.downloadSlug);
  }
  for (const cfg of dailyLearningConfig) {
    const file = cfg.downloadSlug;
    if (file === 'chofetz-chaim') {
      await doChofetzChaim(cfg);
      files.push(file);
    } else if (cfg.dailyLearningOptName && file) {
      await doLearningCalendar(cfg);
      files.push(file);
    }
  }
  if (!argv.nocompress) {
    await compressFiles(files);
  }
  logger.info('Done');
})();
