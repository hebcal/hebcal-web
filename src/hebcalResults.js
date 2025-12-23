import dayjs from 'dayjs';
import {pad2, pad4} from '@hebcal/hdate/dist/esm/pad';
import {abs2greg, greg2abs} from '@hebcal/hdate/dist/esm/greg';
import {hd2abs, abs2hebrew, getMonthName, daysInMonth, monthsInYear} from '@hebcal/hdate/dist/esm/hdateBase';
import {gematriya} from '@hebcal/hdate/dist/esm/gematriya';

/**
 * @private
 * @param {string} s
 * @return {string}
 */
function dateOnly(s) {
  const idxT = s.indexOf('T');
  return idxT === -1 ? s : s.substring(0, idxT);
}

/**
 * @private
 * @param {string} s
 * @return {dayjs.Dayjs}
 */
function makeDayjs(s) {
  const isBCE = s.startsWith('-');
  if (isBCE) {
    s = s.substring(1);
  }
  const yearMultiplier = isBCE ? -1 : 1;
  const ymd = s.split('-');
  const yy = yearMultiplier * parseInt(ymd[0], 10);
  const mm = parseInt(ymd[1], 10);
  const dd = parseInt(ymd[2], 10);
  const dt = new Date(yy, mm - 1, dd);
  if (yy < 100) {
    dt.setFullYear(yy);
  }
  return dayjs(dt);
}

/**
 * @private
 * @param {dayjs.Dayjs} d
 * @return {string}
 */
function formatYearMonth(d) {
  return pad4(d.year()) + '-' + pad2(d.month() + 1);
}

const hour12cc = {
  US: 1, CA: 1, BR: 1, AU: 1, NZ: 1, DO: 1, PR: 1, GR: 1, IN: 1, KR: 1, NP: 1, ZA: 1,
};

function getEventClassName(evt) {
  let className = evt.cat;
  if (evt.yt) {
    className += ' yomtov';
  }
  if (evt.dt.indexOf('T') !== -1) {
    className += ' timed';
  }
  const link = evt.u0;
  if (typeof link === 'string' &&
    link.startsWith('http') &&
    !link.startsWith('https://www.hebcal.com/')) {
    className += ' outbound';
  }
  return className;
}

const EPOCH = -1373428;
const HDATE_EPOCH = {yy: 1, mm: 7, dd: 1};

