import {HDate} from '@hebcal/hdate/dist/esm/hdate';

/**
 * FullCalendar `dayCellContent` hook for the month grid. Prefixes the
 * Gregorian day number with the Hebrew date (e.g. "15 Kislev"), adding the
 * Hebrew year on the 1st of each month. The Hebrew date is hidden below the
 * `md` breakpoint (`d-none d-md-inline`), where the cells are too narrow.
 * Apostrophes in month names become typographic (Sh’vat).
 * @param {import('@fullcalendar/core').DayCellContentArg} info
 * @param {Function} create Preact `createElement`, FullCalendar's second argument to content hooks
 * @return {any} virtual DOM node for the cell's day-number area
 */
export function dayCellContent(info, create) {
  const hd = new HDate(info.date);
  const day = hd.getDate();
  const month = hd.getMonthName().replaceAll('\'', '’');
  let dayNumberText = `${day} ${month}`;
  if (day === 1) {
    dayNumberText += ` ${hd.getFullYear()}`;
  }
  const el0 = create('span', {class: 'fc-hdate d-none d-md-inline'}, dayNumberText);
  return create('span', null, el0, info.dayNumberText);
}

/**
 * Hebrew month or months spanned by a Gregorian date range, used as the
 * month view's subtitle. Includes the year only once unless the range
 * crosses Rosh Hashana, e.g. "Kislev 5786", "Kislev – Tevet 5786", or
 * "Elul 5785 – Tishrei 5786". Apostrophes become typographic (Sh’vat).
 * @param {Date} startDt first day of the range
 * @param {Date} endDt last day of the range (inclusive)
 * @return {string}
 */
export function makeHebMonthRangeStr(startDt, endDt) {
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
 * Renders the month title (e.g. "October 2026") as an <h3> in the toolbar's
 * center chunk and keeps it in sync as the user navigates. Use instead of
 * FullCalendar's built-in `title` toolbar widget, which is hard-coded as an
 * <h2> and so clashes with the page's own <h2> heading; configure the
 * `headerToolbar` with `center: ''`. Call after `calendar.render()`, and
 * before addHebMonthSubtitle(), which appends its subtitle to the same chunk.
 * Safe to call more than once on the same calendar.
 * @param {import('@fullcalendar/core').Calendar} calendar
 */
export function addTitle(calendar) {
  const toolbarEl = calendar.el.querySelector('.fc-header-toolbar .fc-toolbar-chunk:nth-child(2)');
  if (!toolbarEl || toolbarEl.querySelector('.fc-toolbar-title')) {
    return;
  }
  const titleEl = document.createElement('h3');
  titleEl.className = 'fc-toolbar-title text-center';
  toolbarEl.appendChild(titleEl);
  titleEl.innerText = calendar.view.title;
  calendar.on('datesSet', (dateInfo) => {
    titleEl.innerText = dateInfo.view.title;
  });
}

/**
 * Adds a Hebrew month subtitle (e.g. "Tevet – Sh’vat 5786") under the
 * FullCalendar toolbar title and keeps it in sync as the user navigates.
 * Call after `calendar.render()`, because the toolbar does not exist before
 * then. Safe to call more than once on the same calendar.
 * @param {import('@fullcalendar/core').Calendar} calendar
 */
export function addHebMonthSubtitle(calendar) {
  const toolbarEl = calendar.el.querySelector('.fc-header-toolbar .fc-toolbar-chunk:nth-child(2)');
  if (!toolbarEl || toolbarEl.querySelector('#hebmonth')) {
    return;
  }
  const hebmonthEl = document.createElement('h5');
  hebmonthEl.id = 'hebmonth';
  hebmonthEl.className = 'text-burgundy text-center ms-0 mt-1';
  toolbarEl.appendChild(hebmonthEl);
  function monthSubtitle(view) {
    const end = new Date(view.currentEnd);
    end.setDate(end.getDate() - 1);
    hebmonthEl.innerText = makeHebMonthRangeStr(view.currentStart, end);
  }
  monthSubtitle(calendar.view);
  calendar.on('datesSet', (dateInfo) => monthSubtitle(dateInfo.view));
}

/**
 * Binds the left and right arrow keys to the previous and next month.
 * Arrows with Cmd held are left alone, so the browser's Cmd+arrow
 * back/forward shortcuts on macOS still work.
 * @param {import('@fullcalendar/core').Calendar} calendar
 */
export function addArrowKeyNavigation(calendar) {
  document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowLeft' && !e.metaKey) {
      calendar.prev();
    } else if (e.key === 'ArrowRight' && !e.metaKey) {
      calendar.next();
    }
  });
}
