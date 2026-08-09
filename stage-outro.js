/**
 * =============================================================================
 *  stage-outro.js — share bar, stage-completion celebration, account prompt
 *                   and the course cross-sell panel, for every course stage.
 * =============================================================================
 *
 *  WHAT IT DOES
 *  ------------
 *  Two injected pieces, both built here rather than pasted into eleven stage
 *  files (see course-shell.js for why that mattered last time):
 *
 *    1. A persistent SHARE BAR under the stage banner. Always visible, on every
 *       stage, because the ask is "tell a friend", not "tell a friend if you
 *       happen to finish".
 *
 *    2. A STAGE OUTRO that appears only once the reader has actually finished
 *       every action step in the stage. It carries, in order:
 *         - congratulations (they earned it, say so)
 *         - a second share prompt, now that they have proof it was worth it
 *         - a SOFT account prompt — nothing is gated, there is a dismiss link,
 *           and it never reappears once dismissed or once a session exists
 *         - the full course catalogue, matching index.html
 *
 *  WHY COMPLETION IS COMPUTED HERE
 *  -------------------------------
 *  app.js drives #stageCompleteBanner, but renderStageComplete() only reveals
 *  that banner when a NEXT stage exists — so on Stage 5, the last stage of the
 *  course, it never fires. Keying the outro off that element would mean the one
 *  reader who finished the entire program is the only one who never gets
 *  congratulated. So completion is derived directly from the action boxes, the
 *  same signal course-shell.js uses for the sidebar.
 *
 *  ROOT-ABSOLUTE LINKS
 *  -------------------
 *  Stage markup lives in two places at once: the master under
 *  "Financial Literacy Course/" (served inside learn.html, at the site root)
 *  and the generated public copy at the root. Relative paths therefore have to
 *  survive both. Everything injected here uses root-absolute "/..." paths,
 *  which are correct from either location and need no de-nesting pass.
 *
 *  DEPENDENCIES
 *  ------------
 *  None. Deliberately. It reads localStorage directly rather than requiring
 *  auth.js, which is not loaded on stage pages.
 * =============================================================================
 */
