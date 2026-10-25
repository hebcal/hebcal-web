/**
 * Signed-in personalization for an email-subscription modal; see the
 * comment in views/partials/email-modal-signin.ejs for the element IDs
 * and the shape of the #email-signin-cfg JSON.
 */
function main() {
  const d = document;
  const m = d.cookie.match(/(?:^|;\s*)C=([^;]*)/);
  // Case A (not signed in): leave the modal exactly as server-rendered.
  if (!(m && /(?:^|&)hu=1(?:&|$)/.test(m[1]))) {
    return;
  }
  const cfgEl = d.getElementById('email-signin-cfg');
  const form = d.getElementById('f2');
  if (!cfgEl || !form) {
    return;
  }
  const cfg = JSON.parse(cfgEl.textContent);
  function byId(suffix) {
    return d.getElementById(cfg.prefix + '-' + suffix);
  }
  const modal = d.getElementById('email-modal');
  const signin = byId('signin');
  const subscribeMe = byId('subscribe-me');
  const subscribeMeBtn = subscribeMe && subscribeMe.querySelector('button');
  const meLabel = byId('me-label');
  const activeBox = byId('active');
  const activeEmail = byId('active-email');
  const updateLink = byId('update-link');
  const divider = byId('divider');
  const emailField = byId('email-field');
  const bottomBtn = d.getElementById('email-subscribe');
  const entry = d.getElementById('email-modal-entry');
  const verified = d.getElementById('email-modal-verified');
  const already = d.getElementById('email-modal-already');
  const failure = d.getElementById('email-modal-failure');
  const label = form.dataset.emailSubscribeLabel || 'Subscribe';
  let ready = false;
  let hasActiveSub = false;
  let userEmail = null;

  // A signed-in user never sees the provider sign-in buttons. With an active
  // subscription they see the <prefix>-active box; otherwise the one-click
  // "<label> <email>" button, with the email field demoted to an alternative.
  function apply() {
    if (!ready) {
      return;
    }
    if (signin) signin.hidden = true;
    if (hasActiveSub) {
      if (updateLink) {
        const args = updateLink.getAttribute('data-args') || '';
        updateLink.href = '/email?e=' + encodeURIComponent(btoa(userEmail)) +
          (args ? '&' + args : '');
      }
      if (activeEmail) activeEmail.textContent = userEmail;
      if (activeBox) activeBox.hidden = false;
      if (subscribeMe) subscribeMe.hidden = true;
      if (divider) {
        divider.hidden = cfg.activeHidesForm;
        if (cfg.activeDivider) divider.textContent = cfg.activeDivider;
      }
      if (emailField) emailField.hidden = cfg.activeHidesForm;
      if (bottomBtn) {
        bottomBtn.style.display = cfg.activeHidesForm ? 'none' : '';
        bottomBtn.classList.remove('btn-secondary');
        bottomBtn.classList.add('btn-primary');
      }
    } else {
      if (meLabel) meLabel.textContent = userEmail;
      if (subscribeMe) subscribeMe.hidden = false;
      if (activeBox) activeBox.hidden = true;
      if (divider) {
        divider.hidden = false;
        divider.textContent = 'or subscribe with a different email address';
      }
      if (emailField) emailField.hidden = false;
      if (bottomBtn) {
        bottomBtn.style.display = '';
        bottomBtn.classList.remove('btn-primary');
        bottomBtn.classList.add('btn-secondary');
      }
    }
  }

  // The bundle's show.bs.modal handler resets the entry, so re-apply after it.
  if (modal) {
    modal.addEventListener('show.bs.modal', function() {
      setTimeout(function() {
        if (verified) verified.style.display = 'none';
        if (already) already.style.display = 'none';
        if (subscribeMeBtn && userEmail) {
          subscribeMeBtn.disabled = false;
          subscribeMeBtn.textContent = label + ' ' + userEmail;
        }
        apply();
      }, 0);
    });
  }

  const qs = new URLSearchParams();
  (cfg.statusParams || []).forEach(function(k) {
    const el = form.querySelector('[name="' + k + '"]');
    if (el && el.value) {
      qs.append(k, el.value);
    }
  });
  fetch(cfg.statusUrl + '?' + qs.toString(),
      {credentials: 'include', headers: {'Accept': 'application/json'}})
      .then(function(r) {
        return r.ok ? r.json() : null;
      })
      .then(function(data) {
        if (!data || !data.loggedIn || !data.email) {
          return; // stale hint cookie: leave the default (Case A)
        }
        userEmail = data.email;
        hasActiveSub = !!data[cfg.activeKey];
        ready = true;
        apply();
      })
      .catch(function() {});

  // Blue "<label> <email>" -> activate immediately for the signed-in user.
  if (subscribeMeBtn) {
    subscribeMeBtn.addEventListener('click', function() {
      if (!userEmail) {
        return;
      }
      if (failure) failure.style.display = 'none';
      subscribeMeBtn.disabled = true;
      subscribeMeBtn.textContent = 'Processing...';
      const params = new URLSearchParams(new FormData(form));
      params.set('em', userEmail);
      const opts = {
        method: 'POST', credentials: 'include', body: params,
        headers: {'Accept': 'application/json'},
      };
      if (typeof AbortSignal === 'function') {
        opts.signal = AbortSignal.timeout(9000);
      }
      function fail() {
        subscribeMeBtn.disabled = false;
        subscribeMeBtn.textContent = label + ' ' + userEmail;
        if (failure) failure.style.display = 'block';
      }
      fetch(form.dataset.resource, opts)
          .then(function(r) {
            return r.ok ? r.json() : null;
          })
          .then(function(data) {
            if (data && data.ok) {
              // Reopening the modal should now show the active state.
              hasActiveSub = true;
              if (entry) entry.style.display = 'none';
              if (bottomBtn) bottomBtn.style.display = 'none';
              const done = (data.alreadySubscribed && already) ? already : verified;
              if (done) done.style.display = 'block';
            } else {
              fail();
            }
          })
          .catch(fail);
    });
  }
}

main();
