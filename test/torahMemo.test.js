import {describe, it, expect} from 'vitest';
import {calendar, Location, HDate, Event, flags} from '@hebcal/core';
import {makeTorahMemoText} from '../src/torahMemo.js';
import {makeEventMemo} from '../src/eventMemo.js';

describe('makeTorahMemoText', () => {
  it('summarizes Torah, Haftarah and Sephardic Haftarah', () => {
    const events = calendar({
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

  it('includes the Haftarah of Admonition or Consolation', () => {
    const memoForDate = (y, m, d) => {
      const events = calendar({
        noHolidays: true,
        sedrot: true,
        start: new Date(y, m, d),
        end: new Date(y, m, d),
      });
      return makeTorahMemoText(events[0], false).split('\n');
    };
    // Parashat Devarim: 3rd Haftarah of Admonition
    expect(memoForDate(2025, 7, 2)).toEqual([
      'Torah: Deuteronomy 1:1-3:22',
      'Haftarah: Isaiah 1:1-27 | Third Haftarah of Admonition',
    ]);
    // Parashat Vaetchanan: 1st Haftarah of Consolation
    expect(memoForDate(2025, 7, 9)).toEqual([
      'Torah: Deuteronomy 3:23-7:11',
      'Haftarah: Isaiah 40:1-26 | First Haftarah of Consolation',
    ]);
    // Parashat Matot-Masei: theme appears after the reason for a special Haftarah
    expect(memoForDate(2025, 6, 26)).toEqual([
      'Torah: Numbers 30:2-36:13, 28:9-15',
      'Haftarah: Jeremiah 2:4-28, 3:4 | Matot-Masei on Shabbat Rosh Chodesh' +
        ' | Second Haftarah of Admonition',
      'Haftarah for Sephardim: Jeremiah 2:4-28, 4:1-2; Isaiah 66:1, 66:23',
    ]);
    // Parashat Ki Teitzei: the displaced 3rd Haftarah of Consolation
    // chanted along with the 5th
    expect(memoForDate(2022, 8, 10)).toEqual([
      'Torah: Deuteronomy 21:10-25:19',
      'Haftarah: Isaiah 54:1-10, 54:11-55:5 | Ki Teitzei with 3rd Haftarah of' +
        ' Consolation | Third and Fifth Haftarah of Consolation',
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
    const ev1 = calendar({
      start: new Date(2020, 11, 14),
      end: new Date(2020, 11, 14),
    })[0];
    expect(makeTorahMemoText(ev1, false)).toBe('Torah: Numbers 7:30-41');
    const ev2 = calendar({
      start: new Date(2020, 11, 14),
      end: new Date(2020, 11, 14),
      location: Location.lookup('Boston'),
      candlelighting: true,
    })[0];
    expect(makeTorahMemoText(ev2, false)).toBe('');
  });
});

describe('makeEventMemo', () => {
  it('prefers the Torah reading for Parashat ha-Shavua', () => {
    const ev = calendar({
      noHolidays: true,
      sedrot: true,
      start: new Date(2020, 10, 28),
      end: new Date(2020, 10, 28),
    })[0];
    expect(makeEventMemo(ev, false)).toBe(
        'Torah: Genesis 28:10-32:3\n' +
        'Haftarah: Hosea 12:13-14:10\n' +
        'Haftarah for Sephardim: Hosea 11:7-12:12');
  });

  it('falls back to ev.memo and then the holiday description', () => {
    const hd = new HDate(new Date(2021, 1, 13));
    const ev = new Event(hd, 'Whatever', flags.USER_EVENT);
    ev.memo = 'Foo Bar';
    expect(makeEventMemo(ev, false)).toBe('Foo Bar');

    const chanukah = calendar({
      start: new Date(2020, 11, 11),
      end: new Date(2020, 11, 11),
    })[0];
    expect(makeEventMemo(chanukah, false)).toContain('the Jewish festival of rededication');
  });
});
