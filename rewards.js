/* ─────────────────────────────────────────────────────────
   © 2026 Hustlin' For You · hustlin.org · All rights reserved.
   Proprietary source code — unauthorized copying, reproduction,
   or redistribution of this file, in whole or in part, is
   prohibited without prior written permission.
   ─────────────────────────────────────────────────────────
   Hustlin' — the wins system

   Financial literacy has an invisible payoff: you don't look richer after
   ticking a budgeting step. This file manufactures the visible one, and
   escalates it so the big moments still land:

     module  → a gold toast + progress nudge          (seconds of work)
     stage   → full-screen celebration + named badge  (a session of work)
     course  → the finale + a shareable certificate   (the whole journey)

   Two rules it must never break:
     1. A win fires ONCE. Re-ticking a box, reloading, or switching device
        must not replay a celebration — that's what makes it feel cheap.
     2. Signed-out readers still get every celebration. Stage 1 of Financial
        Literacy needs no account, and that reader is exactly the one we're
        trying to convert. Their wins live in localStorage and get merged
        upward the moment they sign up.

   Loads after app.js (for HFY.onCompletion) and, when present, after auth.js
   (for HFY_SUPABASE). Degrades to local-only if Supabase never appears.
   ───────────────────────────────────────────────────────── */
(function () {
  'use strict';

  if (!window.HFY || typeof window.HFY.onCompletion !== 'function') {
    console.error('rewards.js: app.js must load first');
    return;
  }

  var EARNED_KEY = 'hfy_wins_v1';   // local mirror of public.achievements
  var STREAK_KEY = 'hfy_streak_v1';

  var COURSE_NAMES = { fl: 'Financial Literacy', ta: 'Technical Analysis', dwg: 'Disability Wealth Guide' };

  // Stage badges. Named, not numbered — "Survivor" is something you tell
  // someone; "Stage 1 complete" isn't.
  var STAGE_BADGES = {
    'stage1': { name: 'Survivor',      icon: '🛟', line: 'You built a floor to stand on.' },
    'stage2': { name: 'Stabilizer',    icon: '⚓', line: 'You stopped the bleeding.' },
    'stage3': { name: 'Rebuilder',     icon: '🧱', line: 'You started building back.' },
    'stage4': { name: 'Investor',      icon: '📈', line: 'You own a piece of the market.' },
    'stage5': { name: 'Wealth Builder',icon: '👑', line: 'You are playing a different game now.' },
    'ta1': { name: 'Chart Reader',     icon: '📊', line: 'A candle is just a story now.' },
    'ta2': { name: 'Trend Spotter',    icon: '🌊', line: 'You can see where price is leaning.' },
    'ta3': { name: 'Pattern Hunter',   icon: '🔍', line: 'The shapes mean something now.' },
    'ta4': { name: 'Signal Caller',    icon: '🎯', line: 'You read the indicators, not the hype.' },
    'ta5': { name: 'Technician',       icon: '🧭', line: 'You have your own method.' }
  };

  // ── local win store ───────────────────────────────────────────────────
  function loadEarned() {
    try { return JSON.parse(localStorage.getItem(EARNED_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function saveEarned(o) {
    try { localStorage.setItem(EARNED_KEY, JSON.stringify(o)); } catch (e) {}
  }
  var earned = loadEarned();

  function winKey(kind, course, stage, moduleId) {
    return [kind, course || '', stage || 0, moduleId || ''].join(':');
  }
  function alreadyWon(k) { return !!earned[k]; }
  function recordWin(k, label) {
    earned[k] = { at: Date.now(), label: label || '' };
    saveEarned(earned);
  }

  // ── streak ────────────────────────────────────────────────────────────
  // Counts distinct days with at least one completed step. Cheap to maintain
  // and it gives a returning reader something waiting for them.
  function bumpStreak() {
    var today = new Date().toISOString().slice(0, 10);
    var s;
    try { s = JSON.parse(localStorage.getItem(STREAK_KEY) || '{}'); } catch (e) { s = {}; }
    if (s.last === today) return s.count || 1;
    var y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    s.count = (s.last === y) ? (s.count || 0) + 1 : 1;
    s.last = today;
    try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch (e) {}
    return s.count;
  }

  // ── Supabase sync ─────────────────────────────────────────────────────
  function sb() { return window.HFY_SUPABASE || null; }
  async function currentUser() {
    try {
      if (!window.HFY.auth) return null;
      return await window.HFY.auth.getUser();
    } catch (e) { return null; }
  }

  // Pull server progress + wins and fold them into local state, so a reader
  // who did Stage 1 on their phone sees it ticked on their laptop.
  async function pullFromServer() {
    var client = sb(); if (!client) return;
    var user = await currentUser(); if (!user) return;
    try {
      var pr = await client.from('progress').select('course,stage,checks,milestones,pct');
      if (!pr.error && pr.data) {
        var incoming = {};
        pr.data.forEach(function (row) {
          var key = stageKeyFor(row.course, row.stage);
          if (key) incoming[key] = { checks: row.checks || {}, milestones: row.milestones || {}, pct: row.pct || 0 };
        });
        window.HFY.mergeProgress(incoming);
      }
      var ac = await client.from('achievements').select('kind,course,stage,module_id,label');
      if (!ac.error && ac.data) {
        ac.data.forEach(function (a) {
          var k = winKey(a.kind, a.course, a.stage, a.module_id);
          if (!earned[k]) earned[k] = { at: Date.now(), label: a.label || '', synced: true };
        });
        saveEarned(earned);
      }
    } catch (e) { console.error('rewards: pull failed', e); }
  }

  function stageKeyFor(course, stage) {
    var list = (window.HFY.COURSE_STAGE_LISTS || {})[course];
    return list ? list[stage - 1] : null;
  }
  function partsOf(stageKey) {
    var meta = (window.HFY.STAGE_META || {})[stageKey];
    return meta ? { course: meta.course, stage: meta.num, name: meta.name } : null;
  }

  var pushTimer = null;
  function pushProgress(stageKey) {
    if (pushTimer) clearTimeout(pushTimer);
    // Debounced: ticking five boxes quickly is one write, not five.
    pushTimer = setTimeout(async function () {
      var client = sb(); if (!client) return;
      var user = await currentUser(); if (!user) return;
      var p = partsOf(stageKey); if (!p) return;
      var data = (window.HFY.getProgress() || {})[stageKey];
      if (!data) return;
      try {
        await client.from('progress').upsert({
          user_id: user.id, course: p.course, stage: p.stage,
          checks: data.checks || {}, milestones: data.milestones || {},
          pct: data.pct || 0, updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,course,stage' });
      } catch (e) { console.error('rewards: progress push failed', e); }
    }, 1200);
  }

  async function pushWin(kind, course, stage, moduleId, label) {
    var client = sb(); if (!client) return;
    var user = await currentUser(); if (!user) return;
    try {
      // The unique index makes a repeat a no-op rather than a duplicate badge.
      await client.from('achievements').insert({
        user_id: user.id, kind: kind, course: course || '',
        stage: stage || 0, module_id: moduleId || '', label: label || ''
      });
    } catch (e) { /* conflict = already earned, which is fine */ }
  }

  // ── UI ────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('hfy-rewards-css')) return;
    var css = document.createElement('style');
    css.id = 'hfy-rewards-css';
    css.textContent = [
      '.hfy-toast-wrap{position:fixed;right:18px;bottom:18px;z-index:9000;display:flex;flex-direction:column;gap:10px;pointer-events:none}',
      '.hfy-toast{pointer-events:auto;min-width:250px;max-width:340px;background:linear-gradient(135deg,#141006,#0b0b0b);',
      'border:1px solid rgba(245,197,32,.55);border-radius:14px;padding:14px 16px;color:#fff;',
      'box-shadow:0 14px 40px rgba(0,0,0,.55),0 0 0 1px rgba(245,197,32,.08);',
      'transform:translateY(14px);opacity:0;transition:transform .34s cubic-bezier(.2,.9,.3,1.2),opacity .34s}',
      '.hfy-toast.in{transform:translateY(0);opacity:1}',
      '.hfy-toast-top{display:flex;align-items:center;gap:9px;margin-bottom:4px}',
      '.hfy-toast-ico{font-size:1.15rem}',
      '.hfy-toast-title{font-size:.83rem;font-weight:800;letter-spacing:.02em;color:#f5c520}',
      '.hfy-toast-body{font-size:.82rem;line-height:1.5;color:rgba(255,255,255,.72)}',
      '.hfy-toast-meta{margin-top:7px;font-size:.7rem;color:rgba(255,255,255,.4)}',
      '.hfy-toast-bar{margin-top:9px;height:4px;border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden}',
      '.hfy-toast-fill{height:100%;width:0;border-radius:3px;background:linear-gradient(to right,#f5c520,#3ec83e);transition:width .8s ease}',
      '@media(max-width:560px){.hfy-toast-wrap{left:12px;right:12px;bottom:12px}.hfy-toast{max-width:none}}',

      '.hfy-cele{position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;',
      'background:rgba(3,3,3,.82);opacity:0;transition:opacity .3s;padding:24px}',
      '.hfy-cele.in{opacity:1}',
      '.hfy-cele-card{position:relative;max-width:440px;width:100%;text-align:center;border-radius:20px;padding:38px 30px;',
      'background:radial-gradient(ellipse at top,rgba(245,197,32,.14),transparent 62%),#0a0a0a;',
      'border:1px solid rgba(245,197,32,.45);box-shadow:0 30px 80px rgba(0,0,0,.7);',
      'transform:scale(.9);transition:transform .38s cubic-bezier(.2,.9,.3,1.25)}',
      '.hfy-cele.in .hfy-cele-card{transform:scale(1)}',
      '.hfy-cele-badge{font-size:3.2rem;line-height:1;margin-bottom:14px;display:block;',
      'filter:drop-shadow(0 6px 22px rgba(245,197,32,.5))}',
      '.hfy-cele-eyebrow{font-size:.68rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#3ec83e;margin-bottom:9px}',
      '.hfy-cele-title{font-size:1.75rem;font-weight:800;color:#fff;letter-spacing:-.01em;line-height:1.18;margin-bottom:10px}',
      '.hfy-cele-title em{font-style:normal;color:#f5c520;display:block}',
      '.hfy-cele-line{font-size:.92rem;line-height:1.65;color:rgba(255,255,255,.66);margin-bottom:22px}',
      '.hfy-cele-actions{display:flex;flex-direction:column;gap:9px}',
      '.hfy-cele-btn{display:block;width:100%;padding:13px 18px;border-radius:11px;font-size:.88rem;font-weight:800;',
      'text-decoration:none;cursor:pointer;border:none;background:linear-gradient(135deg,#f5c520,#e0a800);color:#0a0a0a}',
      '.hfy-cele-btn.alt{background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.72)}',
      '.hfy-conf{position:fixed;inset:0;pointer-events:none;z-index:9600}',
      '@media(prefers-reduced-motion:reduce){.hfy-toast,.hfy-cele,.hfy-cele-card{transition:none}}'
    ].join('');
    document.head.appendChild(css);
  }

  function toastHost() {
    var h = document.querySelector('.hfy-toast-wrap');
    if (!h) { h = document.createElement('div'); h.className = 'hfy-toast-wrap'; document.body.appendChild(h); }
    return h;
  }

  function toast(opts) {
    injectStyles();
    var el = document.createElement('div');
    el.className = 'hfy-toast';
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<div class="hfy-toast-top"><span class="hfy-toast-ico">' + (opts.icon || '✅') + '</span>' +
      '<span class="hfy-toast-title">' + esc(opts.title) + '</span></div>' +
      '<div class="hfy-toast-body">' + esc(opts.body) + '</div>' +
      (opts.meta ? '<div class="hfy-toast-meta">' + esc(opts.meta) + '</div>' : '') +
      (typeof opts.pct === 'number'
        ? '<div class="hfy-toast-bar"><div class="hfy-toast-fill"></div></div>' : '');
    toastHost().appendChild(el);
    requestAnimationFrame(function () {
      el.classList.add('in');
      var fill = el.querySelector('.hfy-toast-fill');
      if (fill) requestAnimationFrame(function () { fill.style.width = opts.pct + '%'; });
    });
    setTimeout(function () {
      el.classList.remove('in');
      setTimeout(function () { el.remove(); }, 400);
    }, opts.hold || 4200);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function confetti(ms) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var cvs = document.createElement('canvas');
    cvs.className = 'hfy-conf';
    cvs.width = window.innerWidth; cvs.height = window.innerHeight;
    document.body.appendChild(cvs);
    var ctx = cvs.getContext('2d');
    var colors = ['#f5c520', '#3ec83e', '#ffffff', '#e0a800', '#7dd87d'];
    var bits = [];
    for (var i = 0; i < 130; i++) {
      bits.push({
        x: Math.random() * cvs.width, y: -20 - Math.random() * cvs.height * .5,
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
        vy: 2 + Math.random() * 3.4, vx: -1.1 + Math.random() * 2.2,
        rot: Math.random() * 6.28, vr: -.12 + Math.random() * .24,
        c: colors[(Math.random() * colors.length) | 0]
      });
    }
    var stop = Date.now() + (ms || 2600);
    (function frame() {
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      bits.forEach(function (b) {
        b.x += b.vx; b.y += b.vy; b.rot += b.vr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
        ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
      });
      if (Date.now() < stop) requestAnimationFrame(frame);
      else cvs.remove();
    })();
  }

  function celebrate(opts) {
    injectStyles();
    var wrap = document.createElement('div');
    wrap.className = 'hfy-cele';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML =
      '<div class="hfy-cele-card">' +
        '<span class="hfy-cele-badge">' + (opts.icon || '🏆') + '</span>' +
        '<div class="hfy-cele-eyebrow">' + esc(opts.eyebrow || 'Milestone') + '</div>' +
        '<div class="hfy-cele-title">' + esc(opts.title) +
          (opts.subtitle ? '<em>' + esc(opts.subtitle) + '</em>' : '') + '</div>' +
        '<div class="hfy-cele-line">' + esc(opts.line) + '</div>' +
        '<div class="hfy-cele-actions"></div>' +
      '</div>';
    document.body.appendChild(wrap);

    var actions = wrap.querySelector('.hfy-cele-actions');
    (opts.actions || []).forEach(function (a) {
      var b = document.createElement(a.href ? 'a' : 'button');
      b.className = 'hfy-cele-btn' + (a.alt ? ' alt' : '');
      b.textContent = a.label;
      if (a.href) b.href = a.href;
      if (a.onClick) b.addEventListener('click', function (e) { e.preventDefault(); a.onClick(close); });
      else if (!a.href) b.addEventListener('click', close);
      actions.appendChild(b);
    });

    function close() {
      wrap.classList.remove('in');
      setTimeout(function () { wrap.remove(); }, 320);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });

    requestAnimationFrame(function () { wrap.classList.add('in'); });
    if (opts.confetti !== false) confetti(opts.confettiMs);
    return close;
  }

  // ── certificate ───────────────────────────────────────────────────────
  // Drawn on a canvas so it needs no server, no library and no network.
  function makeCertificate(courseKey, name) {
    var W = 1600, H = 1130;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');

    x.fillStyle = '#070707'; x.fillRect(0, 0, W, H);
    var g = x.createRadialGradient(W / 2, H * .34, 40, W / 2, H * .34, W * .72);
    g.addColorStop(0, 'rgba(245,197,32,.15)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);

    x.strokeStyle = '#f5c520'; x.lineWidth = 5; x.strokeRect(42, 42, W - 84, H - 84);
    x.strokeStyle = 'rgba(245,197,32,.32)'; x.lineWidth = 1.5; x.strokeRect(62, 62, W - 124, H - 124);

    x.textAlign = 'center';
    x.fillStyle = '#f5c520';
    x.font = '800 40px "Plus Jakarta Sans", system-ui, sans-serif';
    x.fillText("HUSTLIN'", W / 2, 168);

    x.fillStyle = 'rgba(255,255,255,.5)';
    x.font = '600 22px "Plus Jakarta Sans", system-ui, sans-serif';
    x.fillText('CERTIFICATE OF COMPLETION', W / 2, 232);

    x.fillStyle = 'rgba(255,255,255,.62)';
    x.font = '400 26px "Plus Jakarta Sans", system-ui, sans-serif';
    x.fillText('This certifies that', W / 2, 350);

    x.fillStyle = '#ffffff';
    x.font = '800 84px "Plus Jakarta Sans", system-ui, sans-serif';
    x.fillText(name || 'A Hustlin’ Member', W / 2, 452);

    x.strokeStyle = 'rgba(245,197,32,.55)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(W / 2 - 300, 492); x.lineTo(W / 2 + 300, 492); x.stroke();

    x.fillStyle = 'rgba(255,255,255,.62)';
    x.font = '400 26px "Plus Jakarta Sans", system-ui, sans-serif';
    x.fillText('has completed every stage of', W / 2, 560);

    x.fillStyle = '#f5c520';
    x.font = '800 58px "Plus Jakarta Sans", system-ui, sans-serif';
    x.fillText(COURSE_NAMES[courseKey] || 'the course', W / 2, 640);

    x.fillStyle = 'rgba(255,255,255,.42)';
    x.font = '400 23px "Plus Jakarta Sans", system-ui, sans-serif';
    wrapText(x, 'Banking, credit, budgeting, debt, and investing — start to finish. ' +
                'Not because it was easy, but because they finished it.', W / 2, 726, 1080, 36);

    var d = new Date();
    x.fillStyle = 'rgba(255,255,255,.55)';
    x.font = '600 24px "Plus Jakarta Sans", system-ui, sans-serif';
    x.fillText(d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), W / 2, 880);

    x.fillStyle = 'rgba(255,255,255,.3)';
    x.font = '400 22px "Plus Jakarta Sans", system-ui, sans-serif';
    x.fillText('hustlin.org', W / 2, 1010);

    return c;
  }

  function wrapText(ctx, text, cx, y, maxW, lh) {
    var words = String(text).split(' '), line = '', lines = [];
    words.forEach(function (w) {
      var t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
      else line = t;
    });
    if (line) lines.push(line);
    lines.forEach(function (l, i) { ctx.fillText(l, cx, y + i * lh); });
  }

  async function downloadCertificate(courseKey) {
    var name = '';
    try {
      var u = await currentUser();
      if (u) name = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) ||
                    (u.email ? u.email.split('@')[0] : '');
    } catch (e) {}
    var typed = window.prompt('Name for the certificate:', name || '');
    if (typed === null) return;                    // cancelled
    var canvas = makeCertificate(courseKey, typed.trim() || name);
    var a = document.createElement('a');
    a.download = 'hustlin-' + courseKey + '-certificate.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  // ── reward tiers ──────────────────────────────────────────────────────
  function onModuleDone(evt) {
    var parts = partsOf(evt.stageKey);
    var course = parts ? parts.course : '';
    var k = winKey('module', course, parts ? parts.stage : 0, evt.moduleId);
    if (alreadyWon(k)) return;
    recordWin(k, evt.title);
    pushWin('module', course, parts ? parts.stage : 0, evt.moduleId, evt.title);
    pushProgress(evt.stageKey);

    var streak = bumpStreak();
    toast({
      icon: '✅',
      title: 'Module complete',
      body: evt.title,
      meta: streak > 1 ? streak + '-day streak · ' + evt.stagePct + '% of this stage'
                       : evt.stagePct + '% of this stage done',
      pct: evt.stagePct
    });
  }

  function onStageDone(evt) {
    var k = winKey('stage', evt.course, evt.stageNum, '');
    if (alreadyWon(k)) return;
    var badge = STAGE_BADGES[evt.stageKey] || { name: evt.title, icon: '🏆', line: 'Stage complete.' };
    recordWin(k, badge.name);
    pushWin('stage', evt.course, evt.stageNum, '', badge.name);
    pushProgress(evt.stageKey);

    if (evt.courseComplete) return onCourseDone(evt);

    var nextStage = evt.stageNum + 1;
    var actions = [{
      label: 'Start Stage ' + nextStage + ' →',
      href: 'learn.html?course=' + encodeURIComponent(evt.course) + '&stage=' + nextStage
    }];
    // A signed-out reader has just proved they're serious. This is the single
    // best moment to ask them to save it — the ask is now a favour, not a toll.
    isSignedOut().then(function (out) {
      if (out) actions.push({
        label: 'Create a free account to save this',
        alt: true,
        href: 'signup.html?redirect=' + encodeURIComponent(window.location.href)
      });
      actions.push({ label: 'Keep reading', alt: true });
      celebrate({
        icon: badge.icon,
        eyebrow: 'Stage ' + evt.stageNum + ' complete',
        title: "You're a",
        subtitle: badge.name + '.',
        line: badge.line + ' That badge is yours now.',
        actions: actions,
        confettiMs: 3000
      });
    });
  }

  function onCourseDone(evt) {
    var k = winKey('course', evt.course, 0, '');
    if (!alreadyWon(k)) {
      recordWin(k, COURSE_NAMES[evt.course] || evt.course);
      pushWin('course', evt.course, 0, '', COURSE_NAMES[evt.course] || evt.course);
    }
    celebrate({
      icon: '👑',
      eyebrow: 'Course complete',
      title: 'You finished',
      subtitle: COURSE_NAMES[evt.course] || 'the course',
      line: 'Every stage, every step. Most people never start. You finished. ' +
            'Take the certificate — you earned the right to show it.',
      actions: [
        { label: '⬇  Download your certificate', onClick: function () { downloadCertificate(evt.course); } },
        { label: 'Back to the course', alt: true, href: 'financial-literacy.html' }
      ],
      confettiMs: 5200
    });
  }

  async function isSignedOut() {
    var u = await currentUser();
    return !u;
  }

  // ── the gap, shown before they start ──────────────────────────────────
  // A reward after the fact only motivates someone already reading. This puts
  // the unfinished thing in front of them on arrival: how far in they are, the
  // streak they'd break, and how many modules stand between them and the next
  // badge. Renders into any element carrying data-hfy-progress="<courseKey>".
  var META_KEY = 'hfy_stagemeta_v1';

  function loadStageMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch (e) { return {}; }
  }
  // Module totals only exist inside a lesson, so record them whenever one is
  // open. Course pages then know "5 more modules" instead of just a percentage.
  function recordStageMeta(stageKey) {
    var mods = document.querySelectorAll('.module');
    if (!mods.length) return;
    var meta = loadStageMeta();
    meta[stageKey] = { modules: mods.length, seen: Date.now() };
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {}
  }

  function streakCount() {
    try {
      var s = JSON.parse(localStorage.getItem(STREAK_KEY) || '{}');
      if (!s.last) return 0;
      var today = new Date().toISOString().slice(0, 10);
      var y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      // A streak that wasn't touched today or yesterday is already broken.
      return (s.last === today || s.last === y) ? (s.count || 0) : 0;
    } catch (e) { return 0; }
  }

  function modulesWon(course, stageNum) {
    var n = 0, prefix = 'module:' + course + ':' + stageNum + ':';
    Object.keys(earned).forEach(function (k) { if (k.indexOf(prefix) === 0) n++; });
    return n;
  }

  function courseState(course) {
    var list = (window.HFY.COURSE_STAGE_LISTS || {})[course] || [];
    var meta = loadStageMeta();
    var stagesDone = 0, current = null, currentIdx = 0;
    for (var i = 0; i < list.length; i++) {
      if (window.HFY.getPct(list[i]) >= 100) { stagesDone++; continue; }
      if (!current) { current = list[i]; currentIdx = i; }
    }
    var done = stagesDone === list.length && list.length > 0;
    var key = current || list[list.length - 1];
    var total = (meta[key] && meta[key].modules) || 0;
    return {
      list: list, stagesDone: stagesDone, courseDone: done,
      stageKey: key, stageNum: currentIdx + 1,
      badge: STAGE_BADGES[key] || null,
      pct: key ? window.HFY.getPct(key) : 0,
      modulesTotal: total,
      modulesDone: key ? modulesWon(course, currentIdx + 1) : 0
    };
  }

  function bannerStyles() {
    if (document.getElementById('hfy-prog-css')) return;
    var css = document.createElement('style');
    css.id = 'hfy-prog-css';
    css.textContent = [
      '.hfy-prog{display:flex;align-items:center;gap:18px;flex-wrap:wrap;max-width:1100px;margin:0 auto;',
      'background:linear-gradient(135deg,rgba(245,197,32,.09),rgba(10,10,10,.9));',
      'border:1px solid rgba(245,197,32,.32);border-radius:16px;padding:18px 22px}',
      '.hfy-prog-main{flex:1;min-width:230px}',
      '.hfy-prog-eyebrow{font-size:.66rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;',
      'color:#3ec83e;margin-bottom:6px}',
      '.hfy-prog-line{font-size:1.02rem;font-weight:700;color:#fff;line-height:1.4}',
      '.hfy-prog-line em{font-style:normal;color:#f5c520}',
      '.hfy-prog-sub{margin-top:5px;font-size:.8rem;color:rgba(255,255,255,.5)}',
      '.hfy-prog-bar{margin-top:11px;height:6px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden}',
      '.hfy-prog-fill{height:100%;width:0;border-radius:4px;',
      'background:linear-gradient(to right,#f5c520,#3ec83e);transition:width 1s ease}',
      '.hfy-prog-cta{flex-shrink:0;display:inline-block;padding:12px 22px;border-radius:11px;font-size:.86rem;',
      'font-weight:800;text-decoration:none;background:linear-gradient(135deg,#f5c520,#e0a800);color:#0a0a0a}',
      '.hfy-prog-streak{flex-shrink:0;text-align:center;padding:0 4px}',
      '.hfy-prog-streak b{display:block;font-size:1.5rem;color:#f5c520;line-height:1}',
      '.hfy-prog-streak span{font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.38)}',
      '@media(max-width:640px){.hfy-prog{padding:16px}.hfy-prog-cta{width:100%;text-align:center}}'
    ].join('');
    document.head.appendChild(css);
  }

  function renderProgressBanner() {
    var hosts = document.querySelectorAll('[data-hfy-progress]');
    if (!hosts.length) return;
    bannerStyles();

    Array.prototype.forEach.call(hosts, function (host) {
      var course = host.getAttribute('data-hfy-progress') || 'fl';
      var st = courseState(course);
      var streak = streakCount();
      var href = 'learn.html?course=' + encodeURIComponent(course) + '&stage=' + st.stageNum;
      var eyebrow, line, sub, cta, pct = st.pct;

      if (st.courseDone) {
        eyebrow = 'Course complete';
        line = 'You finished <em>' + esc(COURSE_NAMES[course] || 'the course') + '</em>.';
        sub = 'Every stage, every step. Take the certificate.';
        cta = { label: '⬇  Certificate', download: true };
        pct = 100;
      } else if (st.pct === 0 && st.stagesDone === 0) {
        eyebrow = 'Start here';
        line = 'Stage 1: <em>' + esc(st.badge ? st.badge.name : 'Survive') + '</em> is waiting.';
        sub = st.modulesTotal ? st.modulesTotal + ' modules. Most people finish the first in under ten minutes.'
                              : 'Most people finish the first module in under ten minutes.';
        cta = { label: 'Start Stage 1 →', href: href };
      } else {
        var left = st.modulesTotal ? Math.max(st.modulesTotal - st.modulesDone, 0) : 0;
        eyebrow = 'Pick up where you left off';
        line = left
          ? '<em>' + left + ' module' + (left === 1 ? '' : 's') + '</em> from becoming a ' +
            esc(st.badge ? st.badge.name : 'graduate') + '.'
          : "You're <em>" + st.pct + '%</em> through ' + esc(st.badge ? st.badge.name : 'this stage') + '.';
        sub = st.stagesDone
          ? st.stagesDone + ' stage' + (st.stagesDone === 1 ? '' : 's') + ' already behind you.'
          : 'You have already started. Finishing is the hard part — and the short part.';
        cta = { label: 'Resume Stage ' + st.stageNum + ' →', href: href };
      }

      host.innerHTML =
        '<div class="hfy-prog">' +
          (streak > 1 ? '<div class="hfy-prog-streak"><b>' + streak + '</b><span>day streak</span></div>' : '') +
          '<div class="hfy-prog-main">' +
            '<div class="hfy-prog-eyebrow">' + esc(eyebrow) + '</div>' +
            '<div class="hfy-prog-line">' + line + '</div>' +
            '<div class="hfy-prog-sub">' + esc(sub) + '</div>' +
            '<div class="hfy-prog-bar"><div class="hfy-prog-fill"></div></div>' +
          '</div>' +
          (cta.download
            ? '<button class="hfy-prog-cta" type="button">' + esc(cta.label) + '</button>'
            : '<a class="hfy-prog-cta" href="' + cta.href + '">' + esc(cta.label) + '</a>') +
        '</div>';

      var fill = host.querySelector('.hfy-prog-fill');
      if (fill) setTimeout(function () { fill.style.width = pct + '%'; }, 60);
      if (cta.download) {
        host.querySelector('.hfy-prog-cta')
            .addEventListener('click', function () { downloadCertificate(course); });
      }
    });
  }

  // ── read-only modules ─────────────────────────────────────────────────
  // Not every module has action steps — "Your Three-Tier Safety Net" in
  // Stage 1 is pure reading. Those can never satisfy the tick-every-step rule,
  // so without this the reader finishes one and gets silence, which reads as
  // "that didn't count". They're credited once the reader moves past them.
  //
  // Reader order comes from the sidebar, not the DOM: Stage 3 lists m9 and m10
  // before m8 in markup, and the sidebar is what the reader actually follows.
  function readingOrder() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.cs-item[data-cs]'));
    if (items.length) return items.map(function (i) { return i.getAttribute('data-cs'); });
    return Array.prototype.slice.call(document.querySelectorAll('.module'))
      .map(function (m) { return m.id; });
  }

  function awardModulesPassed(visibleId) {
    var order = readingOrder();
    var upto = order.indexOf(visibleId);
    if (upto < 1) return;
    var stageKey = window.HFY.currentStageKey && window.HFY.currentStageKey();
    if (!stageKey) return;

    order.slice(0, upto).forEach(function (id) {
      var mod = document.getElementById(id);
      if (!mod) return;
      // Only modules that CAN'T be completed by ticking. Anything with action
      // steps still has to be earned properly.
      var boxes = Array.prototype.slice.call(mod.querySelectorAll('.act-box'))
        .filter(function (el) {
          return !(el.hasAttribute('style') && el.getAttribute('style').indexOf('pointer-events') !== -1);
        });
      if (boxes.length) return;

      var parts = partsOf(stageKey);
      var k = winKey('module', parts ? parts.course : '', parts ? parts.stage : 0, id);
      if (alreadyWon(k)) return;

      var title = (function () {
        var t = document.querySelector('.cs-item[data-cs="' + id + '"] .cs-txt');
        return t ? t.textContent.trim() : 'Module';
      })();
      recordWin(k, title);
      pushWin('module', parts ? parts.course : '', parts ? parts.stage : 0, id, title);
      toast({
        icon: '📖',
        title: 'Module complete',
        body: title,
        meta: window.HFY.getPct(stageKey) + '% of this stage done',
        pct: window.HFY.getPct(stageKey)
      });
    });
  }

  // The lesson's own selectModule() toggles cs-visible; watching the class is
  // how we hook it without touching lesson files.
  function watchModuleChanges() {
    if (!window.MutationObserver) return;
    var obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        var el = m.target;
        if (el.classList && el.classList.contains('module') && el.classList.contains('cs-visible')) {
          awardModulesPassed(el.id);
        }
      });
    });
    obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
  }

  // ── wire up ───────────────────────────────────────────────────────────
  watchModuleChanges();

  window.HFY.onCompletion(function (evt) {
    if (evt.type === 'module') { onModuleDone(evt); renderProgressBanner(); }
    else if (evt.type === 'stage') onStageDone(evt);
    else if (evt.type === 'restored') {
      recordStageMeta(evt.stageKey);   // learn how many modules this stage has
      pushProgress(evt.stageKey);
      renderProgressBanner();
    }
  });

  // Course pages have no lesson to restore, so render on load.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderProgressBanner);
  } else {
    renderProgressBanner();
  }

  // Pull server state once auth settles, then re-render the restored stage so
  // progress from another device appears without a manual reload.
  function syncNow() {
    pullFromServer().then(function () {
      var key = window.HFY.currentStageKey && window.HFY.currentStageKey();
      if (key && typeof window.HFY.restoreStage === 'function') window.HFY.restoreStage(key);
    });
  }
  if (window.HFY.auth && typeof window.HFY.auth.onAuthChange === 'function') {
    window.HFY.auth.onAuthChange(function (session) { if (session) syncNow(); });
  }
  setTimeout(syncNow, 900);

  window.HFY.rewards = {
    toast: toast, celebrate: celebrate, confetti: confetti,
    downloadCertificate: downloadCertificate, makeCertificate: makeCertificate,
    earned: function () { return loadEarned(); },
    syncNow: syncNow
  };
})();
