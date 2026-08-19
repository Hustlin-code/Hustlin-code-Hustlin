/**
 * =============================================================================
 *  check-seo-lengths.mjs  —  title and meta description length, on the pages
 *                            that a search engine actually sees.
 * =============================================================================
 *
 *  WHY THIS EXISTS
 *  ---------------
 *  House rule: titles <= 65 characters, meta descriptions <= 160. Google
 *  truncates past roughly those widths, and a description that ends mid-clause
 *  in the SERP is the one piece of copy on the page nobody gets to finish
 *  reading. Nothing enforced it, so four pages drifted over without anyone
 *  noticing, and one of them was a page written the same week.
 *
 *  deploy-site.ps1 step 9 checks that a canonical and a description EXIST.
 *  It does not look at how long they are. This closes that half.
 *
 *  TWO THINGS IT GETS RIGHT THAT A NAIVE VERSION DOES NOT
 *  ------------------------------------------------------
 *  1. IT DECODES ENTITIES BEFORE MEASURING. `&amp;` is five characters in the
 *     file and one on the screen. A raw character count flagged
 *     debt-payoff-calculator.html at 66 when its rendered title is 62, and
 *     technical-analysis.html at 67 when it is inside the limit. Both were
 *     about to be "fixed" — rewriting correct copy because the measurement was
 *     wrong. Same failure mode as the calculator-count sweep that rewrote a
 *     historical note inside a comment. Measure what renders.
 *
 *  2. IT ONLY CHECKS CRAWLABLE PAGES. Skipped, deliberately:
 *       - anything already marked noindex (the thin Markets/ viewers,
 *         learn.html, auth screens). Their meta never reaches a SERP.
 *       - the five course master directories. Those files are uploaded to
 *         Supabase Storage and injected into learn.html as a body; the
 *         master's own <head> is discarded and never renders anywhere. Four
 *         of the TA masters are over the limit and it does not matter. Fixing
 *         them would cost a re-upload of paid course content for zero search
 *         benefit, so they stay out of scope rather than sitting in the report
 *         forever as noise a reader learns to scroll past.
 *
 *  USAGE
 *  -----
 *      node tools/check-seo-lengths.mjs           # report
 *      node tools/check-seo-lengths.mjs --check   # report, exit 1 if any over
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const TITLE_MAX = 65;
const DESC_MAX = 160;

/* Build output, timestamped backups and dependency trees. Same skip list the
   rest of the tools use — stamp-footers once walked _deploy/ and every
   _backup-* folder and rewrote footers inside them. */
const SKIP_DIR_MARKERS = ['_backup', '_deploy', 'node_modules', '.git', '_refactor-backup', '_seo-backup'];

/* Course masters: uploaded to Storage, rendered as a body inside learn.html.
   Their <head> never reaches a browser or a crawler. See note 2 above. */
const SKIP_DIRS = new Set([
  'Financial Literacy Course',
  'TA Course',
  'Fundemental Course',
  'EconomicsCourse',
  'TradingPsycologycourse',
]);

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
  '&nbsp;': ' ', '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
  '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”',
  '&sect;': '§', '&middot;': '·', '&times;': '×', '&minus;': '−',
  '&frac12;': '½', '&plusmn;': '±', '&deg;': '°', '&trade;': '™',
};

/* Decode before measuring. A numeric entity is one rendered character too. */
function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&[a-z0-9]+;/gi, (m) => (m in ENTITIES ? ENTITIES[m] : m));
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR_MARKERS.some((m) => e.name.startsWith(m))) continue;
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, out);
    } else if (e.name.endsWith('.html')) {
      /* footer.template.html, nav.template.html and tools/post-shell.template.html
         are fragments the stampers splice into real pages. They have no <head>
         and never will. check-assets.mjs still reports two of them as missing
         assets on every run, which is exactly how a gate becomes background
         noise — do not repeat it here. */
      if (e.name.endsWith('.template.html')) continue;
      out.push(full);
    }
  }
  return out;
}

const grab = (html, re) => {
  const m = html.match(re);
  return m ? decode(m[1]).trim() : null;
};

const over = [];
const missing = [];
let checked = 0;
let skippedNoindex = 0;

for (const file of walk(ROOT).sort()) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  let html;
  try {
    html = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  /* Not crawlable, so its meta never becomes a search result. */
  if (/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html)) {
    skippedNoindex++;
    continue;
  }

  const title = grab(html, /<title>([\s\S]*?)<\/title>/i);
  const desc = grab(html, /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
  checked++;

  /* Step 9 of deploy-site.ps1 already fails on a missing description, but
     report it here too rather than silently measuring nothing. */
  if (title === null) missing.push(`${rel}  — no <title>`);
  if (desc === null) missing.push(`${rel}  — no meta description`);

  const problems = [];
  if (title !== null && title.length > TITLE_MAX) problems.push(`title ${title.length}/${TITLE_MAX}`);
  if (desc !== null && desc.length > DESC_MAX) problems.push(`description ${desc.length}/${DESC_MAX}`);
  if (problems.length) over.push({ rel, problems, title, desc });
}

const check = process.argv.includes('--check');

if (!over.length && !missing.length) {
  console.log(`  SEO lengths: clean — ${checked} crawlable page(s), ` +
              `titles <= ${TITLE_MAX}, descriptions <= ${DESC_MAX}. ` +
              `(${skippedNoindex} noindex page(s) and the course masters skipped.)`);
  process.exit(0);
}

if (missing.length) {
  console.log('\n  Missing tags:');
  for (const m of missing) console.log('    ' + m);
}

if (over.length) {
  console.log(`\n  ${over.length} page(s) over the house limits ` +
              `(measured after entity decoding, so this is what renders):\n`);
  for (const o of over) {
    console.log(`    ${o.rel}`);
    for (const p of o.problems) console.log(`      ${p}`);
    if (o.problems.some((p) => p.startsWith('title'))) console.log(`      "${o.title}"`);
    if (o.problems.some((p) => p.startsWith('description'))) console.log(`      "${o.desc}"`);
    console.log('');
  }
  console.log('  Fix the copy at source — calculator pages come from tools/calc-content.mjs\n' +
              '  and glossary pages from tools/lingo-content.mjs, so edit the module and\n' +
              '  re-run its generator rather than the built page.');
}

console.log(`  ${checked} crawlable page(s) checked, ${skippedNoindex} noindex skipped.`);

/* Fail ONLY on a real length violation. A missing <title> is already deploy
   step 9's job, and failing here for something another gate owns would make
   this one fire for reasons its own name does not describe — which is how a
   gate stops being read. */
process.exit(check && over.length ? 1 : 0);
