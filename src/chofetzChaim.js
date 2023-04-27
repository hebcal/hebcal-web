import {HDate} from '@hebcal/core';
import {chofetzChaim, ChofetzChaimEvent} from '@hebcal/learning';
import {eventsToIcalendar} from '@hebcal/icalendar';
import {eventsToCsv} from '@hebcal/rest-api';
import fs from 'fs';

(async function() {
  const events = [];
  const dt = new Date();
  const year = dt.getFullYear();
  const start = new HDate(new Date(year - 1, 11, 1));
  const end = new HDate(new Date(year + 1, 11, 31));
  const startAbs = start.abs();
  const endAbs = end.abs();
  for (let abs = startAbs; abs <= endAbs; abs++) {
    const hd = new HDate(abs);
    const reading = chofetzChaim(hd);
    const ev = new ChofetzChaimEvent(hd, reading);
    events.push(ev);
  }
  const icalStream = fs.createWriteStream('chofetz-chaim.ics');
  const str = await eventsToIcalendar(events, {
    title: 'Daily Chofetz Chaim',
    caldesc: 'Daily study of the Sefer Chofetz Chaim, which deals with the Jewish ethics and laws of speech',
    relcalid: 'a2a058a4-d2eb-45d8-9142-5976d4c85ebc',
  });
  icalStream.write(str);
  icalStream.close();

  const csvStream = fs.createWriteStream('chofetz-chaim.csv');
  csvStream.write(eventsToCsv(events, {}));
  csvStream.close();
})();
