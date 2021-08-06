import {Event, flags, HDate, months} from '@hebcal/core';
import {eventsToIcalendar} from '@hebcal/icalendar';
import {eventsToCsv} from '@hebcal/rest-api';
import fs from 'fs';
import pino from 'pino';
import minimist from 'minimist';

const argv = minimist(process.argv.slice(2), {
  boolean: ['dryrun', 'quiet', 'help', 'verbose'],
  alias: {h: 'help', n: 'dryrun', q: 'quiet', v: 'verbose'},
});

if (argv.help) {
  usage();
  process.exit(1);
}
const logger = pino({
  level: argv.verbose ? 'debug' : argv.quiet ? 'warn' : 'info',
  prettyPrint: {translateTime: true, ignore: 'pid,hostname'},
});

const THU = 4;
const FRI = 5;
const SAT = 6;
const caldesc = 'יוֹם כִּפּוּר קָטָן, minor day of atonement on the day preceeding each Rosh Chodesh';

const startYear = new HDate().getFullYear() - 1;
const endYear = startYear + 10;
logger.info(`Creating YKK events from ${startYear} to ${endYear}`);

const events = [];
for (let year = startYear; year <= endYear; year++) {
  // start at Iyyar because one may not fast during Nisan
  const monthsInYear = HDate.monthsInYear(year);
  for (let month = months.IYYAR; month <= monthsInYear; month++) {
    const nextMonth = month + 1;
    // Yom Kippur Katan is not observed on the day before Rosh Hashanah.
    // Not observed prior to Rosh Chodesh Cheshvan because Yom Kippur has just passed.
    // Not observed before Rosh Chodesh Tevet, because that day is Hanukkah.
    if (nextMonth === months.TISHREI || nextMonth === months.CHESHVAN || nextMonth === months.TEVET) {
      continue;
    }
    let ykk = new HDate(29, month, year);
    const dow = ykk.getDay();
    if (dow === FRI || dow === SAT) {
      ykk = ykk.onOrBefore(THU);
    }

    const ev = new Event(ykk, 'Yom Kippur Katan', flags.MINOR_FAST);
    const nextMonthName = HDate.getMonthName(nextMonth, year);
    ev.memo = `Minor Day of Atonement on the day preceeding Rosh Chodesh ${nextMonthName}`;
    events.push(ev);
  }
}

events.sort((a, b) => a.getDate().abs() - b.getDate().abs());

logger.info(`Created ${events.length} YKK events`);

(async () => {
  const str = await eventsToIcalendar(events, {
    title: 'Yom Kippur Katan',
    caldesc: caldesc,
    relcalid: '457ce561-311f-4eeb-9033-65561b7f7503',
    publishedTTL: 'PT30D',
  });

  const filename = 'yom-kippur-katan.ics';
  logger.info(`Creating ${filename}`);
  const icalStream = fs.createWriteStream(filename);
  icalStream.write(str);
  icalStream.close();
})();

const filename = 'yom-kippur-katan.csv';
logger.info(`Creating ${filename}`);
const csvStream = fs.createWriteStream(filename);
csvStream.write(eventsToCsv(events, {}));
csvStream.close();

// eslint-disable-next-line require-jsdoc
function usage() {
  const PROG = 'yk-katan.js';
  const usage = `
Options:
  --help           Help
  --dryrun         Prints the actions that ${PROG} would take
                     but does not remove anything
  --quiet          Only emit warnings and errors
`;
  console.log(usage);
}
