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

  // The all-access bundle has no stages of its own, so "Go to Course" for it
  // has to land on the Learn hub rather than learn.html?course=all&stage=1,
  // which would resolve to nothing.
  var BUNDLE_KEY = 'all';

  function learnHref(course) {
    return course === BUNDLE_KEY
      ? 'learn.html'
      : 'learn.html?course=' + encodeURIComponent(course) + '&stage=1';
  }

  function setLabel(el, text) {
    // Image-only buttons: the Technical Analysis CTAs are a single <img> of
    // branded artwork with no text node at all. The old `else` branch below
    // ran el.textContent = text on those, which deleted the artwork and left
    // a bare string — which is exactly why that page carried its own bespoke
    // checkout wiring instead of using this helper. Update the alt text
    // instead: it is the accessible label, so it is the right thing to
    // change, and the button keeps looking like a button.
    var img = el.querySelector('img');
    if (img && !el.textContent.trim()) {
      img.alt = text;
      return;
    }

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

    // Every distinct course key on the page. This used to be a single key
    // taken from buttons[0], with one on-sale check and one `owns` flag
    // applied to every button — fine when a page only ever sold one thing.
    //
    // The course sales pages now also carry an all-access cross-sell, so a
    // page holds two independent keys. Under the old single-flag logic,
    // owning Fundamental Analysis set owns = true for the whole page, which
    // relabelled the bundle button "Go to Course" and pointed it at
    // learn.html — making the upgrade permanently unreachable for exactly
    // the people it was built for. State has to be per key.
    var keys = [];
    buttons.forEach(function (b) {
      var k = b.getAttribute('data-hfy-buy');
      if (k && keys.indexOf(k) === -1) keys.push(k);
    });

    var user = null;
    try {
      user = await window.HFY.auth.getUser();
    } catch (e) {
      console.error('course-buy: auth lookup failed', e);
    }

    var state = {};
    await Promise.all(keys.map(async function (k) {
      var onSale = await isOnSale(k);
      var owns = false;
      if (user && onSale) {
        try {
          owns = await window.HFY.access.checkCourseAccess(k);
        } catch (e) {
          console.error('course-buy: access check failed for ' + k, e);
        }
      }
      state[k] = { onSale: onSale, owns: owns };
    }));

    // Someone holding at least one paid course who does not yet hold the
    // bundle is an upgrade candidate: the Edge Function credits what they
    // already paid, so they are not being asked for the full sticker price.
    // Saying "Get" to that person misdescribes the offer.
    var ownsSomething = keys.some(function (k) {
      return k !== BUNDLE_KEY && state[k] && state[k].owns;
    });

    buttons.forEach(function (btn) {
      var key = btn.getAttribute('data-hfy-buy');
      var st = state[key] || { onSale: true, owns: false };

      if (!st.onSale) {
        setLabel(btn, 'Coming Soon');
        btn.setAttribute('aria-disabled', 'true');
        btn.style.opacity = '.55';
        btn.style.cursor = 'default';
        btn.addEventListener('click', function (e) { e.preventDefault(); });
        return;
      }

      if (st.owns) {
        setLabel(btn, 'Go to Course');
        btn.setAttribute('href', learnHref(key));
        return;
      }

      if (key === BUNDLE_KEY && ownsSomething) {
        setLabel(btn, 'Upgrade to All-Access');
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
        // Read the label the same way setLabel writes it, so an image-only
        // button restores its real alt text rather than falling back to a
        // generic string.
        var img = btn.querySelector('img');
        var original = (img && !btn.textContent.trim()) ? img.alt : btn.textContent;
        // Text buttons signal "working" by changing their label. Image buttons
        // can't, so dim them instead — otherwise a slow checkout looks like a
        // dead click and gets clicked again.
        btn.style.opacity = '.6';
        btn.style.pointerEvents = 'none';
        setLabel(btn, 'Redirecting to checkout…');
        try {
          await window.HFY.access.startCheckout(key);
        } catch (err) {
          console.error(err);
          btn.dataset.busy = '';
          btn.style.opacity = '';
          btn.style.pointerEvents = '';
          setLabel(btn, (original || '').trim() || 'Enroll Now');
          alert(err.message || 'Could not start checkout. Please try again.');
        }
      });
    });
  });
})();
