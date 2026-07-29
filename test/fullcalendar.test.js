/* eslint-disable max-len */
import {describe, it, expect} from 'vitest';
import {calendar, Location, HDate, HebrewDateEvent} from '@hebcal/core';
import {DafYomiEvent} from '@hebcal/learning';
import {eventToFullCalendar} from '../src/fullcalendar.js';

describe('eventToFullCalendar', () => {
  it('renders candles, zmanim and holidays for a Chicago Pesach', () => {
    const options = {
      year: 1990,
      month: 4,
      noMinorFast: true,
      noRoshChodesh: true,
      noSpecialShabbat: true,
      candlelighting: true,
      havdalahMins: 50,
      location: new Location(41.85003, -87.65005, false, 'America/Chicago', 'Chicago', 'US', 4887398),
    };
    const events = calendar(options).slice(0, 11);
    const tzid = options.location.getTzid();
    const fc = events.map((ev) => eventToFullCalendar(ev, tzid, options));
    const pesachMemo = 'Passover, the Feast of Unleavened Bread. Also called Chag HaMatzot (the Festival of Matzah),' +
      ' it commemorates the Exodus and freedom of the Israelites from ancient Egypt';
    const expectedUrl = 'https://hebcal.com/h/pesach-1990?us=js&um=fc';
    const expected = [
      {
        title: 'Candle lighting',
        start: '1990-04-06T19:04:00-05:00',
        allDay: false,
        hebrew: 'הדלקת נרות',
        className: 'candles',
      },
      {
        title: 'Havdalah (50 min)',
        start: '1990-04-07T20:14:00-05:00',
        allDay: false,
        hebrew: 'הבדלה (50 דקות)',
        className: 'havdalah',
      },
      {
        title: 'Finish eating chametz',
        start: '1990-04-09T10:41:00-05:00',
        allDay: false,
        hebrew: 'סוף זמן אכילת חמץ',
        className: 'zmanim achilasChametz',
        description: 'Latest time of day to eat chametz on the day before Pesach',
      },
      {
        title: 'Biur Chametz',
        start: '1990-04-09T11:47:00-05:00',
        allDay: false,
        hebrew: 'בעור חמץ',
        className: 'zmanim biurChametz',
        description: 'Latest time of day to sell and burn chametz before Pesach',
      },
      {
        title: 'Erev Pesach',
        start: '1990-04-09',
        allDay: true,
        hebrew: 'ערב פסח',
        className: 'holiday major',
        description: pesachMemo,
        url: expectedUrl,
      },
      {
        title: 'Candle lighting',
        start: '1990-04-09T19:07:00-05:00',
        allDay: false,
        hebrew: 'הדלקת נרות',
        className: 'candles',
      },
      {
        title: 'Pesach I',
        start: '1990-04-10',
        allDay: true,
        hebrew: 'פסח א׳',
        className: 'holiday major yomtov',
        url: expectedUrl,
        description: pesachMemo,
      },
      {
        title: 'Candle lighting',
        start: '1990-04-10T20:17:00-05:00',
        allDay: false,
        hebrew: 'הדלקת נרות',
        className: 'candles',
      },
      {
        title: 'Pesach II',
        start: '1990-04-11',
        allDay: true,
        hebrew: 'פסח ב׳',
        className: 'holiday major yomtov',
        url: expectedUrl,
        description: pesachMemo,
      },
      {
        title: 'Havdalah (50 min)',
        start: '1990-04-11T20:18:00-05:00',
        allDay: false,
        hebrew: 'הבדלה (50 דקות)',
        className: 'havdalah',
      },
      {
        title: 'Pesach III (CH’’M)',
        start: '1990-04-12',
        allDay: true,
        hebrew: 'פסח ג׳ (חוה״מ)',
        className: 'holiday major cholhamoed',
        url: expectedUrl,
        description: pesachMemo,
      },
    ];

    expect(fc).toEqual(expected);
  });

  it('renders Chanukah candle lighting times', () => {
    const options = {
      start: new Date(2020, 11, 10),
      end: new Date(2020, 11, 11),
      location: Location.lookup('Boston'),
      candlelighting: true,
    };
    const events = calendar(options);
    const tzid = options.location.getTzid();
    const fc = events.map((ev) => eventToFullCalendar(ev, tzid, options));
    for (const item of fc) {
      delete item.description;
    }
    const expected = [
      {
        title: 'Chanukah: 1 Candle',
        start: '2020-12-10T16:36:00-05:00',
        allDay: false,
        className: 'holiday major',
        hebrew: 'חנוכה: א׳ נר',
        url: 'https://hebcal.com/h/chanukah-2020?us=js&um=fc',
      },
      {
        title: 'Chanukah: 2 Candles',
        start: '2020-12-11T15:53:00-05:00',
        allDay: false,
        className: 'holiday major',
        hebrew: 'חנוכה: ב׳ נרות',
        url: 'https://hebcal.com/h/chanukah-2020?us=js&um=fc',
      },
      {
        title: 'Candle lighting',
        start: '2020-12-11T15:53:00-05:00',
        allDay: false,
        className: 'candles',
        hebrew: 'הדלקת נרות',
      },
    ];
    expect(fc).toEqual(expected);
  });

  it('renders Chanukah without candle lighting', () => {
    const options = {
      start: new Date(2020, 11, 10),
      end: new Date(2020, 11, 11),
    };
    const events = calendar(options);
    const fc = events.map((ev) => eventToFullCalendar(ev, 'UTC', options));
    for (const item of fc) {
      delete item.description;
    }
    const expected = [
      {
        title: 'Chanukah: 1 Candle',
        start: '2020-12-10',
        allDay: true,
        className: 'holiday major',
        hebrew: 'חנוכה: א׳ נר',
        url: 'https://hebcal.com/h/chanukah-2020?us=js&um=fc',
      },
      {
        title: 'Chanukah: 2 Candles',
        start: '2020-12-11',
        allDay: true,
        className: 'holiday major',
        hebrew: 'חנוכה: ב׳ נרות',
        url: 'https://hebcal.com/h/chanukah-2020?us=js&um=fc',
      },
    ];

    expect(fc).toEqual(expected);
  });

  it('renders fast start/end times with the linked holiday', () => {
    const options = {
      start: new Date(2021, 5, 27),
      end: new Date(2021, 5, 27),
      location: Location.lookup('Providence'),
      candlelighting: true,
    };
    const events = calendar(options);
    const tzid = options.location.getTzid();
    const fc = events.map((ev) => eventToFullCalendar(ev, tzid, options));
    const expected = [
      {
        title: 'Fast begins',
        start: '2021-06-27T03:20:00-04:00',
        allDay: false,
        className: 'zmanim fast',
        hebrew: 'תחילת הצום',
        description: 'Tzom Tammuz',
      },
      {
        title: 'Tzom Tammuz',
        start: '2021-06-27',
        allDay: true,
        className: 'holiday fast',
        hebrew: 'צום י״ז בתמוז',
        url: 'https://hebcal.com/h/tzom-tammuz-2021?us=js&um=fc',
        description: 'Fast commemorating breaching of the walls of Jerusalem before the destruction of the Second Temple',
      },
      {
        title: 'Fast ends',
        start: '2021-06-27T21:07:00-04:00',
        allDay: false,
        className: 'zmanim fast',
        hebrew: 'סיום הצום',
        description: 'Tzom Tammuz',
      },
    ];
    expect(fc).toEqual(expected);
  });

  it('renders a BCE date', () => {
    const options = {
      start: new Date(-1, 4, 6),
      end: new Date(-1, 4, 6),
      il: false,
    };
    const ev = calendar(options)[0];
    const fc = eventToFullCalendar(ev, null, options);
    const expected = {
      title: 'Erev Shavuot',
      start: '-000001-05-06',
      allDay: true,
      className: 'holiday major',
      hebrew: 'ערב שבועות',
      description: 'Festival of Weeks. Commemorates the giving of the Torah at Mount Sinai',
    };
    expect(fc).toEqual(expected);
  });

  it('renders Daf Yomi with a learning class and Sefaria URL', () => {
    const ev = new DafYomiEvent(new HDate(new Date(1995, 11, 17)));
    const fc = eventToFullCalendar(ev, null, {il: false});
    const expected = {
      title: 'Avodah Zarah 68',
      start: '1995-12-17',
      allDay: true,
      className: 'dafyomi learning',
      hebrew: 'עבודה זרה דף ס״ח',
      url: 'https://www.sefaria.org/Avodah_Zarah.68a?lang=bi&utm_source=hebcal.com&utm_medium=fc',
    };
    expect(fc).toEqual(expected);
  });

  it('renders a Hebrew date', () => {
    const ev = new HebrewDateEvent(new HDate(new Date(1995, 11, 17)));
    const fc = eventToFullCalendar(ev, null, {il: false});
    const expected = {
      title: '24th of Kislev',
      start: '1995-12-17',
      allDay: true,
      className: 'hebdate',
      hebrew: 'כ״ד כסלו',
    };
    expect(fc).toEqual(expected);
  });
});
