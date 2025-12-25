/* eslint-disable indent */
import {greg, flags, HebrewCalendar, Locale, gematriya, HDate, HebrewDateEvent} from '@hebcal/core';
import PDFDocument from 'pdfkit';
import dayjs from 'dayjs';
import './dayjs-locales.js';
import {localeMap, locationDefaultCandleMins} from './common.js';
import {GregorianDateEvent} from './GregorianDateEvent.js';
import {appendIsraelAndTracking, shouldRenderBrief} from '@hebcal/rest-api';
import {pad2, pad4} from '@hebcal/hdate';

const PDF_WIDTH = 792;
const PDF_HEIGHT = 612;
const PDF_BMARGIN = 72;
const PDF_TMARGIN = 32;
const PDF_LMARGIN = 24;
const PDF_RMARGIN = 24;
const PDF_COLUMNS = 7;
// not intended to be an integer
const PDF_COLWIDTH = (PDF_WIDTH - PDF_LMARGIN - PDF_RMARGIN) / PDF_COLUMNS;
const PDF_CELL_MARGIN = 2; // Horizontal margin for event text within cells (per side)
const TIME_FONT_SIZE = 8.5;

/**
 * @param {dayjs.Dayjs} d
 * @return {string}
 */
function calId(d) {
  return pad4(d.year()) + pad2(d.month() + 1);
}

/**
 * @param {Event[]} events
 * @return {Object}
 */
function eventsToCellsHeb(events) {
  const cells = {};
    // Create month containers in chronological order (like splitByHebrewMonth in hebcalResults.js)
    const startHd = events[0].getDate();
    const endHd = events.at(-1).getDate();

    let currentHYear = startHd.getFullYear();
    let currentHMonth = startHd.getMonth();

    // Special case: Skip Elul of previous year if it's just Erev Rosh Hashana before Tishrei of next year
    // This avoids wasting a full page for one or two events
    const skipInitialElul = currentHMonth === 6 && // Elul
                            startHd.getFullYear() < endHd.getFullYear() && // Different years
                            new HDate(1, 7, currentHYear + 1).abs() <= endHd.abs(); // Tishrei of next year is in range

    if (skipInitialElul) {
      // Start from Tishrei of the next year instead
      currentHMonth = 7;
      currentHYear++;
    }

    // Create all month containers from start to end
    while (true) {
      const yearMonth = 'H' + pad4(currentHYear) + '-' + pad2(currentHMonth);
      cells[yearMonth] = {};

      const testHd = new HDate(1, currentHMonth, currentHYear);
      const monthEnd = new HDate(testHd.daysInMonth(), currentHMonth, currentHYear);

      // Check if we should stop (same logic as splitByHebrewMonth)
      if (testHd.abs() > endHd.abs()) {
        break;
      }
      // Special case: if we just created Tishrei of next year, stop here
      if (currentHYear > startHd.getFullYear() && currentHMonth === 7 && monthEnd.abs() >= endHd.abs()) {
        break;
      }

      // Advance to next Hebrew month
      currentHMonth++;
      if (currentHMonth === 7) {
        // Tishrei is the start of the next Hebrew year
        currentHYear++;
      } else {
        const monthsInYear = HDate.isLeapYear(currentHYear) ? 13 : 12;
        if (currentHMonth > monthsInYear) {
          currentHMonth = 1;
        }
      }
    }

    // Now assign events to the appropriate months
    for (const e of events) {
      const hd = e.getDate();
      const hYear = hd.getFullYear();
      const hMonth = hd.getMonth();
      const hDay = hd.getDate();
      const yearMonth = 'H' + pad4(hYear) + '-' + pad2(hMonth);

      if (cells[yearMonth]) {
        cells[yearMonth][hDay] = cells[yearMonth][hDay] || [];
        cells[yearMonth][hDay].push(e);
      } else if (skipInitialElul && hMonth === 6 && hYear === startHd.getFullYear()) {
        // Events from skipped Elul - store them in Tishrei with a special prefix
        const tishrei = 'H' + pad4(hYear + 1) + '-07';
        if (cells[tishrei]) {
          const key = 'prev_' + hDay; // Mark as previous month day
          cells[tishrei][key] = cells[tishrei][key] || [];
          cells[tishrei][key].push(e);
        }
      }
    }
  return cells;
}

