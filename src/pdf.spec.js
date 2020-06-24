import test from 'ava';
import {hebcal, Location} from '@hebcal/core';
import {renderPdf} from './pdf';

test('pdf', (t) => {
  const year = 2020;

  const options = {
    year: year,
    isHebrewYear: false,
    candlelighting: true,
    location: Location.lookup('Boston'),
    sedrot: true,
    omer: true,
    //  dafyomi: true,
    addHebrewDates: true,
    //  addHebrewDates: true,
    locale: 'ashkenazi',
  };
  const events = hebcal.hebrewCalendar(options);

  renderPdf(events, String(year), options);
  t.pass('message');
});
