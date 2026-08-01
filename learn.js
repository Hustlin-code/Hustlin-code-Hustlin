/* ─────────────────────────────────────────────────────────
   © 2026 Hustlin' For You · hustlin.org · All rights reserved.
   ─────────────────────────────────────────────────────────
   Hustlin' — gated lesson viewer

   Drives learn.html. Reads ?course=&stage= from the URL, asks the
   course-content Edge Function for the lesson, and renders one of:
     · sign-in prompt   (401 auth_required)
     · purchase prompt  (402 payment_required)
     · the lesson       (200)

   The important property: this file never decides who gets to read a
   lesson. It only renders whatever the server already decided to send.
   Tampering with it gets you a nicer-looking 402, not the content.
   ───────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var FN_URL = window.HFY_CONFIG.SUPABASE_URL + '/functions/v1/course-content';

  // Nav button art per course, so each course keeps its own look.
  //
  // A stage entry may be either {n, img, alt} for a course that has button art,
  // or {n, alt} for one that doesn't — renderNav() draws a text pill in that
  // case. Fundamental Analysis and Trading Psychology shipped without artwork,
  // and leaving them out of this map entirely made renderNav() bail early, so
  // those two courses were the only ones with a completely empty nav rail.
  // A labelled pill is not as pretty as a painted button, but every course
  // having the same navigation matters more than that.
  var COURSE_NAV = {
    ta: {
      logo: 'assets/TA Buttons/BlueHustlinLogo-cropped.png',
      stages: [
        { n: 1, img: 'assets/TA Buttons/ChartBasics-cropped.png',   alt: 'Chart Basics' },
        { n: 2, img: 'assets/TA Buttons/TrendandVolume-cropped.png', alt: 'Trend & Volume' },
        { n: 3, img: 'assets/TA Buttons/ChartPatterns-cropped.png', alt: 'Chart Patterns' },
        { n: 4, img: 'assets/TA Buttons/Indicators-cropped.png',    alt: 'Indicators' },
        { n: 5, img: 'assets/TA Buttons/Advanced-cropped.png',      alt: 'Advanced' }
      ]
    },
    fl: {
      logo: 'assets/hustlin-logo.png',
      stages: [
        { n: 1, img: 'assets/buttons/Survive.png',     alt: 'Survive' },
        { n: 2, img: 'assets/buttons/Stabilize.png',   alt: 'Stabilize' },
        { n: 3, img: 'assets/buttons/Rebuild.png',     alt: 'Rebuild' },
        { n: 4, img: 'assets/buttons/Invest.png',      alt: 'Invest' },
        { n: 5, img: 'assets/buttons/BuildWealth.png', alt: 'Build Wealth' }
      ]
    },
    fund: {
      logo: 'assets/hustlin-logo.png',
      stages: [
        { n: 1, alt: 'Foundations' },
        { n: 2, alt: 'Income Statement' },
        { n: 3, alt: 'Balance Sheet & Cash Flow' },
        { n: 4, alt: 'Valuation' },
        { n: 5, alt: 'Moats & Management' }
      ]
    },
    psych: {
      logo: 'assets/hustlin-logo.png',
      stages: [
        { n: 1, alt: 'The Inner Game' },
        { n: 2, alt: 'Bias & Belief' },
        { n: 3, alt: 'Risk & Loss' },
        { n: 4, alt: 'Emotion Under Fire' },
        { n: 5, alt: 'The Repeatable Process' }
      ]
    },
    econ: {
      logo: 'assets/hustlin-logo.png',
      stages: [
        { n: 1, alt: 'Economics 101' },
        { n: 2, alt: 'Inflation' },
        { n: 3, alt: 'Rates, Banks & Bonds' },
        { n: 4, alt: 'Indicators & Global' },
        { n: 5, alt: 'Sectors & Strategy' }
      ]
    }
  };

  var params = new URLSearchParams(window.location.search);
  var course = params.get('course') || 'fl';
  var stage = parseInt(params.get('stage') || '1', 10);
  if (!(stage >= 1)) stage = 1;

  // ── per-course theme ──────────────────────────────────────────────────
  // learn.html is one shared shell for every course, and all of its chrome
  // is written against var(--amber) — the stage tabs, the price, and every
  // .btn-a in styles.css. The Technical Analysis pages re-theme that token
  // to blue in their own :root, but learn.html never received it, so a TA
  // reader got a blue nav and blue stage buttons wrapped around a gold
  // "Create Free Account" card.
  //
  // Setting the token here re-colours the auth wall, the paywall, the stage
  // tabs and the error card in one move, for every stage of the course. Add
  // a key here when a future course gets its own colour.
  var COURSE_THEMES = {
    ta:    { '--amber': '#2FA7FF', '--amber-lt': '#7DD8FF' },
    fund:  { '--amber': '#2DA02D', '--amber-lt': '#6EDB72' },
    psych: { '--amber': '#7C5CE6', '--amber-lt': '#A98FF3' },
    econ:  { '--amber': '#E07B39', '--amber-lt': '#F2A76B' }
  };
  (function applyCourseTheme() {
    var t = COURSE_THEMES[course];
    if (!t) return;
    Object.keys(t).forEach(function (k) {
      document.documentElement.style.setProperty(k, t[k]);
    });
  })();

  var elState = document.getElementById('hfy-state');
  var elLesson = document.getElementById('hfy-lesson');
  var elStyles = document.getElementById('hfy-lesson-styles');
  var elTabs = document.getElementById('hfy-stage-tabs');

  // Set once load() knows whether there's a session. Used only to decide what
  // the stage tabs and the end-of-lesson prompt should say — the server has
  // already made the actual access decision by the time we render anything.
  var signedIn = false;

  function href(c, s) { return 'learn.html?course=' + encodeURIComponent(c) + '&stage=' + s; }

  function card(inner) {
    elLesson.innerHTML = '';
    elState.style.display = '';
    elState.innerHTML = '<div class="hfy-learn-card">' + inner + '</div>';
  }

  function renderNav(data) {
    var conf = COURSE_NAV[course];
    var host = document.querySelector('.nav-stages');
    if (!conf || !host) return;

    var logo = document.getElementById('hfy-nav-logo');
    if (logo && conf.logo) logo.src = conf.logo;

    var count = (data && data.stage_count) || conf.stages.length;
    var html = '';
    conf.stages.forEach(function (s) {
      if (s.n > count) return;
      var current = s.n === stage;
      if (s.img) {
        html += '<a href="' + href(course, s.n) + '" style="display:inline-flex;align-items:center;' +
          'justify-content:center;text-decoration:none;padding:4px;width:190px;flex-shrink:0;">' +
          '<img src="' + s.img + '" alt="' + s.alt + '" style="max-height:78px;height:auto;width:auto;' +
          'max-width:100%;display:block;margin:0 auto;"></a>';
      } else {
        // Text pill for courses with no button art. Styled inline rather than
        // in styles.css so a new course needs no stylesheet edit to get a nav.
        html += '<a href="' + href(course, s.n) + '" style="display:inline-flex;flex-direction:column;' +
          'align-items:center;justify-content:center;text-decoration:none;padding:8px 14px;' +
          'margin:4px;min-width:120px;flex-shrink:0;border-radius:12px;line-height:1.25;' +
          'border:1px solid ' + (current ? 'var(--amber,#f0c030)' : 'rgba(255,255,255,.14)') + ';' +
          'background:' + (current ? 'var(--amber,#f0c030)' : 'rgba(255,255,255,.02)') + ';' +
          'color:' + (current ? '#000' : 'rgba(255,255,255,.72)') + ';">' +
          '<span style="font-family:\'Space Mono\',monospace;font-size:.62rem;letter-spacing:.09em;' +
          'text-transform:uppercase;opacity:.72">Stage ' + s.n + '</span>' +
          '<span style="font-size:.82rem;font-weight:600;text-align:center">' + s.alt + '</span></a>';
      }
    });
    // Insert before the account menu auth.js appends, so Account stays last.
    var account = document.getElementById('hfy-account');
    if (account) account.insertAdjacentHTML('beforebegin', html);
    else host.innerHTML = html;
  }

  // Highest stage number this visitor can open right now. Mirrors the three
  // server-side rules in the course-content Edge Function, in the same order,
  // so the padlocks match what a click would actually do.
  //   · signed out        → anon_stages (Financial Literacy = 1, others 0)
  //   · signed in         → every stage of a free course, else free_stages
  //   · signed in + paid  → everything (server sends entitled: true)
  //
  // Both counts default to 0 when absent, never to 1. `free_stages || 1` would
  // turn a deliberate 0 — a course with no free stage at all, which is what
  // Technical Analysis is now — straight back into 1 and show an open padlock
  // on a stage that answers 402. Erring toward "locked" is the safe direction:
  // the server decides either way, so the worst case is a padlock on something
  // that would in fact open, not a promise of free content that isn't.
  function num(v) { return typeof v === 'number' ? v : 0; }

  function openUpTo(data) {
    if (data.entitled) return data.stage_count;
    if (!signedIn) return num(data.anon_stages);
    if (data.is_free) return data.stage_count;
    return num(data.free_stages);
  }

  function renderTabs(data) {
    if (!data || !data.stage_count || data.stage_count < 2) { elTabs.innerHTML = ''; return; }
    var openTo = openUpTo(data);
    var out = '';
    for (var i = 1; i <= data.stage_count; i++) {
      var locked = i > openTo;
      out += '<a class="hfy-stage-tab' + (i === stage ? ' active' : '') + '" href="' + href(course, i) + '">' +
        'Stage ' + i + (locked ? '<span class="lk">🔒</span>' : '') + '</a>';
    }
    elTabs.innerHTML = out;
  }

  // ─── Lesson HTML fixups ─────────────────────────────
  // The stored files were authored to live in a course subfolder, so their
  // asset paths and inter-stage links assume that. learn.html sits at the
  // site root and routes by query string, so both need rewriting.
  // Cross-course folder links, e.g. a Disability Guide page pointing at
  // "Financial Literacy Course/stage-4-invest.html". These still appear in the
  // copies sitting in Supabase Storage until they're re-uploaded, so map them
  // here rather than relying on the files being refreshed first.
  var FOLDER_COURSE = [
    [/(?:\.\.\/)?Financial(?:%20| )Literacy(?:%20| )Course\/stage-(\d+)[a-z0-9%-]*\.html/gi, 'fl'],
    [/(?:\.\.\/)?TA(?:%20| )Course\/stage-(\d+)[a-z0-9%-]*\.html/gi, 'ta']
  ];

  // Cache-bust for lesson-embedded images.
  //
  // deploy-site.ps1 stamps ?v= onto every script and stylesheet in the site's
  // own HTML, but lesson HTML lives in Supabase Storage and its <img> tags are
  // bare — "assets/buttons/Invest.png". Image filenames never change, so once
  // Cloudflare and the visitor's browser have a copy, replacing the artwork
  // changes nothing on screen until someone purges the CDN and hard-refreshes.
  // That's how the rebuilt buttons kept rendering in their old broken form.
  //
  // Reading the version off our own <script src="learn.js?v=…"> tag means this
  // rides the existing deploy stamp: every deploy gives lesson images a URL
  // nobody has cached, with nothing to remember to bump.
  var ASSET_V = (function () {
    try {
      var s = document.querySelector('script[src*="learn.js"]');
      var m = s && /[?&]v=([^&"']+)/.exec(s.getAttribute('src') || '');
      return m && m[1] !== 'DEPLOYSTAMP' ? m[1] : '';
    } catch (e) { return ''; }
  })();

  function stampAssets(html) {
    if (!ASSET_V) return html;
    return html.replace(/(["'(])(assets\/[^"')?#]+\.(?:png|jpe?g|gif|svg|webp))(["')])/gi,
      function (m, pre, path, post) { return pre + path + '?v=' + ASSET_V + post; });
  }

  function rewrite(html) {
    var out = html
      .replace(/(["'(])\.\.\/assets\//g, '$1assets/')
      .replace(/(["'(])\.\.\/styles\.css/g, '$1styles.css');
    out = stampAssets(out);

    FOLDER_COURSE.forEach(function (pair) {
      out = out.replace(pair[0], function (m, num) {
        return href(pair[1], parseInt(num, 10));
      });
    });

    return rewriteStageLinks(out
      .replace(/(?:\.\.\/)?disability-wealth-guide\.html/gi, href('dwg', 1))
      .replace(/(["'(])\.\.\/([a-z0-9_-]+\.html)/gi, '$1$2'));
  }

  // Bare same-course stage links ("stage-3-rebuild.html"), left over from when
  // every stage was a sibling file. Those files no longer exist, so any that
  // survive are a 404.
  //
  // Applied to the lesson's SCRIPT as well as its HTML, because the biggest
  // offender isn't in the markup at all: addNextButtons() builds the "Next
  // Stage" card at runtime from a template literal containing
  // <a href="stage-3-rebuild.html">. That string lives inside a <script>, which
  // the Edge Function extracts separately, so rewriting only the HTML left the
  // most prominent button on the page pointing at a dead URL.
  //
  // Deliberately matches any quote/paren delimiter rather than href= only, so
  // it also catches onclick="location.href='stage-1-survive.html#tools'".
  // Trailing #fragments are preserved — #tools is a real anchor on the page.
  function rewriteStageLinks(text) {
    return text.replace(
      /(["'(])(?:\.\.\/)?stage-(\d+)[a-z0-9-]*\.html(#[a-z0-9_-]*)?(["')])/gi,
      function (m, open, num, frag, close) {
        return open + href(course, parseInt(num, 10)) + (frag || '') + close;
      }
    );
  }

  // The stored pages carry a paywall-hardening rule (.course-layout
  // {visibility:hidden}) meant for the old client-side gate. Inside the
  // viewer that rule would hide the very content the server just approved,
  // so strip it. Gating is the Edge Function's job now, not CSS's.
  function cleanStyles(css) {
    return rewrite(css)
      .replace(/\.course-layout\s*\{[^}]*visibility\s*:\s*hidden[^}]*\}/gi, '')
      .replace(/\.stage-content\s*\{[^}]*visibility\s*:\s*hidden[^}]*\}/gi, '');
  }

  function runLessonScript(code) {
    if (!code) return;
    try {
      // Deliberately not innerHTML — injected <script> never executes that way.
      var s = document.createElement('script');
      // The FULL rewrite, not just rewriteStageLinks().
      //
      // The lesson's URLs are not confined to its markup. Every stage page
      // declares its onward navigation as data in an inline script:
      //
      //   window.HFY_COURSE = { next: { href: "stage-2-stabilize.html",
      //                                 img:  "../assets/buttons/Stabilize.png" } }
      //
      // course-shell.js turns that into the Next Stage button. Rewriting only
      // the stage href left `img` pointing one directory above the site root,
      // so the button rendered as a broken image, and TA Stage 5's
      // "../technical-analysis.html" course-complete link 404'd. Running the
      // same rewrite the HTML gets fixes assets, cross-course folder links and
      // stage links in one pass — and rewrite() ends by calling
      // rewriteStageLinks(), so nothing that used to be handled is lost.
      s.textContent = rewrite(code);
      document.body.appendChild(s);
    } catch (e) {
      console.error('lesson script failed', e);
    }
  }

  // Last line of defence. Anything that still resolves to a stage-*.html file —
  // a link built after this script ran, an inline handler shape not matched
  // above — gets caught on the way out and redirected to the right lesson
  // instead of a 404. Costs one delegated listener.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var m = /(?:^|\/)stage-(\d+)[a-z0-9-]*\.html(#[a-z0-9_-]*)?$/i.exec(a.getAttribute('href') || '');
    if (!m) return;
    e.preventDefault();
    console.warn('learn.js: caught a legacy stage link →', a.getAttribute('href'));
    window.location.href = href(course, parseInt(m[1], 10)) + (m[2] || '');
  }, true);

  // Boot the shared course shell against the lesson we just injected.
  //
  // course-shell.js owns everything that turns lesson markup into a course:
  // revealing the opening module, the sidebar's done-ticks, the "Next Module"
  // button at the foot of each module, the "Next Stage" card at the end, and
  // the HFY.restoreStage() call that replays saved progress and arms rewards.js.
  //
  // A directly-served stage page gets all of that for free, because it carries
  // <script src="../course-shell.js"> and runs it on DOMContentLoaded. The
  // viewer gets neither half: the Edge Function strips <script src> tags out of
  // the stored lesson, and DOM ready fired long before this fetch returned. So
  // every course reachable only through learn.html lost its navigation and its
  // wins the moment that logic moved out of the stage files and into
  // course-shell.js — while stage-1-survive.html and disability-wealth-guide.html,
  // which are still real pages at the site root, kept working. That asymmetry
  // is the whole bug.
  //
  // Called AFTER runLessonScript() so window.HFY_COURSE (set by the lesson's
  // own inline script) is populated, and so onReady can reach the calculator
  // functions that script defines.
  function bootCourseShell() {
    try {
      if (window.HFY_COURSE_SHELL && typeof window.HFY_COURSE_SHELL.init === 'function') {
        window.HFY_COURSE_SHELL.init();
      } else {
        console.error('learn.js: course-shell.js did not load — module navigation is unavailable');
      }
    } catch (e) {
      console.error('course shell init failed', e);
    }
  }

  // Belt and braces behind bootCourseShell(). If the lesson's inline script
  // throws before it finishes, HFY_COURSE may be missing or malformed and the
  // shell can come up with nothing revealed — a blank pane beside a working
  // sidebar, which is how this failed quietly before. If the lesson defines
  // modules and none ended up visible, show the first one.
  function ensureModuleVisible() {
    try {
      var modules = elLesson.querySelectorAll('.course-main .module, .module');
      if (!modules.length) return;
      for (var i = 0; i < modules.length; i++) {
        if (modules[i].classList.contains('cs-visible')) return;
      }
      modules[0].classList.add('cs-visible');
      var first = modules[0].id &&
        elLesson.querySelector('.cs-item[data-cs="' + modules[0].id + '"]');
      if (first) first.classList.add('cs-active');
      console.warn('learn.js: no module was visible after the lesson script ran — revealed the first one');
    } catch (e) {
      console.error('ensureModuleVisible failed', e);
    }
  }

  // Appended under a lesson that a signed-out visitor just read for free.
  // This is the only place the free stage asks for anything: they've already
  // got the whole lesson, so the pitch is "keep going", not "pay a toll".
  // End-of-stage signup prompt for signed-out readers.
  //
  // This fires on the LAST anonymously-readable stage only, not after every
  // free one. With Financial Literacy open through Stage 3, prompting at the
  // end of 1 and 2 would be asking for an account the reader doesn't need
  // yet — three interruptions for a gate that only exists once, on a course
  // advertised as free. Asking at the end of Stage 3, where the next click
  // genuinely requires an account, is both honest and better timed: the
  // reader has finished three stages and is invested.
  function renderNextStepPrompt(data) {
    if (signedIn) return;

    var total = num(data.stage_count) || 1;
    var anon = num(data.anon_stages);
    if (stage >= total) return;   // nothing after the final stage
    if (stage !== anon) return;   // only on the LAST anonymously-open stage.
                                  // anon = 0 means a signed-out reader never
                                  // reaches a lesson at all, so this never
                                  // fires for the paid courses.

    var remaining = total - stage;
    var back = encodeURIComponent(window.location.href);
    var box = document.createElement('div');
    box.className = 'hfy-learn-card';
    box.style.cssText = 'max-width:560px;margin:40px auto 0;text-align:center';
    box.innerHTML =
      '<h3>That\'s Stage ' + stage + ' done.</h3>' +
      '<p>You\'ve read ' + (stage > 1 ? 'the first ' + stage + ' stages' : 'Stage 1') +
      ' without an account. Stage ' + (stage + 1) +
      (remaining > 1 ? '–' + total : '') + ' need' + (remaining > 1 ? '' : 's') +
      ' a free one — it takes about twenty seconds, costs nothing, and saves your ' +
      'progress across the rest of ' + (data.course_name || 'the course') + '.</p>' +
      '<a class="btn-a" href="signup.html?redirect=' + back +
      '" style="width:100%;justify-content:center">Create Free Account</a>' +
      '<div class="hfy-learn-alt">Already have one? <a href="login.html?redirect=' + back +
      '">Sign in</a></div>';
    elLesson.appendChild(box);
  }

  function renderLesson(data) {
    elState.style.display = 'none';
    elState.innerHTML = '';
    if (data.styles) elStyles.innerHTML = cleanStyles(data.styles);
    elLesson.innerHTML = rewrite(data.html || '');
    document.title = data.title
      ? data.title + ' — ' + data.course_name + " | Hustlin'"
      : data.course_name + " | Hustlin'";
    renderTabs(data);
    runLessonScript(data.script);
    bootCourseShell();
    ensureModuleVisible();
    renderNextStepPrompt(data);
    window.scrollTo(0, 0);
  }

  function renderSignIn(data) {
    var back = encodeURIComponent(window.location.href);
    var name = (data && data.course_name) || 'this course';
    var anon = (data && data.anon_stages) || 0;

    // If this course has stages open to everyone, point the visitor at them
    // rather than making the sign-up wall the only thing on the page.
    var alt = anon > 0
      ? '<div class="hfy-learn-alt">Not ready? <a href="' + href(course, anon) +
        '">Read Stage ' + anon + ' free, no account →</a></div>'
      : '';

    card(
      '<h3>Create a free account to continue</h3>' +
      '<p>Stage ' + (data && data.stage ? data.stage : stage) + ' of ' + name +
      ' is for Hustlin\' members. Signing up takes about twenty seconds, costs nothing, ' +
      'and saves your progress.</p>' +
      '<a class="btn-a" href="signup.html?redirect=' + back + '" style="width:100%;justify-content:center">Create Free Account</a>' +
      '<div class="hfy-learn-alt">Already have one? <a href="login.html?redirect=' + back + '">Sign in</a></div>' +
      alt
    );
    renderTabs(data);
  }

  function renderPaywall(data) {
    var price = ((data.price_cents || 0) / 100).toFixed(2);

    // Only mention a free stage if the course actually has one. Technical
    // Analysis has free_stages = 0, so the old hardcoded "Stage 1 stays free
    // either way" line and the "back to free Stage 1" link were both offering
    // something that now answers 402.
    var free = Math.max(num(data.free_stages), num(data.anon_stages));
    var freeNote = free > 0
      ? ' Stage' + (free > 1 ? 's 1–' + free + ' stay' : ' 1 stays') + ' free either way.'
      : '';
    var altLink = free > 0
      ? '<div class="hfy-learn-alt"><a href="' + href(course, 1) + '">← Back to free Stage 1</a></div>'
      : '<div class="hfy-learn-alt"><a href="financial-literacy.html">Not ready? Start the free Financial Literacy course →</a></div>';

    card(
      '<div class="hfy-learn-price">$' + price + '</div>' +
      '<h3>Unlock ' + data.course_name + '</h3>' +
      '<p>One-time payment, lifetime access to all ' + data.stage_count + ' stages.' + freeNote + '</p>' +
      '<button class="btn-a" id="hfy-buy" style="width:100%;justify-content:center">Buy Now</button>' +
      '<div class="hfy-learn-err" id="hfy-buy-err"></div>' +
      altLink
    );
    var btn = document.getElementById('hfy-buy');
    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = 'Redirecting to checkout…';
      var err = document.getElementById('hfy-buy-err');
      window.HFY.access.startCheckout(course)['catch'](function (e) {
        console.error(e);
        err.textContent = e.message || 'Could not start checkout. Please try again.';
        err.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Buy Now';
      });
    });
    renderTabs(data);
  }

  function renderError(msg) {
    card(
      '<h3>Couldn\'t load this lesson</h3>' +
      '<p>' + (msg || 'Something went wrong on our end.') + '</p>' +
      '<button class="btn-a" onclick="location.reload()" style="width:100%;justify-content:center">Try Again</button>' +
      '<div class="hfy-learn-alt"><a href="index.html">Back to Hustlin\'</a></div>'
    );
  }

  async function load() {
    try {
      var session = await window.HFY.auth.getSession();
      signedIn = !!session;
      var res = await fetch(FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': window.HFY_CONFIG.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' +
            (session ? session.access_token : window.HFY_CONFIG.SUPABASE_ANON_KEY)
        },
        body: JSON.stringify({ course: course, stage: stage })
      });

      var data = await res.json().catch(function () { return {}; });
      renderNav(data);

      if (res.status === 401 || data.error === 'auth_required') return renderSignIn(data);
      if (res.status === 402 || data.error === 'payment_required') return renderPaywall(data);
      if (res.status === 404) return renderError('That course or stage doesn\'t exist.');
      if (!res.ok || !data.html) return renderError();

      renderLesson(data);
    } catch (e) {
      console.error('learn.js load failed', e);
      renderError('Check your connection and try again.');
    }
  }

  if (!window.HFY || !window.HFY.auth || !window.HFY.access) {
    renderError('The page didn\'t load correctly. Please refresh.');
  } else {
    load();
  }
})();
