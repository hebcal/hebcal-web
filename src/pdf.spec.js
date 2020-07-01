import test from 'ava';
import {HebrewCalendar, Location} from '@hebcal/core';
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
  const events = new HebrewCalendar(options).events();

  renderPdf(events, String(year), options);
  t.pass('message');
});
