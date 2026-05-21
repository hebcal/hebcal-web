import {Event, HDate, HebrewCalendar, Locale,
  flags, gematriya, months} from '@hebcal/core';
import dayjs from 'dayjs';
import {murmur32HexSync} from 'murmurhash3';
import {lightCandlesWhen} from './common.js';
import {YAHRZEIT, BIRTHDAY,
  getNumYears,
  getYahrzeitDetailForId} from './yahrzeitCommon.js';

const hebrewRe = /[א-ת]/;

const YAHRZEIT_HE = 'יארצייט';

const en2he = {
  Yahrzeit: YAHRZEIT_HE,
  Birthday: 'יום הולדת',
  Anniversary: 'יום נישואין',
};

export function makeEditMemo(calendarId) {
  return 'To edit this Hebcal Yahrzeit + Anniversary Calendar, visit https://www.hebcal.com/yahrzeit/edit/' +
    calendarId;
}

/**
 * @return {number}
 */
function getDefaultStartYear(today) {
  const hmonth = today.getMonth();
  const hyear = today.getFullYear();
  const isFirst3months = hmonth >= months.TISHREI && hmonth <= months.TEVET;
  return isFirst3months ? hyear - 1 : hyear;
}

export function getDateRange(query) {
  const today = new HDate();
  const years = getNumYears(query.years);
  const startYear = Number.parseInt(query.start, 10) || getDefaultStartYear(today);
  const endYear = Number.parseInt(query.end, 10) || (startYear + years - 1);
  return {today, startYear, endYear, years};
}

/**
 * @param {number} maxId
 * @param {any} query
 * @param {boolean} reminder
 * @return {Promise<Event[]>}
 */
export async function makeYahrzeitEvents(maxId, query, reminder) {
  const {startYear, endYear, years} = getDateRange(query);
  let events = [];
  for (let id = 1; id <= maxId; id++) {
    const events0 = await getEventsForId(query, id, startYear, years);
    events = events.concat(events0);
    if (reminder) {
      const reminders = makeReminderEvents(events0, id);
      events = events.concat(reminders);
    }
  }
  const yizkor = query.yizkor;
  if (yizkor === 'on' || yizkor === '1') {
    const holidays = makeYizkorEvents(startYear, endYear, query.i === 'on');
    for (const ev of holidays) {
      const d = dayjs(ev.greg());
      const hash = murmur32HexSync(ev.getDesc());
      ev.uid = 'yizkor-' + d.format('YYYYMMDD') + '-' + hash;
      if (query.ulid) {
        ev.memo = makeEditMemo(query.ulid);
      }
    }
    events = events.concat(holidays);
  }
  events.sort((a, b) => a.getDate().abs() - b.getDate().abs());
  return events;
}

function getAlarmTime(hd) {
  switch (hd.getDay()) {
    case 6: return '20:00';
    case 5: return '14:30';
    default: return '16:30';
  }
}

function makeReminderEvents(events, id) {
  const yahrzeitEvents = events.filter((ev) => ev.type === YAHRZEIT);
  return yahrzeitEvents.map((ev) => {
    const hd = ev.getDate().prev();
    const dt = hd.greg();
    const uid = 'reminder-' + dayjs(dt).format('YYYYMMDD') + '-' + ev.hash + '-' + id;
    const name = ev.name;
    const subj = hebrewRe.test(name) ?
      `${name} ${YAHRZEIT_HE} תזכורת` :
      `${name} Yahrzeit reminder`;
    return new Event(hd, subj, flags.USER_EVENT, {
      eventTime: dt,
      eventTimeStr: getAlarmTime(hd),
      memo: ev.memo,
      emoji: ev.emoji,
      alarm: 'P0DT0H0M0S',
      uid,
      category: 'Personal',
    });
  });
}

/**
 * @param {any} query
 * @param {number} id
 * @param {number} startYear
 * @param {number} numYears
 * @return {Promise<Event[]>}
 */
async function getEventsForId(query, id, startYear, numYears) {
  const events = [];
  const info = getYahrzeitDetailForId(query, id);
  if (info === null) {
    return events;
  }
  const calendarId = query.ulid;
  const includeUrl = Boolean(calendarId && query.dl !== '1');
  const appendHebDate = (query.hebdate === 'on' || query.hebdate === '1');
  for (let hyear = startYear; events.length < numYears; hyear++) {
    const ev = await makeYahrzeitEvent(id, info, hyear, appendHebDate, calendarId, includeUrl);
    if (ev) {
      events.push(ev);
    }
  }
  return events;
}

function hebdateNoYear(hd, isHebrewName) {
  if (isHebrewName) {
    const dd = hd.getDate();
    const mm = Locale.gettext(hd.getMonthName(), 'he-x-NoNikud');
    return gematriya(dd) + ' ' + mm;
  } else {
    return hd.render('en', false).replaceAll('\'', '’');
  }
}

