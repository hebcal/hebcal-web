import autocomplete, {PreventSubmit} from 'autocompleter';

// Single-character queries are the slowest for the /complete backend and
// rarely useful, so don't search until the user has typed this many.
const MIN_QUERY_LENGTH = 2;
const MAX_ITEMS = 10;
const LOADING_CLASS = 'typeahead-loading';

function el(tag, text) {
  const elem = document.createElement(tag);
  elem.textContent = text;
  return elem;
}

// Nearest scrollable ancestor, e.g. the body of the settings offcanvas
function scrollParent(elem) {
  for (let p = elem.parentElement; p && p !== document.body; p = p.parentElement) {
    const overflowY = getComputedStyle(p).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) {
      return p;
    }
  }
  return document.scrollingElement;
}

const hebcalClient = {
  createCityTypeahead: function(autoSubmit) {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const doFlags = !navigator.userAgent.includes('Win');
    const cityTypeaheadEl = document.getElementById('city-typeahead');

    function renderItem(item) {
      const div = document.createElement('div');
      const flag = doFlags && item.flag ? ' ' + item.flag : '';
      if (item.geo === 'zip') {
        div.append(`${item.asciiname}, ${item.admin1} `, el('strong', item.id), ` - USA${flag}`);
        return div;
      }
      const country = item.country;
      const ctry = country === 'United Kingdom' ? 'UK' : country === 'United States' ? 'USA' : country;
      let ctryStr = ctry || '';
      const admin1 = item.cc === 'IL' ? '' : item.admin1 || '';
      if (ctry && typeof admin1 === 'string' && admin1.length > 0 &&
          !admin1.includes(item.asciiname)) {
        ctryStr = `${admin1}, ${ctryStr}`;
      }
      div.append(el('strong', item.name || item.asciiname));
      if (ctryStr) {
        div.append(' - ', el('small', ctryStr));
      }
      div.append(flag);
      return div;
    }

    // Only the newest request may update the list or clear the spinner;
    // starting a new one aborts the previous.
    let controller = null;
    function abortFetch() {
      if (controller) {
        controller.abort();
        controller = null;
        cityTypeaheadEl.classList.remove(LOADING_CLASS);
      }
    }

    function fetchSuggestions(text, update) {
      abortFetch();
      if (text.length < MIN_QUERY_LENGTH) {
        // Shown as the list's empty message, so it overlays the page like
        // the suggestions do instead of pushing content down
        settings.emptyMsg = `Type at least ${MIN_QUERY_LENGTH} letters`;
        update([]);
        return;
      }
      const ctl = controller = new AbortController();
      cityTypeaheadEl.classList.add(LOADING_CLASS);
      const url = '/complete?q=' + encodeURIComponent(text);
      fetch(url, {credentials: 'omit', mode: 'cors', signal: ctl.signal})
          .then((response) => {
            if (response.ok) {
              return response.json();
            } else if (response.status === 404) {
              return []; // no results found
            }
            throw new Error(`${url} returned ${response.status}`);
          })
          .then((items) => {
            items = items.slice(0, MAX_ITEMS);
            settings.emptyMsg = `Sorry, no city names match “${text}”.`;
            if (items.length === 1) {
              selectSuggestion(items[0]);
            }
            update(items);
          })
          .catch((err) => {
            if (err.name !== 'AbortError') {
              console.error(err);
              update(false);
            }
          })
          .finally(() => {
            if (controller === ctl) {
              controller = null;
              cityTypeaheadEl.classList.remove(LOADING_CLASS);
            }
          });
    }

    const settings = {
      input: cityTypeaheadEl,
      className: 'city-ac',
      // The library closes the list below minLength; we want it open at one
      // character to show the hint, and fetchSuggestions() skips the request
      minLength: 1,
      debounceWaitMs: 300,
      // Like the Enter key, picking a suggestion fills in the city; it only
      // submits the form when autoSubmit is set (see onSelect)
      preventSubmit: PreventSubmit.OnSelect,
      fetch: fetchSuggestions,
      render: renderItem,
      onSelect: (item) => {
        cityTypeaheadEl.value = item.value;
        updateUi();
        selectSuggestion(item);
        if (autoSubmit) {
          const form = document.getElementById('shabbat-form');
          if (form) {
            form.submit();
          }
        }
      },
      // The list always opens below the input, never above it. When there
      // isn't room below, scroll the input up to make some. The resulting
      // scroll event makes the library reposition and call this again.
      customize: (input, inputRect, container, maxHeight) => {
        const wanted = Math.min(container.scrollHeight, 320);
        const room = maxHeight - 8;
        if (room < wanted) {
          scrollParent(input).scrollBy({top: wanted - room, behavior: 'instant'});
        }
        container.style.maxHeight = Math.max(room, wanted) + 'px';
      },
    };
    autocomplete(settings);

    const clearBtn = document.getElementById('clear-btn');
    function updateUi() {
      const len = cityTypeaheadEl.value.length;
      if (len < MIN_QUERY_LENGTH) {
        abortFetch(); // too short to search; don't finish an earlier request
      }
      if (clearBtn) {
        clearBtn.style.display = len ? 'block' : 'none';
      }
    }
    cityTypeaheadEl.addEventListener('input', updateUi);

    function setElem(id, val) {
      const elem = document.getElementById(id);
      if (elem) {
        elem.value = val;
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

    function clearInput() {
      clearGeo();
      cityTypeaheadEl.value = '';
      // Let the library close the list and updateUi() hide the clear button
      cityTypeaheadEl.dispatchEvent(new Event('input'));
    }

    // Registered after autocomplete(), so on Enter the library has already
    // picked the highlighted suggestion (calling onSelect) by the time this runs
    let backspaceClearsEverything = false;
    cityTypeaheadEl.addEventListener('keydown', function(event) {
      if (!autoSubmit && !cityTypeaheadEl.value.length) {
        clearGeo();
      }

      // if we get a 5-digit zip, don't require user to select typeahead result
      const val = cityTypeaheadEl.value.trim();
      if (/^\d{5}/.test(val)) {
        selectSuggestion({geo: 'zip', id: val.substring(0, 5)});
      }
      if (event.key === 'Enter') {
        if (!readyToSubmit) {
          event.preventDefault();
        }
      } else if (event.key === 'Backspace' && backspaceClearsEverything) {
        event.preventDefault();
        clearInput();
      }
      backspaceClearsEverything = false;
    });

    cityTypeaheadEl.addEventListener('focus', function() {
      backspaceClearsEverything = true;
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clearInput();
        cityTypeaheadEl.focus();
      });
    }
  },
};

export default hebcalClient;
