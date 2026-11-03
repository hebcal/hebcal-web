// Gregorian calendar popup (Vanilla Calendar Pro) for Day / Month / Year
// field triples. Built by rollup into static/i/<pkg.config.datepickerApp>
// and loaded on demand by src/client-datepicker-loader.js the first time a
// visitor activates a [data-hebcal-datepicker] button, so the many visitors
// who simply type a date never download it.
//
// The typed fields stay the primary input: they are the fastest way to enter a
// historical date (14, May, 1948, Enter) and they also accept BCE years and
// years outside 1-9999 that a JS Date picker cannot show. The popup is a
// convenience that opens on whatever date the fields currently hold and writes
// its choice back into them.
//
// Button markup:
//   <button type="button" data-hebcal-datepicker="gd gm gy"
//     data-hebcal-datepicker-submit>…</button>
// The attribute names the ids of the day input, month select and year input.
// With data-hebcal-datepicker-submit, choosing a date also submits the form.
import {Calendar} from 'vanilla-calendar-pro';
import layoutCss from 'vanilla-calendar-pro/styles/layout.css';
import lightCss from 'vanilla-calendar-pro/styles/themes/light.css';
import darkCss from 'vanilla-calendar-pro/styles/themes/dark.css';

// Map the theme's accent colours onto Bootstrap's (the purged site CSS
// omits --bs-primary, hence the literal fallbacks) so the popup matches the
// rest of the site in both colour modes, and keep it above Bootstrap modals.
// The library's outside-click test compares event.target to the button
// itself, so a click on the button's <svg> icon would count as "outside".
const bootstrapCss = `
.vc{z-index:1090;font-family:var(--bs-body-font-family)}
[data-hebcal-datepicker] *{pointer-events:none}
[data-vc-theme].vc{
--vc-bg:var(--bs-body-bg);
--vc-color:var(--bs-body-color);
--vc-date-selected-bg:var(--bs-primary,#0d6efd);
--vc-date-weekend-selected-bg:var(--bs-primary,#0d6efd);
--vc-months-years-bg-selected:var(--bs-primary,#0d6efd);
--vc-date-today-color:var(--bs-primary,#0d6efd);
--vc-date-weekend-today-color:var(--bs-primary,#0d6efd);
--vc-focus-outline-color:var(--bs-focus-ring-color,rgba(13,110,253,.25));
border:var(--bs-border-width) solid var(--bs-border-color-translucent);
}`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  const nonce = document.querySelector('script[nonce]')?.nonce;
  if (nonce) style.nonce = nonce;
  style.textContent = layoutCss + lightCss + darkCss + bootstrapCss;
  document.head.appendChild(style);
}

const MIN_YEAR = 1;
const MAX_YEAR = 9999;

function pad(n, width) {
  return String(n).padStart(width, '0');
}

function isoDate(y, m, d) {
  return pad(y, 4) + '-' + pad(m, 2) + '-' + pad(d, 2);
}

/**
 * Returns the date currently typed into the fields as an ISO string, or
 * undefined if the fields do not hold a date the picker can display.
 * @param {HTMLInputElement} dEl
 * @param {HTMLSelectElement} mEl
 * @param {HTMLInputElement} yEl
 * @return {string|undefined}
 */
function fieldsToIso(dEl, mEl, yEl) {
  const y = parseInt(yEl.value, 10);
  const m = parseInt(mEl.value, 10);
  const d = parseInt(dEl.value, 10);
  if (isNaN(y) || y < MIN_YEAR || y > MAX_YEAR || isNaN(m) || m < 1 || m > 12) {
    return undefined;
  }
  const isLeap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  const day = isNaN(d) || d < 1 ? 1 : Math.min(d, daysInMonth);
  return isoDate(y, m, day);
}

function fire(el, type) {
  el.dispatchEvent(new Event(type, {bubbles: true}));
}

