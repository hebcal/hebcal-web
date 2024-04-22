/**
 * hebcal calendar HTML client-side rendering
 * requries jQuery and Day.js
 *
 * Copyright (c) 2023  Michael J. Radwin.
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
import $ from 'jquery';
import Bloodhound from 'corejs-typeahead/dist/bloodhound';
import 'corejs-typeahead/dist/typeahead.jquery';

const hebcalClient = {
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
        function clearGeo() {
      readyToSubmit = false;
      $('#geo').val('none');
      $('#c').val('off');
      $('#geonameid').val('');
      $('#zip').val('');
    }
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
