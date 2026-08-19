/**
 * =============================================================================
 *  stamp-footers.mjs  —  one footer, everywhere.
 * =============================================================================
 *
 *  WHAT THIS SOLVES
 *  ----------------
 *  Footers used to be hand-written into every .html file. 41 pages had drifted
 *  into 22 different footers, and 5 of them (about.html, learn.html, and all
 *  three blog posts) carried .hfy-footer markup with no CSS behind it at all,
 *  so they rendered unstyled on the live site.
 *
 *  Now: footer.template.html is the ONLY hand-edited footer. This script
 *  stamps it into every page between FOOTER:START / FOOTER:END markers.
 *
 *  There used to be a generated site-footer.js alongside this, meant to inject
 *  a footer at runtime on any page that shipped without one. It was removed:
 *  no page ever loaded it, and deploy-site.ps1 now runs --check before staging,
 *  so a missing or stale footer cannot reach the site in the first place. A
 *  build-time gate beats a runtime patch — crawlers see the stamped markup
 *  without executing JS, which is the entire reason footers are stamped.
 *
 *  USAGE
 *  -----
 *      node tools/stamp-footers.mjs           # rewrite all pages
 *      node tools/stamp-footers.mjs --check   # verify only, exit 1 if stale
 *
 *  --check is what CI / the deploy script wants: it never writes, it just
 *  fails loudly if a page's footer no longer matches the template. That is the
 *  guard against someone hand-editing a stamped footer and losing the change
 *  on the next run.
 *
 *  PATH DEPTH
 *  ----------
 *  Pages sit at root ("index.html") or one level down ("Markets/chart.html").
 *  {{BASE}} in the template becomes "" or "../" accordingly. Anything deeper
 *  is handled too — BASE just repeats "../". External URLs are left alone
 *  because the template never puts {{BASE}} in front of them.
 *
 *  WHAT IT WILL NOT TOUCH
 *  ----------------------
 *  node_modules/, _seo-backup/, _refactor-backup/, and footer.template.html
 *  itself. Everything else with an <html> tag gets a footer.
 * =============================================================================
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(ROOT, 'footer.template.html');
const OVERRIDES = join(ROOT, 'footer.overrides.json');

const SKIP_DIRS = new Set(['node_modules', '_seo-backup', '_refactor-backup', '.git', 'assets', 'tools']);

/* Also skip BUILD OUTPUT and TIMESTAMPED BACKUPS.
 *
 * Without this the walker descends into _deploy/ and every _backup-YYYYMMDD-HHMMSS/
 * folder, which has two bad effects:
 *
 *   1. It REWRITES footers inside the backups. A backup that gets modified is not
 *      a backup — the whole point is a frozen copy of what the site looked like
 *      before a change.
 *   2. It reports "1309 pages" for a 47-page site, and --check fails on stale
 *      output in _deploy/ that is regenerated on the next build anyway. A gate
 *      that fails on files nobody ships teaches you to ignore the gate.
 *
 * Matches _deploy, _backup-*, _refactor-*, _seo-* by prefix so new timestamped
 * folders are covered automatically.
 */
const SKIP_DIR_RE = /^_(deploy|backup|refactor|seo)/i;
/* nav.template.html joined this list on 2026-08-10. Both templates are
   fragments that live at the root and are never served — deploy-site.ps1
   removes them from _deploy — so neither has, or should have, a footer.
   Without this the nav template fails gate 2 the moment it exists. */
const SKIP_FILES = new Set(['footer.template.html', 'nav.template.html']);

/**
 * Pages that must stay footer-free. These are auth and transactional screens —
 * they were deliberately bare before this refactor and should stay that way.
 * A full marketing footer with course pricing under a password-reset form is
 * noise at best; on auth-callback.html, which is a redirect shim the user sees
 * for a fraction of a second, it is pure page weight.
 *
 * If you add a new auth screen, add it here or it will get a footer.
 */