(function () {
  'use strict';

  var DISMISS_KEY = 'hfy_outro_account_dismissed_v1';

  // True on learn.html, where the lesson is fetched and injected long after
  // DOM ready. Detected the same two ways course-shell.js detects it — by
  // filename and by the viewer's lesson mount point — so a clean-URL rewrite
  // cannot quietly re-enable the auto-init and have it run against an empty
  // page. In the viewer, learn.js calls HFY_STAGE_OUTRO.init() instead, once
  // the lesson has actually landed.
  var IN_VIEWER = /(^|\/)learn(\.html)?$/i.test(window.location.pathname) ||
                  !!document.getElementById('hfy-lesson');
  var SHARE_URL   = 'https://hustlin.org/financial-literacy.html';
  var SHARE_TEXT  = "I'm taking Hustlin's free financial literacy course — 5 stages, no cost, no account. If you're trying to get your money right, start here:";

  /* --------------------------------------------------------------- helpers */

  /** Cheap session check that does not require auth.js to be on the page. */
  function hasSession() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        if (/^sb-.*-auth-token$/.test(localStorage.key(i))) return true;
      }
    } catch (e) { /* private mode — treat as signed out */ }
    return false;
  }

  function dismissed() {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
  }

  /** Stage number and name, read from the page rather than configured twice. */
  function stageInfo() {
    var key = (window.HFY_COURSE && window.HFY_COURSE.stage) || '';
    var m = /(\d+)/.exec(key);
    var num = m ? parseInt(m[1], 10) : 0;
    var names = { 1: 'Survive', 2: 'Stabilize', 3: 'Rebuild', 4: 'Invest', 5: 'Build Wealth' };
    return { num: num, name: names[num] || '', last: num === 5 };
  }

  /**
   * Complete = every module in the stage is ticked.
   *
   * This scores module by module rather than counting every .act-box on the
   * page, because that is exactly what course-shell.js's syncSidebar() does:
   * a module uses its .act-box elements if it has any, and only falls back to
   * .ms-row when it has none. Several modules in Stages 4 and 5 carry only
   * .ms-row, so a flat .act-box sweep would call the stage finished while the
   * sidebar still showed those modules unticked — the outro would fire early
   * and contradict the ticks the reader is looking at.
   *
   * A module with neither kind of activity is skipped, not failed: there is
   * nothing in it to complete, and treating it as outstanding would mean the
   * outro could never fire on a stage that contains one.
   */
  function isComplete() {
    var mods = document.querySelectorAll('.course-main .module');
    if (!mods.length) return false;

    var scored = 0;
    for (var i = 0; i < mods.length; i++) {
      var items = mods[i].querySelectorAll('.act-box');
      if (!items.length) items = mods[i].querySelectorAll('.ms-row');
      if (!items.length) continue;          // nothing to complete — skip it
      scored++;
      for (var j = 0; j < items.length; j++) {
        if (!items[j].classList.contains('done')) return false;
      }
    }
    return scored > 0;
  }

  /* ----------------------------------------------------------- share links */

  function shareHref(network) {
    var u = encodeURIComponent(SHARE_URL);
    var t = encodeURIComponent(SHARE_TEXT);
    switch (network) {
      case 'x':  return 'https://twitter.com/intent/tweet?text=' + t + '&url=' + u;
      case 'fb': return 'https://www.facebook.com/sharer/sharer.php?u=' + u;
      case 'sms':   return 'sms:?&body=' + t + '%20' + u;
      case 'email': return 'mailto:?subject=' + encodeURIComponent("A free financial course that's actually good")
                         + '&body=' + t + '%20' + u;
      /* Snapchat's Share Link plugin. Opens the camera with the URL already
         attached, on mobile and on Snapchat for Web. `attachmentUrl` is the
         parameter that carries the link — without it the Snap posts with no
         way back to us, which is the whole point of sharing it. */
      case 'snap':  return 'https://www.snapchat.com/scan?attachmentUrl=' + u;
      /* Instagram is a FOLLOW link, not a share link, and that is not an
         oversight. Instagram exposes no share intent for third-party URLs and
         does not make links in captions tappable, so a "Share to Instagram"
         button cannot do what its label promises. Pointing at the profile is
         the honest version. Anyone who wants to put us in a Story can use
         Copy link, which is the actual supported path. */
      case 'ig':    return 'https://www.instagram.com/hustlin_org/';
      default: return SHARE_URL;
    }
  }

  function copyLink(btn) {
    var done = function () {
      var was = btn.textContent;
      btn.textContent = '✓ Link copied';
      btn.classList.add('is-copied');
      setTimeout(function () { btn.textContent = was; btn.classList.remove('is-copied'); }, 2200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(SHARE_URL).then(done, function () { fallbackCopy(done); });
    } else {
      fallbackCopy(done);
    }
  }

  function fallbackCopy(done) {
    var ta = document.createElement('textarea');
    ta.value = SHARE_URL;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* nothing sensible left to do */ }
    document.body.removeChild(ta);
  }

  function shareButtons(compact) {
    return '' +
      '<button type="button" class="hfy-share-btn hfy-share-copy" data-share="copy">🔗 Copy link</button>' +
      '<a class="hfy-share-btn" href="' + shareHref('sms') + '">💬 Text it</a>' +
      '<a class="hfy-share-btn" href="' + shareHref('x') + '" target="_blank" rel="noopener">𝕏 Post</a>' +
      '<a class="hfy-share-btn" href="' + shareHref('fb') + '" target="_blank" rel="noopener">📘 Facebook</a>' +
      '<a class="hfy-share-btn" href="' + shareHref('snap') + '" target="_blank" rel="noopener">👻 Snapchat</a>' +
      // Labelled "Follow", never "Share" — see shareHref('ig') for why the
      // distinction is load-bearing rather than pedantic.
      '<a class="hfy-share-btn" href="' + shareHref('ig') + '" target="_blank" rel="noopener">📸 Follow on IG</a>' +
      (compact ? '' : '<a class="hfy-share-btn" href="' + shareHref('email') + '">✉️ Email</a>');
  }

  /* The QR block. Exists for the in-person case the buttons cannot cover:
     you are standing next to someone, they are not going to type a URL, and
     nobody wants to swap phone numbers over a course recommendation. They
     point a camera at your screen instead.

     Hidden below 560px on purpose (see the CSS): a phone is the device most
     likely to BE the screen being scanned, not the one doing the scanning,
     and the code would eat half the bar. */
  function qrBlock() {
    return '' +
      '<div class="hfy-share-qr">' +
        '<img src="/assets/qr-code.png" width="96" height="96" loading="lazy" decoding="async" ' +
             'alt="QR code linking to hustlin.org">' +
        '<span>Point a camera<br>at this</span>' +
      '</div>';
  }

  function wireShare(root) {
    var btn = root.querySelector('[data-share="copy"]');
    if (btn) btn.addEventListener('click', function () { copyLink(btn); });
  }

  /* ------------------------------------------------------------- share bar */

  function buildShareBar() {
    if (document.getElementById('hfyShareBar')) return;
    var anchor = document.querySelector('.course-layout');
    if (!anchor || !anchor.parentNode) return;

    var bar = document.createElement('div');
    bar.className = 'hfy-sharebar';
    bar.id = 'hfyShareBar';
    bar.innerHTML =
      '<div class="hfy-sharebar-txt">' +
        '<strong>Somebody you know needs this.</strong>' +
        '<span>The whole course is free. Send it to one person.</span>' +
      '</div>' +
      '<div class="hfy-sharebar-btns">' + shareButtons(true) + '</div>' +
      qrBlock();

    anchor.parentNode.insertBefore(bar, anchor);
    wireShare(bar);
  }

  /* ----------------------------------------------------------- outro panel */

  function catalogueHTML() {
    var courses = [
      { href: '/technical-analysis.html',  ico: '📈', title: 'Technical Analysis',    desc: 'Charts, indicators, patterns, and a complete trading system with defined rules.', price: '$37.95' },
      { href: '/fundamental-analysis.html',ico: '📊', title: 'Fundamental Analysis',  desc: 'Financial statements, business quality, and calculating intrinsic value.',        price: '$37.95' },
      { href: '/trading-psychology.html',  ico: '🧠', title: 'Trading Psychology',    desc: 'Cognitive biases, emotional discipline, and the mental game of money.',          price: '$37.95' },
      { href: '/economics.html',           ico: '🌍', title: 'Economics for Traders', desc: 'Growth, inflation, rates, and the indicators that actually move markets.',       price: '$37.95' }
    ];
    var cards = courses.map(function (c) {
      return '<a class="hfy-oc-card" href="' + c.href + '">' +
               '<span class="hfy-oc-ico">' + c.ico + '</span>' +
               '<span class="hfy-oc-price">' + c.price + ' · one-time</span>' +
               '<span class="hfy-oc-title">' + c.title + '</span>' +
               '<span class="hfy-oc-desc">' + c.desc + '</span>' +
               '<span class="hfy-oc-go">View course →</span>' +
             '</a>';
    }).join('');

    return '' +
      '<div class="hfy-outro-sec">' +
        '<div class="hfy-outro-h3">Keep going — the rest of the library</div>' +
        '<p class="hfy-outro-p">Financial Literacy is free forever and always will be. When you are ready to read the market instead of just surviving it, these are the four that take you there.</p>' +
        '<div class="hfy-oc-grid">' + cards + '</div>' +
        '<a class="hfy-oc-bundle" href="/index.html#courses">' +
          '<span class="hfy-oc-bundle-l">All-Access Bundle — all four courses</span>' +
          '<span class="hfy-oc-bundle-r"><b>$113.85</b> four for the price of three · save $37.95</span>' +
        '</a>' +
        '<div class="hfy-oc-free">' +
          'Still free, still no account: ' +
          '<a href="/calculate-your-hustle.html">the calculators</a> · ' +
          '<a href="/disability-wealth-guide.html">Disability Wealth Guide</a> · ' +
          '<a href="/markets.html">Markets</a>' +
        '</div>' +
      '</div>';
  }

  function accountHTML(info) {
    if (hasSession() || dismissed()) return '';
    var redirect = encodeURIComponent(location.pathname + location.search);
    return '' +
      '<div class="hfy-outro-sec hfy-outro-acct" id="hfyOutroAcct">' +
        '<div class="hfy-outro-h3">Save this so you never lose it</div>' +
        '<p class="hfy-outro-p">Right now your progress lives on this device only. Clear your browser, switch to your phone, get a new one — it is gone. A free account keeps every ticked box and every stage on all of them, and it is how we send you what we build next.</p>' +
        '<div class="hfy-outro-btns">' +
          '<a class="hfy-outro-cta" href="/signup.html?redirect=' + redirect + '">Create a free account</a>' +
          '<a class="hfy-outro-alt" href="/login.html?redirect=' + redirect + '">I already have one</a>' +
          '<button type="button" class="hfy-outro-skip" id="hfyOutroSkip">Not right now</button>' +
        '</div>' +
        '<div class="hfy-outro-fine">Free. No card. Nothing is locked either way — the course stays open whatever you choose.</div>' +
      '</div>';
  }

  function buildOutro() {
    if (document.getElementById('hfyStageOutro')) return;
    var anchor = document.querySelector('.course-layout');
    if (!anchor || !anchor.parentNode) return;

    var info = stageInfo();
    var head = info.last
      ? '🏆 That is the whole thing. All five stages, start to finish.'
      : '🏆 Stage ' + info.num + ': ' + info.name + ' — complete.';
    var sub = info.last
      ? 'Most people who open a financial course never finish one module. You finished forty. Nobody handed you that. You did the work, every action step, all the way through.'
      : 'You did not skim it — you ticked every action step in the stage. That is discipline, and discipline is the only thing this whole system actually runs on.';

    var el = document.createElement('div');
    el.className = 'hfy-outro';
    el.id = 'hfyStageOutro';
    el.setAttribute('aria-live', 'polite');
    el.innerHTML =
      '<div class="hfy-outro-crown">' +
        '<div class="hfy-outro-h1">' + head + '</div>' +
        '<p class="hfy-outro-lede">' + sub + '</p>' +
        '<div class="hfy-outro-stamp">That is why you are a true hustler. 100%</div>' +
      '</div>' +
      '<div class="hfy-outro-sec">' +
        '<div class="hfy-outro-h3">Now go put somebody else on</div>' +
        '<p class="hfy-outro-p">You just proved it works. One person you send this to is one person who does not pay a hundred dollars for the same information.</p>' +
        '<div class="hfy-outro-share">' + shareButtons(false) + '</div>' +
      '</div>' +
      accountHTML(info) +
      catalogueHTML();

    anchor.parentNode.insertBefore(el, anchor.nextSibling);
    wireShare(el);

    var skip = document.getElementById('hfyOutroSkip');
    if (skip) {
      skip.addEventListener('click', function () {
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
        var box = document.getElementById('hfyOutroAcct');
        if (box) box.remove();
      });
    }
  }

  /* -------------------------------------------------------------------- run */

  var built = false;

  function check() {
    if (built) return;
    if (!isComplete()) return;
    built = true;
    buildOutro();
    var el = document.getElementById('hfyStageOutro');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * First pass must not scroll: a returning reader who already finished the
   * stage should land where they left off, not get yanked to the outro.
   */
  function initial() {
    buildShareBar();
    if (isComplete()) { built = true; buildOutro(); }
  }

  // The observer is attached once and only once. start() is re-entrant by
  // design — learn.js calls it after the lesson lands, and a stage page that
  // somehow fired DOM ready twice would call it again — and a second observer
  // on document.body would run check() twice for every class change on the
  // page, for no benefit.
  var observing = false;

  function start() {
    initial();
    if (observing) return;
    observing = true;
    // Action boxes toggle a class rather than firing an event, so watch for it.
    new MutationObserver(check).observe(document.body, {
      attributes: true, attributeFilter: ['class'], subtree: true
    });
  }

  if (!IN_VIEWER) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }

  // learn.html injects the lesson long after DOMContentLoaded — let it re-run.
  window.HFY_STAGE_OUTRO = { init: start };
})();
