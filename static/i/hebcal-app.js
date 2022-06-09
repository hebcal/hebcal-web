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
export const hebcalClient = {
  hour12cc: {
    US: 1, CA: 1, BR: 1, AU: 1, NZ: 1, DO: 1, PR: 1, GR: 1, IN: 1, KR: 1, NP: 1, ZA: 1,
  },

  getEventClassName: function({category, yomtov, link}) {
    let className = category;
    if (yomtov) {
      className += ' yomtov';
    }
    if (typeof link === 'string' &&
      link.substring(0, 4) === 'http' &&
      link.substring(0, 22) !== 'https://www.hebcal.com') {
      className += ' outbound';
    }
    return className;
  },

  transformHebcalEvents: function(events, lang) {
    const self = this;
    let evts = events.map((src) => {
      const allDay = !src.date.includes('T');
      const title = allDay ? src.title : src.title.substring(0, src.title.indexOf(':'));

      const dest = {
        title,
        start: dayjs(src.date),
        className: self.getEventClassName(src),
        allDay,
      };

      if (src.memo) {
        dest.description = src.memo;
      }
      if (src.link) {
        dest.url = src.link;
      }
      if (src.hebrew) {
        dest.hebrew = src.hebrew;
        if (lang === 'h') {
          dest.title = src.hebrew;
          dest.className += ' hebrew';
        }
      }
      return dest;
    });
    if (lang === 'ah' || lang === 'sh') {
      const dest = [];
      evts.forEach((evt) => {
        dest.push(evt);
        if (evt.hebrew) {
          const tmp = $.extend({}, evt, {
            title: evt.hebrew,
            className: `${evt.className} hebrew`,
          });
          dest.push(tmp);
        }
      });
      evts = dest;
    }
    return evts;
  },

  splitByMonth: function(events) {
    const out = [];
    let prevMonth = '';
    let monthEvents;
    events.forEach((evt) => {
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
    return out;
  },

  tableRow: function(evt) {
    const self = this;
    const m = dayjs(evt.date);
    const dt = evt.date;
    const cat = evt.category;
    const localeData = window['hebcal'].localeConfig;
    const lang = window['hebcal'].lang || 's';
    const isHebrew = lang == 'h' || lang == 'he' || lang == 'he-x-NoNikud';
    const dateStr0 = localeData.weekdaysShort[m.day()] + m.format(' DD ') + localeData.monthsShort[m.month()];
    const dateStr = isHebrew ? `<span lang="he" dir="rtl">${dateStr0}</span>` : dateStr0;
    const allDay = !dt.includes('T');
    let subj = evt.title;
    let timeStr = '';
    const className = self.getEventClassName(evt);
    if (cat === 'dafyomi') {
      subj = subj.substring(subj.indexOf(':') + 1);
    } else if (cat === 'candles' || cat === 'havdalah') {
      // "Candle lighting: foo" or "Havdalah (42 min): foo"
      subj = subj.substring(0, subj.indexOf(':'));
    }
    if (!allDay) {
      const cc = window['hebcal'].cconfig.cc;
      if (typeof self.hour12cc[cc] === 'undefined') {
        timeStr = dt.substring(11, 16);
      } else {
        let hour = +dt.substring(11, 13);
        const suffix = hour >= 12 ? 'pm' : 'am';
        if (hour > 12) {
          hour = hour - 12;
        }
        const min = dt.substring(14, 16);
        timeStr = `${String(hour)}:${String(min)}${suffix}`;
      }
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
    const yearStr = month.month.substring(0, month.month.length - 3);
    const monthStr = month.month.substring(month.month.length - 2);
    const yy = parseInt(yearStr, 10);
    const mm = parseInt(monthStr, 10);
    const dt = new Date(yy, mm - 1, 1);
    if (yy < 100) {
      dt.setFullYear(yy);
    }
    const lang = window['hebcal'].lang || 's';
    const isHebrew = lang == 'h' || lang == 'he' || lang == 'he-x-NoNikud';
    const dir = isHebrew ? 'rtl' : 'ltr';
    const divBegin = `<div class="month-table" dir="${dir}">`;
    const divEnd = '</div><!-- .month-table -->';
    const localeData = window['hebcal'].localeConfig;
    const titleText = `${localeData.months[mm - 1]} ${yearStr}`;
    const titleSpan = isHebrew ? `<span lang="he" dir="rtl">${titleText}</span>` : titleText;
    const heading = `<h3>${titleSpan}</h3>`;
    const timeColumn = window['hebcal'].cconfig['geo'] === 'none' ? '' : '<col style="width:27px">';
    // eslint-disable-next-line max-len
    const tableHead = `<table class="table table-striped" dir="${dir}"><col style="width:116px">${timeColumn}<col><tbody>`;
    const tableFoot = '</tbody></table>';
    const tableContents = month.events.map(this.tableRow.bind(this));
    return divBegin + heading + tableHead + tableContents.join('') + tableFoot + divEnd;
  },

  renderMonthTables: function() {
    const self = this;
    if (typeof window['hebcal'].monthTablesRendered === 'undefined') {
      const months = self.splitByMonth(window['hebcal'].events);
      months.forEach((month) => {
        const html = self.monthHtml(month);
        const selector = `#cal-${month.month} .agenda`;
        document.querySelectorAll(selector).forEach((el) => {
          el.innerHTML = html;
        });
      });
      window['hebcal'].monthTablesRendered = true;
    }
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

    const clearGeo = () => {
      $('#geo').val('none');
      $('#c').val('off');
      $('#geonameid').val('');
      $('#zip').val('');
      $('#city').val('');
    };

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
          const encodedStr = query.replace(/[\u00A0-\u9999<>\&]/gim, (i) => {
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
        const suggestion = suggestions[0];
        if (typeof suggestion.geo == 'string' && suggestion.geo == 'zip') {
          $('#geo').val('zip');
          $('#zip').val(suggestion.id);
        } else {
          $('#geo').val('geoname');
          $('#geonameid').val(suggestion.id);
        }
        $('#c').val('on');
      }
    }).bind('typeahead:select', function(ev, suggestion, name) {
      if (typeof suggestion.geo === 'string' && suggestion.geo == 'zip') {
        clearGeo();
        $('#geo').val('zip');
        $('#zip').val(suggestion.id);
        $('#c').val('on');
      } else {
        clearGeo();
        $('#geo').val('geoname');
        $('#geonameid').val(suggestion.id);
        $('#c').val('on');
      }
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
        $('#geo').val('zip');
        $('#zip').val(zip5);
        $('#c').val('on');
        $('#geonameid').val('');
        $('#city').val('');
      }
      const code = e.keyCode || e.which;
      if (code == 13) {
        if (val.length == 5 && numericRe.test(val)) {
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
