/* eslint-disable max-len */
import {describe, it, expect} from 'vitest';
import {
  HebrewCalendar,
  Location,
  HDate,
  Event,
  flags,
  ParshaEvent,
  HolidayEvent,
  HebrewDateEvent,
  OmerEvent,
} from '@hebcal/core';
import {DafYomiEvent} from '@hebcal/learning';
import {createMemo, makeIcalEvents, makeIcalendar} from '../src/icalCommon.js';
import {getParshaSummary} from '../src/parshaCommon.js';

describe('createMemo', () => {
  it('makes a Torah reading memo for Parashat ha-Shavua', () => {
    const options = {year: 1993, month: 4, sedrot: true, noHolidays: true};
    const events = HebrewCalendar.calendar(options);
    expect(createMemo(events[0], options)).toBe(
        'In Tzav (“Command”), God tells Moses about the sacrifices offered in the ' +
        'Mishkan (Tabernacle), including a meal offering brought by the high ' +
        'priest, guilt offerings, and offerings of thanks. Moses initiates Aaron ' +
        'and Aaron’s sons for priestly service in the Mishkan.\n\n' +
        'Torah: Leviticus 6:1-8:36\n' +
        'Haftarah: Malachi 3:4-24 | Shabbat HaGadol\n\n' +
        'https://hebcal.com/s/5753/25?us=ical&um=icalendar');

    const options2 = {year: 1993, month: 6, sedrot: true, noHolidays: true};
    const events2 = HebrewCalendar.calendar(options2);
    expect(createMemo(events2[2], options2)).toBe(
        'Parashat Korach recounts the rebellion of Korach (a cousin of Moses and ' +
        'Aaron), Dathan, Abiram, and 250 of their followers. Some rebels are ' +
        'swallowed by the ground, while others are consumed by a fire from God ' +
        'and others die in a plague. The portion ends by describing gifts given ' +
        'to priests and Levites.\n\n' +
        'Torah: Numbers 16:1-18:32, 28:9-15\n' +
        'Haftarah: Isaiah 66:1-24 | Shabbat Rosh Chodesh\n\n' +
        'https://hebcal.com/s/5753/38?us=ical&um=icalendar');
  });

  it('appends the URL to an existing memo', () => {
    const options = {
      year: 1993,
      month: 4,
      noMinorFast: true,
      noRoshChodesh: true,
      noSpecialShabbat: true,
    };
    const events = HebrewCalendar.calendar(options);
    const memo = 'Passover, the Feast of Unleavened Bread';
    const erevPesach = new HolidayEvent(
        events[0].getDate(), events[0].getDesc(), events[0].getFlags(), {memo});
    expect(createMemo(erevPesach, options)).toBe(
        'Passover, the Feast of Unleavened Bread\n\n' +
        'https://hebcal.com/h/pesach-1993?us=ical&um=icalendar');
  });

  it('combines memo, Torah reading and URL', () => {
    const options = {
      year: 1993,
      month: 4,
      noMinorFast: true,
      noRoshChodesh: true,
      noSpecialShabbat: true,
    };
    const events = HebrewCalendar.calendar(options);
    const pesachII = new HolidayEvent(
        events[2].getDate(), events[2].getDesc(), events[2].getFlags(),
        {memo: 'Passover, the Feast of Unleavened Bread'});
    expect(createMemo(pesachII, options)).toBe(
        'Passover, the Feast of Unleavened Bread\n\n' +
        'Torah: Leviticus 22:26-23:44; Numbers 28:16-25\n' +
        'Haftarah: II Kings 23:1-9, 23:21-25\n\n' +
        'https://hebcal.com/h/pesach-1993?us=ical&um=icalendar');
  });

  it('uses the holiday description', () => {
    const options = {
      start: new Date(2020, 11, 11),
      end: new Date(2020, 11, 11),
      location: Location.lookup('Boston'),
      candlelighting: true,
    };
    const events = HebrewCalendar.calendar(options);
    expect(createMemo(events[0], options)).toBe(
        'Hanukkah, the Jewish festival of rededication. Also known as the Festival ' +
        'of Lights, the eight-day festival is observed by lighting the candles of a ' +
        'hanukkiah (menorah)\n\n' +
        'https://hebcal.com/h/chanukah-2020?us=ical&um=icalendar');
  });

  it('adds i=on to Israel URLs', () => {
    const options = {
      start: new Date(2021, 8, 28),
      end: new Date(2021, 8, 28),
      il: true,
    };
    const events = HebrewCalendar.calendar(options);
    expect(createMemo(events[0], options)).toBe(
        'Eighth Day of Assembly. Immediately following Sukkot, it is observed as a ' +
        'separate holiday in the Diaspora and is combined with Simchat Torah in Israel\n\n' +
        'Torah: Deuteronomy 33:1-34:12; Genesis 1:1-2:3; Numbers 29:35-30:1\n' +
        'Haftarah: Joshua 1:1-18\n\n' +
        'https://hebcal.com/h/shmini-atzeret-2021?i=on&us=ical&um=icalendar');
  });

  it('makes a URL-only memo for daily learning', () => {
    const options = {
      year: 1993,
      month: 3,
      noHolidays: true,
      dailyLearning: {dafYomi: true},
      locale: 'he',
    };
    const ev = HebrewCalendar.calendar(options)[0];
    expect(ev.getDesc()).toBe('Nedarim 14');
    expect(createMemo(ev, options)).toBe(
        'https://www.sefaria.org/Nedarim.14a?lang=bi&utm_source=hebcal.com&utm_medium=icalendar');
  });

  it('falls back to the linked event', () => {
    const options = {
      start: new Date(2021, 5, 27),
      end: new Date(2021, 5, 27),
      location: Location.lookup('Providence'),
      candlelighting: true,
    };
    const events = HebrewCalendar.calendar(options);
    const memos = events.map((ev) => createMemo(ev, options));
    expect(events.map((ev) => ev.getDesc())).toEqual([
      'Fast begins', 'Tzom Tammuz', 'Fast ends',
    ]);
    expect(memos[0]).toBe('Tzom Tammuz');
    expect(memos[2]).toBe('Tzom Tammuz');
    expect(memos[1]).toBe(
        'Fast commemorating breaching of the walls of Jerusalem before the ' +
        'destruction of the Second Temple\n\n' +
        'Torah: Exodus 32:11-14, 34:1-10\n\n' +
        'https://hebcal.com/h/tzom-tammuz-2021?us=ical&um=icalendar');

    const hd = new HDate(22, 'Iyyar', 5781);
    const userEv = new Event(hd, 'Foo Bar Baaz', flags.USER_EVENT, {
      linkedEvent: new HebrewDateEvent(hd),
    });
    expect(createMemo(userEv, {})).toBe('22nd of Iyyar, 5781');
  });

  it('renders the Omer count in English, Hebrew and transliteration', () => {
    const ev = new OmerEvent(new HDate(22, 'Iyyar', 5781), 37);
    expect(createMemo(ev, {})).toBe(
        'Today is 37 days, which are 5 weeks and 2 days of the Omer\n\n' +
        'הַיּוֹם שִׁבְעָה וּשְׁלוֹשִׁים יוֹם, שֶׁהֵם חֲמִשָּׁה שָׁבוּעוֹת וּשְׁנֵי יָמִים לָעֽוֹמֶר\n\n' +
        'Might within Foundation\nגְּבוּרָה שֶׁבִּיְסוֹד\nGevurah shebiYesod');
  });

  it('returns ev.memo untouched for candles and havdalah', () => {
    const options = {
      start: new Date(1993, 2, 12),
      end: new Date(1993, 2, 14),
      location: Location.lookup('Chicago'),
      candlelighting: true,
      noHolidays: true,
    };
    const events = HebrewCalendar.calendar(options);
    expect(events.map((ev) => ev.getDesc())).toEqual(['Candle lighting', 'Havdalah']);
    expect(events.map((ev) => createMemo(ev, options))).toEqual(['', '']);
  });

  it('honors utmCampaign', () => {
    const ev1 = new ParshaEvent({
      hdate: new HDate(new Date(2022, 3, 30)),
      parsha: ['Kedoshim'],
      il: true,
      chag: false,
      num: -1,
    });
    expect(createMemo(ev1, {utmCampaign: 'ical-foo-bar'})).toBe(
        'Kedoshim (“Holy”) opens by instructing the Israelites to be holy. It ' +
        'details dozens of laws regulating all aspects of life, including ' +
        'observing Shabbat, loving one’s neighbor, and leaving portions of a ' +
        'field for the poor. It ends by detailing punishments for certain types ' +
        'of idolatry and sexual misconduct.\n\n' +
        'Torah: Leviticus 19:1-20:27\n' +
        'Haftarah: I Samuel 20:18-42 | Shabbat Machar Chodesh\n\n' +
        'https://hebcal.com/s/5782i/30?uc=ical-foo-bar');

    const ev2 = new DafYomiEvent(new HDate(new Date(1995, 11, 17)));
    expect(createMemo(ev2, {utmCampaign: 'ical-foo-bar'})).toBe(
        'https://www.sefaria.org/Avodah_Zarah.68a?lang=bi&utm_source=hebcal.com' +
        '&utm_medium=icalendar&utm_campaign=ical-foo-bar');
  });

  it('honors utmSource and utmMedium', () => {
    const ev = new TestEvent(new HDate(22, 'Iyyar', 5781));
    expect(createMemo(ev, {utmSource: 'baaz', utmCampaign: 'quux'})).toBe(
        'https://www.hebcal.com/foobar?utm_source=baaz&utm_medium=icalendar&utm_campaign=quux');
    expect(createMemo(ev, {})).toBe(
        'https://www.hebcal.com/foobar?utm_source=ical&utm_medium=icalendar');
  });

  it('keeps a pre-set Parsha memo', () => {
    const ev = new ParshaEvent({
      hdate: new HDate(new Date(2023, 9, 21)),
      parsha: ['Noach'],
      il: false,
      chag: false,
      num: -1,
    });
    ev.memo = 'Hello World!';
    expect(createMemo(ev, {})).toBe(
        'Hello World!\n\n' +
        'Torah: Genesis 6:9-11:32\n' +
        'Haftarah: Isaiah 54:1-55:5\n' +
        'Haftarah for Sephardim: Isaiah 54:1-10\n\n' +
        'https://hebcal.com/s/5784/2?us=ical&um=icalendar');
  });
});

