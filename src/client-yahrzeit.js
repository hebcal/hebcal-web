/* eslint-disable indent */
import Papa from 'papaparse';

// eslint-disable-next-line spaced-comment
/*! hebcal client-yahrzeit.js */
document.addEventListener('DOMContentLoaded', function() {
const mainFormEl = document.getElementById('f3');
let count=mainFormEl.dataset.count;
function getCurrentCount() {
  return count;
}

// The blank-row markup lives in a single place: views/partials/yahrzeit-row.ejs.
// The server renders it once into <template id="yahrzeit-row-tmpl"> with the
// literal token __IDX__ standing in for the row number (see views/yahrzeit.ejs).
// To add a row we take that markup and swap __IDX__ for the new row number.
// A token replace (rather than cloning and walking attributes) is used because
// the index appears in both attributes and a text node (the "N." row label),
// and the ids are irregular (del-N, sN-0), so one string pass is simplest.
const rowTmpl = document.getElementById('yahrzeit-row-tmpl');

function addNewRow() {
  const n = ++count;
  const holder = document.createElement('div');
  holder.innerHTML = rowTmpl.innerHTML.replace(/__IDX__/g, n);
  const newNode = holder.firstElementChild;
  const parentDiv = document.getElementById('rows');
  parentDiv.insertBefore(newNode, null);
  const delBtn = document.getElementById('del-'+n);
  clickToDelete(delBtn);
  return n;
}

document.getElementById('newrow').addEventListener('click', function() {
  addNewRow();
  return false;
});

const checkbox = document.getElementById('yizkor');
const radio0 = document.getElementById('i0');
const radio1 = document.getElementById('i1');
checkbox.addEventListener('change', () => {
  radio0.disabled = !checkbox.checked;
  radio1.disabled = !checkbox.checked;
});

function clickToDelete(el) {
  const num = el.id.substring(4);
  el.addEventListener('click', function() {
    const node = document.getElementById('row' + num);
    node.innerHTML = '<div class="row mb-3 align-items-center mt-1"><div class="col-auto">'+num+'.</div>'+
      '<div class="col-auto"><span class="text-danger lead">Deleted.</span></div>'+
      '<div class="col-auto"><span class="text-burgundy">Click “Update Calendar” to save changes.</span></div>'+
      '</div>';
  });
}
const delBtns = [].slice.call(document.querySelectorAll('button.del'));
delBtns.forEach(clickToDelete);

const now = new Date();
const maxYear = now.getFullYear() + 100;
const tzoEl = document.getElementById('tzo');
if (tzoEl) {
  const feb15 = new Date();
  feb15.setDate(15);
  feb15.setMonth(1);
  tzoEl.value = feb15.getTimezoneOffset();
}
mainFormEl.addEventListener('submit', function(event) {
  mainFormEl.classList.remove('was-validated');
  const _paq = window._paq = window._paq || [];
  let formInvalid = false;
  function checkNumber(el, event, min, max) {
    const value = el.value.trim();
    if (value.length === 0) {
      el.classList.remove('is-invalid');
      return true;
    }
    const num = Number.parseInt(value, 10);
    if (Number.isNaN(num) || num < min || num > max) {
      event.preventDefault();
      event.stopPropagation();
      el.classList.add('is-invalid');
      formInvalid = true;
      _paq.push(['trackEvent', 'Interaction', 'form-invalid', 'yahrzeit']);
      return false;
    } else {
      el.classList.remove('is-invalid');
      return true;
    }
  }
  const allInputs = [].slice.call(mainFormEl.querySelectorAll('input'));
  const dayNumberInputs = allInputs.filter((el) => /^d\d+$/.test(el.id));
  dayNumberInputs.forEach((el) => checkNumber(el, event, 1, 31));
  const yearInputs = allInputs.filter((el) => /^y\d+$/.test(el.id));
  yearInputs.forEach((el) => checkNumber(el, event, 1, maxYear));
  dayNumberInputs.forEach((el) => {
    const num = el.id.substring(1);
    const dd = Number.parseInt(el.value, 10);
    const mm = Number.parseInt(mainFormEl.querySelector('#m' + num).value, 10);
    const yy = Number.parseInt(mainFormEl.querySelector('#y' + num).value, 10);
    if (!Number.isNaN(dd) && !Number.isNaN(mm) && !Number.isNaN(yy)) {
      const daysInMonth = new Date(yy, mm, 0).getDate();
      if (dd > daysInMonth) {
        event.preventDefault();
        event.stopPropagation();
        el.classList.add('is-invalid');
        formInvalid = true;
      }
    }
  });
  if (!mainFormEl.checkValidity()) {
    event.preventDefault();
    event.stopPropagation();
    _paq.push(['trackEvent', 'Interaction', 'form-invalid', 'yahrzeit']);
    return;
  }
  if (!formInvalid) {
    mainFormEl.classList.add('was-validated');
  }
}, false);

function processRow(row) {
  const parts = row[0].trim().split('/');
  const mm = Number.parseInt(parts[0], 10);
  const dd = Number.parseInt(parts[1], 10);
  const yy = Number.parseInt(parts[2], 10);
  if (Number.isNaN(mm) || Number.isNaN(dd) || Number.isNaN(yy)) {
    return false;
  }
  let n = getCurrentCount();
  if (!document.getElementById('y'+n) || !document.getElementById('m'+n) || !document.getElementById('d'+n)) {
    n = addNewRow();
  }
  if (document.getElementById('y'+n).value &&
      document.getElementById('m'+n).value &&
      document.getElementById('d'+n).value) {
    n = addNewRow();
  }
  document.getElementById('d'+n).value = ''+dd;
  document.getElementById('m'+n).value = ''+mm;
  document.getElementById('y'+n).value = ''+yy;
  if (typeof row[1] === 'string') {
    const name = row[1].trim();
    document.getElementById('n'+n).value = name;
  }
  if (typeof row[2] === 'boolean' && row[2]) {
    document.getElementById('s'+n+'-0').checked = false;
    document.getElementById('s'+n+'-1').checked = true;
  }
  if (typeof row[3] === 'string') {
    const typ = row[3].trim().toLowerCase();
    const el = document.getElementById('t'+n);
    switch (typ[0]) {
      case 'y':
        el.value = 'Yahrzeit';
        break;
      case 'b':
        el.value = 'Birthday';
        break;
      case 'a':
        el.value = 'Anniversary';
        break;
      case 'o':
        el.value = 'Other';
        break;
    }
  }
  addNewRow();
  return true;
}
const formFileEl = document.getElementById('formFile');
const formEl = document.getElementById('import-form');
formEl.addEventListener('submit', function(event) {
  event.preventDefault();
  event.stopPropagation();
  const nofileAlertEl = document.getElementById('nofile-alert');
  const badimportAlertEl = document.getElementById('badimport-alert');
  const successAlertEl = document.getElementById('success-alert');
  const _paq = window._paq = window._paq || [];
  if (formFileEl.files.length == 0) {
    nofileAlertEl.hidden = false;
    badimportAlertEl.hidden = true;
    successAlertEl.hidden = true;
    _paq.push(['trackEvent', 'Interaction', 'csv-nofile', '(none)', 0]);
  } else {
    nofileAlertEl.hidden = true;
    badimportAlertEl.hidden = true;
    successAlertEl.hidden = true;
    const file = formFileEl.files[0];
    Papa.parse(file, {
      dynamicTyping: true,
      error: function(err, file, inputElem, reason) {
        _paq.push(['trackEvent', 'Interaction', 'csv-error', file.name, 0]);
      },
      complete: function(results) {
        let numOK = 0;
        for (const row of results.data) {
          if (typeof row[0] === 'string') {
            const ok = processRow(row);
            if (ok) {
              numOK++;
            }
          }
        }
        if (numOK) {
          document.getElementById('success-numrecords').innerHTML = numOK;
          document.getElementById('success-filename').innerHTML = file.name;
          successAlertEl.hidden = false;
          _paq.push(['trackEvent', 'Upload', 'csv-import', file.name, numOK]);
        } else {
          badimportAlertEl.hidden = false;
          _paq.push(['trackEvent', 'Interaction', 'csv-fail', file.name, 0]);
        }
      },
    });
  }
});
});
