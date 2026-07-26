/* ─────────────────────────────────────────────────────────
   © 2026 Hustlin' For You · hustlin.org · All rights reserved.
   ─────────────────────────────────────────────────────────
   Hustlin' — buy button binder for course sales pages

   Put data-hfy-buy="<course key>" on any button or link and this wires it up:
     · signed out          → send to sign-up, then back here
     · signed in, unpaid   → Stripe Checkout
     · signed in, owns it  → turns into "Go to Course"

   Requires app.js, supabase-js, supabase-config.js, auth.js and
   course-access.js to be loaded first.

   As always, this is presentation only. Access is decided by the
   course-content Edge Function, not by anything in this file.
   ───────────────────────────────────────────────────────── */
(function () {
  'use strict';

  if (!window.HFY || !window.HFY.auth || !window.HFY.access) {
    console.error('course-buy.js: HFY.auth / HFY.access not loaded');
    return;
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function learnHref(course) {
    return 'learn.html?course=' + encodeURIComponent(course) + '&stage=1';
  }

  function setLabel(el, text) {
    // These buttons wrap their label in icons/spans, so replace only the
    // deepest text node rather than blowing away the markup.
    var node = null;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.trim()) node = walker.currentNode;
    }
    if (node) node.nodeValue = ' ' + text + ' ';
    else el.textContent = text;
  }

  // A course that isn't on sale yet is marked active = false in the database.
  // RLS on public.courses only returns active rows, so "no row" means "not
  // for sale" — no separate flag needed, and the browser can't override it.
  async function isOnSale(course) {
    try {
      var res = await window.HFY_SUPABASE
        .from('courses').select('key').eq('key', course).limit(1);
      if (res.error) throw res.error;
      return !!(res.data && res.data.length);
    } catch (e) {
      console.error('course-buy: catalog lookup failed', e);
      return true; // don't block a sale because of a transient network error
    }
  }

  ready(async function () {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-hfy-buy]'));
    if (!buttons.length) return;

    var course = buttons[0].getAttribute('data-hfy-buy');
    var user = null;
    var owns = false;

    if (!(await isOnSale(course))) {
      buttons.forEach(function (btn) {
        setLabel(btn, 'Coming Soon');
        btn.setAttribute('aria-disabled', 'true');
        btn.style.opacity = '.55';
        btn.style.cursor = 'default';
        btn.addEventListener('click', function (e) { e.preventDefault(); });
      });
      return;
    }

    try {
      user = await window.HFY.auth.getUser();
      if (user) owns = await window.HFY.access.checkCourseAccess(course);
    } catch (e) {
      console.error('course-buy: access check failed', e);
    }

    buttons.forEach(function (btn) {
      var key = btn.getAttribute('data-hfy-buy') || course;

      if (owns) {
        setLabel(btn, 'Go to Course');
        btn.setAttribute('href', learnHref(key));
        return;
      }

      btn.addEventListener('click', async function (e) {
        e.preventDefault();
        if (btn.dataset.busy === '1') return;

        if (!user) {
          var back = encodeURIComponent(window.location.href);
          window.location.href = 'signup.html?redirect=' + back;
          return;
        }

        btn.dataset.busy = '1';
        var original = btn.textContent;
        setLabel(btn, 'Redirecting to checkout…');
        try {
          await window.HFY.access.startCheckout(key);
        } catch (err) {
          console.error(err);
          btn.dataset.busy = '';
          setLabel(btn, original.trim() || 'Enroll Now');
          alert(err.message || 'Could not start checkout. Please try again.');
        }
      });
    });
  });
})();