/**
 * @param {Event[]} events
 * @return {Object}
 */
function eventsToCells(events) {
  const cells = {};
  for (const e of events) {
    const d = e.greg();
    const mday = d.getDate();
    const yearMonth = calId(dayjs(d));
    cells[yearMonth] = cells[yearMonth] || {};
    cells[yearMonth][mday] = cells[yearMonth][mday] || [];
    cells[yearMonth][mday].push(e);
  }
  // add blank months in the middle, even if there are no events
  const startDate = dayjs(events[0].greg());
  const endDate = dayjs(events.at(-1).greg());
  const start = startDate.set('date', 1);
  for (let i = start; i.isBefore(endDate); i = i.add(1, 'month')) {
    const yearMonth = calId(i);
    if (!cells[yearMonth]) {
      cells[yearMonth] = {dummy: []};
    }
  }
  return cells;
}

/**
 * @param {dayjs.Dayjs} d
 * @return {string[]}
 */
function getWeekdays(d) {
  let sunday = d;
  while (sunday.day() != 0) {
    sunday = sunday.add(1, 'day');
  }
  const weekdays = [];
  for (let i = 0, dd = sunday; i < 7; i++, dd = dd.add(1, 'day')) {
    weekdays.push(dd.format('dddd'));
  }
  return weekdays;
}

function renderPdfMonthGrid(doc, d, rtl, rows, rowheight) {
  // rectangle of calendar grid
  doc.lineWidth(1)
      .strokeColor('#cccccc')
      .rect(PDF_LMARGIN,
          PDF_BMARGIN,
          PDF_WIDTH - PDF_LMARGIN - PDF_RMARGIN,
          PDF_HEIGHT - PDF_TMARGIN - PDF_BMARGIN)
      .stroke()
      .addContent('n');
  // days of the week above 7 columns
  doc.fontSize(10)
      .font(rtl ? 'hebrew' : 'plain');
  const dowNames = getWeekdays(d);
  for (let i = 0; i < dowNames.length; i++) {
    const edgeOffset = (i * PDF_COLWIDTH) + (PDF_COLWIDTH / 2);
    const x = rtl ? PDF_WIDTH - PDF_RMARGIN - edgeOffset :
      PDF_LMARGIN + edgeOffset;
    const str = dowNames[i];
    const width = doc.widthOfString(str);
    doc.fillColor('#0000cc')
        .text(str, x - (width / 2), PDF_TMARGIN + 24);
  }
  // Loop through the columns
  for (let c = 1; c < PDF_COLUMNS; c++) {
    const x = PDF_LMARGIN + c * PDF_COLWIDTH;
    // Print a vertical grid line
    doc.moveTo(x, PDF_BMARGIN)
        .lineTo(x, PDF_HEIGHT - PDF_TMARGIN)
        .stroke()
        .addContent('n');
  }
  // Loop through the rows
  for (let r = 1; r < rows; r++) {
    const y = PDF_HEIGHT - PDF_TMARGIN - r * rowheight;
    // Print a horizontal grid line
    doc.moveTo(PDF_LMARGIN, y)
        .lineTo(PDF_WIDTH - PDF_RMARGIN, y)
        .stroke()
        .addContent('n');
  }
}

/**
 * @param {dayjs.Dayjs} d
 * @param {boolean} rtl
 * @param {import('@hebcal/core').CalOptions} options
 * @return {string}
 */
