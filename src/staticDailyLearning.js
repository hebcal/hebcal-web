import {HDate, HebrewCalendar} from '@hebcal/core';
import {icalEventsToString, IcalEvent} from '@hebcal/icalendar';
import {eventsToCsv} from '@hebcal/rest-api';
import {dailyLearningConfig, makeIcalOpts} from './common.js';
import {exec} from 'node:child_process';
import util from 'util';
import fs from 'fs';

const execPromise = util.promisify(exec);

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

async function doCalendar(year, cfg) {
  const file = cfg.downloadSlug;
  console.log(file);
  const start = new HDate(new Date(year - 1, 11, 1));
  const end = new HDate(new Date(year + cfg.years - 1, 11, 31));
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
    dtstamp: IcalEvent.makeDtstamp(new Date()),
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
  const icals = events.map((ev) => new IcalEvent(ev, icalOpt));
  const icalFilename = `ical/${file}.ics`;
  const icalStream = fs.createWriteStream(icalFilename);
  const str = await icalEventsToString(icals, icalOpt);
  icalStream.write(str);
  icalStream.close();

  const csvFilename = `ical/${file}.csv`;
  const csvStream = fs.createWriteStream(csvFilename);
  csvStream.write(eventsToCsv(events, {}));
  csvStream.close();

  removeCompressed(icalFilename);
  removeCompressed(csvFilename);
  await runCommand(`nice brotli --keep --best ${icalFilename} ${csvFilename}`);
  await runCommand(`nice gzip --keep --best ${icalFilename} ${csvFilename}`);
}

(async function() {
  const dt = new Date();
  const year = dt.getFullYear();
  if (!fs.existsSync('ical')) {
    fs.mkdirSync('ical');
  }
  for (const cfg of Object.values(dailyLearningConfig)) {
    const file = cfg.downloadSlug;
    if (file === 'chofetz-chaim') {
      continue;
    }
    if (cfg.dailyLearningOptName && file) {
      await doCalendar(year, cfg);
    }
  }
})();