describe('parsha summary', () => {
  it('is folded in by createMemo without touching the event', () => {
    const options = {year: 1993, month: 4, sedrot: true, noHolidays: true};
    const [ev] = HebrewCalendar.calendar(options);
    expect(ev.getDesc()).toBe('Parashat Tzav');
    expect(createMemo(ev, options)).toContain('In Tzav (\u201cCommand\u201d)');
    // the summary must not be written back onto the event: the .csv wants the
    // special-Shabbat name there instead
    expect(ev.memo).toBeUndefined();
  });

  it('lets an explicit ev.memo win', () => {
    const ev = new ParshaEvent({
      hdate: new HDate(new Date(2023, 9, 21)),
      parsha: ['Noach'],
      il: false,
      chag: false,
      num: -1,
    });
    expect(createMemo(ev, {})).toContain('Noach');
    ev.memo = 'Hello World!';
    expect(createMemo(ev, {})).toBe(
        'Hello World!\n\n' +
        'Torah: Genesis 6:9-11:32\n' +
        'Haftarah: Isaiah 54:1-55:5\n' +
        'Haftarah for Sephardim: Isaiah 54:1-10\n\n' +
        'https://hebcal.com/s/5784/2?us=ical&um=icalendar');
  });

  it('is absent for non-parsha events', () => {
    const [ev] = HebrewCalendar.calendar({year: 2026, month: 4});
    expect(getParshaSummary(ev)).toBeUndefined();
  });
});

