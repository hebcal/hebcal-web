import {HebrewCalendar, HDate, Event, flags, months} from '@hebcal/core';
import {eventsToIcalendar, eventsToCsv} from '@hebcal/icalendar';
import dayjs from 'dayjs';

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function yahrzeitDownload(ctx) {
  const query = ctx.request.query;
  if (query.v !== 'yahrzeit') {
    return;
  }
  const ids = Object.keys(query)
      .filter((k) => k[0] == 't').map((k) => +(k.substring(1)));
  const maxId = Math.max(...ids);
  const years = +query.years || 20;
  const startYear = new HDate().getFullYear();
  const endYear = startYear + years;
  let events = [];
  for (let id = 1; id <= maxId; id++) {
    events = events.concat(getEventsForId(query, id, startYear, endYear));
  }
  if (query.yizkor == 'on') {
    const holidays = makeYizkorEvents(startYear, endYear);
    events = events.concat(holidays);
  }
  events.sort((a, b) => a.getDate().abs() - b.getDate().abs());
  if (ctx.request.path.endsWith('.ics')) {
    const ical = eventsToIcalendar(events, {yahrzeit: true});
    ctx.response.type = 'text/calendar; charset=utf-8';
    ctx.body = ical;
  } else if (ctx.request.path.endsWith('.csv')) {
    const euro = Boolean(query.euro);
    const ical = eventsToCsv(events, {euro});
    ctx.response.type = 'text/x-csv; charset=utf-8';
    ctx.body = ical;
  }
}

/**
 * @param {any} query
 * @param {number} id
 * @param {number} startYear
 * @param {number} endYear
 * @return {Event[]}
 */
function getEventsForId(query, id, startYear, endYear) {
  const events = [];
  const [type, dd, mm, yy] = [
    query[`t${id}`],
    query[`d${id}`],
    query[`m${id}`],
    query[`y${id}`],
  ];
  if (!type || !dd || !mm || !yy) {
    return events;
  }
  const sunset = query[`s${id}`];
  const name = query[`n${id}`] || `Person${id}`;
  let day = dayjs(new Date(yy, mm - 1, dd));
  if (sunset == 'on') {
    day = day.add(1, 'day');
  }
  for (let hyear = startYear; hyear <= endYear; hyear++) {
    const hd = (type == 'Yahrzeit') ?
      HebrewCalendar.getYahrzeit(hyear, day.toDate()) :
      HebrewCalendar.getBirthdayOrAnniversary(hyear, day.toDate());
    if (hd) {
      const typeStr = (type == 'Yahrzeit') ? type : `Hebrew ${type}`;
      let subj = `${name}'s ${typeStr}`;
      if (query.hebdate == 'on') {
        subj += ' (' + hd.render('en') + ')';
      }
      events.push(new Event(hd, subj, flags.USER_EVENT));
    }
  }
  return events;
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
        new Event(new HDate(22, months.NISAN, hyear), 'Yizkor (Pesach VIII)', flags.USER_EVENT),
        new Event(new HDate(7, months.SIVAN, hyear), 'Yizkor (Shavuot II)', flags.USER_EVENT),
        new Event(new HDate(10, months.TISHREI, hyear), 'Yizkor (Yom Kippur)', flags.USER_EVENT),
        new Event(new HDate(22, months.TISHREI, hyear), 'Yizkor (Shmini Atzeret)', flags.USER_EVENT),
    );
  }
  return holidays;
}
