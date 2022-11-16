/* eslint-disable require-jsdoc */
import dayjs from 'dayjs';

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
  const isBCE = s[0] === '-';
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
 * @param {number} number
 * @return {string}
 */
function pad4(number) {
  if (number < 0) {
    return '-00' + pad4(-number);
  } else if (number < 10) {
    return '000' + number;
  } else if (number < 100) {
    return '00' + number;
  } else if (number < 1000) {
    return '0' + number;
  }
  return '' + number;
}

/**
 * @param {number} number
 * @return {string}
 */
function pad2(number) {
  if (number < 10) {
    return '0' + number;
  }
  return '' + number;
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
  let className = evt.category;
  if (evt.yomtov) {
    className += ' yomtov';
  }
  if (evt.date.indexOf('T') !== -1) {
    className += ' timed';
  }
  const link = evt.link;
  if (typeof link === 'string' &&
    link.substring(0, 4) === 'http' &&
    link.substring(0, 23) !== 'https://www.hebcal.com/') {
    className += ' outbound';
  }
  return className;
}

function splitByMonth(events) {
  const startDate = makeDayjs(dateOnly(events[0].date));
  const endDate = makeDayjs(dateOnly(events[events.length - 1].date));
  const start = startDate.set('date', 1);
  const end = endDate.add(1, 'day');
  const months = {};
  const out = [];
  let i = 0;
  for (let d = start; d.isBefore(end); d = d.add(1, 'month')) {
    const yearMonth = formatYearMonth(d);
    if (!months[yearMonth]) {
      out[i++] = months[yearMonth] = {month: yearMonth, events: []};
    }
  }
  events.forEach(function(evt) {
    const isoDate = dateOnly(evt.date);
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

function tableRow(evt) {
  const isoDate = dateOnly(evt.date);
  const m = makeDayjs(isoDate);
  const cat = evt.category;
  const localeData = window['hebcal'].localeConfig;
  const lang = window['hebcal'].lang || 's';
  const isHebrew = lang == 'h' || lang == 'he' || lang == 'he-x-NoNikud';
  const dateStr0 = localeData.weekdaysShort[m.day()] + m.format(' DD ') + localeData.monthsShort[m.month()];
  const dateStr = isHebrew ? `<span lang="he" dir="rtl">${dateStr0}</span>` : dateStr0;
  let subj = evt.title;
  const timeStr = getTimeStr(evt.date);
  const className = getEventClassName(evt);
  if (cat === 'dafyomi') {
    subj = subj.substring(subj.indexOf(':') + 1);
  } else if (cat === 'candles' || cat === 'havdalah') {
    // "Candle lighting: foo" or "Havdalah (42 min): foo"
    subj = subj.substring(0, subj.indexOf(':'));
  }
  const timeTd = window['hebcal'].cconfig['geo'] === 'none' ? '' : `<td>${timeStr}</td>`;
  if (isHebrew) {
    subj = `<span lang="he" dir="rtl">${subj}</span>`;
  } else if ((lang === 'sh' || lang === 'ah') && evt.hebrew) {
    subj += ` / <span lang="he" dir="rtl">${evt.hebrew}</span>`;
  }
  if (evt.link) {
    subj = `<a href="${evt.link}">${subj}</a>`;
  }
  const memo0 = evt.bn && window['hebcal'].memos[evt.bn];
  const memo = memo0 ? ` title="${memo0}"` : '';
  return `<tr><td>${dateStr}</td>${timeTd}<td><span class="table-event ${className}"${memo}>${subj}</span></td></tr>`;
}

function monthHtml(month) {
  const lang = window['hebcal'].lang || 's';
  const isHebrew = lang == 'h' || lang == 'he' || lang == 'he-x-NoNikud';
  const dir = isHebrew ? 'rtl' : 'ltr';
  const divBegin = `<div class="month-table" dir="${dir}">`;
  const divEnd = '</div><!-- .month-table -->';
  const heading = getMonthTitle(month, false, false);
  const timeColumn = window['hebcal'].cconfig['geo'] === 'none' ? '' : '<col style="width:27px">';
  // eslint-disable-next-line max-len
  const tableHead = `<table class="table table-striped" dir="${dir}"><col style="width:116px">${timeColumn}<col><tbody>`;
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
  const lang = window['hebcal'].lang || 's';
  const isHebrew = lang == 'h' || lang == 'he' || lang == 'he-x-NoNikud';
  str = str.replace(/(\(\d+.+\))$/, '<small>$&</small>');
  if (isHebrew) {
    return '<span lang="he" dir="rtl">' + str + '</span>';
  }
  return str;
}

function renderEventHtml(evt) {
  let subj = evt.title;
  const cat = evt.category;
  if (cat === 'dafyomi') {
    subj = subj.substring(subj.indexOf(':') + 1);
  } else if (cat === 'candles' || cat === 'havdalah') {
    // "Candle lighting: foo" or "Havdalah (42 min): foo"
    subj = subj.substring(0, subj.indexOf(':'));
  }
  const time = getTimeStr(evt.date);
  if (time) {
    const timeHtml = evt.bn === 'Chanukah' ?
    '<small>' + time + '</small>' :
    '<small class="text-muted">' + time + '</small>';
    subj = timeHtml + ' ' + subjectSpan(subj);
  } else {
    subj = subjectSpan(subj);
  }
  const className = getEventClassName(evt);
  const lang = window['hebcal'].lang || 's';
  if ((lang === 'sh' || lang === 'ah') && evt.hebrew) {
    subj += `<br><span lang="he" dir="rtl">${evt.hebrew}</span>`;
  }
  const memo0 = evt.bn && window['hebcal'].memos[evt.bn];
  const memo = memo0 ? ` title="${memo0}"` : '';
  const url = evt.link;
  const ahref = url ? `<a href="${url}">` : '';
  const aclose = url ? '</a>' : '';
  return `<div class="fc-event ${className}"${memo}>${ahref}${subj}${aclose}</div>\n`;
}

function getMonthTitle(month, center, prevNext) {
  const lang = window['hebcal'].lang || 's';
  const isHebrew = lang == 'h' || lang == 'he' || lang == 'he-x-NoNikud';
  const span0 = isHebrew ? '<span lang="he" dir="rtl">' : '';
  const span1 = isHebrew ? '</span>' : '';
  const localeData = window['hebcal'].localeConfig;
  const yearMonth = month.month;
  const yyStr = yearMonth.substring(0, yearMonth.length - 3);
  const yy = parseInt(yyStr, 10);
  const yearStr = yy >= 0 ? yy : -yy + ' ' + (isHebrew ? 'לפנה״ס' : 'B.C.E.');
  const monthStr = yearMonth.substring(yearMonth.length - 2);
  const mm = parseInt(monthStr, 10);
  const titleText = localeData.months[mm - 1] + ' ' + yearStr;
  const prev = prevNext && month.prev ? `<a class="d-print-none text-muted" href="#cal-${month.prev}">«</a> ` : '';
  const next = prevNext && month.next ? ` <a class="d-print-none text-muted" href="#cal-${month.next}">»</a>` : '';
  const h3 = center ? '<h3 class="text-center">' : '<h3>';
  return h3 + prev + span0 + titleText + span1 + next + '</h3>';
}

function makeMonthHtml(month) {
  const lang = window['hebcal'].lang || 's';
  const isHebrew = lang == 'h' || lang == 'he' || lang == 'he-x-NoNikud';
  const span0 = isHebrew ? '<span lang="he" dir="rtl">' : '';
  const span1 = isHebrew ? '</span>' : '';
  const localeData = window['hebcal'].localeConfig;
  let html = getMonthTitle(month, true, true);
  const dir = isHebrew ? ' dir="rtl" ' : ' ';
  html += '<table' + dir + 'class="table table-bordered fc-emulated-table">\n';
  html += '<tbody>\n';
  html += '<tr>';
  localeData.weekdaysShort.forEach(function(s) {
    html += '<th>' + span0 + s + span1 + '</th>';
  });
  html += '</tr>\n';
  const tbody = makeMonthTableBody(month);
  html += tbody;
  html += '</tbody></table>\n';
  return html;
}

function makeMonthTableBody(month) {
  const dayMap = [];
  const events = month.events;
  events.forEach(function(evt) {
    const isoDate = dateOnly(evt.date);
    const d = makeDayjs(isoDate);
    const date = d.date();
    dayMap[date] = dayMap[date] || [];
    dayMap[date].push(evt);
  });
  let html = '<tr>';
  const isoDate = month.month + '-01';
  const day1 = makeDayjs(isoDate);
  const dow = day1.day();
  for (let i = 0; i < dow; i++) {
    html += '<td>&nbsp;</td>';
  }
  let n = dow;
  const days = day1.daysInMonth();
  for (let i = 1; i <= days; i++) {
    html += `<td><p><b>${i}</b></p>`;
    const evts = dayMap[i] || [];
    evts.forEach(function(evt) {
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
