import {Calendar} from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import {isoDateString} from '@hebcal/hdate/dist/esm/dateFormat';
import {getHolidaysOnDate} from '@hebcal/core/dist/esm/holidays';
import {addArrowKeyNavigation, addHebMonthSubtitle, dayCellContent} from './clientFullCalendarCommon.js';

/**
 * @param {import('@hebcal/core/dist/esm/event').Event} ev
 * @return {any}
 */
function eventToFullCalendar(ev) {
  const classes = ev.getCategories().slice();
  const isChag = ev.hasFlag('CHAG');
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

/**
 * @param {Date} dt
 * @param {boolean} il
 * @return {any[]}
 */
function makeFullCalendarHolidaysForDate(dt, il) {
  const holidays = getHolidaysOnDate(dt, il) || [];
  const filtered = holidays.filter((ev) => !ev.hasAnyFlag('YOM_KIPPUR_KATAN', 'BEHAB'));
  return filtered.map(eventToFullCalendar);
}

document.addEventListener('DOMContentLoaded', function() {
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
      addHebMonthSubtitle(calendar);
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
      dayCellContent: dayCellContent,
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
    addArrowKeyNavigation(calendar);
    const _paq = window._paq = window._paq || [];
    _paq.push(['trackEvent', 'Interaction', 'fullcalendar', year]);
    return calendar;
  }
});
