/**
 * =============================================================================
 *  check-shared-css.mjs  —  a class used on more than one page belongs in
 *                           styles.css.
 * =============================================================================
 *
 *  THE BUG THIS CATCHES, TWICE IN ONE DAY
 *  --------------------------------------
 *  A page-local <style> block defines a class. Another page uses the same
 *  class and does not carry the rule. The second page renders the element
 *  with no styling at all, and because it is still *there* - just wrong size,
 *  wrong colour - it does not look broken enough to notice in a diff.
 *
 *  On 2026-08-09 this had happened twice and both had been live for weeks:
 *
 *    .nav-market-btn  defined in blog.html, used on about.html and five blog
 *                     posts. On six of seven pages the Markets pill rendered
 *                     as a bare purple text link.
 *    .breadcrumb      defined in blog.html and disability-wealth-guide.html,
 *                     used on 22 pages. On the other twenty it rendered at
 *                     inherited body size - 21px at the site's 130% root -
 *                     in the browser's default visited-link purple.
 *
 *  Neither failed a gate, because until now no gate knew that "defined here,
 *  used there" was even a thing.
 *
 *  USAGE
 *  -----
 *      node tools/check-shared-css.mjs            # report + exit 1 if any
 *      node tools/check-shared-css.mjs --list     # also list every local class
 *
 *  WHAT COUNTS AS A PROBLEM
 *  ------------------------
 *  A class that is (a) defined in some page's inline <style>, and (b) used in
 *  the markup of a DIFFERENT page that does not itself define it. Same-page
 *  definition and use is exactly what a page-local block is for and is fine.
 *
 *  THE FIX IS ALWAYS THE SAME
 *  --------------------------
 *  Move the rule to styles.css - or to blog/post.css if it is blog-post-only -
 *  and delete the local copies. Do not paste the rule into the second page:
 *  that is how nine byte-identical copies of .breadcrumb came to exist across
 *  the course and Markets pages, all of which then had to be found and removed.
 *
 *  DELIBERATE LIMITS
 *  -----------------
 *  This is a text scan, not a CSS parser. It reads simple leading class
 *  selectors and `class="..."` attributes. It will miss a class only ever
 *  applied by JavaScript, and it ignores anything inside a media query's
 *  nested braces only insofar as the selector still starts with a dot. Both
 *  are acceptable: the failure it is aimed at is a hand-written rule in one
 *  file and hand-written markup in another.
 * =============================================================================
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIST = process.argv.includes('--list');

const SKIP_DIRS = new Set([
  'node_modules', '_deploy', 'tools', '.git', '.github', 'supabase',
  'Financial Literacy Course', 'TA Course', 'Fundemental Course',
  'EconomicsCourse', 'TradingPsycologycourse', 'assets', 'mascot',
]);

/* Classes owned by third parties or generated at runtime. A rule for these
   legitimately lives wherever the widget that needs it lives. */
const IGNORE = new Set(['adsbygoogle', 'grecaptcha-badge']);

/* KNOWN OUTSTANDING - real findings, not yet fixed.
 *
 * These are genuine: each one is a class styled on some pages and used
 * unstyled on the page listed. They are all on the Markets pages, which were
 * out of scope on 2026-08-09 when this checker was written to fix the blog,
 * and Markets pages carry generated data blocks that make a blind sweep the
 * wrong move.
 *
 * They live here rather than being downgraded to a warning on purpose. A gate
 * that prints warnings nobody acts on is a gate you have taught yourself to
 * scroll past; a gate that is red or green, with the outstanding work written
 * down in the source, is one you still believe. An entry that no longer
 * reproduces is reported as stale below, so this list cannot quietly outlive
 * the problem it describes.
 *
 *   .mkt-filter-note  markets-fundamental.html has one and no rule for it.
 *   .sym              markets-economic.html has one; only symbol-check.html
 *                     styles .sym standalone.
 */
/* .mkt-table was here until 2026-08-10. Resolved properly rather than
   silenced: the base rules moved out of the three inline copies and into
   styles.css, so Markets/compare.html's <table class="mkt-table sec-table">
   now gets them like every other page. The stale-entry check is what forced
   the issue — it went red the moment the finding stopped reproducing. */