function makeYahrzeitSubject(info, hd, yearNumber, appendHebDate) {
  const name = info.name;
  let subj = name;
  const isHebrewName = hebrewRe.test(name) && !/[A-Za-z]/.test(name);
  const type = info.type;
  if (type !== 'Other') {
    const isYahrzeit = type === YAHRZEIT;
    if (isHebrewName) {
      const prefix = en2he[type];
      subj = isYahrzeit ?
        `${prefix} ה-${yearNumber} של ${name}` :
        `${prefix} ${yearNumber} ל${name}`;
    } else {
      const nth = Locale.ordinal(yearNumber, 'en');
      const typeStr = isYahrzeit ? type : `Hebrew ${type}`;
      subj = `${name}’s ${nth} ${typeStr}`;
    }
  }
  if (appendHebDate) {
    const hebdate = hebdateNoYear(hd, isHebrewName);
    subj += ' (' + hebdate + ')';
  }
  return subj;
}

/**
 * @param {number} id
 * @param {any} info
 * @param {number} hyear
 * @param {boolean} appendHebDate
 * @param {string} calendarId
 * @param {boolean} includeUrl
 * @return {Promise<Event>}
 */
async function makeYahrzeitEvent(id, info, hyear, appendHebDate, calendarId, includeUrl) {
  const type = info.type;
  const isYahrzeit = type === YAHRZEIT;
  const isBirthday = type === BIRTHDAY;
  const origDt = info.day.toDate();
  const hd = isYahrzeit ?
    HebrewCalendar.getYahrzeit(hyear, origDt) :
    HebrewCalendar.getBirthdayOrAnniversary(hyear, origDt);
  if (!hd) {
    return null;
  }
  const typeStr = isYahrzeit ? type : `Hebrew ${type}`;
  const hebdate = hd.render('en').replaceAll('\'', '’');
  const origHd = new HDate(origDt);
  const origHyear = origHd.getFullYear();
  const yearNumber = hyear - origHyear;
  const nth = Locale.ordinal(yearNumber, 'en');
  const name = info.name;
  const subj = makeYahrzeitSubject(info, hd, yearNumber, appendHebDate);
  const ev = new Event(hd, subj, flags.USER_EVENT);
  if (isYahrzeit) {
    ev.emoji = '🕯️';
  } else if (isBirthday) {
    ev.emoji = '🎂✡️';
  }
  const observed = dayjs(hd.greg());
  ev.memo = makeMemo(id, info, observed, nth, typeStr, hebdate, includeUrl, calendarId);
  const hash = calendarId || murmur32HexSync(name);
  ev.uid = type.toLowerCase() + '-' + hyear + '-' + hash + '-' + id;
  ev.name = name;
  ev.type = type;
  ev.anniversary = yearNumber;
  if (isYahrzeit) {
    ev.alarm = false;
    ev.hash = hash;
  }
  return ev;
}

function makeMemo(id, info, observed, nth, typeStr, hebdate, includeUrl, calendarId) {
  const type = info.type;
  const isYahrzeit = type === YAHRZEIT;
  const isBirthday = type === BIRTHDAY;
  const isOther = (type === 'Other');
  const name = info.name;
  const nameAndType = isOther ? name : `${name}’s ${typeStr}`;
  const erev = observed.subtract(1, 'day');
  const verb = isYahrzeit ? 'remembering' : 'honoring';
  const prefix = isOther ? name : `Hebcal joins you in ${verb} ${name}, whose ${nth} ${typeStr}`;
  let memo = `${prefix} occurs on ` +
    `${observed.format('dddd, MMMM D')}, corresponding to the ${hebdate}.\\n\\n` +
    `${nameAndType} begins at sundown on ${erev.format('dddd, MMMM D')} and continues until ` +
    `sundown on the day of observance.`;
  if (isYahrzeit) {
    const dow = erev.day();
    const when = lightCandlesWhen(dow);
    memo += ` It is customary to light a memorial candle ${when} as the Yahrzeit begins.\\n\\n` +
      'May your loved one’s soul be bound up in the bond of eternal life and may their memory ' +
      'serve as a continued source of inspiration and comfort to you.';
  } else if (isBirthday) {
    memo += '\\n\\nMazel Tov!';
  }
  if (includeUrl) {
    memo += `\\n\\nhttps://www.hebcal.com/yahrzeit/edit/${calendarId}#row${id}`;
  }
  return memo;
}

/**
 * @param {number} startYear
 * @param {number} endYear
 * @param {boolean} il
 * @return {Event[]}
 */
function makeYizkorEvents(startYear, endYear, il) {
  const holidays = [];
  const attrs = {emoji: '🕯️'};
  const pesachDay = il ? 21 : 22;
  const pesachDesc = il ? 'Yizkor (Pesach VII)' : 'Yizkor (Pesach VIII)';
  const shavuotDay = il ? 6 : 7;
  const shavuotDesc = il ? 'Yizkor (Shavuot)' : 'Yizkor (Shavuot II)';
  for (let hyear = startYear; hyear <= endYear; hyear++) {
    holidays.push(
        new Event(new HDate(pesachDay, months.NISAN, hyear), pesachDesc, flags.USER_EVENT, attrs),
        new Event(new HDate(shavuotDay, months.SIVAN, hyear), shavuotDesc, flags.USER_EVENT, attrs),
        new Event(new HDate(10, months.TISHREI, hyear), 'Yizkor (Yom Kippur)', flags.USER_EVENT, attrs),
        new Event(new HDate(22, months.TISHREI, hyear), 'Yizkor (Shmini Atzeret)', flags.USER_EVENT, attrs),
    );
  }
  return holidays;
}
