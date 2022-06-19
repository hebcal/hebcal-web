/**
 * hebcal calendar HTML client-side rendering
 * requries jQuery and Day.js
 *
 * Copyright (c) 2021  Michael J. Radwin.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or
 * without modification, are permitted provided that the following
 * conditions are met:
 *  - Redistributions of source code must retain the above
 *    copyright notice, this list of conditions and the following
 *    disclaimer.
 *  - Redistributions in binary form must reproduce the above
 *    copyright notice, this list of conditions and the following
 *    disclaimer in the documentation and/or other materials
 *    provided with the distribution.
 */
import dayjs from 'dayjs';
import $ from 'jquery';
import Bloodhound from 'corejs-typeahead/dist/bloodhound';
import 'corejs-typeahead/dist/typeahead.jquery';

const hebcalClient = {
  hour12cc: {
    US: 1, CA: 1, BR: 1, AU: 1, NZ: 1, DO: 1, PR: 1, GR: 1, IN: 1, KR: 1, NP: 1, ZA: 1,
  },

  getEventClassName: function(evt) {
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
  },

  splitByMonth: function(events) {
    const out = [];
    let prevMonth = '';
    let monthEvents;
    events.forEach(function(evt) {
      const idxT = evt.date.indexOf('T');
      const isoDate = idxT == -1 ? evt.date : evt.date.substring(0, idxT);
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
  },

  getTimeStr: function(dt) {
    const allDay = dt.indexOf('T') === -1;
    if (allDay) {
      return '';
    }
    const cc = window['hebcal'].cconfig.cc;
    if (typeof this.hour12cc[cc] === 'undefined') {
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
  },

  tableRow: function(evt) {
    const self = this;
    const m = dayjs(evt.date);
    const cat = evt.category;
    const localeData = window['hebcal'].localeConfig;
    const lang = window['hebcal'].lang || 's';
    const isHebrew = lang == 'h' || lang == 'he' || lang == 'he-x-NoNikud';
    const dateStr0 = localeData.weekdaysShort[m.day()] + m.format(' DD ') + localeData.monthsShort[m.month()];
    const dateStr = isHebrew ? `<span lang="he" dir="rtl">${dateStr0}</span>` : dateStr0;
    let subj = evt.title;
    const timeStr = this.getTimeStr(evt.date);
    const className = self.getEventClassName(evt);
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
      const atitle = evt.memo ? ` title="${evt.memo}"` : '';
      subj = `<a${atitle} href="${evt.link}">${subj}</a>`;
    }
    return `<tr><td>${dateStr}</td>${timeTd}<td><span class="table-event ${className}">${subj}</span></td></tr>`;
  },

  monthHtml: function(month) {
    const lang = window['hebcal'].lang || 's';
    const isHebrew = lang == 'h' || lang == 'he' || lang == 'he-x-NoNikud';
    const dir = isHebrew ? 'rtl' : 'ltr';
    const divBegin = `<div class="month-table" dir="${dir}">`;
    const divEnd = '</div><!-- .month-table -->';
    const heading = this.getMonthTitle(month, false, false);
    const timeColumn = window['hebcal'].cconfig['geo'] === 'none' ? '' : '<col style="width:27px">';
    // eslint-disable-next-line max-len
    const tableHead = `<table class="table table-striped" dir="${dir}"><col style="width:116px">${timeColumn}<col><tbody>`;
    const tableFoot = '</tbody></table>';
    const tableContents = month.events.map(this.tableRow.bind(this));
    return divBegin + heading + tableHead + tableContents.join('') + tableFoot + divEnd;
  },

  renderMonthTables: function() {
    if (window['hebcal'].monthTablesRendered ) {
      return;
    }
    const self = this;
    const months = self.splitByMonth(window['hebcal'].events);
    months.forEach(function(month) {
      const html = self.monthHtml(month);
      const selector = `div#cal-${month.month} div.agenda`;
      const el = document.querySelector(selector);
      if (el) {
        el.innerHTML = html;
      }
    });
    window['hebcal'].monthTablesRendered = true;
  },

  subjectSpan: function(str) {
    const lang = window['hebcal'].lang || 's';
    const isHebrew = lang == 'h' || lang == 'he' || lang == 'he-x-NoNikud';
    str = str.replace(/(\(\d+.+\))$/, '<small>$&</small>');
    if (isHebrew) {
      return '<span lang="he" dir="rtl">' + str + '</span>';
    }
    return str;
  },

  renderEventHtml: function(evt) {
    let subj = evt.title;
    const cat = evt.category;
    if (cat === 'dafyomi') {
      subj = subj.substring(subj.indexOf(':') + 1);
    } else if (cat === 'candles' || cat === 'havdalah') {
      // "Candle lighting: foo" or "Havdalah (42 min): foo"
      subj = subj.substring(0, subj.indexOf(':'));
    }
    const time = this.getTimeStr(evt.date);
    if (time) {
      const timeHtml = evt.bn === 'Chanukah' ?
        '<small>' + time + '</small>' :
        '<small class="text-muted">' + time + '</small>';
      subj = timeHtml + ' ' + this.subjectSpan(subj);
    } else {
      subj = this.subjectSpan(subj);
    }
    const className = this.getEventClassName(evt);
    const lang = window['hebcal'].lang || 's';
    if ((lang === 'sh' || lang === 'ah') && evt.hebrew) {
      subj += `<br><span lang="he" dir="rtl">${evt.hebrew}</span>`;
    }
    const memo0 = evt.memo;
    const memo = memo0 ? ` title="${memo0}"` : '';
    const url = evt.link;
    const ahref = url ? `<a href="${url}"${memo}>` : '';
    const aclose = url ? '</a>' : '';
    return `<div class="fc-event ${className}">${ahref}${subj}${aclose}</div>\n`;
  },

  getMonthTitle: function(month, center, prevNext) {
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
  },

  makeMonthHtml: function(month) {
    const lang = window['hebcal'].lang || 's';
    const isHebrew = lang == 'h' || lang == 'he' || lang == 'he-x-NoNikud';
    const span0 = isHebrew ? '<span lang="he" dir="rtl">' : '';
    const span1 = isHebrew ? '</span>' : '';
    const localeData = window['hebcal'].localeConfig;
    let html = this.getMonthTitle(month, true, true);
    const dir = isHebrew ? ' dir="rtl" ' : ' ';
    html += '<table' + dir + 'class="table table-bordered fc-emulated-table">\n';
    html += '<tbody>\n';
    html += '<tr>';
    localeData.weekdaysShort.forEach(function(s) {
      html += '<th>' + span0 + s + span1 + '</th>';
    });
    html += '</tr>\n';
    const tbody = this.makeMonthTableBody(month.events);
    html += tbody;
    html += '</tbody></table>\n';
    return html;
  },

  makeMonthTableBody: function(events) {
    const self = this;
    const dayMap = [];
    events.forEach(function(evt) {
      const d = dayjs(evt.date);
      const date = d.date();
      dayMap[date] = dayMap[date] || [];
      dayMap[date].push(evt);
    });
    let html = '<tr>';
    const day1 = dayjs(events[0].date).date(1);
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
        html += self.renderEventHtml(evt);
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
  },

  createCityTypeahead: function(autoSubmit) {
    const doFlags = navigator.userAgent.indexOf('Win') === -1;
    const hebcalCities = new Bloodhound({
      datumTokenizer: Bloodhound.tokenizers.obj.whitespace('value'),
      queryTokenizer: Bloodhound.tokenizers.whitespace,
      identify: function(obj) {
        return obj.id;
      },
      remote: {
        url: '/complete.php?q=%QUERY',
        wildcard: '%QUERY',
      },
    });

    hebcalCities.initialize();

    let readyToSubmit = false;
    // eslint-disable-next-line require-jsdoc
    function clearGeo() {
      readyToSubmit = false;
      $('#geo').val('none');
      $('#c').val('off');
      $('#geonameid').val('');
      $('#zip').val('');
    }
    // eslint-disable-next-line require-jsdoc
    function selectSuggestion(suggestion) {
      const geo = suggestion.geo;
      const id = suggestion.id;
      if (geo === 'zip') {
        $('#zip').val(id);
        $('#geonameid').val('');
      } else {
        $('#geonameid').val(id);
        $('#zip').val('');
      }
      $('#geo').val(geo);
      $('#c').val('on');
      readyToSubmit = true;
    }

    $('#city-typeahead').typeahead({autoselect: true}, {
      name: 'hebcal-city',
      display: function(ctx) {
        if (ctx.geo === 'zip') {
          return `${ctx.asciiname}, ${ctx.admin1} ${ctx.id}`;
        }
        const country = ctx.country;
        const ctry = country == 'United Kingdom' ? 'UK' : country == 'United States' ? 'USA' : country;
        let ctryStr = ctry || '';
        const cc = ctx.cc;
        const admin1 = cc === 'IL' ? '' : ctx.admin1 || '';
        if (admin1.length > 0 && admin1.indexOf(ctx.asciiname) != 0) {
          ctryStr = admin1 + ', ' + ctryStr;
        }
        const name = ctx.name || ctx.asciiname;
        const s = name + ', ' + ctryStr;
        return s;
      },
      source: hebcalCities.ttAdapter(),
      limit: 10,
      templates: {
        empty: function({query}) {
          const encodedStr = query.replace(/[\u00A0-\u9999<>\&]/gim, function(i) {
            return `&#${i.charCodeAt(0)};`;
          });
          return `<div class="tt-suggestion">Sorry, no city names match <b>${encodedStr}</b>.</div>`;
        },
        suggestion: function(ctx) {
          if (ctx.geo === 'zip') {
            const flag = doFlags && ctx.flag ? ' ' + ctx.flag : '';
            return `<p>${ctx.asciiname}, ${ctx.admin1} <strong>${ctx.id}</strong> - USA${flag}</p>`;
          } else {
            const country = ctx.country;
            const ctry = country == 'United Kingdom' ? 'UK' : country == 'United States' ? 'USA' : country;
            let ctryStr = ctry || '';
            const name = ctx.name || ctx.asciiname;
            const s = `<p><strong>${name}</strong>`;
            const admin1 = ctx.cc === 'IL' ? '' : ctx.admin1 || '';
            if (ctry && typeof admin1 === 'string' && admin1.length > 0 &&
                admin1.indexOf(ctx.asciiname) != 0) {
              ctryStr = `${admin1}, ${ctryStr}`;
            }
            if (ctryStr) {
              ctryStr = ` - <small>${ctryStr}</small>`;
            }
            const flag = doFlags && ctx.flag ? ' ' + ctx.flag : '';
            return `${s}${ctryStr}${flag}</p>`;
          }
        },
      },
    }).bind('typeahead:render', function(ev, suggestions, isAsync, name) {
      if (suggestions.length == 1) {
        selectSuggestion(suggestions[0]);
      }
    }).bind('typeahead:select', function(ev, suggestion, name) {
      selectSuggestion(suggestion);
      if (autoSubmit) {
        $('#shabbat-form').submit();
      }
    }).bind('keyup keypress', function(e) {
      if (!autoSubmit && !$(this).val()) {
        clearGeo();
      }

      // if we get a 5-digit zip, don't require user to select typeahead result
      const val0 = $('#city-typeahead').typeahead('val');

      const val = (typeof val0 === 'string') ? val0.trim() : '';
      const firstCharCode = val.charCodeAt(0);
      const numericRe = /^\d\d\d\d\d/;
      if (firstCharCode >= 48 && firstCharCode <= 57 && numericRe.test(val)) {
        const zip5 = val.substring(0, 5);
        selectSuggestion({geo: 'zip', id: zip5});
      }
      const code = e.keyCode || e.which;
      if (code == 13) {
        if (readyToSubmit) {
          return true; // allow form to submit
        }
        e.preventDefault();
        return false;
      }
    }).bind('focus', function(e) {
      $(this).typeahead('val', '');
      clearGeo();
    });
  },
};

export default hebcalClient;