const NO_FOOTER = new Set([
  'auth-callback.html',
  'change-password.html',
  'checkout-success.html',
  'forgot-password.html',
  'login.html',
  'reset-password.html',
  'signup.html',
  // Retired 2026-08-02. News, the earnings calendar and the heatmaps moved onto
  // markets.html / markets-economic.html and these three are now instant
  // redirects that exist only so old inbound links do not 404. Same reasoning as
  // auth-callback.html above: a full marketing footer on a page nobody reads for
  // more than a fraction of a second is pure page weight. Delete these files
  // once the old URLs stop getting traffic, and these three lines with them.
  'Markets/news.html',
  'Markets/calendar.html',
  'Markets/heatmaps.html',
  // Retired 2026-08-10. The original 8-module Economics for Traders sales page,
  // superseded by /economics.html and its five stage pages. Same redirect-stub
  // reasoning as the three above. Unlike them it was never linked and never in
  // the sitemap, so it is a candidate for outright deletion sooner rather than
  // later — the stub exists mainly to be certain nothing was quietly pointing at it.
  'EconomicsCourse/economics-for-traders.html',
]);

const START = '<!-- FOOTER:START — generated by tools/stamp-footers.mjs from footer.template.html. DO NOT EDIT BY HAND. -->';
const END = '<!-- FOOTER:END -->';

const checkOnly = process.argv.includes('--check');

/* ---------------------------------------------------------------- template */

function loadTemplate() {
  const raw = readFileSync(TEMPLATE, 'utf8');

  // Strip HTML comments BEFORE looking for the footer element. The template's
  // own instructions block talks about "<footer>", and a naive indexOf('<footer')
  // happily matched that prose and stamped the documentation into all 41 pages.
  // Comments are removed first so only real markup can match.
  const markup = raw.replace(/<!--[\s\S]*?-->/g, '');

  const i = markup.indexOf('<footer');
  const j = markup.lastIndexOf('</footer>');
  if (i < 0 || j < 0) {
    console.error('  footer.template.html has no <footer> element. Aborting.');
    process.exit(1);
  }
  const block = markup.slice(i, j + '</footer>'.length).trim();

  // Guard: exactly one footer element, balanced. A template that fails this
  // would multiply across every page, so refuse to run rather than repair.
  const opens = (block.match(/<footer\b/gi) || []).length;
  const closes = (block.match(/<\/footer>/gi) || []).length;
  if (opens !== 1 || closes !== 1) {
    console.error(`  footer.template.html is malformed: ${opens} <footer> open tag(s), ${closes} close tag(s). Expected exactly 1 of each. Aborting.`);
    process.exit(1);
  }
  return block;
}

/* --------------------------------------------------------------- overrides */

/**
 * Per-page footer text. The disclaimer used to be baked into the template,
 * which meant the first run of this script replaced disability-wealth-guide's
 * benefits-specific legal language with the generic site wording and nobody
 * noticed. Overrides exist so a page can keep text it genuinely needs.
 */
function loadOverrides() {
  try {
    const raw = JSON.parse(readFileSync(OVERRIDES, 'utf8'));
    if (!raw.default || typeof raw.default.disclaimer !== 'string') {
      console.error('  footer.overrides.json has no usable "default".disclaimer. Aborting.');
      process.exit(1);
    }
    return raw;
  } catch (err) {
    console.error(`  Could not read footer.overrides.json — ${err.message}`);
    console.error('  Refusing to stamp: every page would lose its disclaimer.');
    process.exit(1);
  }
}

/** Text for `relPath`, falling back to the defaults. */
function textFor(overrides, relPath) {
  const key = relPath.split(sep).join('/');
  const page = overrides[key] || {};
  const base = overrides.default;
  return {
    disclaimer: typeof page.disclaimer === 'string' ? page.disclaimer : base.disclaimer,
    note: typeof page.note === 'string' ? page.note : (base.note || ''),
  };
}

/** Depth-correct copy of the template for a file at `relPath`. */
function render(template, relPath, overrides) {
  const depth = relPath.split(/[\\/]/).length - 1;
  const { disclaimer, note } = textFor(overrides, relPath);
  return template
    .replaceAll('{{BASE}}', '../'.repeat(depth))
    .replaceAll('{{DISCLAIMER}}', disclaimer)
    .replaceAll('{{NOTE}}', note);
}

