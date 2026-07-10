function show(el) {
  if (el) {
    el.style.display = 'block';
  }
}
function hide(el) {
  if (el) {
    el.style.display = 'none';
  }
}
const d = document;
const _paq = window._paq = window._paq || [];
const emailForm = d.getElementById('f2');
const resource = emailForm.dataset.resource;
const emailSubscribeLabel = emailForm.dataset.emailSubscribeLabel;
const action = emailForm.dataset.action;

const emailModalSuccess = d.getElementById('email-modal-success');
const emailModalFailure = d.getElementById('email-modal-failure');
const emailModalAlready = d.getElementById('email-modal-already');
const emailModalEntry = d.getElementById('email-modal-entry');
const emailModal = d.getElementById('email-modal');
const emailSubscribeBtn = d.getElementById('email-subscribe');
const emailInput = d.getElementById('em');
emailModal.addEventListener('show.bs.modal', function() {
  hide(emailModalSuccess);
  hide(emailModalFailure);
  show(emailModalEntry);
  show(emailSubscribeBtn);
  emailSubscribeBtn.textContent = emailSubscribeLabel;
  emailSubscribeBtn.disabled = false;
  emailForm.classList.remove('was-validated', 'is-invalid');
  _paq.push(['trackEvent', 'Interaction', 'email-modal', action]);
});

function validateEmail(email) {
  // eslint-disable-next-line max-len
  const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(String(email).toLowerCase());
}

function myFail(name) {
  show(emailModalFailure);
  emailSubscribeBtn.textContent = emailSubscribeLabel;
  emailSubscribeBtn.disabled = false;
  _paq.push(['trackEvent', 'Error', '500', action + ': ' + name]);
}

function doSubscribe(event) {
  event.preventDefault();
  event.stopPropagation();
  hide(emailModalSuccess);
  hide(emailModalFailure);
  hide(emailModalAlready);
  emailForm.classList.remove('was-validated');
  if (!emailForm.checkValidity()) {
    emailForm.classList.add('was-validated');
    _paq.push(['trackEvent', 'Interaction', 'signup-invalid', action]);
    return;
  }
  emailInput.classList.remove('is-invalid');
  if (!validateEmail(emailInput.value)) {
    emailForm.classList.add('was-validated');
    emailInput.classList.add('is-invalid');
    _paq.push(['trackEvent', 'Interaction', 'signup-invalid', action]);
    return;
  }
  emailForm.classList.add('was-validated');

  _paq.push(['trackEvent', 'Email', 'signup', action]);

  emailSubscribeBtn.textContent = 'Processing...';
  emailSubscribeBtn.disabled = true;
  const params = new URLSearchParams();
  const formData = new FormData(emailForm);
  for (const pair of formData) {
    params.append(pair[0], pair[1]);
  }
  const options = {
    method: 'POST',
    credentials: 'omit',
    body: params,
    headers: {
      'Accept': 'application/json',
    },
  };
  if (typeof AbortSignal === 'function') {
    options.signal = AbortSignal.timeout(9000);
  }
  fetch(resource, options).then(function(response) {
    if (response.ok) {
      response.json().then(function(data) {
        if (data.alreadySubscribed) {
          show(emailModalAlready);
          hide(emailModalFailure);
          hide(emailModalEntry);
          hide(emailSubscribeBtn);
        } else if (data.ok) {
          show(emailModalSuccess);
          hide(emailModalFailure);
          hide(emailModalEntry);
          hide(emailSubscribeBtn);
        } else {
          myFail(emailInput.value);
        }
      }).catch(function(err) {
        myFail(err.message);
      });
    } else {
      myFail(emailInput.value);
    }
  }).catch(function(err) {
    if (err.name === 'TimeoutError') {
      console.error('Timeout: It took more than 9 seconds to get the result!');
    } else if (err.name === 'AbortError') {
      console.error('Fetch aborted by user action (browser stop button, closing tab, etc.');
    } else if (err.name === 'TypeError') {
      console.error('AbortSignal.timeout() method is not supported');
    } else {
      // A network error, or some other problem.
      console.error(`Error: type: ${err.name}, message: ${err.message}`);
    }
    myFail(err.message);
  });
};
emailForm.addEventListener('submit', doSubscribe);
emailSubscribeBtn.addEventListener('click', doSubscribe);
