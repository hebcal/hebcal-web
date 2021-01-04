import {Event, flags, HDate} from '@hebcal/core';
import {IcalEvent} from '@hebcal/icalendar';
import kindness from './areyvut-kindness-a-day.json';

const version = IcalEvent.version();
const title = 'Kindness a Day';
const caldesc = 'Daily Act of Kindness and Quote from www.areyvut.org';
const preamble = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  `PRODID:-//hebcal.com/NONSGML Hebcal Calendar v1${version}//EN`,
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'X-PUBLISHED-TTL:PT7D',
  `X-WR-CALNAME:${title}`,
  `X-WR-CALDESC:${caldesc}`,
].map(IcalEvent.fold).join('\r\n');
process.stdout.write(preamble);
process.stdout.write('\r\n');

for (const [monthDay, arr] of Object.entries(kindness)) {
  const [monthStr, mday] = monthDay.split('-');
  const month = parseInt(monthStr, 10);
  const dt = new Date(2021, month - 1, +mday);
  const summary = cleanStr(arr[0]);
  const memo = cleanStr(arr[1]);
  const ev = new Event(new HDate(dt), summary, flags.USER_EVENT, {memo});
  const ical = new IcalEvent(ev, {});
  const lines = ical.getLongLines();
  const triggerIdx = lines.findIndex((line) => line.startsWith('TRIGGER'));
  lines[triggerIdx] = 'TRIGGER:P0DT9H0M0S';
  const catIdx = lines.findIndex((line) => line.startsWith('CATEGORIES'));
  lines[catIdx] = `CATEGORIES:${title}`;
  const alarmIdx = lines.findIndex((line) => line.startsWith('BEGIN:VALARM'));
  lines.splice(alarmIdx, 0,
      'CLASS:PUBLIC',
      `RRULE:FREQ=YEARLY;INTERVAL=1;BYMONTH=${month}`,
  );
  process.stdout.write(ical.toString());
  process.stdout.write('\r\n');
}

process.stdout.write('END:VCALENDAR\r\n');

/**
 * @return {string}
 * @param {string} s
 */
function cleanStr(s) {
  return s.trim().replace(/\.$/, '').replace(/\s+/g, ' ').trim();
}
