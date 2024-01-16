import {greg, flags, HebrewCalendar} from '@hebcal/core';
import PDFDocument from 'pdfkit';
import dayjs from 'dayjs';
import './dayjs-locales.js';
import {localeMap, locationDefaultCandleMins} from './common.js';
import {pad4, pad2, appendIsraelAndTracking, shouldRenderBrief} from '@hebcal/rest-api';

const PDF_WIDTH = 792;
const PDF_HEIGHT = 612;
const PDF_BMARGIN = 72;
const PDF_TMARGIN = 32;
const PDF_LMARGIN = 24;
const PDF_RMARGIN = 24;
const PDF_COLUMNS = 7;
// not intended to be an integer
const PDF_COLWIDTH = (PDF_WIDTH - PDF_LMARGIN - PDF_RMARGIN) / PDF_COLUMNS;

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
function eventsToCells(events) {
  const cells = {};
  for (const e of events) {
    const d = e.getDate().greg();
    const mday = d.getDate();
    const yearMonth = calId(dayjs(d));
    cells[yearMonth] = cells[yearMonth] || {};
    cells[yearMonth][mday] = cells[yearMonth][mday] || [];
    cells[yearMonth][mday].push(e);
  }
  // add blank months in the middle, even if there are no events
  const startDate = dayjs(events[0].getDate().greg());
  const endDate = dayjs(events[events.length - 1].getDate().greg());
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

// eslint-disable-next-line require-jsdoc
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

// eslint-disable-next-line require-jsdoc
function renderPdfMonthTitle(doc, d, rtl) {
  const yy = d.year();
  const titleYear = yy > 0 ? yy : -(yy-1) + ' ' + (rtl ? 'לפנה״ס' : 'B.C.E.');
  const monthTitle0 = d.format('MMMM') + ' ' + titleYear;
  const monthTitle = rtl ? reverseHebrewWords(monthTitle0) : monthTitle0;
  const monthFont = rtl ? 'hebrew' : 'semi';
  doc.fontSize(36)
      .font(monthFont)
      .text(monthTitle, 0, PDF_TMARGIN - 24, {align: 'center'});
}

// eslint-disable-next-line require-jsdoc
function eventColor(evt) {
  const f = evt.getFlags();
  if (f & (flags.DAF_YOMI | flags.OMER_COUNT | flags.HEBREW_DATE |
    flags.MISHNA_YOMI | flags.YERUSHALMI_YOMI | flags.NACH_YOMI)) {
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
 * @param {CalOptions} options
 * @return {number}
 */
function renderPdfEvent(doc, evt, x, y, rtl, options) {
  const color = eventColor(evt);
  doc.fillColor(color);
  let timedWidth = 0;
  const timed = Boolean(evt.eventTime);
  if (timed) {
    const str = HebrewCalendar.reformatTimeStr(evt.eventTimeStr, 'p', options) + ' ';
    doc.font('bold').fontSize(8.5);
    timedWidth = doc.widthOfString(str);
    doc.text(str, x, y + 1);
    x += timedWidth;
  }
  const locale = options?.locale;
  const mask = evt.getFlags();
  let subj = shouldRenderBrief(evt) ? evt.renderBrief(locale) : evt.render(locale);
  const isChag = Boolean(mask & flags.CHAG) && !timed;
  let fontSize = rtl ? 12 : 10;
  const heFontName = isChag ? 'hebrew-bold' : 'hebrew';
  const fontStyle = rtl ? heFontName : isChag ? 'bold' : 'plain';
  if (rtl) {
    subj = reverseHebrewWords(subj);
  }
  doc.font(fontStyle).fontSize(fontSize);
  let width = doc.widthOfString(subj);
  let numLines = 1;
  for (let i = 0; i < 4; i++) {
    if (timedWidth + width > (PDF_COLWIDTH - 8)) {
      fontSize = fontSize - 0.5;
      doc.fontSize(fontSize);
      width = doc.widthOfString(subj);
    } else {
      break;
    }
  }
  // If it's still too wide, break it into two lines
  if (timedWidth + width > (PDF_COLWIDTH - 8)) {
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
  const url = evt.url();
  if (url) {
    const utmSource = options.utmSource || 'pdf';
    const utmMedium = options.utmMedium || 'document';
    const utmCampaign = options.utmCampaign || 'pdf-' + evt.getDate().getFullYear();
    textOptions.link = appendIsraelAndTracking(url, options.il, utmSource, utmMedium, utmCampaign);
  }
  doc.text(subj, x, rtl ? y + 0.65 : y, textOptions);
  if (options.appendHebrewToSubject) {
    const slash = ' / ';
    doc.font(fontStyle);
    const widthSlash = doc.widthOfString(slash);
    const hebrew = evt.renderBrief('he');
    doc.font(heFontName).fontSize(11);
    const hebrewWidth = doc.widthOfString(hebrew);
    if ((timedWidth + width + widthSlash + hebrewWidth) > (PDF_COLWIDTH - 8)) {
      y += (numLines * fontSize * 1.35);
      numLines = 1;
    } else {
      x += width;
      doc.font(fontStyle).fontSize(fontSize);
      doc.text(slash, x, y);
      x += widthSlash;
      y += 1.35;
    }
    doc.font(heFontName).fontSize(11);
    doc.text(reverseHebrewWords(hebrew), x, y);
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
  subj = subj.replace('\u0001', ')').replace('\u0002', '(');
  subj = subj.split(' ').reverse().join('  ');
  return subj;
}

/**
 * Creates an empty PDF doc so we can start streaming
 * @param {string} title
 * @param {CalOptions} options
 * @return {PDFDocument}
 */
export function createPdfDoc(title, options) {
  const doc = new PDFDocument({
    autoFirstPage: false,
    layout: 'landscape',
    margin: 0,
    pdfVersion: '1.5',
    displayTitle: true,
    lang: (options && options.locale) || 'en-US',
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
 * Renders a list of Hebcal holidays as PDF
 * @param {PDFDocument} doc
 * @param {Event[]} events
 * @param {Object} options
 * @return {PDFDocument}
 */
export function renderPdf(doc, events, options) {
  const cells = eventsToCells(events);
  const locale0 = options?.locale;
  const locale = localeMap[locale0] || 'en';
  const rtl = Boolean(locale === 'he');
  const xposNewRow = rtl ? (PDF_WIDTH - PDF_RMARGIN - 4) : (PDF_LMARGIN + PDF_COLWIDTH - 4);
  const xposMultiplier = rtl ? -1 : 1;
  for (const yearMonth of Object.keys(cells)) {
    const year = parseInt(yearMonth.substring(0, yearMonth.length - 2), 10);
    const month = parseInt(yearMonth.substring(yearMonth.length - 2), 10);
    const daysInMonth = greg.daysInMonth(month, year);
    const firstDayOfMonth = new Date(year, month - 1, 1);
    if (year < 100) {
      firstDayOfMonth.setFullYear(year);
    }
    const startDayOfWeek = firstDayOfMonth.getDay();
    const rows = (daysInMonth == 31 && startDayOfWeek >= 5) ||
      (daysInMonth == 30 && startDayOfWeek == 6) ? 6 : 5;
    // not intended to be an integer
    const rowheight = (PDF_HEIGHT - PDF_TMARGIN - PDF_BMARGIN) / rows;

    doc.addPage();
    const pageName = 'cal-' + year + '-' + pad2(month);
    doc.addNamedDestination(pageName);

    const d = dayjs(firstDayOfMonth).locale(locale);
    renderPdfMonthTitle(doc, d, rtl);

    renderPdfMonthGrid(doc, d, rtl, rows, rowheight);

    let dow = startDayOfWeek;
    let xpos = xposNewRow + (dow * PDF_COLWIDTH) * xposMultiplier;
    let ypos = PDF_TMARGIN + 40;
    for (let mday = 1; mday <= daysInMonth; mday++) {
      // render day number
      doc.font('semi').fontSize(14);
      doc.fillColor('#000000');
      const str = String(mday);
      const width = doc.widthOfString(str);
      doc.text(str, xpos - width, ypos); // right-align
      // events within day mday
      if (cells[yearMonth][mday]) {
        let y = ypos + 18;
        for (const evt of cells[yearMonth][mday]) {
          y = renderPdfEvent(doc, evt, xpos - PDF_COLWIDTH + 8, y, rtl, options);
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
 * @param {CalOptions} options
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
