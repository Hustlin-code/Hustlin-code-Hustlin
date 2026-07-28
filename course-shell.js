/**
 * =============================================================================
 *  course-shell.js — module navigation for every course stage page.
 * =============================================================================
 *
 *  WHAT THIS REPLACES
 *  ------------------
 *  selectModule / syncSidebar / addNextButtons / goToNextModule used to be
 *  copy-pasted into all 12 stage pages. They had already drifted into two
 *  dialects: the Financial Literacy pages tracked completion via .act-box OR
 *  .ms-row, the Technical Analysis pages only via .act-box. A fix applied to
 *  one dialect silently skipped the other half of the site.
 *
 *  The two are unified here on the Financial Literacy behaviour, which is a
 *  strict superset: it checks .act-box first and only falls back to .ms-row
 *  when a module has no .act-box at all. On a TA page (no .ms-row anywhere)
 *  the fallback evaluates to "not done" — identical to the old TA logic. So
 *  unifying changes nothing on TA pages and preserves the FL behaviour.
 *
 *  HOW A PAGE USES IT
 *  ------------------
 *  Set window.HFY_COURSE before loading this file, then load it:
 *
 *      <script>
 *        window.HFY_COURSE = {
 *          stage: 'stage2',            // HFY.restoreStage() key
 *          gate:  'stage2',            // HFY.isUnlocked() key; omit if free
 *          next: {                     // shown after the final module
 *            href: 'stage-3-rebuild.html',
 *            img:  '../assets/buttons/Rebuild.png',
 *            alt:  'Stage 3: Rebuild'
 *          },
 *          onReady: function () { calcTimeline(); }   // page-specific setup
 *        };
 *      </script>
 *      <script src="../course-shell.js"></script>
 *
 *  CONFIG REFERENCE
 *  ----------------
 *    stage     string  Progress key passed to HFY.restoreStage(). Omit to skip.
 *    gate      string  Unlock key for HFY.isUnlocked(). When set, the page
 *                      shows #lockedGate and hides #stageContent for users who
 *                      have not paid, and none of the init below runs.
 *    first     string  Module id opened on load. Default 'm1'.
 *    doneText  string  Message above the final-module CTA. Has a sane default.
 *    next      object  Final-module call to action, one of:
 *                        {href, img, alt}  → image "Next Stage" button
 *                        {href, label, title} → text button
 *                        {html: '...'}     → raw markup, escape hatch
 *                      Omit entirely for "last module, no CTA".
 *    onReady   fn      Runs after modules are wired. Put page-specific
 *                      calculator bootstrapping here.
 *
 *  Init is deferred to DOMContentLoaded so onReady can safely call functions
 *  defined in inline <script> blocks further down the page.
 *
 *  TWO WAYS IN
 *  -----------
 *  1. A directly-served stage page (stage-1-survive.html, disability-wealth-
 *     guide.html): the page sets HFY_COURSE, loads this file, and init() runs
 *     itself on DOMContentLoaded. Unchanged.
 *
 *  2. learn.html, the gated viewer: the lesson arrives from the course-content
 *     Edge Function LONG after DOMContentLoaded, and that function strips every
 *     <script src=...> tag — so this file is never carried in with the lesson
 *     and DOMContentLoaded has already fired by the time the modules exist.
 *     The viewer therefore loads this file up front and calls
 *     HFY_COURSE_SHELL.init() itself once the lesson is in the DOM.
 *
 *  This is what broke every course except the two that are still served as real
 *  pages: the viewer got the lesson markup but none of the behaviour that turns
 *  it into a course — no restoreStage (so no progress and no rewards), no
 *  visible first module, no Next Module buttons, no Next Stage CTA.
 *
 *  Two consequences for the code below:
 *    - CFG must be read INSIDE init(), not at IIFE time. In the viewer the
 *      lesson's inline script sets window.HFY_COURSE after this file has
 *      already been parsed, so a module-level snapshot is always {}.
 *    - init() must be idempotent and safe to call more than once, since the
 *      viewer may re-run it after a late progress sync.
 * =============================================================================
 */
