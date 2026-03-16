import Autocomplete from 'bootstrap5-autocomplete';

const hebcalClient = {
  createCityTypeahead: function(autoSubmit, fixedPosition) {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const doFlags = navigator.userAgent.indexOf('Win') === -1;
    const cityTypeaheadEl = document.getElementById('city-typeahead');
    const autocomplete = new Autocomplete(cityTypeaheadEl, {
      noCache: false,
      liveServer: true,
      server: '/complete.php',
      fetchOptions: {
        method: 'GET',
        credentials: 'omit',
        mode: 'cors',
      },
      queryParam: 'q',
      labelField: 'value',
      valueField: 'value',
      maximumItems: 10,
      showAllSuggestions: true,
      preventBrowserAutocomplete: true,
      fixed: Boolean(fixedPosition),
      onBeforeFetch: (inst) => {
        inst._config.notFoundMessage = undefined;
        const query = cityTypeaheadEl.value;
        if (query.length) {
          const encodedStr = query.replace(/[\u00A0-\u9999<>&]/gim, function(i) {
            return `&#${i.charCodeAt(0)};`;
          });
          inst._config.notFoundMessage = `Sorry, no city names match <b>${encodedStr}</b>.`;
        }
      },
      onServerResponse: (response, inst) => {
        if (response.ok) {
          return response.json();
        } else if (response.status === 404) {
          // return an empty array if there are no results found
          return Promise.resolve([]);
        }
        // let any other error cascade through
        return response.json();
      },
      onSelectItem: (item, inst) => {
        selectSuggestion(item);
        if (autoSubmit) {
          const el = document.getElementById('shabbat-form');
          if (el) {
            el.submit();
          }
        }
      },
      onRenderItem: (item, label, inst) => {
        if (Object.keys(inst._items).length === 1) {
          selectSuggestion(item);
        }
        if (item.geo === 'zip') {
          const flag = doFlags && item.flag ? ' ' + item.flag : '';
          return `${item.asciiname}, ${item.admin1} <strong>${item.id}</strong> - USA${flag}`;
        } else {
          const country = item.country;
          const ctry = country == 'United Kingdom' ? 'UK' : country == 'United States' ? 'USA' : country;
          let ctryStr = ctry || '';
          const name = item.name || item.asciiname;
          const s = `<strong>${name}</strong>`;
          const admin1 = item.cc === 'IL' ? '' : item.admin1 || '';
          if (ctry && typeof admin1 === 'string' && admin1.length > 0 &&
              !admin1.includes(item.asciiname)) {
            ctryStr = `${admin1}, ${ctryStr}`;
          }
          if (ctryStr) {
            ctryStr = ` - <small>${ctryStr}</small>`;
          }
          const flag = doFlags && item.flag ? ' ' + item.flag : '';
          return `${s}${ctryStr}${flag}`;
        }
      },
    });

    function setElem(id, val) {
      const el = document.getElementById(id);
      if (el) {
        el.value = val;
      }
    }

    let readyToSubmit = false;
    function clearGeo() {
      readyToSubmit = false;
      setElem('geo', 'none');
      setElem('c', 'off');
      setElem('geonameid', '');
      setElem('zip', '');
    }

    function selectSuggestion(item) {
      const geo = item.geo;
      const id = item.id;
      if (geo === 'zip') {
        setElem('zip', id);
        setElem('geonameid', '');
      } else {
        setElem('geonameid', id);
        setElem('zip', '');
      }
      setElem('geo', geo);
      setElem('c', 'on');
      readyToSubmit = true;
    }

    let backspaceClearsEverything = false;
    cityTypeaheadEl.addEventListener('keydown', function(event) {
      if (!autoSubmit && !cityTypeaheadEl.value.length) {
        clearGeo();
      }

      // if we get a 5-digit zip, don't require user to select typeahead result
      const val0 = cityTypeaheadEl.value;

      const val = (typeof val0 === 'string') ? val0.trim() : '';
      const firstCharCode = val.charCodeAt(0);
      const numericRe = /^\d\d\d\d\d/;
      if (firstCharCode >= 48 && firstCharCode <= 57 && numericRe.test(val)) {
        const zip5 = val.substring(0, 5);
        selectSuggestion({geo: 'zip', id: zip5});
      }
      if (event.key === 'Enter') {
        const selection = autocomplete.getSelection();
        if (!selection) {
          autocomplete._moveSelection('next');
        }
        if (readyToSubmit) {
          return true; // allow form to submit
        }
        event.preventDefault();
        return false;
      } else if (event.key === 'Backspace') {
        if (backspaceClearsEverything) {
          clearGeo();
          autocomplete.hideSuggestions();
          autocomplete.clear();
        }
      }
      backspaceClearsEverything = false;
      return true;
    });

    cityTypeaheadEl.addEventListener('focus', function() {
      backspaceClearsEverything = true;
    });

    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clearGeo();
        cityTypeaheadEl.value = '';
        cityTypeaheadEl.focus();
        // Trigger input event to update any listeners
        cityTypeaheadEl.dispatchEvent(new Event('input'));
      });
      // Show/hide button based on input value
      cityTypeaheadEl.addEventListener('input', () => {
        clearBtn.style.display = cityTypeaheadEl.value ? 'block' : 'none';
      });
    }
  },
};

export default hebcalClient;
