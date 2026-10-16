import Autocomplete from 'bootstrap5-autocomplete';

// Single-character queries are the slowest for the /complete backend and
// rarely useful, so don't search until the user has typed this many.
const MIN_QUERY_LENGTH = 2;
const LOADING_CLASS = 'typeahead-loading';

const hebcalClient = {
  createCityTypeahead: function(autoSubmit, fixedPosition) {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const doFlags = !navigator.userAgent.includes('Win');
    const cityTypeaheadEl = document.getElementById('city-typeahead');
    // The library toggles its own is-loading class, but a superseded slow
    // request's cleanup removes it while the newer request is still pending.
    // Track in-flight requests ourselves; script-typeahead.ejs styles this.
    let pendingFetches = 0;
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
      suggestionsThreshold: MIN_QUERY_LENGTH,
      preventBrowserAutocomplete: true,
      fixed: Boolean(fixedPosition),
      onBeforeFetch: (inst) => {
        pendingFetches++;
        inst._config.notFoundMessage = undefined;
        const query = cityTypeaheadEl.value;
        if (query.length < MIN_QUERY_LENGTH) {
          // The debounced search reads the input when it fires, so one
          // scheduled while the input was longer (e.g. focusing a prefilled
          // field, then typing over it) would send a too-short query.
          // Aborting before fetch() sends no request; onServerError ignores it.
          inst._abortController.abort();
          return;
        }
        cityTypeaheadEl.classList.add(LOADING_CLASS);
        if (query.length) {
          const encodedStr = query.replaceAll(/[\u00A0-\u9999<>&]/gim, function(i) {
            return `&#${i.charCodeAt(0)};`;
          });
          inst._config.notFoundMessage = `Sorry, no city names match <b>${encodedStr}</b>.`;
        }
      },
      onAfterFetch: (inst) => {
        // Runs in a finally, so exactly once per onBeforeFetch, including
        // for requests aborted because a newer one superseded them
        pendingFetches--;
        if (pendingFetches === 0) {
          cityTypeaheadEl.classList.remove(LOADING_CLASS);
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
          const ctry = country === 'United Kingdom' ? 'UK' : country === 'United States' ? 'USA' : country;
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

    const hintEl = document.createElement('div');
    hintEl.id = 'city-typeahead-hint';
    hintEl.className = 'small text-body-secondary mt-1';
    hintEl.setAttribute('aria-live', 'polite');
    hintEl.textContent = `Type at least ${MIN_QUERY_LENGTH} characters`;
    hintEl.hidden = true;
    // Place the hint below the input-clear-wrapper (or plain div) holding the input
    cityTypeaheadEl.parentElement.after(hintEl);
    cityTypeaheadEl.setAttribute('aria-describedby', hintEl.id);
    function updateHint() {
      const len = cityTypeaheadEl.value.length;
      hintEl.hidden = len === 0 || len >= MIN_QUERY_LENGTH;
    }
    cityTypeaheadEl.addEventListener('input', updateHint);
    cityTypeaheadEl.addEventListener('blur', () => {
      hintEl.hidden = true;
    });

    // ArrowDown deliberately bypasses suggestionsThreshold in the library
    // ("show menu regardless of input length"), which would send a
    // too-short query. Capture-phase listeners on the target run before the
    // library's own keydown handler, so swallow the key here instead.
    cityTypeaheadEl.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' &&
          cityTypeaheadEl.value.length < MIN_QUERY_LENGTH &&
          !autocomplete.isDropdownVisible()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        updateHint();
      }
    }, true);

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
