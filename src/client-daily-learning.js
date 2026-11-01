import {Calendar} from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import {HDate} from '@hebcal/hdate/dist/esm/hdate';
import {isoDateString} from '@hebcal/hdate/dist/esm/dateFormat';
import {DailyLearning} from '@hebcal/core/dist/esm/DailyLearning';
import {addArrowKeyNavigation, addHebMonthSubtitle, addTitle, dayCellContent} from './clientFullCalendarCommon.js';
import '@hebcal/learning';

/**
 * @param {import('@hebcal/core/dist/esm/event').Event} ev
 * @return {any}
 */
function eventToFullCalendar(ev) {
  const fcEvent = {
    title: ev.renderBrief('en'),
    start: isoDateString(ev.greg()),
    allDay: true,
    className: ev.getCategories().join(' '),
  };
  const url = ev.url();
  if (url) {
    fcEvent.url = url;
  }
  return fcEvent;
}

const u = new URL(window.location.href);
const il = u.searchParams.get('i') === 'on';
const calendarEl = document.getElementById('calendar');
const schedule = calendarEl.dataset.schedule;

const opts = {
  plugins: [
    dayGridPlugin,
  ],
  initialView: 'dayGridMonth',
  headerToolbar: {
    left: 'prev',
    center: '', // addTitle() renders the title as an <h3>
    right: 'next',
  },
  timeZone: 'local',
  eventDisplay: 'block',
  dayCellContent: dayCellContent,
  events: function(info, successCallback) {
    const result = [];
    // copy: FullCalendar owns info.start and reuses it after this callback
    for (const dt = new Date(info.start); dt < info.end; dt.setDate(dt.getDate() + 1)) {
      const hd = new HDate(dt);
      const ev = DailyLearning.lookup(schedule, hd, il);
      if (ev) {
        result.push(eventToFullCalendar(ev));
      }
    }
    successCallback(result);
  },
};

const calendar = new Calendar(calendarEl, opts);
calendar.render();
addTitle(calendar);
addHebMonthSubtitle(calendar);
addArrowKeyNavigation(calendar);