const KNOWN = new Map([
  ['mkt-filter-note', ['markets-fundamental.html']],
  ['sym', ['markets-economic.html']],
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('_backup-') || SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

/* Rules that live in a real stylesheet are, by definition, shared. */
const sheets = ['styles.css', 'calculators.css', join('blog', 'post.css')]
  .map(f => join(ROOT, f))
  .filter(f => { try { statSync(f); return true; } catch { return false; } });

const SHARED = new Set();
for (const f of sheets) {
  for (const m of readFileSync(f, 'utf8').matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
    SHARED.add(m[1]);
  }
}

const files = walk(ROOT).sort();
const definesLocally = new Map();   // class -> [file, ...]
const usesInMarkup = new Map();     // class -> [file, ...]

for (const path of files) {
  const rel = relative(ROOT, path).replace(/\\/g, '/');
  const src = readFileSync(path, 'utf8');

  const styles = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
  const markup = src.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  /* Only UNSCOPED, SINGLE-CLASS rules count as "this class is styled here":
     the selector's first compound must be the class on its own.

         .breadcrumb            counts
         .breadcrumb a          counts   - still keyed on .breadcrumb
         .email-ok:hover        counts
         .mkt-table td.up       does NOT - .up is only styled inside a table
         .eco-hero .lede        does NOT - .lede is only styled inside that hero

     Without this the report drowns in false positives. A class that is only
     ever meaningful under an ancestor is not a shared component, and another
     page using the bare class was never going to inherit it anyway. The bug
     being hunted is the standalone component - a pill, a breadcrumb, a
     success panel - that works on the page it was written on and nowhere
     else. */
  const rules = styles.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of rules.matchAll(/(^|[{}])\s*([^{}@][^{}]*?)\s*\{/g)) {
    for (const sel of m[2].split(',')) {
      const key = /^\.(-?[A-Za-z_][\w-]*)(?![\w-])(?:::?[\w-]+(?:\([^)]*\))?)*(?:[\s>+~][^,]*)?$/
        .exec(sel.trim());
      if (!key) continue;
      if (!definesLocally.has(key[1])) definesLocally.set(key[1], []);
      if (!definesLocally.get(key[1]).includes(rel)) definesLocally.get(key[1]).push(rel);
    }
  }
  for (const m of markup.matchAll(/class="([^"{}]*)"/g)) {
    for (const c of m[1].trim().split(/\s+/)) {
      if (!c) continue;
      if (!usesInMarkup.has(c)) usesInMarkup.set(c, []);
      if (!usesInMarkup.get(c).includes(rel)) usesInMarkup.get(c).push(rel);
    }
  }
}

const problems = [];
const stillKnown = new Set();
for (const [cls, definers] of definesLocally) {
  if (SHARED.has(cls) || IGNORE.has(cls)) continue;
  const users = usesInMarkup.get(cls) || [];
  let orphans = users.filter(u => !definers.includes(u));
  if (KNOWN.has(cls)) {
    const before = orphans.length;
    orphans = orphans.filter(u => !KNOWN.get(cls).includes(u));
    if (before !== orphans.length) stillKnown.add(cls);
  }
  if (orphans.length) problems.push({ cls, definers, orphans });
}

/* An allowlist entry that no longer reproduces is itself a problem: it means
   the list is describing a past state and will start hiding a future one. */
const staleKnown = [...KNOWN.keys()].filter(c => !stillKnown.has(c));
if (staleKnown.length) {
  console.error('shared css: KNOWN entries that no longer reproduce - delete them\n');
  for (const c of staleKnown) console.error(`  .${c}`);
  console.error('');
  process.exit(1);
}

if (LIST) {
  const local = [...definesLocally.keys()].filter(c => !SHARED.has(c)).sort();
  console.log(`page-local classes not in a shared stylesheet: ${local.length}`);
  for (const c of local) console.log(`  .${c}  <- ${definesLocally.get(c).join(', ')}`);
  console.log('');
}

if (!problems.length) {
  console.log(`shared css: clean - ${files.length} pages, no class styled on one page and used unstyled on another.`);
  process.exit(0);
}

problems.sort((a, b) => b.orphans.length - a.orphans.length);
console.error('shared css: classes defined on one page and used unstyled on others\n');
for (const { cls, definers, orphans } of problems) {
  console.error(`  .${cls}`);
  console.error(`      defined in : ${definers.join(', ')}`);
  console.error(`      unstyled on: ${orphans.length} page(s) - ${orphans.slice(0, 6).join(', ')}${orphans.length > 6 ? ', …' : ''}`);
}
console.error('\nMove the rule into styles.css (or blog/post.css for post-only styling)');
console.error('and delete the local copies. Do not paste it into the second page.');
process.exit(1);
