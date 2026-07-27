import {describe, it, expect} from 'vitest';
import {HebrewCalendar, Location, HDate, Event, flags} from '@hebcal/core';
import {makeTorahMemoText, makeMemo} from '../src/torahMemo.js';

describe('makeTorahMemoText', () => {
  it('summarizes Torah, Haftarah and Sephardic Haftarah', () => {
    const events = HebrewCalendar.calendar({
      noHolidays: true,
      sedrot: true,
      start: new Date(2021, 1, 13),
      end: new Date(2021, 1, 13),
    });
    const memo = makeTorahMemoText(events[0], false).split('\n');
    expect(memo).toEqual([
      'Torah: Exodus 21:1-24:18; Numbers 28:9-15; Exodus 30:11-16',
      'Haftarah: II Kings 12:1-17 | Shabbat Shekalim (on Rosh Chodesh)',
      'Haftarah for Sephardim: II Kings 11:17-12:17',
    ]);
  });

  it('ignores user events but not holidays', () => {
    const hd = new HDate(new Date(2021, 1, 13));
    const userEvent = new Event(hd, 'User Event', flags.USER_EVENT);
    expect(makeTorahMemoText(userEvent, false)).toBe('');

    const holidayEvent = new Event(hd, 'Holiday Event', 0);
    expect(makeTorahMemoText(holidayEvent, false)).toBe('Haftarah: Isaiah 66:1-24');
  });

  it('ignores timed events', () => {
    const ev1 = HebrewCalendar.calendar({
      start: new Date(2020, 11, 14),
      end: new Date(2020, 11, 14),
    })[0];
    expect(makeTorahMemoText(ev1, false)).toBe('Torah: Numbers 7:30-41');
    const ev2 = HebrewCalendar.calendar({
      start: new Date(2020, 11, 14),
      end: new Date(2020, 11, 14),
      location: Location.lookup('Boston'),
      candlelighting: true,
    })[0];
    expect(makeTorahMemoText(ev2, false)).toBe('');
  });
});

describe('makeMemo', () => {
  it('prefers the Torah reading for Parashat ha-Shavua', () => {
    const ev = HebrewCalendar.calendar({
      noHolidays: true,
      sedrot: true,
      start: new Date(2020, 10, 28),
      end: new Date(2020, 10, 28),
    })[0];
    expect(makeMemo(ev, false)).toBe(
        'Torah: Genesis 28:10-32:3\n' +
        'Haftarah: Hosea 12:13-14:10\n' +
        'Haftarah for Sephardim: Hosea 11:7-12:12');
  });

  it('falls back to ev.memo and then the holiday description', () => {
    const hd = new HDate(new Date(2021, 1, 13));
    const ev = new Event(hd, 'Whatever', flags.USER_EVENT);
    ev.memo = 'Foo Bar';
    expect(makeMemo(ev, false)).toBe('Foo Bar');

    const chanukah = HebrewCalendar.calendar({
      start: new Date(2020, 11, 11),
      end: new Date(2020, 11, 11),
    })[0];
    expect(makeMemo(chanukah, false)).toContain('the Jewish festival of rededication');
  });
});