/* ------------------------------------------------------------- file walker */

function htmlFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || SKIP_DIR_RE.test(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) htmlFiles(full, acc);
    else if (name.endsWith('.html') && !SKIP_FILES.has(name)) acc.push(full);
  }
  return acc;
}

/* --------------------------------------------------------------- rewriting */

/**
 * Replace whatever footer the page currently has with the stamped block.
 * Handles three cases: already-stamped (markers present), legacy hand-written
 * <footer>, and no footer at all (inserted before </body>).
 */
function replaceFooter(html, block) {
  const stamped = `${START}\n${block}\n${END}`;

  // 1. Already stamped — swap between markers.
  const s = html.indexOf(START);
  const e = html.indexOf(END);
  if (s >= 0 && e > s) {
    return html.slice(0, s) + stamped + html.slice(e + END.length);
  }

  // 2. Legacy footer — replace the last <footer>...</footer> in the document.
  //    "last" because a page could conceivably use <footer> inside an article.
  const openRe = /<footer\b[^>]*>/gi;
  let lastOpen = -1, m;
  while ((m = openRe.exec(html)) !== null) lastOpen = m.index;
  if (lastOpen >= 0) {
    const close = html.toLowerCase().indexOf('</footer>', lastOpen);
    if (close >= 0) {
      return html.slice(0, lastOpen) + stamped + html.slice(close + '</footer>'.length);
    }
  }

  // 3. No footer — insert before </body>.
  const body = html.toLowerCase().lastIndexOf('</body>');
  if (body >= 0) {
    return html.slice(0, body) + stamped + '\n' + html.slice(body);
  }
  return html + '\n' + stamped + '\n';
}

/**
 * The footer's CSS lives in styles.css. A page that stamps a footer but never
 * loads styles.css renders it unstyled — exactly the bug this refactor found.
 * So: guarantee the stylesheet link exists.
 */
function ensureStylesheet(html, relPath) {
  if (/href="[^"]*styles\.css/i.test(html)) return { html, added: false };
  const depth = relPath.split(/[\\/]/).length - 1;
  const href = '../'.repeat(depth) + 'styles.css?v=DEPLOYSTAMP';
  const link = `<link rel="stylesheet" href="${href}">`;
  const head = html.toLowerCase().indexOf('</head>');
  if (head < 0) return { html, added: false };
  return { html: html.slice(0, head) + '  ' + link + '\n' + html.slice(head), added: true };
}

/* -------------------------------------------------------------------- main */

const template = loadTemplate();
const overrides = loadOverrides();
const files = htmlFiles(ROOT);

let changed = 0, stylesheetAdded = 0, unchanged = 0;
const stale = [];

for (const full of files) {
  const rel = relative(ROOT, full);
  if (NO_FOOTER.has(rel.split(sep).join('/'))) { unchanged++; continue; }
  const before = readFileSync(full, 'utf8');

  let after = replaceFooter(before, render(template, rel, overrides));
  const ss = ensureStylesheet(after, rel);
  after = ss.html;

  if (after === before) { unchanged++; continue; }

  if (checkOnly) {
    stale.push(rel);
  } else {
    writeFileSync(full, after, 'utf8');
    changed++;
    if (ss.added) { stylesheetAdded++; console.log(`  + styles.css  ${rel}`); }
  }
}

if (checkOnly) {
  if (stale.length) {
    console.error(`\n  ${stale.length} page(s) have a stale or missing footer:\n`);
    stale.forEach(f => console.error(`    ${f}`));
    console.error(`\n  Fix with:  node tools/stamp-footers.mjs\n`);
    process.exit(1);
  }
  console.log(`  Footers current across ${files.length} pages.`);
  process.exit(0);
}


console.log(`\n  Footer stamp complete`);
console.log(`    ${changed} page(s) updated, ${unchanged} already current`);
if (stylesheetAdded) console.log(`    ${stylesheetAdded} page(s) had styles.css added`);