function getHebMonthName(d) {
  const abs = greg2abs(d.toDate());
  const hdt = abs <= EPOCH ? HDATE_EPOCH : abs2hebrew(abs);
  const localeData = window['hebcal'].localeConfig;
  const str = localeData.hebMonths[hdt.mm] || getMonthName(hdt.mm, hdt.yy);
  hdt.monthName = str.replace(/'/g, '’');
  return hdt;
}

function addHebMonthName(month) {
  const start = getHebMonthName(month.startDay);
  const end = getHebMonthName(month.endDay);
  let str = start.monthName;
  if (end.yy !== start.yy) {
    str += ' ' + start.yy;
  }
  if (end.mm !== start.mm) {
    str += ' – ' + end.monthName;
  }
  str += ' ' + end.yy;
  month.monthName = str;
}

/**
 * Format Hebrew year-month as a string key
 * @private
 * @param {import('@hebcal/hdate').SimpleHebrewDate} hd
 * @return {string}
 */
function formatHebrewYearMonth(hd) {
  const hy = pad4(hd.yy);
  const hm = pad2(hd.mm);
  return `H${hy}-${hm}`;
}

/**
 * Get Hebrew month boundaries for a given Hebrew year-month
 * @private
 * @param {number} hyear - Hebrew year
 * @param {number} hmonth - Hebrew month (1-13)
 * @return {Object} start and end dayjs objects
 */
function getHebrewMonthBoundaries(hyear, hmonth) {
  const startHd = {yy: hyear, mm: hmonth, dd: 1};
  const ndays = daysInMonth(hyear, hmonth);
  const endHd = {yy: hyear, mm: hmonth, dd: ndays};

  return {
    startDay: dayjs(abs2greg(hd2abs(startHd))),
    endDay: dayjs(abs2greg(hd2abs(endHd))),
    startHd,
    endHd,
    daysInMonth: ndays,
  };
}

/**
 * Split events by Hebrew months instead of Gregorian
 * @private
 * @param {Array} events
 * @return {Array}
 */
function splitByHebrewMonth(events) {
  const startDate = makeDayjs(dateOnly(events[0].dt));
  const endDate = makeDayjs(dateOnly(events[events.length - 1].dt));

  const startAbs = greg2abs(startDate.toDate());
  const endAbs = greg2abs(endDate.toDate());
  const startHd = abs2hebrew(startAbs);
  const endHd = abs2hebrew(endAbs);

  const months = {};
  const out = [];
  let i = 0;

  let currentHYear = startHd.yy;
  let currentHMonth = startHd.mm;

  // Special case: Skip Elul of previous year if it's just Erev Rosh Hashana before Tishrei of next year
  // This avoids wasting a full page for one or two events
  const skipInitialElul = currentHMonth === 6 && // Elul
                          startHd.yy < endHd.yy && // Different years
                          hd2abs({
                            yy: currentHYear + 1,
                            mm: 7,
                            dd: 1,
                          }) <= endAbs; // Tishrei of next year is in range

  if (skipInitialElul) {
    // Start from Tishrei of the next year instead
    currentHMonth = 7;
    currentHYear++;
  }

  // Use Gregorian dates for loop termination since Hebrew month/year comparisons are complex
  const endGregDate = endDate.toDate();

  while (true) {
    const testHd = {yy: currentHYear, mm: currentHMonth, dd: 1};
    const monthKey = formatHebrewYearMonth(testHd);
    const boundaries = getHebrewMonthBoundaries(currentHYear, currentHMonth);

    out[i++] = months[monthKey] = {
      month: monthKey,
      events: [],
      startDay: boundaries.startDay,
      endDay: boundaries.endDay,
      startHd: boundaries.startHd,
      endHd: boundaries.endHd,
      isHebrew: true,
      daysInMonth: boundaries.daysInMonth,
    };

    // Check if we've passed the end date
    // Special case: if we just created Tishrei (month 7, start of new year)
    // and it's past the original end date, this is the intentional "extra month"
    // for printed calendars - keep it but don't create any more months after it
    if (boundaries.startDay.toDate() > endGregDate) {
      break;
    }
    if (currentHMonth === 7 && boundaries.endDay.toDate() >= endGregDate) {
      // We've created Tishrei of the next year, which extends past or meets the end date
      // This is intentional, but don't create any more months
      break;
    }

    // Advance to next Hebrew month
    // Hebrew year transitions from Elul (month 6) to Tishrei (month 7)
    currentHMonth++;
    if (currentHMonth === 7) {
      // Tishrei is the start of the next Hebrew year
      currentHYear++;
    } else {
      if (currentHMonth > monthsInYear(currentHYear)) {
        currentHMonth = 1;
      }
    }
  }

  events.forEach(function(evt) {
    const isoDate = dateOnly(evt.dt);
    const d = makeDayjs(isoDate);
    const hd = abs2hebrew(greg2abs(d.toDate()));
    const monthKey = formatHebrewYearMonth(hd);

    if (months[monthKey]) {
      months[monthKey].events.push(evt);
    } else if (skipInitialElul && hd.mm === 6 && hd.yy === startHd.yy) {
      // Events from skipped Elul - store in Tishrei with marker
      const tishrei = formatHebrewYearMonth({yy: startHd.yy + 1, mm: 7, dd: 1});
      if (months[tishrei]) {
        months[tishrei].prevMonthEvents = months[tishrei].prevMonthEvents || [];
        months[tishrei].prevMonthEvents.push({evt, day: hd.dd});
      }
    }
  });

  for (let i = 1; i < out.length; i++) {
    out[i].prev = out[i - 1].month;
  }
  for (let i = 0; i < out.length - 1; i++) {
    out[i].next = out[i + 1].month;
  }

  Object.values(months).forEach((month) => {
    const localeData = window['hebcal'].localeConfig;
    const hd = month.startHd;
    const endHd = month.endHd;
    const monthName = localeData.hebMonths[hd.mm] || getMonthName(hd.mm, hd.yy);
    const endYear = endHd.yy;
    const isHebrew = window['hebcal'].locale === 'he';
    const endYearStr = isHebrew ? gematriya(endYear) : endYear;
    month.monthName = monthName.replace(/'/g, '\u2019') + ' ' + endYearStr;
  });

  return out;
}

const langNameWithHebrew = new Set(['ah', 'sh']);

function splitByMonth(events) {
  const opts = window['hebcal'].opts;
  const isHebrewMonths = opts.hebrewMonths === true;

  if (isHebrewMonths) {
    return splitByHebrewMonth(events);
  }

  const startDate = makeDayjs(dateOnly(events[0].dt));
  const endDate = makeDayjs(dateOnly(events[events.length - 1].dt));
  const start = startDate.set('date', 1);
  const end = endDate.add(1, 'day');
  const months = {};
  const out = [];
  let i = 0;
  for (let d = start; d.isBefore(end); d = d.add(1, 'month')) {
    const yearMonth = formatYearMonth(d);
    if (!months[yearMonth]) {
      out[i++] = months[yearMonth] = {
        month: yearMonth,
        events: [],
        startDay: d,
        endDay: d.add(1, 'month').subtract(1, 'day'),
      };
    }
  }
  events.forEach(function(evt) {
    const isoDate = dateOnly(evt.dt);
    const d = makeDayjs(isoDate);
    const yearMonth = formatYearMonth(d);
    const monthEvents = months[yearMonth].events;
    monthEvents.push(evt);
  });
  for (let i = 1; i < out.length; i++) {
    out[i].prev = out[i - 1].month;
  }
  for (let i = 0; i < out.length - 1; i++) {
    out[i].next = out[i + 1].month;
  }
  Object.values(months).map(addHebMonthName);
  return out;
}

function getTimeStr(dt) {
  const allDay = dt.indexOf('T') === -1;
  if (allDay) {
    return '';
  }
  const opts = window['hebcal'].opts;
  if (typeof opts.hour12 !== 'undefined' && !opts.hour12) {
    return dt.substring(11, 16);
  }
  const cc = window['hebcal'].cconfig.cc;
  if (!opts.hour12 && typeof hour12cc[cc] === 'undefined') {
    return dt.substring(11, 16);
  } else {
    let hour = +dt.substring(11, 13);
    const suffix = hour >= 12 ? 'pm' : 'am';
    if (hour > 12) {
      hour = hour - 12;
    }
    const min = dt.substring(14, 16);
    return '' + hour + ':' + min + suffix;
  }
}

function hebDayAndMonthName(d) {
  const hdt = getHebMonthName(d);
  return hdt.dd + ' ' + hdt.monthName;
}

function tableRow(evt) {
  const isoDate = dateOnly(evt.dt);
  const m = makeDayjs(isoDate);
  const cat = evt.cat;
  const localeData = window['hebcal'].localeConfig;
  const lang = window['hebcal'].lang || 's';
  const isHebrew = window['hebcal'].locale === 'he';
  const opts = window['hebcal'].opts;
  const isHebrewMonths = opts.hebrewMonths === true;
  const dateStr0 = isHebrewMonths ? hebDayAndMonthName(m) :
    m.format('DD ') + localeData.monthsShort[m.month()];
  const dateStr1 = localeData.weekdaysShort[m.day()] + ' ' + dateStr0;
  const dateStr = isHebrew ? `<span lang="he" dir="rtl">${dateStr1}</span>` : dateStr1;
  let subj = evt.t0;
  const timeStr = getTimeStr(evt.dt);
  const className = getEventClassName(evt);
  if (cat === 'dafyomi') {
    subj = subj.substring(subj.indexOf(':') + 1);
  } else if (cat === 'candles' || cat === 'havdalah') {
    // "Candle lighting: foo" or "Havdalah (42 min): foo"
    subj = subj.substring(0, subj.indexOf(':'));
  }
  const timeTd = window['hebcal'].cconfig['geo'] === 'none' ? '' : `<td>${timeStr}</td>`;
  // Gregorian dates (alternate dates in Hebrew month mode) should be left-aligned
  const isGregorianDate = cat === 'gregdate' || cat === 'hebdate';
  if (isHebrew && !isGregorianDate) {
    subj = `<span lang="he" dir="rtl">${subj}</span>`;
  } else if (isGregorianDate && isHebrew) {
    // Gregorian dates remain LTR even in Hebrew mode
    subj = `<span dir="ltr">${subj}</span>`;
  } else if (langNameWithHebrew.has(lang) && evt.h0) {
    subj += ` / <span lang="he" dir="rtl">${evt.h0}</span>`;
  }
  if (evt.u0) {
    subj = `<a href="${evt.u0}">${subj}</a>`;
  }
  const basename = evt.bn || evt.t0;
  const memo0 = basename && window['hebcal'].memos[basename];
  const memo = memo0 ? ` title="${memo0}"` : '';
  return `<tr><td>${dateStr}</td>${timeTd}<td><span class="table-event ${className}"${memo}>${subj}</span></td></tr>`;
}

function monthHtml(month) {
  const isHebrew = window['hebcal'].locale === 'he';
  const dir = isHebrew ? 'rtl' : 'ltr';
  const divBegin = `<div class="month-table" dir="${dir}">`;
  const divEnd = '</div><!-- .month-table -->';
  const heading = getMonthTitle(month, false, false);
  const timeColumn = window['hebcal'].cconfig['geo'] === 'none' ? '' : '<col style="width:27px">';
  const opts = window['hebcal'].opts;
  const dateColWidth = opts.hebrewMonths ? 140 : 116;
  // eslint-disable-next-line max-len
  const tableHead = `<table class="table table-striped" dir="${dir}"><col style="width:${dateColWidth}px">${timeColumn}<col><tbody>`;
  const tableFoot = '</tbody></table>';
  const tableContents = month.events.map(tableRow);
  return divBegin + heading + tableHead + tableContents.join('') + tableFoot + divEnd;
}

function renderMonthTables(months) {
  if (window['hebcal'].monthTablesRendered) {
    return;
  }
  months.forEach(function(month) {
    const html = monthHtml(month);
    const selector = `div#cal-${month.month} div.agenda`;
    const el = document.querySelector(selector);
    if (el) {
      el.innerHTML = html;
    }
  });
  window['hebcal'].monthTablesRendered = true;
}

function subjectSpan(str) {
  const isHebrew = window['hebcal'].locale === 'he';
  str = str.replace(/(\(\d+.+\))$/, '<small>$&</small>');
  if (isHebrew) {
    return '<span lang="he" dir="rtl">' + str + '</span>';
  }
  return str;
}

function renderEventHtml(evt) {
  let subj = evt.t0;
  const cat = evt.cat;
  if (cat === 'dafyomi') {
    subj = subj.substring(subj.indexOf(':') + 1);
  } else if (cat === 'candles' || cat === 'havdalah') {
    // "Candle lighting: foo" or "Havdalah (42 min): foo"
    subj = subj.substring(0, subj.indexOf(':'));
  }
  const time = getTimeStr(evt.dt);
  if (time) {
    const timeHtml = evt.bn === 'Chanukah' ?
    '<small>' + time + '</small>' :
    '<small class="text-body-secondary">' + time + '</small>';
    subj = timeHtml + ' ' + subjectSpan(subj);
  } else {
    subj = subjectSpan(subj);
  }
  const className = getEventClassName(evt);
  const lang = window['hebcal'].lang || 's';
  if (langNameWithHebrew.has(lang) && evt.h0) {
    subj += `<br><span lang="he" dir="rtl">${evt.h0}</span>`;
  }
  const basename = evt.bn || evt.t0;
  const memo0 = basename && window['hebcal'].memos[basename];
  const memo = memo0 ? ` title="${memo0}"` : '';
  const url = evt.u0;
  const ahref = url ? `<a href="${url}">` : '';
  const aclose = url ? '</a>' : '';
  // Add left-align class for Gregorian dates in Hebrew mode
  const isHebrew = window['hebcal'].locale === 'he';
  const alignClass = isHebrew ? ' text-start' : '';
  return `<div class="fc-event ${className}${alignClass}"${memo}>${ahref}${subj}${aclose}</div>\n`;
}

function getMonthTitle(month, center, prevNext) {
  const isHebrewLang = window['hebcal'].locale === 'he';
  const span0 = isHebrewLang ? '<span lang="he" dir="rtl">' : '';
  const span1 = isHebrewLang ? '</span>' : '';
  const localeData = window['hebcal'].localeConfig;
  const yearMonth = month.month;

  let titleText; let subtitleText;

  if (month.isHebrew) {
    // Hebrew month mode: Hebrew month is primary, Gregorian range is secondary
    titleText = month.monthName; // e.g., "Kislev 5784"

    // Build Gregorian date range subtitle
    const startDate = month.startDay;
    const endDate = month.endDay;
    const startMon = localeData.monthsShort[startDate.month()];
    const endMon = localeData.monthsShort[endDate.month()];
    const startYear = startDate.year();
    const endYear = endDate.year();

    if (startYear === endYear && startMon === endMon) {
      // Same month: "Dec 3 – 31, 2024"
      subtitleText = `${startMon} ${startYear}`;
    } else if (startYear === endYear) {
      // Different months, same year: "Nov 28 – Dec 27, 2024"
      subtitleText = `${startMon} \u2013 ${endMon} ${endYear}`;
    } else {
      // Different years: "Dec 28, 2023 – Jan 25, 2024"
      subtitleText = `${startMon} ${startYear} \u2013 ${endMon} ${endYear}`;
    }
  } else {
    // Gregorian month mode: Gregorian month is primary, Hebrew month is secondary
    const yyStr = yearMonth.substring(0, yearMonth.length - 3);
    const yy = parseInt(yyStr, 10);
    const yearStr = yy > 0 ? yy : -(yy-1) + ' ' + (isHebrewLang ? 'לפנה״ס' : 'B.C.E.');
    const monthStr = yearMonth.substring(yearMonth.length - 2);
    const mm = parseInt(monthStr, 10);
    titleText = localeData.months[mm - 1] + ' ' + yearStr;
    subtitleText = month.monthName || '';
  }

  const prev = prevNext && month.prev ?
    `<a class="d-print-none text-body-secondary text-decoration-none" href="#cal-${month.prev}">«</a> ` : '';
  const next = prevNext && month.next ?
    ` <a class="d-print-none text-body-secondary text-decoration-none" href="#cal-${month.next}">»</a>` : '';
  const h3 = center ? '<h3 class="text-center">' : '<h3>';
  const subtitleClass = center ? 'text-center text-burgundy' : 'text-burgundy';
  const subtitleHtml = subtitleText ? `\n<h5 class="${subtitleClass}">${subtitleText}</h5>` : '';
  return h3 + prev + span0 + titleText + span1 + next + '</h3>' + subtitleHtml;
}

function makeMonthHtml(month) {
  const isHebrew = window['hebcal'].locale === 'he';
  const span0 = isHebrew ? '<span lang="he" dir="rtl">' : '';
  const span1 = isHebrew ? '</span>' : '';
  const localeData = window['hebcal'].localeConfig;
  let html = getMonthTitle(month, true, true);
  const dir = isHebrew ? ' dir="rtl" ' : ' ';
  html += '<table' + dir + 'class="table table-bordered fc-emulated-table">\n';
  html += '<tbody>\n';
  html += '<tr>';
  localeData.weekdays.forEach(function(s) {
    html += '<th>' + span0 + s + span1 + '</th>';
  });
  html += '</tr>\n';
  const tbody = makeMonthTableBody(month);
  html += tbody;
  html += '</tbody></table>\n';
  return html;
}

function makeMonthTableBody(month) {
  const isHebrew = month.isHebrew;
  const dayMap = [];
  const events = month.events;

  events.forEach(function(evt) {
    const isoDate = dateOnly(evt.dt);
    const d = makeDayjs(isoDate);
    let dayNum;
    if (isHebrew) {
      const hd = abs2hebrew(greg2abs(d.toDate()));
      dayNum = hd.dd;
    } else {
      dayNum = d.date();
    }
    dayMap[dayNum] = dayMap[dayNum] || [];
    dayMap[dayNum].push(evt);
  });

  let html = '<tr>';
  let day1; let dow; let days;

  if (isHebrew) {
    day1 = month.startDay;
    dow = day1.day();
    days = month.daysInMonth;
  } else {
    const isoDate = month.month + '-01';
    day1 = makeDayjs(isoDate);
    dow = day1.day();
    days = day1.daysInMonth();
  }

  // Render leading days from previous month (Elul) if this is Tishrei with skipped Elul
  if (isHebrew && month.startHd.mm === 7 && month.prevMonthEvents) {
    // Create a map of Elul day -> events
    const prevDayMap = {};
    month.prevMonthEvents.forEach(function(item) {
      prevDayMap[item.day] = prevDayMap[item.day] || [];
      prevDayMap[item.day].push(item.evt);
    });

    // Calculate Elul days for leading cells
    const elulDays = 29;

    for (let i = 0; i < dow; i++) {
      const elulDay = elulDays - (dow - i - 1);
      if (prevDayMap[elulDay]) {
        // Render cell with Elul day and events
        const opts = window['hebcal'].opts || {};
        const useGematriya = opts.gematriyaNumerals === true;
        const dayNumStr = useGematriya ? gematriya(elulDay) : elulDay;
        html += `<td><p style="color:#999;"><b>${dayNumStr}</b></p>`;
        prevDayMap[elulDay].forEach(function(evt) {
          html += renderEventHtml(evt);
        });
        html += '</td>\n';
      } else {
        html += '<td>&nbsp;</td>';
      }
    }
  } else {
    for (let i = 0; i < dow; i++) {
      html += '<td>&nbsp;</td>';
    }
  }

  let n = dow;
  const today = dayjs();

  for (let i = 1; i <= days; i++) {
    let d;
    if (isHebrew) {
      const abs = hd2abs({yy: month.startHd.yy, mm: month.startHd.mm, dd: i});
      d = dayjs(abs2greg(abs));
    } else {
      d = makeDayjs(month.month + '-' + pad2(i));
    }

    const clazz = today.isSame(d, 'd') ? 'fc-daygrid-day fc-day-today pb-3' : 'pb-3';
    const opts = window['hebcal'].opts || {};
    const useGematriya = opts.gematriyaNumerals === true;
    const dayNumStr = useGematriya ? gematriya(i) : i;
    html += `<td class="${clazz}"><div class="d-flex justify-content-between mb-3"><b>${dayNumStr}</b>`;
    const evts = dayMap[i] || [];
    const altDates = opts.addAlternateDates || opts.addAlternateDatesForEvents;
    if (altDates) {
      const altDateEvt = evts.find((evt) => evt.cat === 'hebdate' || evt.cat === 'gregdate');
      if (altDateEvt) {
        html += `<small class="text-body-secondary ms-1 me-1">${altDateEvt.t0}</small>`;
      }
    }
    html += '</div>';
    evts.forEach(function(evt) {
      if (altDates && evt.cat === 'hebdate' || evt.cat === 'gregdate') {
        return; // skip these
      }
      html += renderEventHtml(evt);
    });
    html += '</td>\n';
    n++;
    if (n % 7 === 0) {
      html += '</tr>\n<tr>';
    }
  }

  while (n % 7 !== 0) {
    html += '<td>&nbsp;</td>';
    n++;
  }
  html += '</tr>\n';
  if (html.substring(html.length - 10) === '<tr></tr>\n') {
    return html.substring(0, html.length - 10);
  }
  return html;
}

function makeMonthDivs(months) {
  if (window['hebcal'].monthDivsCreated) {
    return;
  }
  const parentDiv = document.getElementById('hebcal-results');
  const currentMonth = new Date().toISOString().substring(0, 7);
  for (let i = 0; i < months.length; i++) {
    const month = months[i];
    const wrapperEl = document.createElement('div');
    wrapperEl.id = `cal-${month.month}`;
    if (currentMonth === month.month) {
      const el = document.createElement('div');
      el.id = 'cal-current';
      wrapperEl.appendChild(el);
    }
    const calEl = document.createElement('div');
    const first = !i;
    calEl.className = first ? 'cal' : 'cal pbba';
    if (!first) {
      calEl.style.pageBreakBefore = 'always';
    }
    wrapperEl.appendChild(calEl);
    const agendaEl = document.createElement('div');
    agendaEl.className = 'agenda';
    wrapperEl.appendChild(agendaEl);
    parentDiv.appendChild(wrapperEl);
  }
  // parentDiv.style.display = 'block';
  window['hebcal'].monthDivsCreated = true;
}

function renderCalendarGrids(months) {
  if (window['hebcal'].resultsRendered) {
    return;
  }
  months.forEach((month) => {
    const html = makeMonthHtml(month);
    const selector = `div#cal-${month.month} div.cal`;
    const el = document.querySelector(selector);
    if (el) {
      el.innerHTML = html;
    }
  });
  window['hebcal'].resultsRendered = true;
}

function paginationListItem({href, title, rel, innerHTML}) {
  const listEl = document.createElement('li');
  listEl.className = 'page-item';
  const anchor = document.createElement('a');
  anchor.className = 'page-link';
  anchor.href = href;
  if (title) anchor.title = title;
  if (rel) anchor.rel = rel;
  anchor.innerHTML = innerHTML;
  listEl.appendChild(anchor);
  return listEl;
}

const hebcalResults = {
  makeMonthDivs,
  renderMonthTables,
  makeMonthHtml,
  renderCalendarGrids,
  paginationListItem,
  splitByMonth,
};

export default hebcalResults;
