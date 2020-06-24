import {hebcal, HDate, Event, flags, HebrewDateEvent, common} from '@hebcal/core';
import {eventsToIcalendar, eventsToCsv} from '@hebcal/icalendar';
import dayjs from 'dayjs';

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function yahrzeitDownload(ctx) {
  if (ctx.request.query.v !== 'yahrzeit') {
    return;
  }
  const ids = Object.keys(ctx.request.query)
      .filter((k) => k[0] == 't').map((k) => +(k.substring(1)));
  const max = Math.max(...ids);
  const years = +ctx.request.query.years || 20;
  const startYear = new HDate().getFullYear();
  const endYear = startYear + years;
  const yizkor = Boolean(ctx.request.query.yizkor && ctx.request.query.yizkor == 'on');
  const hebdate = Boolean(ctx.request.query.hebdate && ctx.request.query.hebdate == 'on');
  let events = [];
  for (let id = 1; id <= max; id++) {
    const [type, dd, mm, yy, sunset, name] = [
      ctx.request.query[`t${id}`],
      ctx.request.query[`d${id}`],
      ctx.request.query[`m${id}`],
      ctx.request.query[`y${id}`],
      ctx.request.query[`s${id}`],
      ctx.request.query[`n${id}`],
    ];
    let day = dayjs(new Date(yy, mm - 1, dd));
    if (sunset == 'on') {
      day = day.add(1, 'day');
    }
    for (let hyear = startYear; hyear <= endYear; hyear++) {
      const hd = (type == 'Yahrzeit') ?
        hebcal.getYahrzeit(hyear, day.toDate()) :
        hebcal.getBirthdayOrAnniversary(hyear, day.toDate());
      if (hd) {
        const typeStr = (type == 'Yahrzeit') ? type : `Hebrew ${type}`;
        let subj = `${name}'s ${typeStr}`;
        if (hebdate) {
          subj += ' (' + new HebrewDateEvent(hd).render() + ')';
        }
        const ev = new Event(hd, subj, flags.USER_EVENT);
        events.push(ev);
      }
    }
  }
  if (yizkor) {
    const holidays = makeYizkorEvents(startYear, endYear);
    events = events.concat(holidays);
  }
  events.sort((a, b) => a.getDate().abs() - b.getDate().abs());
  if (ctx.request.path.endsWith('.ics')) {
    const ical = eventsToIcalendar(events, {yahrzeit: true});
    ctx.response.type = 'text/calendar; charset=utf-8';
    ctx.body = ical;
  } else if (ctx.request.path.endsWith('.csv')) {
    const euro = Boolean(ctx.request.query.euro);
    const ical = eventsToCsv(events, {euro});
    ctx.response.type = 'text/x-csv; charset=utf-8';
    ctx.body = ical;
  }
}

/**
 * @param {number} startYear
 * @param {number} endYear
 * @return {Event[]}
 */
function makeYizkorEvents(startYear, endYear) {
  const holidays = [];
  for (let hyear = startYear; hyear <= endYear; hyear++) {
    holidays.push(
        new Event(new HDate(22, common.months.NISAN, hyear), 'Yizkor (Pesach VIII)', flags.USER_EVENT),
        new Event(new HDate(7, common.months.SIVAN, hyear), 'Yizkor (Shavuot II)', flags.USER_EVENT),
        new Event(new HDate(10, common.months.TISHREI, hyear), 'Yizkor (Yom Kippur)', flags.USER_EVENT),
        new Event(new HDate(22, common.months.TISHREI, hyear), 'Yizkor (Shmini Atzeret)', flags.USER_EVENT),
    );
  }
  return holidays;
}
