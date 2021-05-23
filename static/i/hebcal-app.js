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
      const m = dayjs(evt.date);
      const month = m.format('YYYY-MM');
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
    const dateStr = localeData.weekdaysShort[m.day()] + m.format(' DD ') + localeData.monthsShort[m.month()];
    const allDay = !dt.includes('T');
    const lang = window['hebcal'].lang || 's';
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
    if (evt.hebrew) {
      const hebrewHtml = `<span lang="he" dir="rtl">${evt.hebrew}</span>`;
      if (lang == 'h') {
        subj = hebrewHtml;
      } else if (lang.includes('h')) {
        subj += ` / ${hebrewHtml}`;
      }
    }
    if (evt.link) {
      const atitle = evt.memo ? ` title="${evt.memo}"` : '';
      subj = `<a${atitle} href="${evt.link}">${subj}</a>`;
    }
    return `<tr><td>${dateStr}</td>${timeTd}<td><span class="table-event ${className}">${subj}</span></td></tr>`;
  },

  monthHtml: function(month) {
    const date = `${month.month}-01`;
    const m = dayjs(date);
    const lang = window['hebcal'].lang || 's';
    const dir = lang === 'h' ? 'rtl' : 'ltr';
    const divBegin = `<div class="month-table" dir="${dir}">`;
    const divEnd = '</div><!-- .month-table -->';
    const localeData = window['hebcal'].localeConfig;
    const heading = `<h3>${localeData.months[m.month()]} ${m.format('YYYY')}</h3>`;
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
    const hebcalCities = new Bloodhound({
      datumTokenizer: Bloodhound.tokenizers.obj.whitespace('value'),
      queryTokenizer: Bloodhound.tokenizers.whitespace,
      remote: '/complete.php?q=%QUERY',
      limit: 8,
    });

    hebcalCities.initialize();

    const clearGeo = () => {
      $('#geo').val('none');
      $('#c').val('off');
      $('#geonameid').val('');
      $('#zip').val('');
      $('#city').val('');
    };

    $('#city-typeahead').typeahead(null, {
      name: 'hebcal-city',
      displayKey: 'value',
      source: hebcalCities.ttAdapter(),
      templates: {
        empty: function({query}) {
          const encodedStr = query.replace(/[\u00A0-\u9999<>\&]/gim, (i) => {
            return `&#${i.charCodeAt(0)};`;
          });
          return `<div class="tt-suggestion">Sorry, no city names match <b>${encodedStr}</b>.</div>`;
        },
        suggestion: function(ctx) {
          if (typeof ctx.geo === 'string' && ctx.geo == 'zip') {
            return `<p>${ctx.asciiname}, ${ctx.admin1} <strong>${ctx.id}</strong> - United States</p>`;
          } else {
            const ctry = ctx.country && ctx.country == 'United Kingdom' ? 'UK' : ctx.country;
            let ctryStr = ctry || '';
            const s = `<p><strong>${ctx.asciiname}</strong>`;
            if (ctry && typeof ctx.admin1 === 'string' && ctx.admin1.length > 0 &&
                ctx.admin1.indexOf(ctx.asciiname) != 0) {
              ctryStr = `${ctx.admin1}, ${ctryStr}`;
            }
            if (ctryStr) {
              ctryStr = ` - <small>${ctryStr}</small>`;
            }
            return `${s + ctryStr}</p>`;
          }
        },
      },
    }).on('typeahead:selected', (obj, {geo, id}, name) => {
      if (typeof geo === 'string' && geo == 'zip') {
        $('#geo').val('zip');
        $('#zip').val(id);
        if (autoSubmit) {
          $('#geonameid').remove();
        } else {
          $('#c').val('on');
          $('#geonameid').val('');
          $('#city').val('');
        }
      } else {
        $('#geo').val('geoname');
        $('#geonameid').val(id);
        if (autoSubmit) {
          $('#zip').remove();
        } else {
          $('#c').val('on');
          $('#zip').val('');
          $('#city').val('');
        }
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
      const numericRe = /^\d+$/;
      if (val.length == 5 && numericRe.test(val)) {
        $('#geo').val('zip');
        $('#zip').val(val);
        if (autoSubmit) {
          $('#geonameid').remove();
        } else {
          $('#c').val('on');
          $('#geonameid').val('');
          $('#city').val('');
        }
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