function currentTheme() {
  return document.documentElement.getAttribute('data-bs-theme') === 'dark' ?
    'dark' : 'light';
}

const calendars = new WeakMap();
const fresh = new WeakSet();

/**
 * Click hook for a trigger button, run in the capture phase before the
 * library's own listener on the button. Creates the calendar on first use,
 * re-syncs it with the fields, or closes it if it is already open. Returns true
 * if the click was fully handled and must not reach the library's listener.
 * @param {HTMLElement} btn
 * @return {boolean}
 */
function open(btn) {
  const ids = (btn.getAttribute('data-hebcal-datepicker') || '').split(/\s+/);
  const [dEl, mEl, yEl] = ids.map((id) => document.getElementById(id));
  if (!dEl || !mEl || !yEl) return true;
  injectStyles();
  const iso = fieldsToIso(dEl, mEl, yEl);
  let cal = calendars.get(btn);
  if (cal && fresh.delete(btn)) {
    return false; // the replayed first click: let the library show it
  }
  if (cal) {
    // The loader calls us in the capture phase, before the library's own
    // click handler on the button (attached by init()) runs.
    if (cal.context.isShowInInputMode) {
      cal.hide(); // second click on the button closes it
      return true; // tell the loader to stop the event
    }
    // Fields may have been edited since the last open: re-sync and re-theme,
    // then let the library's own handler show it.
    cal.set({
      selectedDates: iso ? [iso] : [],
      selectedMonth: iso ? Number(iso.substring(5, 7)) - 1 : undefined,
      selectedYear: iso ? Number(iso.substring(0, 4)) : undefined,
      selectedTheme: currentTheme(),
    });
    return false;
  }
  const options = {
    inputMode: true,
    positionToInput: 'auto',
    locale: document.documentElement.lang || 'en',
    firstWeekday: 0, // Sunday
    selectedWeekends: [6], // Shabbat
    selectedTheme: currentTheme(),
    // The library defaults to 1970-01-01..2470-12-31, which would grey out
    // exactly the historical dates people come to convert.
    dateMin: isoDate(MIN_YEAR, 1, 1),
    dateMax: isoDate(MAX_YEAR, 12, 31),
    enableJumpToSelectedDate: true,
    labels: {
      application: 'Choose a Gregorian date',
    },
    onClickDate(self) {
      const picked = self.context.selectedDates[0];
      if (!picked) return;
      const [y, m, d] = picked.split('-').map((s) => parseInt(s, 10));
      dEl.value = String(d);
      mEl.value = String(m);
      yEl.value = String(y);
      for (const el of [dEl, mEl, yEl]) {
        fire(el, 'input');
        fire(el, 'change');
        el.classList.remove('is-invalid');
      }
      self.hide();
      if (btn.hasAttribute('data-hebcal-datepicker-submit')) {
        const form = btn.form || dEl.form;
        if (form) {
          // requestSubmit() runs validation and includes the submitter's
          // name/value (e.g. g2h=1), exactly as if it had been clicked.
          const submitter = form.querySelector('button[type=submit]');
          form.requestSubmit(submitter || undefined);
        }
      } else {
        btn.focus();
      }
    },
  };
  if (iso) {
    options.selectedDates = [iso];
    options.selectedMonth = Number(iso.substring(5, 7)) - 1;
    options.selectedYear = Number(iso.substring(0, 4));
  }
  cal = new Calendar(btn, options);
  // Never call show() directly: before first display it falls back to
  // btn.click() itself and ends up registering the outside-click handler
  // twice. Instead let the library's own click listener on the button create
  // and show the popup. init() attaches that listener only after this click
  // has finished dispatching, so replay the click once it is in place; the
  // replay comes back through open(), which skips the re-sync below.
  cal.init();
  calendars.set(btn, cal);
  fresh.add(btn);
  setTimeout(() => btn.click(), 0);
  return true;
}

window.hebcalDatepicker = {open};
