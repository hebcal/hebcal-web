import {HDate, flags, Event} from '@hebcal/core';
import {chofetzChaim, ChofetzChaimEvent, shemiratHaLashon, ShemiratHaLashonEvent} from '@hebcal/learning';
import {eventsToIcalendar, IcalEvent} from '@hebcal/icalendar';
import {eventsToCsv} from '@hebcal/rest-api';
import fs from 'fs';

/**
 * Event wrapper around a combo of Chofetz Chaim and Shemirat HaLashon
 */
class ChofetzChaimShemiratHaLashonEvent extends Event {
  /**
   * @param {HDate} hd
   * @param {any} reading1
   * @param {any} reading2
   */
  constructor(hd, reading1, reading2) {
    const ev1 = new ChofetzChaimEvent(hd, reading1);
    const ev2 = new ShemiratHaLashonEvent(hd, reading2);
    const desc = ev1.getDesc() + ' / ' + ev2.getDesc();
    super(hd, desc, flags.USER_EVENT);
    this.ev1 = ev1;
    this.ev2 = ev2;
    const hdateStr = hd.getDate() + ' ' + hd.getMonthName();
    this.memo = 'Sefer Chofetz Chaim, ' + hdateStr + '\n' +
      ev1.render('memo') + '\n' + ev1.url() + '\n\n' +
      'Shemirat HaLashon, ' + hdateStr + '\n' +
      ev2.render('memo') + '\n' + ev2.url();
    this.alarm = false;
    this.category = 'Chofetz Chaim';
    const startDate = IcalEvent.formatYYYYMMDD(hd.greg());
    this.uid = `hebcal-${startDate}-chofetz-chaim`;
  }
  /**
   * Returns name of reading
   * @param {string} [locale] Optional locale name (defaults to active locale).
   * @return {string}
   */
  render(locale) {
    return this.ev1.render(locale) + ' / ' + this.ev2.render(locale);
  }
  /** @return {string} */
  url() {
    return undefined;
  }
  /** @return {string[]} */
  getCategories() {
    return ['chofetzChaim'];
  }
}

(async function() {
  const events = [];
  const dt = new Date();
  const year = dt.getFullYear();
  const start = new HDate(new Date(year - 1, 11, 1));
  const end = new HDate(new Date(year + 2, 11, 31));
  const startAbs = start.abs();
  const endAbs = end.abs();
  for (let abs = startAbs; abs <= endAbs; abs++) {
    const hd = new HDate(abs);
    const reading1 = chofetzChaim(hd);
    const reading2 = shemiratHaLashon(hd);
    const ev = new ChofetzChaimShemiratHaLashonEvent(hd, reading1, reading2);
    events.push(ev);
  }
  const icalStream = fs.createWriteStream('chofetz-chaim.ics');
  const str = await eventsToIcalendar(events, {
    title: 'Daily Chofetz Chaim',
    // eslint-disable-next-line max-len
    caldesc: 'Daily study of the Sefer Chofetz Chaim and Shemirat HaLashon, which deal with the Jewish ethics and laws of speech',
    relcalid: 'a2a058a4-d2eb-45d8-9142-5976d4c85ebc',
  });
  icalStream.write(str);
  icalStream.close();

  const csvStream = fs.createWriteStream('chofetz-chaim.csv');
  csvStream.write(eventsToCsv(events, {}));
  csvStream.close();
})();
