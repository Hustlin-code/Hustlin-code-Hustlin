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
  const STAGES = FL_STAGES.concat(TA_STAGES);
  const COURSE_STAGE_LISTS = { fl: FL_STAGES, ta: TA_STAGES };
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
    ta5: { num:5, name:'Advanced Methods',    file:'stage-5-advanced-methods.html', course:'ta' }
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

  function check(el){
    el.classList.toggle('done');
    el.textContent = el.classList.contains('done') ? '✓' : '';
    if(currentStage){
      progress[currentStage].checks[checkboxKey(el)] = el.classList.contains('done');
      saveProgress();
    }
    updateProgRing();
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
    if(currentStage){ progress[currentStage].pct = pct; saveProgress(); }
    const circ = 207.3;
    const circle = document.getElementById('progCircle');
    const txt = document.getElementById('progTxt');
    if(circle) circle.style.strokeDashoffset = circ - (pct/100)*circ;
    if(txt) txt.textContent = pct+'%';
    renderStageComplete(pct);
    renderNav();
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
  function restoreStage(stageKey){
    currentStage = stageKey;
    const data = progress[stageKey] || { checks:{}, milestones:{}, pct:0 };
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
    updateProgRing();
    updateMilestones();
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
  //   3. Serving ads on login-gated pages is a policy grey area worth avoiding.
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
    'forgot-password.html', 'reset-password.html'
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
    getProgress: ()=>progress
  };
})();
