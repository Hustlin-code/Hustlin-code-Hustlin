/**
 * =============================================================================
 *  verify-viewer-pipeline.mjs
 * =============================================================================
 *  Replays the whole learn.html path against every stage file on disk, without
 *  a browser and without touching Supabase:
 *
 *      stage-N.html  ->  Edge Function extractLesson()  ->  learn.js rewrite()
 *                    ->  evaluate the lesson script     ->  inspect HFY_COURSE
 *
 *  and asserts the things that were silently broken:
 *
 *    1. every stage yields a window.HFY_COURSE
 *    2. its `stage` key is one app.js actually knows (else restoreStage is a
 *       no-op and the wins system never arms)
 *    3. its `next` block renders a button with a real label, not a bare "Next"
 *    4. every URL the lesson emits — next href, next img, cross-course links —
 *       resolves to something that exists at the site root after rewriting
 *    5. the sidebar (.cs-item[data-cs]) and the modules it points at agree
 *
 *  Run:  node tools/verify-viewer-pipeline.mjs
 *  Exit: 0 = all good, 1 = at least one stage would break in the viewer.
 * =============================================================================
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ── the upload manifest: local file -> course key + stage number ────────── */
const STAGES = [
  ['Financial Literacy Course/stage-1-survive.html',                    'fl', 1],
  ['Financial Literacy Course/stage-2-stabilize.html',                  'fl', 2],
  ['Financial Literacy Course/stage-3-rebuild.html',                    'fl', 3],
  ['Financial Literacy Course/stage-4-invest.html',                     'fl', 4],
  ['Financial Literacy Course/stage-5-wealth.html',                     'fl', 5],
  ['TA Course/stage-1-chart-basics.html',                               'ta', 1],
  ['TA Course/stage-2-trend-volume.html',                               'ta', 2],
  ['TA Course/stage-3-chart-patterns.html',                             'ta', 3],
  ['TA Course/stage-4-indicators-signals.html',                         'ta', 4],
  ['TA Course/stage-5-advanced-methods.html',                           'ta', 5],
  ['Fundemental Course/stage-1-foundations.html',                       'fund', 1],
  ['Fundemental Course/stage-2-income-statement.html',                  'fund', 2],
  ['Fundemental Course/stage-3-balance-sheet-cash-flow.html',           'fund', 3],
  ['Fundemental Course/stage-4-valuation.html',                         'fund', 4],
  ['Fundemental Course/stage-5-moats-management-process.html',          'fund', 5],
  ['TradingPsycologycourse/stage-1-the-inner-game.html',                'psych', 1],
  ['TradingPsycologycourse/stage-2-bias-and-belief.html',               'psych', 2],
  ['TradingPsycologycourse/stage-3-risk-and-loss.html',                 'psych', 3],
  ['TradingPsycologycourse/stage-4-emotion-under-fire.html',            'psych', 4],
  ['TradingPsycologycourse/stage-5-the-repeatable-process.html',        'psych', 5],
  ['EconomicsCourse/stage-1-economics-101.html',                        'econ', 1],
  ['EconomicsCourse/stage-2-inflation.html',                            'econ', 2],
  ['EconomicsCourse/stage-3-rates-central-banks-bonds.html',            'econ', 3],
  ['EconomicsCourse/stage-4-indicators-global.html',                    'econ', 4],
  ['EconomicsCourse/stage-5-sectors-strategy.html',                     'econ', 5],
  ['disability-wealth-guide.html',                                      'dwg', 1],
];

/* ── mirror of supabase/functions/course-content extractLesson() ─────────── */
function extractInlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (/application\/(ld\+json|json)/i.test(m[0])) continue;
    if (/adsbygoogle|gtag\(|dataLayer/i.test(m[1])) continue;
    if (m[1].trim()) out.push(m[1]);
  }
  return out.join('\n;\n');
}

function extractLesson(html) {
  const bm = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  let body = bm ? bm[1] : html;
  body = body
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<ins\b[^>]*adsbygoogle[\s\S]*?<\/ins>/gi, '');
  return { html: body, script: extractInlineScripts(html) };
}

