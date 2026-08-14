import {IcalEvent} from '@hebcal/icalendar';
import {buildAllCalendars, renderCalendar} from './staticCalendars.js';
import {exec} from 'node:child_process';
import util from 'node:util';
import fs from 'node:fs';
import {basename} from 'node:path';
import pino from 'pino';

const {values: argv} = util.parseArgs({
  options: {
    help: {type: 'boolean', short: 'h'},
    quiet: {type: 'boolean', short: 'q'},
    verbose: {type: 'boolean', short: 'v'},
    nocompress: {type: 'boolean', short: 'c'},
  },
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

function makeFilename(file, ext) {
  return `ical/${file}.${ext}`;
}

function writeFile(filename, contents) {
  fs.writeFileSync(filename, contents);
  fs.utimesSync(filename, TODAY, TODAY);
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
  const files = [];
  for (const calendar of buildAllCalendars(TODAY)) {
    const file = calendar.file;
    logger.info(`${file}: ${calendar.events.length}`);
    const {ics, csv} = await renderCalendar(calendar, DTSTAMP);
    writeFile(makeFilename(file, 'ics'), ics);
    writeFile(makeFilename(file, 'csv'), csv);
    files.push(file);
  }
  if (!argv.nocompress) {
    await compressFiles(files);
  }
  logger.info('Done');
})();