describe('makeIcalEvents', () => {
  it('never mutates the shared events returned by @hebcal/core', () => {
    const options = {
      start: new Date(2021, 8, 28),
      end: new Date(2021, 8, 28),
      il: true,
    };
    const events = HebrewCalendar.calendar(options);
    const [ical] = makeIcalEvents(events, options);
    expect(ical.ev).toBe(events[0]);
    expect(events[0].memo).toBe(undefined);
    expect(ical.options.memo).toContain('Eighth Day of Assembly');

    // a second calendar for the same dates must not inherit the first memo
    const events2 = HebrewCalendar.calendar(options);
    expect(events2[0].memo).toBe(undefined);
  });

  it('leaves the caller\'s options object alone', () => {
    const options = {year: 1993, month: 4, sedrot: true, noHolidays: true};
    makeIcalEvents(HebrewCalendar.calendar(options), options);
    expect(options.memo).toBe(undefined);
  });
});

describe('DESCRIPTION generated by @hebcal/icalendar', () => {
  it('escapes newlines and folds long lines', () => {
    const options = {year: 1993, month: 4, sedrot: true, noHolidays: true};
    const events = HebrewCalendar.calendar(options);
    const [ical] = makeIcalEvents(events, {...options, dtstamp: 'X'});
    const lines = ical.toString().split('\r\n');
    expect(lines).toEqual([
      'BEGIN:VEVENT',
      'DTSTAMP:X',
      'CATEGORIES:Parsha',
      'SUMMARY:Parashat Tzav',
      'DTSTART;VALUE=DATE:19930403',
      'DTEND;VALUE=DATE:19930404',
      'UID:hebcal-19930403-b025cb50',
      'TRANSP:TRANSPARENT',
      'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
      'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE',
      'CLASS:PUBLIC',
      'DESCRIPTION:In Tzav (“Command”)\\, God tells Moses about the sacrifices',
      '  offered in the Mishkan (Tabernacle)\\, including a meal offering brought b',
      ' y the high priest\\, guilt offerings\\, and offerings of thanks. Moses initi',
      ' ates Aaron and Aaron’s sons for priestly service in the Mishkan.\\n\\nTora',
      ' h: Leviticus 6:1-8:36\\nHaftarah: Malachi 3:4-24 | Shabbat HaGadol\\n\\nhttps',
      ' ://hebcal.com/s/5753/25?us=ical&um=icalendar',
      'END:VEVENT',
    ]);
  });

  it('omits DESCRIPTION when there is no memo', () => {
    const hd = new HDate(new Date(2021, 1, 13));
    const ev = new Event(hd, 'User Event', flags.USER_EVENT, {uid: 'foo-bar-baaz'});
    ev.alarm = false;
    const [ical] = makeIcalEvents([ev], {dtstamp: 'X'});
    const lines = ical.getLongLines();
    expect(lines.find((line) => line.startsWith('DESCRIPTION:'))).toBe(undefined);
  });

  it('makeIcalendar() wraps the events in a VCALENDAR', async () => {
    const options = {year: 1993, month: 4, sedrot: true, noHolidays: true};
    const events = HebrewCalendar.calendar(options);
    const ics = await makeIcalendar(events, {...options, prodid: 'X', dtstamp: 'X'});
    expect(ics.split('\r\n').slice(0, 9)).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:X',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-LOTUS-CHARSET:UTF-8',
      'REFRESH-INTERVAL;VALUE=DURATION:P7D',
      'X-PUBLISHED-TTL:P7D',
      'X-WR-CALNAME:Hebcal Diaspora April 1993',
    ]);
    expect(ics).toContain('DESCRIPTION:In Tzav (“Command”)');
    expect(ics).toContain('Leviticus 6:1-8:36');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});

/** Event with a www.hebcal.com URL */
class TestEvent extends Event {
  constructor(date) {
    super(date, 'Test Event', 0);
    this.uid = 'X';
  }
  url() {
    return 'https://www.hebcal.com/foobar';
  }
  getCategories() {
    return ['holiday'];
  }
}