function makeHebMonthStr(d, rtl, options) {
  const start = new HDate(d.toDate());
  const endD = d.add(1, 'month').subtract(1, 'day');
  const end = new HDate(endD.toDate());
  let str = Locale.gettext(start.getMonthName(), options?.locale);
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const useGematriya = options?.gematriyaNumerals === true;
  if (endYear !== startYear) {
    const yearStr = useGematriya ? gematriya(startYear) : startYear;
    str += ' ' + yearStr;
  }
  if (end.getMonth() !== start.getMonth()) {
    str += ' – ' + Locale.gettext(end.getMonthName(), options?.locale);
  }
  const endYearStr = useGematriya ? gematriya(endYear) : endYear;
  str += ' ' + endYearStr;
  return rtl ? reverseHebrewWords(str) : str.replace(/'/g, '’');
}

// Hebrew month mode: Hebrew month is primary, Gregorian range is secondary
function pdfMonthTitleHebrew(year, month, options, rtl) {
    const hd = new HDate(1, month, year);
    const monthName = Locale.gettext(hd.getMonthName(), options?.locale);
    const yearStr = rtl ? gematriya(year) : year;
    const monthTitle0 = monthName + ' ' + yearStr;
    const monthTitle = rtl ? reverseHebrewWords(monthTitle0) : monthTitle0;

    // Build Gregorian date range subtitle
    const lastDay = hd.daysInMonth();
    const endHd = new HDate(lastDay, month, year);
    const locale0 = options?.locale;
    const locale = localeMap[locale0] || 'en';
    const startDay = dayjs(hd.greg()).locale(locale);
    const endDay = dayjs(endHd.greg()).locale(locale);

    let subtitle;
    if (startDay.month() === endDay.month()) {
      // Same month: "Dec 3 – 31, 2024"
      subtitle = startDay.format('MMM D ') + `\u2013 ` + endDay.format('D, YYYY');
    } else if (startDay.year() === endDay.year()) {
      // Different months, same year: "Nov 28 – Dec 27, 2024"
      subtitle = startDay.format('MMM D ') + `\u2013 ` + endDay.format('MMM D, YYYY');
    } else {
      // Different years: "Dec 28, 2023 – Jan 25, 2024"
      subtitle = startDay.format('MMM D, YYYY ') + `\u2013` + endDay.format('MMM D, YYYY');
    }
    subtitle = rtl ? reverseHebrewWords(subtitle) : subtitle;
    return {monthTitle, subtitle};
}

// Gregorian month mode: Gregorian month is primary, Hebrew month is secondary
function pdfMonthTitleGreg(d, options, rtl) {
    const yy = d.year();
    const titleYear = yy > 0 ? yy : -(yy - 1) + ' ' + (rtl ? 'לפנה״ס' : 'B.C.E.');
    const monthTitle0 = d.format('MMMM') + ' ' + titleYear;
    const monthTitle = rtl ? reverseHebrewWords(monthTitle0) : monthTitle0;
    const subtitle = makeHebMonthStr(d, rtl, options);
    return {monthTitle, subtitle};
}

function renderPdfMonthTitle(doc, d, rtl, options, year, month) {
  const {monthTitle, subtitle} = options?.hebrewMonths ?
    pdfMonthTitleHebrew(year, month, options, rtl) :
    pdfMonthTitleGreg(d, options, rtl);
  const monthFont = rtl ? 'hebrew' : 'semi';
  doc.fontSize(26)
      .font(monthFont)
      .text(monthTitle, 0, PDF_TMARGIN - 24, {align: 'center'});
  doc.fontSize(14)
      .font(rtl ? 'hebrew' : 'plain')
      .text(subtitle, 0, PDF_TMARGIN + 4, {align: 'center'});
}

function eventColor(evt) {
  const f = evt.getFlags();
  if (f & (flags.DAF_YOMI | flags.OMER_COUNT | flags.HEBREW_DATE |
    flags.MISHNA_YOMI | flags.YERUSHALMI_YOMI | flags.NACH_YOMI |
    flags.DAILY_LEARNING)) {
    return '#666666';
  }
  if (f & flags.ROSH_CHODESH) {
    return '#660099';
  }
  if (f & flags.MINOR_FAST) {
    return '#FF3300';
  }
  if (f & flags.PARSHA_HASHAVUA) {
    return '#009900';
  }
  if (f & (flags.SPECIAL_SHABBAT | flags.MODERN_HOLIDAY | flags.MINOR_HOLIDAY)) {
    return '#006699';
  }
  if (f & (flags.CHAG | flags.EREV | flags.CHOL_HAMOED | flags.MAJOR_FAST)) {
    return '#990000';
  }
  return '#000000';
}

/**
 * @param {PDFDocument} doc
 * @param {Event} evt
 * @param {number} x
 * @param {number} y
 * @param {boolean} rtl
 * @param {import('@hebcal/core').CalOptions} options
 * @return {number}
 */
function renderPdfEvent(doc, evt, x, y, rtl, options) {
  const color = eventColor(evt);
  doc.fillColor(color);
  let timedWidth = 0;
  const timed = Boolean(evt.eventTime);
  let timeStr = '';
  if (timed) {
    timeStr = HebrewCalendar.reformatTimeStr(evt.eventTimeStr, 'p', options);
    // Calculate time width with bold font at 10pt
    doc.font('bold').fontSize(TIME_FONT_SIZE);
    timedWidth = doc.widthOfString(timeStr + ' ');
  }
  const locale = options?.locale;
  const mask = evt.getFlags();
  let subj = shouldRenderBrief(evt) ? evt.renderBrief(locale) : evt.render(locale);
  // Check if this is a Gregorian date event (alternate date in Hebrew month mode)
  const isGregorianDate = evt instanceof GregorianDateEvent;
  const isChag = Boolean(mask & flags.CHAG) && !timed;
  let fontSize = rtl ? 12 : 10;
  const heFontName = isChag ? 'hebrew-bold' : 'hebrew';
  const fontStyle = rtl ? heFontName : isChag ? 'bold' : 'plain';
  // For RTL, reverse Hebrew text only
  if (rtl) {
    subj = reverseHebrewWords(subj);
  }
  doc.font(fontStyle).fontSize(fontSize);
  let width = doc.widthOfString(subj);
  let numLines = 1;
  const availableWidth = PDF_COLWIDTH - (2 * PDF_CELL_MARGIN);
  for (let i = 0; i < 4; i++) {
    if (timedWidth + width > availableWidth) {
      fontSize = fontSize - 0.5;
      doc.fontSize(fontSize);
      width = doc.widthOfString(subj);
    } else {
      break;
    }
  }
  // If it's still too wide, break it into two lines
  if (timedWidth + width > availableWidth) {
    const strs = subj.split(/(\s)/);
    const idx = Math.ceil(strs.length / 2);
    if (strs[idx] === ' ') {
      strs[idx] = '\n  ';
    } else if (strs[idx + 1] === ' ') {
      strs[idx+1] = '\n  ';
    }
    subj = strs.join('');
    width = doc.widthOfString(subj);
    numLines++;
  }

  const textOptions = {};
  let textX = x;

  // Gregorian dates in Hebrew month mode should be left-aligned
  if (isGregorianDate && rtl) {
    // Left-align Gregorian dates with a slightly larger margin
    textX = x + PDF_CELL_MARGIN*2;
  } else if (rtl && timed) {
    // For RTL timed events, calculate position to right-align time+text as a unit
    const totalWidth = timedWidth + width;
    const startX = x + availableWidth - totalWidth;

    // Render time first (on the left when reading RTL) in bold
    doc.font('bold').fontSize(TIME_FONT_SIZE);
    doc.text(timeStr + ' ', startX, y + 1);

    // Then render text (on the right when reading RTL)
    textX = startX + timedWidth;
  } else if (rtl) {
    // For non-timed RTL events, use standard right-align
    textOptions.align = 'right';
    textOptions.width = availableWidth;
  } else if (timed) {
    // For LTR with time, render time first, then text in bold
    // Add extra left margin to prevent overlap with grid lines
    const timeX = x + PDF_CELL_MARGIN*2;
    doc.font('bold').fontSize(TIME_FONT_SIZE);
    doc.text(timeStr + ' ', timeX, y + 1);
    textX = timeX + timedWidth;
  } else {
    // For LTR non-timed events, add extra left margin to prevent overlap with grid lines
    textX = x + PDF_CELL_MARGIN*2;
  }

  const url = evt.url();
  if (url) {
    let utmSource = options.utmSource;
    if (!utmSource) {
      const u = new URL(url);
      if (u.host === 'www.hebcal.com') {
        utmSource = 'pdf';
      }
    }
    const utmMedium = options.utmMedium || 'document';
    const utmCampaign = options.utmCampaign || 'pdf-' + evt.getDate().getFullYear();
    textOptions.link = appendIsraelAndTracking(url, options.il, utmSource, utmMedium, utmCampaign);
  }

  // Render main text
  doc.font(fontStyle).fontSize(fontSize);
  doc.text(subj, textX, rtl ? y + 0.65 : y, textOptions);
  if (options.appendHebrewToSubject) {
    const slash = ' / ';
    doc.font(fontStyle);
    const widthSlash = doc.widthOfString(slash);
    const hebrew = evt.renderBrief('he');
    doc.font(heFontName).fontSize(11);
    const hebrewWidth = doc.widthOfString(hebrew);
    if ((timedWidth + width + widthSlash + hebrewWidth) > availableWidth) {
      y += (numLines * fontSize * 1.35);
      numLines = 1;
    } else {
      // Position after the main text (accounting for time if present)
      const slashX = textX + width;
      doc.font(fontStyle).fontSize(fontSize);
      doc.text(slash, slashX, y);
      doc.font(heFontName).fontSize(11);
      y += 1.35;
      doc.text(reverseHebrewWords(hebrew), slashX + widthSlash, y);
      return y + (numLines * fontSize * 1.4);
    }
    doc.font(heFontName).fontSize(11);
    doc.text(reverseHebrewWords(hebrew), textX, y);
  }
  return y + (numLines * fontSize * 1.4); // newline within cell
}

/**
 * nonsense required for pdfkit
 * @param {string} subj
 * @return {string}
 */
function reverseHebrewWords(subj) {
  subj = subj.replace('(', '\u0001').replace(')', '\u0002');
  subj = subj.replace('\u0001', ') ').replace('\u0002', '(');
  const words = subj.split(' ').reverse();
  for (let i = 0; i < words.length; i++) {
    if (words[i].endsWith(',')) {
      words[i] = ',' + words[i].substring(0, words[i].length - 1);
    }
  }
  subj = words.join('  ').replace('   ', '  ');
  return subj;
}

/**
 * Creates an empty PDF doc so we can start streaming
 * @param {string} title
 * @param {import('@hebcal/core').CalOptions} options
 * @return {PDFDocument}
 */
export function createPdfDoc(title, options) {
  const doc = new PDFDocument({
    autoFirstPage: false,
    layout: 'landscape',
    margin: 0,
    pdfVersion: '1.5',
    displayTitle: true,
    lang: options?.locale || 'en-US',
  });

  doc.info['Title'] = title;
  doc.info['Subject'] = title;
  let keywords = 'Hebrew calendar, Jewish holidays';
  const locationName = options?.location?.getName();
  if (locationName) {
    keywords += ', ' + locationName;
  }
  doc.info['Keywords'] = keywords;
  doc.info['Author'] = 'Hebcal Jewish Calendar (hebcal.com)';

  doc.registerFont('plain', './fonts/Source_Sans_Pro/SourceSansPro-Regular.ttf');
  doc.registerFont('semi', './fonts/Source_Sans_Pro/SourceSansPro-SemiBold.ttf');
  doc.registerFont('bold', './fonts/Source_Sans_Pro/SourceSansPro-Bold.ttf');
  doc.registerFont('hebrew', './fonts/Adobe_Hebrew/adobehebrew-regular.otf');
  doc.registerFont('hebrew-bold', './fonts/Adobe_Hebrew/adobehebrew-bold.otf');

  return doc;
}

/**
 * Renders alternate date (Hebrew or Gregorian) on the same line as day number
 * @param {PDFDocument} doc
 * @param {Event[]} eventsForDay - Array of events for this day
 * @param {number} xpos - X position of day number (right edge of cell)
 * @param {number} ypos - Y position of day number
 * @param {number} dayNumWidth - Width of the day number string
 * @param {string} locale - Locale code
 * @param {boolean} rtl - Whether we're in RTL mode
 * @param {string} [colorOverride] - Optional color override (e.g., '#999999' for prev month)
 * @return {Event|null} - Returns the alternate date event if found, null otherwise
 */
function renderAlternateDateOnLine(doc, eventsForDay, xpos, ypos, dayNumWidth, locale, rtl, colorOverride) {
  const altIdx = eventsForDay.findIndex((evt) =>
    evt instanceof GregorianDateEvent || evt instanceof HebrewDateEvent);
  if (altIdx === -1) {
    return null;
  }

  const alternateDateEvent = eventsForDay[altIdx];
  const isHebrewDate = alternateDateEvent instanceof HebrewDateEvent;
  // Use renderBrief for Hebrew dates to avoid including the year
  let altDateStr = isHebrewDate ?
    alternateDateEvent.renderBrief(locale) :
    alternateDateEvent.render(locale);

  // Use Hebrew font when rendering in Hebrew locale (rtl mode), plain font otherwise
  // This is based on the output language, not the type of date
  const fontName = rtl ? 'hebrew' : 'plain';
  doc.font(fontName).fontSize(10);

  // Reverse Hebrew text if in RTL mode
  if (rtl) {
    altDateStr = reverseHebrewWords(altDateStr);
  }

  doc.fillColor(colorOverride || '#666666');
  const marginFactor = rtl ? 2 : 3;
  // Position alternate date at left side of cell (left-aligned)
  const altDateX = xpos - PDF_COLWIDTH + PDF_CELL_MARGIN * marginFactor;
  doc.text(altDateStr, altDateX, ypos + 3);

  return alternateDateEvent;
}

/**
 * Checks if an event is an alternate date event (GregorianDateEvent or HebrewDateEvent)
 * @param {Event} evt
 * @return {boolean}
 */
function isAlternateDateEvent(evt) {
  return evt instanceof GregorianDateEvent || evt instanceof HebrewDateEvent;
}

/**
 * Renders a list of Hebcal holidays as PDF
 * @param {PDFDocument} doc
 * @param {Event[]} events
 * @param {Object} options
 * @return {PDFDocument}
 */
export function renderPdf(doc, events, options) {
  const hebrewMonths = options?.hebrewMonths === true;
  const cells = hebrewMonths ? eventsToCellsHeb(events) : eventsToCells(events);
  const locale0 = options?.locale;
  const locale = localeMap[locale0] || 'en';
  const rtl = Boolean(locale === 'he');
  const xposNewRow = rtl ? (PDF_WIDTH - PDF_RMARGIN - 4) : (PDF_LMARGIN + PDF_COLWIDTH - 4);
  const xposMultiplier = rtl ? -1 : 1;
  // Sort keys to ensure correct month order, especially for Hebrew months
  // where the year starts with month 7 (Tishrei), not month 1
  const sortedKeys = Object.keys(cells).sort((a, b) => {
    if (hebrewMonths) {
      // Hebrew format: "HYYYY-MM"
      const [yearA, monthA] = a.substring(1).split('-').map(Number);
      const [yearB, monthB] = b.substring(1).split('-').map(Number);
      if (yearA !== yearB) return yearA - yearB;
      // Hebrew year goes: 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6
      // Convert to sequential order: 7->0, 8->1, ..., 12->5, 1->6, 2->7, ..., 6->11
      const seqA = monthA >= 7 ? monthA - 7 : monthA + 5;
      const seqB = monthB >= 7 ? monthB - 7 : monthB + 5;
      return seqA - seqB;
    } else {
      // Gregorian format: "YYYYMM" - lexicographic sort works fine
      return a.localeCompare(b);
    }
  });

  for (const yearMonth of sortedKeys) {
    let year;
    let month;
    let daysInMonth;
    let firstDayOfMonth;

    if (yearMonth.startsWith('H')) {
      // Hebrew month: format "HYYYY-MM"
      const parts = yearMonth.substring(1).split('-');
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      const hd = new HDate(1, month, year);
      daysInMonth = hd.daysInMonth();
      firstDayOfMonth = hd.greg();
    } else {
      // Gregorian month: format "YYYYMM"
      year = parseInt(yearMonth.substring(0, yearMonth.length - 2), 10);
      month = parseInt(yearMonth.substring(yearMonth.length - 2), 10);
      daysInMonth = greg.daysInMonth(month, year);
      firstDayOfMonth = new Date(year, month - 1, 1);
      if (year < 100) {
        firstDayOfMonth.setFullYear(year);
      }
    }
    const startDayOfWeek = firstDayOfMonth.getDay();

    const rows = (daysInMonth == 31 && startDayOfWeek >= 5) ||
      (daysInMonth == 30 && startDayOfWeek == 6) ? 6 : 5;
    // not intended to be an integer
    const rowheight = (PDF_HEIGHT - PDF_TMARGIN - PDF_BMARGIN) / rows;

    doc.addPage();
    const pageName = hebrewMonths ? `cal-H${year}-${pad2(month)}` : 'cal-' + year + '-' + pad2(month);
    doc.addNamedDestination(pageName);

    const d = dayjs(firstDayOfMonth).locale(locale);
    renderPdfMonthTitle(doc, d, rtl, options, year, month);

    renderPdfMonthGrid(doc, d, rtl, rows, rowheight);

    let dow = startDayOfWeek;
    let xpos = xposNewRow + (dow * PDF_COLWIDTH) * xposMultiplier;
    let ypos = PDF_TMARGIN + 40;

    // Render last day of previous year's Elul's. NOTE that this day will never
    // be Saturday (according to the Hebrew calendar rules), so it will never
    // require another week and mess up the rendering.
    if (hebrewMonths && month === 7) {
      // Check if we have previous month events
      const hasPrevEvents = Object.keys(cells[yearMonth]).some((k) => k.startsWith('prev_'));
      if (hasPrevEvents) {
        // Render Elul days in the leading empty cells
        const elulDays = 29;

        // Start from the leftmost cell and work forward
        let prevXpos = xposNewRow;
        const useGematriya = options?.gematriyaNumerals === true;
        const fontName = useGematriya ? 'hebrew' : 'semi';

        for (let d = 0; d < startDayOfWeek; d++) {
          const elulDay = elulDays - (startDayOfWeek - d - 1); // Calculate which Elul day this is
          const prevKey = 'prev_' + elulDay;

          if (cells[yearMonth][prevKey]) {
            // Render the Elul day number in gray
            doc.font(fontName).fontSize(14);
            doc.fillColor('#999999'); // Gray color for previous month
            const str = useGematriya ? gematriya(elulDay) : String(elulDay);
            const width = doc.widthOfString(str);
            doc.text(str, prevXpos - width, ypos);

            // Render alternate date on the same line if present
            renderAlternateDateOnLine(doc, cells[yearMonth][prevKey], prevXpos, ypos, width, locale0, rtl, '#999999');

            // Render events for this Elul day
            doc.fillColor('#999999');
            let y = ypos + 22;
            for (const evt of cells[yearMonth][prevKey]) {
              if (isAlternateDateEvent(evt)) {
                continue;
              }
              y = renderPdfEvent(doc, evt, prevXpos - PDF_COLWIDTH + PDF_CELL_MARGIN, y, rtl, options);
            }
          }

          prevXpos += PDF_COLWIDTH * xposMultiplier;
        }
      }
    }

    for (let mday = 1; mday <= daysInMonth; mday++) {
      // render day number
      const useGematriya = options?.gematriyaNumerals === true;
      // Always use 'hebrew' font for gematriya to support Hebrew characters
      const fontName = useGematriya ? 'hebrew' : 'semi';
      doc.font(fontName).fontSize(14);
      doc.fillColor('#000000');
      const str = useGematriya ? gematriya(mday) : String(mday);
      const width = doc.widthOfString(str);
      doc.text(str, xpos - width, ypos); // right-align

      // Render alternate date on the same line if present
      if (cells[yearMonth][mday]) {
        renderAlternateDateOnLine(doc, cells[yearMonth][mday], xpos, ypos, width, locale0, rtl);
        doc.fillColor('#000000');
      }

      // events within day mday
      if (cells[yearMonth][mday]) {
        let y = ypos + 22;
        for (const evt of cells[yearMonth][mday]) {
          if (isAlternateDateEvent(evt)) {
            continue;
          }
          y = renderPdfEvent(doc, evt, xpos - PDF_COLWIDTH + PDF_CELL_MARGIN, y, rtl, options);
        }
      }

      if (++dow == 7) {
        dow = 0;
        xpos = xposNewRow;
        ypos += rowheight; // move down the page
      } else {
        xpos += PDF_COLWIDTH * xposMultiplier; // move to the right by one cell
      }
    }

    doc.fillColor('#000000');
    doc.font('plain').fontSize(8);
    const leftText = makeLeftText(options);
    doc.text(leftText, PDF_LMARGIN, PDF_HEIGHT - 28);

    const str = 'Provided by Hebcal.com with a Creative Commons Attribution 4.0 International License';
    const width = doc.widthOfString(str);
    doc.text(str, PDF_WIDTH - PDF_RMARGIN - width, PDF_HEIGHT - 28);
  }

  return doc;
}

/**
 * @param {import('@hebcal/core').CalOptions} options
 * @return {string}
 */
function makeLeftText(options) {
  const locationName = options?.location?.getName();
  if (locationName) {
    const location = options.location;
    const offset = locationDefaultCandleMins(location);
    let str = locationName;
    const elev = location.getElevation();
    if (options?.useElevation && elev > 0) {
      str += ` (elevation: ${elev} m)`;
    }
    return str + ' · ' +
      `Candle-lighting times ${options.candleLightingMins || offset} min before sunset`;
  }
  return options.il ? 'Israel holiday schedule' : 'Diaspora holiday schedule';
}
