/* eslint-disable require-jsdoc */
import dayjs from 'dayjs';

function dateOnly(s) {
  const idxT = s.indexOf('T');
  return idxT === -1 ? s : s.substring(0, idxT);
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
    link.substring(0, 22) !== 'https://www.hebcal.com') {
    className += ' outbound';
  }
  return className;
}

function splitByMonth(events) {
  const out = [];
  let prevMonth = '';
  let monthEvents;
  events.forEach(function(evt) {
    const isoDate = dateOnly(evt.date);
    const month = isoDate.substring(0, isoDate.length - 3);
    if (month !== prevMonth) {
      prevMonth = month;
      monthEvents = [];
      out.push({
        month,
        events: monthEvents,
      });
    }
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
  const cc = window['hebcal'].cconfig.cc;
  if (typeof hour12cc[cc] === 'undefined') {
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
  const m = dayjs(isoDate);
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
    const memo0 = evt.bn && window['hebcal'].memos[evt.bn];
    const atitle = memo0 ? ` title="${memo0}"` : '';
    subj = `<a${atitle} href="${evt.link}">${subj}</a>`;
  }
  return `<tr><td>${dateStr}</td>${timeTd}<td><span class="table-event ${className}">${subj}</span></td></tr>`;
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

function renderMonthTables() {
  if (window['hebcal'].monthTablesRendered) {
    return;
  }
  const months = splitByMonth(window['hebcal'].events);
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
  const ahref = url ? `<a href="${url}"${memo}>` : '';
  const aclose = url ? '</a>' : '';
  return `<div class="fc-event ${className}">${ahref}${subj}${aclose}</div>\n`;
}

function getMonthTitle(month, center, prevNext) {
  const lang = window['hebcal'].lang || 's';
  const isHebrew = lang == 'h' || lang == 'he' || lang == 'he-x-NoNikud';
  const span0 = isHebrew ? '<span lang="he" dir="rtl">' : '';
  const span1 = isHebrew ? '</span>' : '';
  const localeData = window['hebcal'].localeConfig;
  const yearMonth = month.month;
  const yearStr = yearMonth.substring(0, yearMonth.length - 3);
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
  const tbody = makeMonthTableBody(month.events);
  html += tbody;
  html += '</tbody></table>\n';
  return html;
}

function makeMonthTableBody(events) {
  const dayMap = [];
  events.forEach(function(evt) {
    const isoDate = dateOnly(evt.date);
    const d = dayjs(isoDate);
    const date = d.date();
    dayMap[date] = dayMap[date] || [];
    dayMap[date].push(evt);
  });
  let html = '<tr>';
  const isoDate = dateOnly(events[0].date);
  const day1 = dayjs(isoDate).date(1);
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

function renderResults() {
  if (window['hebcal'].resultsRendered) {
    return;
  }
  const parentDiv = document.getElementById('hebcal-results');
  // parentDiv.style.display = 'none';
  let first = true;
  const currentMonth = new Date().toISOString().substring(0, 7);
  const months = splitByMonth(window['hebcal'].events);
  months.forEach((month) => {
    const wrapperEl = document.createElement('div');
    wrapperEl.id = `cal-${month.month}`;
    if (currentMonth === month.month) {
      const el = document.createElement('div');
      el.id = 'cal-current';
      wrapperEl.appendChild(el);
    }
    const calEl = document.createElement('div');
    calEl.className = first ? 'cal' : 'cal pbba';
    if (!first) {
      calEl.style.pageBreakBefore = 'always';
    }
    const html = makeMonthHtml(month);
    calEl.innerHTML = html;
    wrapperEl.appendChild(calEl);
    const agendaEl = document.createElement('div');
    agendaEl.className = 'agenda';
    wrapperEl.appendChild(agendaEl);
    parentDiv.appendChild(wrapperEl);
    first = false;
  });
  // parentDiv.style.display = 'block';
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
  renderMonthTables,
  makeMonthHtml,
  renderResults,
  paginationListItem,
  splitByMonth,
};

export default hebcalResults;
