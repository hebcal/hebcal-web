import {Calendar} from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import {HDate} from '@hebcal/hdate/dist/esm/hdate';
import {isoDateString} from '@hebcal/hdate/dist/esm/dateFormat';
import {flags} from '@hebcal/core/dist/esm/event';
import {getHolidaysOnDate} from '@hebcal/core/dist/esm/holidays';

function makeHebMonthRangeStr(startDt, endDt) {
  const start = new HDate(startDt);
  const end = new HDate(endDt);
  let str = start.getMonthName();
  if (end.getFullYear() !== start.getFullYear()) {
    str += ' ' + start.getFullYear();
  }
  if (end.getMonth() !== start.getMonth()) {
    str += ' – ' + end.getMonthName();
  }
  str += ' ' + end.getFullYear();
  return str.replaceAll('\'', '’');
}

/**
 * @param {import('@hebcal/core/dist/esm/event').Event} ev
 * @return {any}
 */
function eventToFullCalendar(ev) {
  const classes = ev.getCategories().slice();
  const mask = ev.getFlags();
  const isChag = Boolean(mask & flags.CHAG);
  if (isChag && classes[0] === 'holiday') {
    classes.push('yomtov');
  }
  const fcEvent = {
    title: ev.render('s'),
    start: isoDateString(ev.greg()),
    allDay: true,
    className: classes.join(' '),
  };
  const emoji = ev.getEmoji();
  if (emoji) {
    fcEvent.title += '\u00a0' + emoji;
  }
  const url = ev.url();
  if (url) {
    fcEvent.url = url;
    const u = new URL(fcEvent.url);
    const p = u.pathname;
    if (p.startsWith('/h/')) {
      fcEvent.url = '/holidays/' + p.substring(3);
    }
  }
  return fcEvent;
}

const IGNORE_MASK = flags.YOM_KIPPUR_KATAN | flags.BEHAB;

/**
 * @param {Date} dt
 * @param {boolean} il
 * @return {any[]}
 */
function makeFullCalendarHolidaysForDate(dt, il) {
  const holidays = getHolidaysOnDate(dt, il) || [];
  const filtered = holidays.filter((ev) => (ev.getFlags() & IGNORE_MASK) === 0);
  return filtered.map(eventToFullCalendar);
}

document.addEventListener('DOMContentLoaded', function() {
  let hebmonthEl = null;
  function monthSubtitle(view) {
    const end = new Date(view.currentEnd.getTime());
    end.setDate(end.getDate() - 1);
    const s = makeHebMonthRangeStr(view.currentStart, end);
    if (hebmonthEl) {
      hebmonthEl.innerText = s;
    }
  }
  let calendar = null;
  const calendarEl = document.getElementById('calendar');
  calendarEl.style.display = 'none';
  const listViewEl = document.getElementById('list-view');
  const toggleMonth = document.getElementById('toggle-month');
  toggleMonth.addEventListener('change', function(event) {
    const fc = this.checked;
    calendarEl.style.display = fc ? 'block' : 'none';
    listViewEl.style.display = fc ? 'none' : 'block';
    if (fc) {
      const u = new URL(window.location.href);
      const il = u.searchParams.get('i') === 'on';
      const year = calendarEl.dataset.year;
      const initialDate = calendarEl.dataset.initialDate;
      makeFullCalendar(il, year, initialDate);
      calendar.render();
      const toolbarEl = document.querySelector('.fc-header-toolbar .fc-toolbar-chunk:nth-child(2)');
      if (toolbarEl && !hebmonthEl) {
        hebmonthEl = document.createElement('h5');
        hebmonthEl.id = 'hebmonth';
        hebmonthEl.className = 'text-burgundy ms-0 mt-1';
        toolbarEl.appendChild(hebmonthEl);
        monthSubtitle(calendar.view);
      }
    }
    toggleMonth.blur();
  });
  function makeFullCalendar(il, year, initialDate) {
    if (calendar) {
      return calendar;
    }
    const opts = {
      plugins: [
        dayGridPlugin,
      ],
      initialView: 'dayGridMonth',
      headerToolbar: {
        left: 'prev next',
        center: 'title',
        right: '',
      },
      initialDate,
      timeZone: 'local',
      eventDisplay: 'block',
      dayCellContent: function(info, create) {
        const hd = new HDate(info.date);
        const day = hd.getDate();
        const month = hd.getMonthName().replaceAll('\'', '’');
        let dayNumberText = `${day} ${month}`;
        if (day === 1) {
          dayNumberText += ` ${hd.getFullYear()}`;
        }
        const el0 = create('span', {class: 'fc-hdate d-none d-md-inline'}, dayNumberText);
        return create('span', null, el0, info.dayNumberText);
      },
      events: function(info, successCallback, failureCallback) {
        const result = [];
        for (const dt = info.start; dt < info.end; dt.setDate(dt.getDate() + 1)) {
          const holidays = makeFullCalendarHolidaysForDate(dt, il);
          result.push(...holidays);
        }
        successCallback(result);
      },
    };
    calendar = new Calendar(calendarEl, opts);
    calendar.on('datesSet', function(dateInfo) {
      monthSubtitle(dateInfo.view);
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowLeft' && !e.metaKey) {
        calendar.prev();
      } else if (e.key === 'ArrowRight' && !e.metaKey) {
        calendar.next();
      }
    });
    const _paq = window._paq = window._paq || [];
    _paq.push(['trackEvent', 'Interaction', 'fullcalendar', year]);
    return calendar;
  }
});
