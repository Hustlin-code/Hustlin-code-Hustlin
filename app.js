/* ─────────────────────────────────────────────────────────
   © 2026 Hustlin' For You · hustlin.org · All rights reserved.
   Proprietary source code — unauthorized copying, reproduction,
   or redistribution of this file, in whole or in part, is
   prohibited without prior written permission.
   ─────────────────────────────────────────────────────────
   Hustlin' — shared app logic
   Handles:
   - cross-page progress (localStorage) that unlocks stages
   - shared checkbox / milestone tracking
   - shared tool-data persistence helpers
   - shared nav/lock rendering
   - logo swap (badge → script logo image on all pages)
   - Google AdSense injection
   ───────────────────────────────────────────────────────── */
window.HFY = (function(){

  const PROGRESS_KEY = 'hfy_progress_v2';
  // Each course (Financial Literacy, Technical Analysis, ...) has its own stage
  // list. Keys are namespaced per course (stage1.. / ta1..) so progress never
  // collides between courses, but they share one progress/nav engine below.
  const FL_STAGES = ['stage1','stage2','stage3','stage4','stage5'];
  const TA_STAGES = ['ta1','ta2','ta3','ta4','ta5'];
  const FA_STAGES = ['fa1','fa2','fa3','fa4','fa5'];
  const PS_STAGES = ['ps1','ps2','ps3','ps4','ps5'];
  // The Disability Wealth Guide is a single-stage course, but it still needs a
  // key here. Without one its HFY_COURSE carried no `stage`, so restoreStage()
  // was never called for it — ticked boxes never came back and no win ever
  // fired. It read as "working" only because its navigation is self-contained.
  const DWG_STAGES = ['dwg1'];
  const EC_STAGES = ['ec1','ec2','ec3','ec4','ec5'];
  const STAGES = FL_STAGES.concat(TA_STAGES, FA_STAGES, PS_STAGES, EC_STAGES, DWG_STAGES);
  const COURSE_STAGE_LISTS = { fl: FL_STAGES, ta: TA_STAGES, fund: FA_STAGES, psych: PS_STAGES, econ: EC_STAGES, dwg: DWG_STAGES };
  const STAGE_META = {
    stage1: { num:1, name:'Survive',      file:'stage-1-survive.html',   course:'fl' },
    stage2: { num:2, name:'Stabilize',    file:'stage-2-stabilize.html', course:'fl' },
    stage3: { num:3, name:'Rebuild',      file:'stage-3-rebuild.html',   course:'fl' },
    stage4: { num:4, name:'Invest',       file:'stage-4-invest.html',    course:'fl' },
    stage5: { num:5, name:'Build Wealth', file:'stage-5-wealth.html',    course:'fl' },
    ta1: { num:1, name:'Chart Basics',        file:'stage-1-chart-basics.html',     course:'ta' },
    ta2: { num:2, name:'Trend & Volume',      file:'stage-2-trend-volume.html',     course:'ta' },
    ta3: { num:3, name:'Chart Patterns',      file:'stage-3-chart-patterns.html',   course:'ta' },
    ta4: { num:4, name:'Indicators & Signals',file:'stage-4-indicators-signals.html', course:'ta' },
    ta5: { num:5, name:'Advanced Methods',    file:'stage-5-advanced-methods.html', course:'ta' },
    fa1: { num:1, name:'Foundations',              file:'stage-1-foundations.html',                course:'fund' },
    fa2: { num:2, name:'The Income Statement',     file:'stage-2-income-statement.html',           course:'fund' },
    fa3: { num:3, name:'Balance Sheet & Cash Flow',file:'stage-3-balance-sheet-cash-flow.html',    course:'fund' },
    fa4: { num:4, name:'Valuation',                file:'stage-4-valuation.html',                  course:'fund' },
    fa5: { num:5, name:'Moats, Management & Process', file:'stage-5-moats-management-process.html',course:'fund' },
    ps1: { num:1, name:'The Inner Game',           file:'stage-1-the-inner-game.html',             course:'psych' },
    ps2: { num:2, name:'Bias & Belief',            file:'stage-2-bias-and-belief.html',            course:'psych' },
    ps3: { num:3, name:'Risk & Loss',              file:'stage-3-risk-and-loss.html',              course:'psych' },
    ps4: { num:4, name:'Emotion Under Fire',       file:'stage-4-emotion-under-fire.html',         course:'psych' },
    ps5: { num:5, name:'The Repeatable Process',   file:'stage-5-the-repeatable-process.html',     course:'psych' },
    ec1: { num:1, name:'Economics 101',                file:'stage-1-economics-101.html',              course:'econ' },
    ec2: { num:2, name:'Inflation',                    file:'stage-2-inflation.html',                  course:'econ' },
    ec3: { num:3, name:'Rates, Central Banks & Bonds', file:'stage-3-rates-central-banks-bonds.html',  course:'econ' },
    ec4: { num:4, name:'Indicators & the Global Economy', file:'stage-4-indicators-global.html',       course:'econ' },
    ec5: { num:5, name:'Sectors & Strategy',           file:'stage-5-sectors-strategy.html',           course:'econ' },
    dwg1:{ num:1, name:'Disability Wealth Guide',  file:'disability-wealth-guide.html',            course:'dwg' }
  };

  let currentStage = null;

  // ─── PATH HELPERS ───────────────────────────
  // Every course's stage-*.html files live in their own subfolder ("Financial
  // Literacy Course/", "TA Course/"), while app.js and everything else lives
  // at the site root. Since this same app.js is loaded from every level, hrefs
  // to stage pages / the homepage / assets need to be built relative to
  // whichever level (and course folder) the current page is on.
  // Stage pages no longer exist as files on the site. Lesson content lives in
  // a private Supabase Storage bucket and is served by the course-content Edge
  // Function through learn.html, which routes by query string. So every stage
  // link is now learn.html?course=<key>&stage=<n>.
  //
  // The old per-course-folder path juggling is gone with them; the only depth
  // that still matters is whether the current page sits in a subfolder
  // (Markets/) or at the site root.
  // Matched against a known folder name rather than counting path segments,
  // because counting breaks the moment the site is served from a subdirectory
  // (e.g. Live Server at /Hustlin-main/index.html) and would prepend '../' on
  // every root page.
  const inSubfolder = /\/Markets\//i.test(window.location.pathname);
  const UP = inSubfolder ? '../' : '';

  function stageHref(key){
    const meta = STAGE_META[key];
    return UP + 'learn.html?course=' + meta.course + '&stage=' + meta.num;
  }
  function homeHref(path){
    return UP + (path || 'index.html');
  }
  function assetHref(path){
    return UP + path;
  }

  // ─── PROGRESS: LOAD / SAVE ─────────────────
  function loadProgress(){
    let p;
    try{
      const raw = localStorage.getItem(PROGRESS_KEY);
      p = raw ? JSON.parse(raw) : {};
    }catch(e){ p = {}; }
    STAGES.forEach(s=>{ if(!p[s]) p[s] = { checks:{}, milestones:{}, pct:0 }; });
    return p;
  }
  function saveProgress(){ try{ localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); }catch(e){} }
  let progress = loadProgress();

  function getPct(stageKey){ return (progress[stageKey] && progress[stageKey].pct) || 0; }
  // ✅ ALL STAGES UNLOCKED: gating disabled
  const FORCE_UNLOCK_ALL = true;

  function isUnlocked(stageKey){
    if(FORCE_UNLOCK_ALL) return true;
    const list = COURSE_STAGE_LISTS[STAGE_META[stageKey].course];
    const idx = list.indexOf(stageKey);
    if(idx <= 0) return true;
    return getPct(list[idx-1]) >= 100;
  }

  // ─── CHECKBOX HELPERS ───────────────────────
  function isRealCheckbox(el){
    return !(el.hasAttribute('style') && el.getAttribute('style').indexOf('pointer-events') !== -1);
  }
  function checkboxKey(el){
    const mod = el.closest('.module');
    const modId = mod ? mod.id : 'global';
    const siblings = Array.from(mod ? mod.querySelectorAll('.act-box') : document.querySelectorAll('.act-box')).filter(isRealCheckbox);
    return modId + '-' + siblings.indexOf(el);
  }
  function computePct(){
    const boxes = Array.from(document.querySelectorAll('.act-box')).filter(isRealCheckbox);
    if(!boxes.length) return 0;
    const done = boxes.filter(b=>b.classList.contains('done')).length;
    return Math.round((done/boxes.length)*100);
  }

  // ─── COMPLETION DETECTION ───────────────────
  // Every action step in a lesson calls HFY.check(), so this is the one place
  // that sees progress happen. Detecting completion here means the reward
  // system needs no changes to any lesson file — those live in Supabase
  // Storage and would each need re-uploading.
  //
  // A module counts as complete when every real action step inside it is
  // ticked. Modules with no action steps can't be completed this way; they're
  // marked done when the reader advances past them (see markModuleSeen).
  function moduleBoxes(mod){
    return Array.from(mod.querySelectorAll('.act-box')).filter(isRealCheckbox);
  }
  function isModuleComplete(mod){
    const boxes = moduleBoxes(mod);
    return boxes.length > 0 && boxes.every(b => b.classList.contains('done'));
  }

  // Listeners registered by rewards.js. Kept as a plain array so app.js has no
  // dependency on it — if rewards.js never loads, this is simply inert.
  const completionListeners = [];
  function onCompletion(fn){ if(typeof fn === 'function') completionListeners.push(fn); }
  function emitCompletion(evt){
    completionListeners.forEach(fn => {
      try { fn(evt); } catch(e){ console.error('completion listener failed', e); }
    });
  }

  function check(el){
    el.classList.toggle('done');
    el.textContent = el.classList.contains('done') ? '✓' : '';

    const mod = el.closest('.module');
    const wasComplete = mod ? mod.dataset.hfyComplete === '1' : false;

    if(currentStage){
      progress[currentStage].checks[checkboxKey(el)] = el.classList.contains('done');
      saveProgress();
    }
    updateProgRing();

    if(mod){
      const nowComplete = isModuleComplete(mod);
      mod.dataset.hfyComplete = nowComplete ? '1' : '0';
      // Only announce the transition into completeness, and only forwards —
      // unticking a box must not fire a second celebration when it's re-ticked
      // is handled by the achievement store, which records each win once.
      if(nowComplete && !wasComplete){
        emitCompletion({
          type: 'module',
          stageKey: currentStage,
          moduleId: mod.id,
          title: moduleTitle(mod),
          stagePct: getPct(currentStage)
        });
      }
    }

    // A stage is done when every action step across every module is ticked.
    if(currentStage && getPct(currentStage) >= 100 && !stageAnnounced){
      stageAnnounced = true;
      const meta = STAGE_META[currentStage] || {};
      emitCompletion({
        type: 'stage',
        stageKey: currentStage,
        course: meta.course,
        stageNum: meta.num,
        title: meta.name,
        courseComplete: isCourseComplete(meta.course)
      });
    }
  }

  let stageAnnounced = false;

  function moduleTitle(mod){
    const item = document.querySelector('.cs-item[data-cs="' + mod.id + '"] .cs-txt');
    if(item) return item.textContent.trim();
    const h = mod.querySelector('h2, h3, .mod-title');
    return h ? h.textContent.trim() : 'Module';
  }

  function isCourseComplete(courseKey){
    const list = COURSE_STAGE_LISTS[courseKey];
    return !!list && list.every(k => getPct(k) >= 100);
  }

  function toggleMs(row){
    row.classList.toggle('done');
    const box = row.querySelector('.ms-box');
    if(box) box.textContent = row.classList.contains('done') ? '✓' : '';
    const idx = Array.from(document.querySelectorAll('#milestone-list .ms-row')).indexOf(row);
    if(currentStage){
      progress[currentStage].milestones[idx] = row.classList.contains('done');
      saveProgress();
    }
    updateMilestones();
  }
  function updateMilestones(){
    const rows = document.querySelectorAll('#milestone-list .ms-row');
    if(!rows.length) return;
    const total = rows.length;
    const done = document.querySelectorAll('#milestone-list .ms-row.done').length;
    const pct = Math.round((done/total)*100);
    const fill = document.getElementById('ms-prog-fill');
    const lbl = document.getElementById('ms-pct-lbl');
    if(fill) fill.style.width = pct+'%';
    if(lbl) lbl.textContent = done+' / '+total+' milestones';
  }

  // ─── PROGRESS RING + STAGE-COMPLETE BANNER ──
  function updateProgRing(){
    const pct = computePct();
    /* stageSlot, not progress[currentStage] — see the note on restoreStage.
       updateProgRing is also reachable from check()/toggleMs() on a page
       whose key was never seeded, so the guard belongs here too. */
    if(currentStage){ stageSlot(currentStage).pct = pct; saveProgress(); }
    const circ = 207.3;
    const circle = document.getElementById('progCircle');
    const txt = document.getElementById('progTxt');
    if(circle) circle.style.strokeDashoffset = circ - (pct/100)*circ;
    if(txt) txt.textContent = pct+'%';
    updateStickyProgress(pct);
    renderStageComplete(pct);
    renderNav();
  }

  /* ─── STICKY PROGRESS BAR ────────────────────────────────────────────────
     The ring above lives in the hero, and the hero scrolls away about four
     seconds into a stage that takes forty-five minutes to read. From then on
     a reader has no idea how far in they are or how much is left — and people
     abandon what they cannot measure. This is the same number, pinned.

     It reads pct from the ring's own calculation rather than recomputing, so
     there is exactly one definition of "done" on the page. Module N of M comes
     from the DOM, so nothing has to be maintained per stage: add a module and
     the denominator moves on its own.

     IT SHOWS A COUNT, NOT A TIME ESTIMATE, AND THAT IS DELIBERATE.
     The first version said "about 12 min left", computed at 220 words per
     minute. That number is an assumption about a reader we do not know, on a
     site read by people on a phone after a double shift, people reading in a
     second language, and people who read slowly and have been made to feel bad
     about it their whole lives. Tell that reader twelve minutes, take them
     thirty, and you have confirmed something they already believed about
     themselves — on a site whose entire pitch is that it does not tell you
     comfortable things that are not true.

     "7 modules left" is a fact. It needs no assumption about anyone, it is
     right for every reader, and it still answers the question the bar exists
     to answer: how much of this is left. Do not put a wpm estimate back.
     ─────────────────────────────────────────────────────────────────────── */
  var stickyEl = null, stickyMods = null;

  function buildSticky(){
    if(stickyEl || !document.querySelector('.module')) return;
    var bar = document.createElement('div');
    bar.className = 'stg-bar';
    bar.setAttribute('role','status');
    bar.setAttribute('aria-live','polite');
    bar.innerHTML =
      '<div class="stg-bar-track"><div class="stg-bar-fill" id="stgFill"></div></div>' +
      '<div class="stg-bar-row">' +
        '<span id="stgWhere"></span>' +
        '<span id="stgLeft"></span>' +
      '</div>';
    document.body.appendChild(bar);
    stickyEl = bar;
    stickyMods = Array.prototype.slice.call(document.querySelectorAll('.module'));
    window.addEventListener('scroll', positionSticky, { passive:true });
    positionSticky();
  }

  function positionSticky(){
    if(!stickyEl || !stickyMods.length) return;
    /* .stage-banner is the block that carries the h1 and the progress ring on
       the five FL stage pages — it is the thing scrolling away that this bar
       replaces. The other two are there so the bar also works if it is ever
       dropped on a page using the site's generic hero. The scrollY fallback
       only fires if none of them is present. */
    var hero = document.querySelector('.stage-banner, .stage-hero, .hero');
    var past = hero ? (hero.getBoundingClientRect().bottom < 0) : (window.scrollY > 320);
    stickyEl.classList.toggle('is-on', past);
    if(!past) return;

    var i = 0;
    for(var n = 0; n < stickyMods.length; n++){
      if(stickyMods[n].getBoundingClientRect().top < 140) i = n;
    }
    var where = document.getElementById('stgWhere');
    var left  = document.getElementById('stgLeft');
    if(where) where.textContent = 'Module ' + (i+1) + ' of ' + stickyMods.length;
    if(left){
      var rest = stickyMods.length - (i+1);
      left.textContent = rest === 0 ? 'last one'
                       : rest === 1 ? '1 module left'
                       : rest + ' modules left';
    }
  }

  function updateStickyProgress(pct){
    buildSticky();
    var fill = document.getElementById('stgFill');
    if(fill) fill.style.width = pct + '%';
    positionSticky();
  }
  function renderStageComplete(pct){
    const banner = document.getElementById('stageCompleteBanner');
    if(!banner || !currentStage) return;
    const list = COURSE_STAGE_LISTS[STAGE_META[currentStage].course];
    const idx = list.indexOf(currentStage);
    const next = list[idx+1];
    if(pct >= 100 && next){
      banner.style.display = 'flex';
      const link = banner.querySelector('.scb-next');
      const meta = STAGE_META[next];
      // stageHref(), not meta.file — the stage-*.html files no longer exist on
      // the deployed site. Lessons are served through learn.html?course=&stage=,
      // so linking to meta.file gives every "next stage" button a 404.
      if(link){ link.href = stageHref(next); link.innerHTML = 'Start Stage '+meta.num+': '+meta.name+' →'; }
    } else {
      banner.style.display = 'none';
    }
  }

  // ─── NAV / ROADMAP LOCK RENDERING ───────────
  function getCurrentStageKey(list){
    list = list || STAGES;
    for(const s of list){ if(getPct(s) < 100) return s; }
    return list[list.length-1];
  }

  function renderNav(){
    const currentProgressByCourse = {
      fl: getCurrentStageKey(FL_STAGES),
      ta: getCurrentStageKey(TA_STAGES)
    };
    document.querySelectorAll('[data-nav-stage]').forEach(el=>{
      const key = el.getAttribute('data-nav-stage');
      const unlocked = isUnlocked(key);
      const done = getPct(key) >= 100;
      el.classList.toggle('locked', !unlocked);
      el.classList.toggle('done', done);
      el.classList.toggle('active', key === currentStage);
      el.style.cursor = 'pointer';
      el.onclick = function(e){
        if(e) e.preventDefault();
        window.location.href = unlocked ? stageHref(key) : (homeHref('index.html') + '#join');
      };
    });
    document.querySelectorAll('[data-stage-card]').forEach(el=>{
      const key = el.getAttribute('data-stage-card');
      const meta = STAGE_META[key];
      const unlocked = isUnlocked(key);
      const done = getPct(key) >= 100;
      el.classList.toggle('locked', !unlocked);
      el.classList.toggle('live', unlocked);
      el.classList.toggle('current', key === currentProgressByCourse[meta.course]);
      const lockEl = el.querySelector('.s-lock');
      if(lockEl){
        const idx = COURSE_STAGE_LISTS[meta.course].indexOf(key);
        if(unlocked){
          // currentProgressByCourse[meta.course] is the stage this reader is
          // actually up to in THIS course. (This used to read an undeclared
          // `currentProgressStage`, which throws a ReferenceError the moment a
          // stage card contains a .s-lock element and aborts the rest of this
          // loop — leaving every card below it without a click handler.)
          lockEl.innerHTML = done ? '✓ Complete' : (key === currentProgressByCourse[meta.course] ? '● You are here — start now' : '● Unlocked — start now');
        } else {
          lockEl.innerHTML = '🔒 Unlocks after Stage '+idx+' · <span style="text-decoration:underline">keep going →</span>';
        }
      }
      el.onclick = function(e){
        if(e) e.preventDefault();
        window.location.href = unlocked ? stageHref(key) : (homeHref('index.html') + '#join');
      };
    });
  }

  // ─── RESTORE A STAGE PAGE ON LOAD ────────────
  /* Guarantee progress[key] exists before anything writes to it.
     ------------------------------------------------------------------
     loadProgress() only seeds the keys listed in STAGES. The situation
     guides each pass their own key to restoreStage — fc1, ds1, rd1,
     sl1, sop1 — and none of those was ever in that list, so
     progress[key] was undefined for all of them.

     restoreStage() read it defensively (progress[stageKey] || {...})
     but never wrote the slot back, and updateProgRing() a few lines
     later does progress[currentStage].pct = pct with no guard. That
     threw a TypeError on every one of those guide pages, which aborted
     restoreStage, which aborted course-shell.js init() BEFORE
     addNextButtons() ran — so those guides had no Next Module button,
     no end-of-guide CTA, no crosslink handling and no saved progress.

     Nothing looked broken. The opening module is hardcoded cs-visible
     in the markup, so the page rendered fine and simply stopped
     navigating. disability-wealth-guide.html was the one guide that
     worked, because dwg1 had been added to STAGES for this exact
     reason once before — a fix applied to one page instead of to the
     cause.

     Seeding on demand repairs every guide at once, and means the next
     guide added cannot reintroduce this by forgetting to register a
     key. */
  function stageSlot(stageKey){
    if(!progress[stageKey]) progress[stageKey] = { checks:{}, milestones:{}, pct:0 };
    return progress[stageKey];
  }
  function restoreStage(stageKey){
    currentStage = stageKey;
    const data = stageSlot(stageKey);
    document.querySelectorAll('.act-box').forEach(el=>{
      if(!isRealCheckbox(el)) return;
      if(data.checks[checkboxKey(el)]){ el.classList.add('done'); el.textContent = '✓'; }
    });
    document.querySelectorAll('#milestone-list .ms-row').forEach((row, idx)=>{
      if(data.milestones[idx]){
        row.classList.add('done');
        const box = row.querySelector('.ms-box');
        if(box) box.textContent = '✓';
      }
    });
    // Seed each module's completion flag from restored state BEFORE any
    // clicking happens. Without this, the first tick after a reload would look
    // like a fresh transition into "complete" and replay a celebration the
    // reader already earned last session.
    document.querySelectorAll('.module').forEach(mod=>{
      mod.dataset.hfyComplete = isModuleComplete(mod) ? '1' : '0';
    });
    // Same reasoning at stage level: if they arrive already finished, don't
    // re-announce it — but leave it armed if they're still mid-stage.
    stageAnnounced = getPct(stageKey) >= 100;

    updateProgRing();
    updateMilestones();
    emitCompletion({ type: 'restored', stageKey: stageKey, stagePct: getPct(stageKey) });
  }

  function resetStageProgress(stageKey){
    if(!confirm("Reset all your checked-off progress for this stage on this device? This can't be undone.")) return;
    progress[stageKey] = { checks:{}, milestones:{}, pct:0 };
    saveProgress();
    location.reload();
  }

  // ─── GENERIC TOOL-DATA PERSISTENCE ────────────
  function saveToolData(key, data){ try{ localStorage.setItem(key, JSON.stringify(data)); }catch(e){} }
  function loadToolData(key){ try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }catch(e){ return null; } }
  function escapeAttr(str){ return String(str==null?'':str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ─── MISC UTILS ──────────────────────────────
  function scrollTo(id){ const el = document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth'}); }
  function fmt(n){ return '$'+Math.abs(n).toLocaleString('en-US',{maximumFractionDigits:0}); }
  function fmtDec(n){ return '$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }

  function initNavOnly(){
    renderNav();
  }

  // ─── LOGO SWAP ───────────────────────────────
  // Replaces the CSS badge in every nav with the real Hustlin' script logo.
  // Works on ALL pages automatically — no need to edit individual HTML files.
  function swapNavLogo(){
    const LOGO_SRC = assetHref('assets/hustlin-logo.png');
    const LOGO_STYLE = 'height:38px;width:auto;display:block;filter:drop-shadow(0 2px 10px rgba(0,0,0,.5))';

    // Nav badge → logo image
    document.querySelectorAll('.nav .hfy-logo, .nav .hfy-badge').forEach(el=>{
      const parent = el.closest('a') || el.parentElement;
      // Don't replace if image is already there
      if(parent && parent.querySelector('img[src*="hustlin-logo"]')) return;
      const img = document.createElement('img');
      img.src = LOGO_SRC;
      img.alt = 'Hustlin\'';
      img.setAttribute('style', LOGO_STYLE);
      img.onerror = function(){ this.style.display='none'; }; // silent fallback
      el.replaceWith(img);
    });

    // Footer badge → smaller logo image
    document.querySelectorAll('footer .hfy-logo, footer .hfy-badge, .footer .hfy-logo, .footer .hfy-badge').forEach(el=>{
      if(el.closest('.nav')) return; // skip if inside nav (already handled)
      if(el.parentElement && el.parentElement.querySelector('img[src*="hustlin-logo"]')) return;
      const img = document.createElement('img');
      img.src = LOGO_SRC;
      img.alt = 'Hustlin\'';
      img.setAttribute('style', 'height:32px;width:auto;display:block;filter:drop-shadow(0 2px 8px rgba(0,0,0,.4));margin-bottom:8px');
      img.onerror = function(){ this.style.display='none'; };
      el.replaceWith(img);
    });
  }

  // ─── FOOTER LOGO → HOME LINK ─────────────────
  // The footer brand logo ships as a real <a> in footer.template.html, so every
  // stamped page already has it. This is a backstop for the narrow case where a
  // page carries a footer the stamper never touched — e.g. one injected at
  // runtime by site-footer.js, or legacy markup in a file outside the walk.
  //
  // Runs after swapNavLogo() so any <img> that function just created from a
  // CSS badge gets wrapped too. Idempotent — an already-linked logo is left
  // alone, so it never double-wraps the pages that ship the anchor.
  function linkFooterLogo(){
    document.querySelectorAll('footer img, .hfy-footer img, .footer img').forEach(img=>{
      if(!/hustlin-logo/i.test(img.getAttribute('src') || '')) return;
      if(img.closest('a')) return;                   // already clickable

      const a = document.createElement('a');
      a.href = homeHref('index.html');
      a.setAttribute('aria-label', "Hustlin' - back to home");
      a.style.display = 'inline-block';
      img.parentNode.insertBefore(a, img);
      a.appendChild(img);
    });
  }

  // ─── ADSENSE ─────────────────────────────────
  // ─────────────────────────────────────────────
  // SETUP INSTRUCTIONS:
  // 1. Go to adsense.google.com → sign up with your Google account
  // 2. Enter hustlin.org as your site URL
  // 3. Google will review your site (takes 1–14 days)
  // 4. Once approved, go to Ads → Get code
  // 5. Copy your Publisher ID — looks like: ca-pub-1234567890123456
  // 6. Replace ca-pub-1249156793457835 below with your actual ID
  // 7. Upload this app.js to GitHub — AdSense will activate on ALL pages
  // ─────────────────────────────────────────────
  // ✅ PRODUCTION: Real AdSense ID configured
  const ADSENSE_PUB_ID = 'ca-pub-1249156793457835';

  // Numeric slot ID for the in-article unit used between modules. Create it in
  // AdSense (Ads → By ad unit → Display ads) and paste the data-ad-slot number
  // here, e.g. '1234567890'.
  //
  // Left empty on purpose: the previous value was the string 'auto', which is
  // not a valid slot ID, so those units could never fill and just reserved
  // blank 90px gaps down the page. While this is empty we skip the manual
  // units entirely and let Auto Ads (enabled above) place everything instead.
  const AD_SLOT_ID = '';

  // Pages where ads should not appear
  // learn.html serves gated course content. No ads there, for three reasons:
  //   1. Paying customers shouldn't see ads in a product they bought.
  //   2. The page is noindex and its content only arrives after an
  //      authenticated fetch, so the AdSense crawler sees an empty shell and
  //      has nothing to target against anyway.
  //   3. Serving ads on login-gated pages is a policy gray area worth avoiding.
  // Ads stay on the public marketing pages, which is where they actually earn.
  const NO_ADS_PAGES = [
    '', 'index.html', 'work-with-us.html',

    // Gated course content. Paying customers shouldn't see ads in a product
    // they bought, and the page is noindex with content that only arrives
    // after an authenticated fetch - the crawler sees an empty shell anyway.
    'learn.html', 'auth-callback.html',

    // Course sales pages. Ads here are actively negative: Google will serve
    // competing trading-course ads next to our own Buy button.
    'economics.html', 'fundamental-analysis.html', 'trading-psychology.html',

    // Conversion and account flows. Near-zero ad revenue, and ads next to a
    // sign-in form or a payment confirmation undermine trust exactly where
    // it matters most.
    'checkout-success.html', 'login.html', 'signup.html',
    'forgot-password.html', 'reset-password.html', 'change-password.html'
  ];

  function adsAllowed(){
    const page = window.location.pathname.split('/').pop() || '';
    return !NO_ADS_PAGES.includes(page);
  }

  function loadAdSense(){
    if(!adsAllowed()) return;
    if(document.querySelector('script[src*="pagead2.googlesyndication"]')) return; // already loaded

    // Inject AdSense Auto Ads script
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + ADSENSE_PUB_ID;
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);

    // Enable Auto Ads — Google automatically finds optimal placement
    (window.adsbygoogle = window.adsbygoogle || []).push({
      google_ad_client: ADSENSE_PUB_ID,
      enable_page_level_ads: true
    });
  }

  // ─── AD SLOTS BETWEEN MODULES ────────────────
  // Inserts responsive ad units between every 3rd module on stage pages.
  // These run ALONGSIDE Auto Ads for better coverage on long-form pages.
  function insertModuleAds(){
    if(!adsAllowed()) return;
    if(!AD_SLOT_ID) return; // no valid unit configured — Auto Ads covers the page
    const modules = document.querySelectorAll('.module');
    if(modules.length < 3) return;

    // Insert ad after every 3rd module (after module 3, 6, 9...)
    modules.forEach((mod, i)=>{
      if((i + 1) % 3 === 0 && i < modules.length - 1){
        const adWrap = document.createElement('div');
        adWrap.className = 'hfy-ad-slot';
        adWrap.style.cssText = 'margin:24px 0;text-align:center;min-height:90px;background:transparent';
        // No inline <script> here: a <script> tag written via innerHTML is
        // never executed by the browser, so the push() below used to be dead
        // code and these units sat empty. Insert the <ins>, then push from
        // real JS after it's in the document.
        adWrap.innerHTML =
          '<ins class="adsbygoogle" style="display:block"' +
          ' data-ad-client="' + ADSENSE_PUB_ID + '"' +
          ' data-ad-slot="' + AD_SLOT_ID + '"' +
          ' data-ad-format="auto" data-full-width-responsive="true"></ins>';
        mod.parentNode.insertBefore(adWrap, mod.nextSibling);
        try{
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        }catch(e){ /* adblocker or script not loaded — leave the slot empty */ }
      }
    });
  }

  // ─── INIT ON DOM READY ───────────────────────
  // Runs automatically on every page that loads app.js
  function init(){
    swapNavLogo();
    linkFooterLogo();   // after swapNavLogo, so badge-derived imgs get wrapped too
    loadAdSense();
    insertModuleAds();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init(); // DOM already ready
  }

  return {
    STAGES, STAGE_META,
    stageHref, homeHref, assetHref,
    getPct, isUnlocked,
    check, toggleMs, updateMilestones,
    restoreStage, resetStageProgress, initNavOnly,
    saveToolData, loadToolData, escapeAttr,
    scrollTo, fmt, fmtDec,
    getProgress: ()=>progress,

    // ─── Rewards integration ───
    // rewards.js subscribes here; app.js knows nothing about it in return.
    onCompletion, isModuleComplete, isCourseComplete,
    COURSE_STAGE_LISTS,
    currentStageKey: ()=>currentStage,
    // Lets rewards.js write server-fetched progress back in, then re-render.
    mergeProgress(incoming){
      if(!incoming || typeof incoming !== 'object') return;
      Object.keys(incoming).forEach(k=>{
        if(!progress[k]) progress[k] = { checks:{}, milestones:{}, pct:0 };
        const src = incoming[k] || {};
        // Ticks only ever move forwards on merge: a step done on any device
        // stays done. Prevents an older device overwriting newer progress.
        Object.keys(src.checks || {}).forEach(ck=>{
          if(src.checks[ck]) progress[k].checks[ck] = true;
        });
        Object.keys(src.milestones || {}).forEach(mk=>{
          if(src.milestones[mk]) progress[k].milestones[mk] = true;
        });
        progress[k].pct = Math.max(progress[k].pct || 0, src.pct || 0);
      });
      saveProgress();
    }
  };
})();

/* ─────────────────────────────────────────────────────────────────────
   MOBILE MODULE RAIL — discoverability for the horizontal module strip
   ─────────────────────────────────────────────────────────────────────
   Below 900px the course sidebar collapses into a horizontal .cs-list.
   On a phone that read as a static box with ~2 cards: nothing told the
   user modules 3..N existed. This progressively enhances every .cs-list
   on the page with:
     - a "Module 3 of 8" counter + a swipe hint that retires on first scroll
     - gradient edge fades that appear only when there IS more that way
     - tappable position dots that mirror active/completed state
   It runs on every stage page automatically because all of them load
   app.js — no per-stage HTML edits, so new stages inherit it for free.
   Above 900px the injected nodes are display:none and this is a no-op. */
(function(){
  'use strict';

  var HINT_KEY = 'hfy_rail_hint_seen';

  function seenHint(){
    try { return localStorage.getItem(HINT_KEY) === '1'; } catch(e){ return false; }
  }
  function markHintSeen(){
    try { localStorage.setItem(HINT_KEY, '1'); } catch(e){}
  }

  function buildRail(list){
    if(list.dataset.hfyRail) return;
    var items = Array.prototype.slice.call(list.querySelectorAll('.cs-item'));
    if(items.length < 2) return;               // nothing to scroll, no cue needed
    list.dataset.hfyRail = '1';

    var parent = list.parentNode;

    // wrap the scroller so the fades have something to anchor to
    var rail = document.createElement('div');
    rail.className = 'cs-rail';
    parent.insertBefore(rail, list);
    rail.appendChild(list);

    var head = document.createElement('div');
    head.className = 'cs-railhead';
    head.innerHTML =
      '<span class="csh-label">Module <span class="csh-count">1 of ' + items.length + '</span></span>' +
      '<span class="csh-hint">Swipe <i>→</i></span>';
    parent.insertBefore(head, rail);
    if(seenHint()) head.classList.add('cs-touched');

    var dots = document.createElement('div');
    dots.className = 'cs-dots';
    dots.setAttribute('role', 'tablist');
    dots.setAttribute('aria-label', 'Module navigation');
    items.forEach(function(item, i){
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'cs-dot';
      dot.setAttribute('aria-label', 'Go to module ' + (i + 1) + ' of ' + items.length);
      dot.addEventListener('click', function(){ item.click(); });
      dots.appendChild(dot);
    });
    parent.insertBefore(dots, rail.nextSibling);

    var countEl = head.querySelector('.csh-count');
    var dotEls  = Array.prototype.slice.call(dots.children);

    // ── edge fades: only shown when there is actually more in that direction
    function syncEdges(){
      var max = list.scrollWidth - list.clientWidth;
      var x   = list.scrollLeft;
      rail.classList.toggle('cs-more-left',  x > 4);
      rail.classList.toggle('cs-more-right', max > 4 && x < max - 4);
    }

    // ── mirror sidebar state onto the dots + counter
    function syncState(){
      var activeIdx = -1;
      items.forEach(function(item, i){
        if(item.classList.contains('cs-active')) activeIdx = i;
        dotEls[i].classList.toggle('cs-dot-done', item.classList.contains('cs-done'));
      });
      dotEls.forEach(function(d, i){
        d.classList.toggle('on', i === activeIdx);
        d.setAttribute('aria-selected', i === activeIdx ? 'true' : 'false');
      });
      if(activeIdx > -1){
        countEl.textContent = (activeIdx + 1) + ' of ' + items.length;
        centreOn(items[activeIdx]);
      }
    }

    // Keep the active chip on screen without touching page scroll —
    // scrollIntoView would drag the whole document on iOS.
    //
    // Only nudges when the chip is actually out of view. Centering
    // unconditionally left module 1 hanging half off the left edge on load:
    // centering a chip that already sits flush at the start can only push it
    // backwards, and a clipped FIRST card reads as "you missed something"
    // rather than "there is more ahead".
    function centreOn(chip){
      if(!window.matchMedia || !window.matchMedia('(max-width:900px)').matches) return;
      var pad     = 30;                       // width of the edge fade
      var chipL   = chip.offsetLeft;
      var chipR   = chipL + chip.offsetWidth;
      var viewL   = list.scrollLeft;
      var viewR   = viewL + list.clientWidth;
      if(chipL >= viewL && chipR <= viewR) return;   // already fully visible

      var left;
      if(chipL < viewL) left = chipL - pad;                        // off to the left
      else              left = chipR - list.clientWidth + pad;     // off to the right
      left = Math.max(0, Math.min(left, list.scrollWidth - list.clientWidth));
      if(Math.abs(left - list.scrollLeft) < 4) return;
      if(list.scrollTo) list.scrollTo({ left: left, behavior: 'smooth' });
      else list.scrollLeft = left;
    }

    var raf = null;
    list.addEventListener('scroll', function(){
      if(raf) return;
      raf = requestAnimationFrame(function(){ raf = null; syncEdges(); });
    }, { passive: true });

    // first real swipe means they've got it — retire the hint for good
    list.addEventListener('scroll', function once(){
      list.removeEventListener('scroll', once);
      head.classList.add('cs-touched');
      markHintSeen();
    }, { passive: true });

    window.addEventListener('resize', syncEdges);

    // the stage pages toggle cs-active / cs-done directly on the chips
    new MutationObserver(syncState).observe(list, {
      subtree: true, attributes: true, attributeFilter: ['class']
    });

    syncState();
    syncEdges();
    // fonts/images landing late change scrollWidth
    window.addEventListener('load', function(){ syncEdges(); syncState(); });
  }

  function init(){
    Array.prototype.forEach.call(document.querySelectorAll('.cs-list'), buildRail);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // learn.html renders lessons by fetching the stage HTML from Supabase and
  // dropping it into #hfy-lesson with innerHTML — long after DOMContentLoaded.
  // Watch for a .cs-list that shows up late so the viewer gets the same
  // treatment as a directly-served stage page. buildRail() is idempotent.
  var queued = false;
  new MutationObserver(function(){
    if(queued) return;
    queued = true;
    setTimeout(function(){ queued = false; init(); }, 0);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
