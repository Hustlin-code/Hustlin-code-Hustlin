#!/usr/bin/env node
/* ============================================================================
   stamp-nav.mjs — one nav, stamped into every page
   ============================================================================

   Same contract as stamp-footers.mjs, deliberately: writes the contents of
   nav.template.html between <!-- NAV:START --> and <!-- NAV:END --> on every
   page, and --check byte-compares instead of writing so the deploy can gate on
   it. Copying the nav out of another page fails on whitespace alone, which is
   the behaviour that stopped footers drifting.

   MODES

     node tools/stamp-nav.mjs             stamp every page that has markers
     node tools/stamp-nav.mjs --check     fail if any stamped block is stale
     node tools/stamp-nav.mjs --migrate   convert pages that still carry a
                                          hand-written <nav>...</nav> into the
                                          marker pair, then stamp them

   --migrate EXISTS BECAUSE THERE WERE FOUR NAVS

     index.html                 no <nav> at all
     markets.html               a logo and nothing else
     blog.html / about.html     logo + 2 links
     stage / guide pages        logo + the 5 stage buttons

   Migration replaces the whole existing <nav ...>...</nav> element. That is a
   destructive edit on a lot of files, so it is a separate flag rather than the
   default, it prints every file it touches, and it refuses to run on a page
   that already has markers. Pages with NO <nav> at all are listed rather than
   guessed at — where the nav belongs in a page that never had one is a
   judgement call, not something a script should invent.

   WHAT IS NOT STAMPED

   The stage pages' .nav-stages progress strip is per-page state (which stage
   you are on, which are done) and is NOT part of this template. Those pages
   keep their strip BELOW the shared nav. A page whose nav contains
   `nav-stage` is therefore skipped by --migrate and reported, so the strip is
   never silently deleted.
   ========================================================================== */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { navFor, NAV_TEMPLATE } from './nav-template.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(ROOT, 'nav.template.html');

const checkOnly = process.argv.includes('--check');
const migrate = process.argv.includes('--migrate');
const keepStrip = process.argv.includes('--keep-stage-strip');

const START = '<!-- NAV:START -->';
const END = '<!-- NAV:END -->';

/* Mirrors stamp-footers.mjs. `assets` and `tools` hold no pages; the course
   folders are gitignored masters uploaded to Supabase, not served. */
/* `blog` is skipped and that is NOT an oversight. Blog posts already have an
   owner for their nav: tools/post-shell.template.html, stamped by
   stamp-post-shell.mjs into the POST-SHELL markers. Letting this script also
   write a nav into those files gave two scripts one surface — the first
   --migrate run rewrote the posts' <nav> and broke BOTH stamp-post-shell
   --check and stamp-footers --check at once. The gates caught it, which is
   the system working.

   The right way to give posts the shared nav is to update the NAV block inside
   post-shell.template.html and re-run stamp-post-shell. One surface, one
   owner. */
const SKIP_DIRS = new Set([
  'node_modules', '_deploy', 'tools', 'assets', 'mascot', '.git', '.github',
  'supabase', '_seo-backup', '_refactor-backup', 'blog',
  'Financial Literacy Course', 'TA Course', 'Fundemental Course',
  'EconomicsCourse', 'TradingPsycologycourse',
]);
const SKIP_DIR_RE = /^_backup-/;

/* Pages that should NOT carry the site nav. Auth and transactional pages are
   deliberately dead ends — a nav on a checkout return page is an invitation to
   wander off mid-flow — and 404 keeps its own minimal markup. */
const EXCLUDE = new Set([
  'login.html', 'signup.html', 'forgot-password.html', 'reset-password.html',
  'change-password.html', 'auth-callback.html', 'checkout-success.html',
  '404.html', 'footer.template.html', 'nav.template.html',
]);

/* Nav-less ON PURPOSE, matched on the repo-relative path rather than the
   basename so a future root-level calendar.html is not silently exempted.
   These four were reported as "decide where it belongs" for weeks; the
   decision was already made and is recorded inside each file.

     Markets/calendar.html
     Markets/heatmaps.html
     Markets/news.html   - RETIRED 2026-08-02. Redirect stubs: noindex+follow,
                           canonical to markets.html, meta refresh. They exist
                           so old inbound links and leftover indexation land
                           somewhere useful instead of a 404. Same deliberate
                           pattern as /sinking-fund-calculator.html. A nav on a
                           page the browser leaves in under a second is markup
                           nobody sees. Do not tidy these away.
     symbol-check.html   - internal tool, noindex+nofollow. Renders candidate
                           tickers in the free TradingView widget to find out
                           which ones the free tier actually supports. Not a
                           public destination and must never look like one.

   Anything NOT in this set that turns up nav-less is still reported. */
