import {HDate} from '@hebcal/core';
import {dailyRambam1, DailyRambamEvent} from '@hebcal/learning';
import {eventsToIcalendar} from '@hebcal/icalendar';
import {eventsToCsv} from '@hebcal/rest-api';
import fs from 'node:fs';

(async function() {
  const events = [];
  const dt = new Date();
  const year = dt.getFullYear();
  const start = new HDate(new Date(year - 1, 11, 1));
  const end = new HDate(new Date(year + 3, 11, 31));
  const startAbs = start.abs();
  const endAbs = end.abs();
  for (let abs = startAbs; abs <= endAbs; abs++) {
    const hd = new HDate(abs);
    const reading = dailyRambam1(hd);
    const ev = new DailyRambamEvent(hd, reading);
    events.push(ev);
  }
  const icalStream = fs.createWriteStream('rambam1.ics');
  const str = await eventsToIcalendar(events, {
    title: 'Daily Rambam',
    caldesc: 'Daily study of Maimonides’ Mishneh Torah legal code',
    relcalid: '13cb480b-a4a0-4667-8ec5-25819a2e37a1',
  });
  icalStream.write(str);
  icalStream.close();

  const csvStream = fs.createWriteStream('rambam1.csv');
  csvStream.write(eventsToCsv(events, {}));
  csvStream.close();
})();