(function () {
  'use strict';

  // Read at call time, never cached at parse time — see header.
  function cfg() { return window.HFY_COURSE || {}; }

  // True on learn.html, where the server has already decided access and the
  // lesson is injected asynchronously. Checked by filename AND by the presence
  // of the viewer's lesson mount point, so a clean-URL or index-style rewrite
  // of learn.html can't quietly turn the auto-init back on and race the fetch.
  var IN_VIEWER = /(^|\/)learn(\.html)?$/i.test(window.location.pathname) ||
                  !!document.getElementById('hfy-lesson');

  /* ------------------------------------------------------------ navigation */

  /**
   * Show one module, hide the rest, mirror the state into the sidebar, and
   * scroll the newly visible module to the top of the viewport.
   *
   * The scroll runs on EVERY call, not just on "Next Module" clicks. Sidebar
   * clicks — including jumping ahead to a module you have not reached yet —
   * swap visibility the same way, and without this the viewport stays where it
   * was for the previous (now hidden) module, leaving the reader on blank
   * space. The double requestAnimationFrame waits for the display swap to
   * finish laying out before measuring where to scroll.
   */
  function selectModule(id) {
    document.querySelectorAll('.course-main .module').forEach(function (m) {
      m.classList.toggle('cs-visible', m.id === id);
    });
    document.querySelectorAll('.cs-item').forEach(function (item) {
      item.classList.toggle('cs-active', item.getAttribute('data-cs') === id);
    });
    syncSidebar();

    var mod = document.getElementById(id);
    if (mod) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          mod.scrollIntoView({ behavior: 'auto', block: 'start' });
        });
      });
    }
  }

  /**
   * Mark a sidebar entry done when every activity in its module is done.
   * Modules score completion by .act-box; modules that have none fall back to
   * .ms-row. A module with neither is never "done", which is correct — there
   * is nothing in it to complete.
   */
  function syncSidebar() {
    document.querySelectorAll('.cs-item').forEach(function (item) {
      var mod = document.getElementById(item.getAttribute('data-cs'));
      if (!mod) return;

      var boxes = Array.from(mod.querySelectorAll('.act-box'));
      var allDone;
      if (boxes.length > 0) {
        allDone = boxes.every(function (b) { return b.classList.contains('done'); });
      } else {
        var rows = Array.from(mod.querySelectorAll('.ms-row'));
        allDone = rows.length > 0 && rows.every(function (r) { return r.classList.contains('done'); });
      }
      item.classList.toggle('cs-done', allDone);
    });
  }

  function goToNextModule(currentId) {
    var ids = moduleIds();
    var idx = ids.indexOf(currentId);
    if (idx === -1 || idx === ids.length - 1) return;
    selectModule(ids[idx + 1]);   // handles visibility swap + scroll together
  }

  function moduleIds() {
    return Array.from(document.querySelectorAll('.cs-item')).map(function (i) {
      return i.getAttribute('data-cs');
    });
  }

  /* -------------------------------------------------------- final-module CTA */

  /** Build the markup that closes out the last module of a stage. */
  function finalCta() {
    var CFG = cfg();
    var done = CFG.doneText || "That's the last module in this stage. Nice work.";
    var head = '<div class="next-mod-done">🎉 ' + done + '</div>';
    var next = CFG.next;

    if (!next) return head;
    if (next.html) return head + next.html;

    if (next.img) {
      return head +
        '\n        <a href="' + next.href + '" class="next-stage-btn-img">' +
        '\n          <span class="next-stage-btn-img-label">' + (next.label || 'Next Stage') + '</span>' +
        '\n          <img src="' + next.img + '" alt="' + (next.alt || '') + '">' +
        '\n        </a>';
    }
    // `alt` is the last fallback for the title. The Fundamental Analysis and
    // Trading Psychology pages were generated with {href, alt} and no image,
    // which lands here — without this they rendered a bare "Next" with an empty
    // title, so the reader got an unlabelled button at the end of every stage.
    return head +
      '\n        <a href="' + next.href + '" class="next-stage-btn">' +
      '\n          <span><span class="next-stage-btn-label">' + (next.label || 'Next Stage') + '</span>' +
      '<span class="next-stage-btn-title">' + (next.title || next.alt || '') + '</span></span>' +
      '<span class="next-stage-btn-arrow">→</span>' +
      '\n        </a>';
  }

  /**
   * Inject a "Next Module" button at the end of each module body, and the
   * stage-closing CTA at the end of the last one. Injected rather than written
   * into the HTML so adding or reordering a module needs no button edits.
   */
  function addNextButtons() {
    var ids = moduleIds();
    ids.forEach(function (id, idx) {
      var mod = document.getElementById(id);
      if (!mod) return;
      var body = mod.querySelector('.mod-body');
      if (!body || body.querySelector('.next-mod-wrap')) return;   // already built

      var wrap = document.createElement('div');
      wrap.className = 'next-mod-wrap';

      if (idx === ids.length - 1) {
        wrap.innerHTML = finalCta();
      } else {
        var nextTxt = document.querySelector('.cs-item[data-cs="' + ids[idx + 1] + '"] .cs-txt');
        var nextTitle = nextTxt ? nextTxt.textContent.trim() : 'Next Module';
        var btn = document.createElement('button');
        btn.className = 'next-mod-btn';
        btn.innerHTML = '<span><span class="next-mod-btn-label">Next Module</span>' +
                        '<span class="next-mod-btn-title">' + nextTitle + '</span></span>' +
                        '<span class="next-mod-btn-arrow">→</span>';
        btn.onclick = function () { goToNextModule(id); };
        wrap.appendChild(btn);
      }
      body.appendChild(wrap);
    });
  }

  /* -------------------------------------------------------------------- init */

  var observing = false;

  function init() {
    var CFG = cfg();

    // Legacy client-side gate. Only meaningful on a directly-served stage page.
    //
    // Inside the viewer the course-content Edge Function has already made the
    // real access decision server-side — if we're rendering a lesson at all,
    // this reader is entitled to it. Honouring `gate` here would let a stale
    // localStorage progress value hide content the server just approved, so
    // the viewer skips it entirely. (HFY.isUnlocked currently returns true
    // unconditionally anyway; this keeps that from silently mattering again if
    // FORCE_UNLOCK_ALL is ever turned off.)
    if (CFG.gate && !IN_VIEWER) {
      var gate = document.getElementById('lockedGate');
      var content = document.getElementById('stageContent');
      var unlocked = window.HFY && HFY.isUnlocked ? HFY.isUnlocked(CFG.gate) : true;

      if (gate) gate.style.display = unlocked ? 'none' : 'flex';
      if (content) content.style.display = unlocked ? '' : 'none';
      if (!unlocked) return;
    }

    // Restores ticked boxes and milestones, and emits the 'restored'
    // completion event that rewards.js listens for. This is the single line
    // whose absence took the wins system down inside the viewer.
    if (CFG.stage && window.HFY && HFY.restoreStage) HFY.restoreStage(CFG.stage);

    // Reveal the opening module — unless a module is already showing, which is
    // the case when init() runs a second time after a progress sync.
    if (!document.querySelector('.module.cs-visible')) {
      var first = document.getElementById(CFG.first || 'm1') ||
                  document.querySelector('.course-main .module') ||
                  document.querySelector('.module');
      if (first) first.classList.add('cs-visible');
    }

    syncSidebar();
    addNextButtons();   // idempotent: skips any .mod-body already carrying a wrap

    // Keep the sidebar honest when activity boxes are ticked anywhere on the
    // page — those toggle a class rather than firing an event we could listen
    // for directly. Guarded so repeat init() calls don't stack observers.
    if (!observing) {
      observing = true;
      new MutationObserver(function () { syncSidebar(); })
        .observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
    }

    if (typeof CFG.onReady === 'function') {
      try { CFG.onReady(); }
      catch (e) { console.error('HFY_COURSE.onReady failed', e); }
    }
  }

  /* Exposed globally: inline onclick="selectModule('m3')" attributes in the
     stage HTML call these by name, so they must stay on window. */
  window.selectModule = selectModule;
  window.syncSidebar = syncSidebar;
  window.goToNextModule = goToNextModule;
  window.addNextButtons = addNextButtons;

  /* The viewer's entry point. learn.js calls this once the lesson markup and
     the lesson's own inline script are both in the document. */
  window.HFY_COURSE_SHELL = { init: init, selectModule: selectModule };

  // On learn.html there is nothing to initialise at DOM ready — the lesson
  // hasn't been fetched yet, and HFY_COURSE doesn't exist. Wait to be called.
  if (IN_VIEWER) return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