const NO_NAV_BY_DESIGN = new Set([
  'Markets/calendar.html', 'Markets/heatmaps.html', 'Markets/news.html',
  'symbol-check.html',
]);

if (!existsSync(TEMPLATE)) {
  console.error('  nav.template.html not found at the repo root.');
  process.exit(1);
}
/* Resolved through nav-template.mjs so the {{CALC_COUNT_WORD_CAP}} token in
   the template is filled from CALCS.length. build-calculators.mjs and
   build-lingo.mjs read the same module, which is what keeps the byte-compare
   below from failing the moment a calculator is added. */
const NAV = NAV_TEMPLATE;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || SKIP_DIR_RE.test(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.html') && !EXCLUDE.has(name)) out.push(p);
  }
  return out;
}

const pages = walk(ROOT);
const stale = [];
const written = [];
const migrated = [];
const noMarkers = [];
const hasStageStrip = [];
const noNavAtAll = [];

const NAV_RE = /[ \t]*<nav\b[\s\S]*?<\/nav>\s*/i;

for (const file of pages) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  let html = readFileSync(file, 'utf8');
  const hasMarkers = html.includes(START) && html.includes(END);

  if (!hasMarkers) {
    const m = html.match(NAV_RE);
    if (!m) { if (!NO_NAV_BY_DESIGN.has(rel)) noNavAtAll.push(rel); continue; }

    /* A stage progress strip WAS per-page state, so this refused to delete one
       and reported the page instead. That guard did its job: it is why the
       first rollout stopped at 29 pages instead of silently destroying the
       progress UI on 19 others.

       It is now opt-out rather than absolute, because the strip's only unique
       content — which stages are done, which one you are on — moved into the
       Learn panel, where it is applied from localStorage by the snippet in
       nav.template.html. The strip is genuinely redundant once that is in
       place, and only then. --keep-stage-strip preserves the old behaviour if
       you ever need to roll back. */
    if (/nav-stage\b/.test(m[0]) && keepStrip) { hasStageStrip.push(rel); continue; }

    if (!migrate) { noMarkers.push(rel); continue; }

    html = html.replace(NAV_RE, `${START}\n${END}\n\n`);
    migrated.push(rel);
  }

  /* ── DEPTH-CORRECT THE LINKS ────────────────────────────────────────────
     The template is written from the repo root, so `href="index.html"` is
     right for markets.html and WRONG for Markets/chart.html, where it
     resolves to Markets/index.html and 404s. Every link in the nav broke on
     the four Markets/ pages the first time this ran.

     Prefixing with ../ per directory level rather than switching the template
     to root-absolute `/index.html` is deliberate: root-absolute would be
     simpler on the live domain but breaks file:// entirely, and opening a
     page straight off disk is how this site actually gets previewed before a
     deploy. Relative links work in both places.

     Skips anything already absolute, protocol-relative, a fragment, or a
     mailto/tel — those are correct at any depth. */
  const depth = rel.split('/').length - 1;
  const nav = navFor(depth);

  const re = new RegExp(`${START}[\\s\\S]*?${END}`);
  const next = html.replace(re, `${START}\n${nav}\n${END}`);

  if (next === readFileSync(file, 'utf8')) continue;

  if (checkOnly) { stale.push(rel); continue; }
  writeFileSync(file, next, 'utf8');
  written.push(rel);
}

const report = (label, list) => {
  if (!list.length) return;
  console.log(`\n  ${label} (${list.length}):`);
  for (const f of list) console.log(`    ${f}`);
};

if (checkOnly) {
  if (!stale.length && !noMarkers.length) {
    console.log(`  nav stamp current - ${pages.length} pages checked.`);
    if (hasStageStrip.length || noNavAtAll.length) {
      report('not yet migrated - stage progress strip, place by hand', hasStageStrip);
      report('no <nav> element at all - decide where it belongs', noNavAtAll);
    }
    process.exit(0);
  }
  report('nav block is stale', stale);
  report('no NAV markers yet - run --migrate', noMarkers);
  console.error('\n  Fix with:  node tools/stamp-nav.mjs --migrate\n');
  process.exit(1);
}

report('migrated to markers', migrated);
report('nav stamped', written);
report('skipped - carries a stage progress strip', hasStageStrip);
report('skipped - no <nav> element at all', noNavAtAll);
if (!migrate) report('has no markers - re-run with --migrate', noMarkers);
if (!written.length && !migrated.length) console.log('  Nav already current - nothing written.');
console.log('');