/* ── mirror of learn.js rewrite() ────────────────────────────────────────── */
const FOLDER_COURSE = [
  [/(?:\.\.\/)?Financial(?:%20| )Literacy(?:%20| )Course\/stage-(\d+)[a-z0-9%-]*\.html/gi, 'fl'],
  [/(?:\.\.\/)?TA(?:%20| )Course\/stage-(\d+)[a-z0-9%-]*\.html/gi, 'ta'],
];
const href = (c, s) => 'learn.html?course=' + encodeURIComponent(c) + '&stage=' + s;

function rewriteStageLinks(text) {
  return text.replace(
    /(["'(])(?:\.\.\/)?stage-(\d+)[a-z0-9-]*\.html(#[a-z0-9_-]*)?(["')])/gi,
    (m, open, num, frag, close) => open + href(CURRENT_COURSE, parseInt(num, 10)) + (frag || '') + close
  );
}
let CURRENT_COURSE = 'fl';

function rewrite(html) {
  let out = html
    .replace(/(["'(])\.\.\/assets\//g, '$1assets/')
    .replace(/(["'(])\.\.\/styles\.css/g, '$1styles.css');
  FOLDER_COURSE.forEach(([re, key]) => {
    out = out.replace(re, (m, num) => href(key, parseInt(num, 10)));
  });
  return rewriteStageLinks(
    out.replace(/(?:\.\.\/)?disability-wealth-guide\.html/gi, href('dwg', 1))
       .replace(/(["'(])\.\.\/([a-z0-9_-]+\.html)/gi, '$1$2')
  );
}

/* ── app.js STAGE_META keys, parsed from source so it can't drift ────────── */
const appJs = readFileSync(join(ROOT, 'app.js'), 'utf8');
const metaBlock = /const STAGE_META = \{([\s\S]*?)\n  \};/.exec(appJs)[1];
const KNOWN_STAGE_KEYS = new Set(
  [...metaBlock.matchAll(/^\s*([a-z0-9]+)\s*:\s*\{/gim)].map((m) => m[1])
);

/* ── run one lesson script in a sandbox and recover HFY_COURSE ───────────── */
function evalLessonScript(code) {
  const win = {};
  const noop = () => {};
  const fakeEl = new Proxy(
    { classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      style: {}, dataset: {}, textContent: '', innerHTML: '', value: '',
      appendChild: noop, insertBefore: noop, addEventListener: noop,
      querySelector: () => null, querySelectorAll: () => [], closest: () => null,
      getAttribute: () => null, setAttribute: noop, remove: noop },
    { get: (t, k) => (k in t ? t[k] : noop) }
  );
  const sandbox = {
    window: win, document: {
      getElementById: () => null, querySelector: () => null,
      querySelectorAll: () => [], createElement: () => fakeEl,
      addEventListener: noop, body: fakeEl, documentElement: fakeEl,
    },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    HFY: new Proxy({}, { get: () => () => '' }),
    console: { log: noop, warn: noop, error: noop },
    setTimeout: noop, requestAnimationFrame: noop, confirm: () => false,
    location: { reload: noop, href: '' }, navigator: { userAgent: '' },
  };
  sandbox.window = Object.assign(win, sandbox);
  vm.createContext(sandbox);
  // Errors from the lesson's calculator bootstrapping are expected here (no
  // real DOM). HFY_COURSE is assigned by the FIRST inline script, so it is
  // already set by the time anything later throws — which is exactly the
  // property the viewer relies on.
  try { vm.runInContext(code, sandbox, { timeout: 5000 }); } catch { /* expected */ }
  return win.HFY_COURSE;
}

/* ── checks ──────────────────────────────────────────────────────────────── */
let failures = 0;
const rows = [];

for (const [rel, course, stageNum] of STAGES) {
  CURRENT_COURSE = course;
  const problems = [];
  const path = join(ROOT, rel);

  if (!existsSync(path)) {
    console.log(`FAIL ${rel} — file missing`);
    failures++;
    continue;
  }

  const raw = readFileSync(path, 'utf8');
  const { html, script } = extractLesson(raw);
  const cfg = evalLessonScript(rewrite(script));
  const lessonHtml = rewrite(html);

  // 1 + 2. config and a stage key app.js recognises
  if (!cfg) problems.push('no window.HFY_COURSE');
  else if (!cfg.stage) problems.push('HFY_COURSE.stage missing — restoreStage() will no-op, rewards stay dead');
  else if (!KNOWN_STAGE_KEYS.has(cfg.stage)) problems.push(`stage key "${cfg.stage}" is not in app.js STAGE_META`);

  // 3 + 4. the onward button
  const next = cfg && cfg.next;
  if (stageNum < 5 && course !== 'dwg' && !next) problems.push('no next: block — dead end at the foot of the stage');
  if (next && !next.html) {
    if (!next.href) problems.push('next.href missing');
    if (!next.img && !next.label && !next.title && !next.alt) problems.push('next block renders an unlabelled button');
    if (next.href && !/^learn\.html\?/.test(next.href)) {
      // must be a real file at the site root after rewriting
      const target = next.href.split(/[?#]/)[0];
      if (!existsSync(join(ROOT, target))) problems.push(`next.href "${next.href}" does not resolve`);
    }
    if (next.href && /^learn\.html\?course=([a-z]+)/.test(next.href)) {
      const got = /course=([a-z]+)/.exec(next.href)[1];
      if (got !== course) problems.push(`next.href points at course "${got}", expected "${course}"`);
    }
    if (next.img && !existsSync(join(ROOT, decodeURIComponent(next.img.split('?')[0])))) {
      problems.push(`next.img "${next.img}" does not resolve`);
    }
  }

  // 5. sidebar and modules agree
  const csIds = [...lessonHtml.matchAll(/class="cs-item[^"]*"[^>]*data-cs="([^"]+)"/g)].map((m) => m[1]);
  const csIdsAlt = [...lessonHtml.matchAll(/data-cs="([^"]+)"/g)].map((m) => m[1]);
  const ids = csIds.length ? csIds : csIdsAlt;
  const modIds = [...lessonHtml.matchAll(/<div[^>]*class="[^"]*\bmodule\b[^"]*"[^>]*id="([^"]+)"/g)].map((m) => m[1])
    .concat([...lessonHtml.matchAll(/<div[^>]*id="([^"]+)"[^>]*class="[^"]*\bmodule\b[^"]*"/g)].map((m) => m[1]));
  if (!ids.length) problems.push('no .cs-item[data-cs] sidebar entries — no module navigation possible');
  const orphans = ids.filter((id) => !modIds.includes(id));
  if (orphans.length) problems.push(`sidebar points at missing modules: ${orphans.join(', ')}`);
  /* The module the viewer actually opens is the sidebar chip carrying
     cs-active - learn.js line ~396 adds it to the first chip when the stage
     ships without one, and course-shell.js toggles it from there. Assuming
     'm1' was wrong for any stage whose module ids are historical rather than
     positional: FL Stage 5 opens on m10 and always has, so this gate reported
     a break that does not exist. Order of trust: an explicit HFY_COURSE.first,
     then the cs-active chip, then the first chip in the sidebar. */
  const csTags = [...lessonHtml.matchAll(/<[^>]*data-cs="([^"]+)"[^>]*>/g)];
  const activeTag = csTags.find((m) => /cs-active/.test(m[0]));
  const first = (cfg && cfg.first) || (activeTag && activeTag[1]) || ids[0] || 'm1';
  if (ids.length && !modIds.includes(first)) problems.push(`opening module "${first}" does not exist (have: ${modIds.slice(0, 3).join(', ')}…)`);

  // any ../ that survived the rewrite would 404 from the site root
  const escaped = [...lessonHtml.matchAll(/["'(](\.\.\/[^"')]+)["')]/g)].map((m) => m[1]);
  if (escaped.length) problems.push(`${escaped.length} unrewritten "../" path(s), e.g. ${escaped[0]}`);

  rows.push({ rel, course, stageNum, modules: modIds.length, sidebar: ids.length, problems });
  if (problems.length) failures++;
}

/* ── report ──────────────────────────────────────────────────────────────── */
const pad = (s, n) => String(s).padEnd(n);
console.log('\n' + pad('COURSE', 8) + pad('STAGE', 7) + pad('MODULES', 9) + pad('SIDEBAR', 9) + 'RESULT');
console.log('-'.repeat(78));
for (const r of rows) {
  console.log(
    pad(r.course, 8) + pad(r.stageNum, 7) + pad(r.modules, 9) + pad(r.sidebar, 9) +
    (r.problems.length ? 'FAIL' : 'ok')
  );
  for (const p of r.problems) console.log('        · ' + p);
}
console.log('-'.repeat(78));
console.log(failures ? `\n${failures} stage(s) would break in the viewer.\n` : '\nAll stages pass.\n');
process.exit(failures ? 1 : 0);
