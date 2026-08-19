/* ===================================================================
   check-calc-count.mjs
   -------------------------------------------------------------------
   Fails the build when any page states a calculator count that
   disagrees with CALCS.length.

   RUN:  node tools/check-calc-count.mjs          (report + exit 1)
         node tools/check-calc-count.mjs --fix    (rewrite them)

   WHY
   The count drifted three separate times. At one point the site said
   "Fourteen calculators" in the hub hero, "14 Tools" on the badge,
   "All 14 calculators" in the rail and "Sixteen calculators" in the
   nav — simultaneously, for a set of fifteen. Each fix was by hand and
   each one broke on the next calculator added.

   The generated surfaces are now derived: nav-template.mjs fills the
   nav, sidebar() builds the rail, sync-hub-sections.mjs owns the hub's
   hero, badge, meta description and JSON-LD. But the number also turns
   up in ordinary prose on marketing pages and in a redirect stub, and
   nothing can generate those. So this looks everywhere instead.

   FALSE POSITIVES ARE THE WHOLE DESIGN PROBLEM. "free calculators" and
   "the calculators" carry no count and must not trip it, so a match
   only counts when the word before is a recognised number word or a
   digit. Anything else is prose and is left alone.
   =================================================================== */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CALC_COUNT, CALC_COUNT_WORD, inWords } from './nav-template.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = process.argv.includes('--fix');

const SKIP_DIR = /(^|[\\/])(_backup|_deploy|node_modules|\.git)/;
/* nav.template.html holds the {{CALC_COUNT_WORD_CAP}} token by design. */
const SKIP_FILE = new Set(['nav.template.html']);

const NUMBERS = new Map();
for (let i = 1; i <= 99; i++) {
  NUMBERS.set(inWords(i), i);
  NUMBERS.set(String(i), i);
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* "<quantity> calculators", "<quantity> free calculators",
   "<quantity> Free Money Calculators" (the hub's og:title and twitter:title,
   which sat at 14 unnoticed because the old pattern was lower-case only),
   "<quantity> Tools". The quantity is validated against NUMBERS below, so
   "free calculators" and "the calculators" never match.

   Case is spelled out per word instead of using the /i flag ON PURPOSE. With
   /i the pattern also matches "tools" in ordinary prose, and it immediately
   claimed "three tools" on an Economics stage page and "two tools" on a
   glossary page were stale calculator counts. Neither sentence is about
   calculators. "Tools" stays capitalised-only; only Calculators is loosened. */
const RE = /\b([A-Za-z][A-Za-z-]*|\d+)(\s+(?:[Ff]ree\s+)?(?:[Mm]oney\s+|[Pp]ersonal [Ff]inance\s+)?[Cc]alculators|\s+Tools)\b/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (SKIP_DIR.test(full)) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.html') && !SKIP_FILE.has(name)) out.push(full);
  }
  return out;
}

/* Blank out regions that are not reader-facing copy before scanning, and
   restore them afterwards. This matters more than it sounds: nav.template.html
   carries a developer comment reading "why sixteen calculators and six guides
   were reachable only from the footer", which is stamped into every page. That
   sentence is a note about a decision taken when there WERE sixteen. Rewriting
   it to twenty-four does not fix a stale count, it falsifies a design note —
   and because the comment ships on 68 pages, doing it once looked like finding
   68 bugs. Comments, <script> and <style> are all out of scope. */
const MASKED = /<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi;

function scan(html, onHit) {
  const holes = [];
  const masked = html.replace(MASKED, (m) => {
    holes.push(m);
    return '\u0000'.repeat(m.length);
  });
  let i = 0;
  const out = masked.replace(RE, onHit);
  return out.replace(/\u0000+/g, () => holes[i++]);
}

let bad = 0, fixed = 0;
const report = [];

for (const file of walk(ROOT)) {
  const before = readFileSync(file, 'utf8');
  let hits = 0;

  const after = scan(before, (whole, qty, tail) => {
    const key = qty.toLowerCase();
    if (!NUMBERS.has(key)) return whole;          // prose, not a count
    if (NUMBERS.get(key) === CALC_COUNT) return whole;

    hits++;
    const isDigits = /^\d+$/.test(qty);
    const replacement = isDigits
      ? String(CALC_COUNT)
      : (qty[0] === qty[0].toUpperCase() ? cap(CALC_COUNT_WORD) : CALC_COUNT_WORD);
    report.push(`  ${relative(ROOT, file).replace(/\\/g, '/')}: "${whole.trim()}" -> "${replacement}${tail}"`);
    return replacement + tail;
  });

  if (!hits) continue;
  bad += hits;
  if (FIX) { writeFileSync(file, after, 'utf8'); fixed += hits; }
}

if (!bad) {
  console.log(`  calculator count consistent (${CALC_COUNT}) across every page.`);
  process.exit(0);
}

console.log(report.join('\n'));
if (FIX) {
  console.log(`\n  rewrote ${fixed} stale count(s) to ${CALC_COUNT}.`);
  process.exit(0);
}
console.error(`\n  ${bad} page(s) state a calculator count other than ${CALC_COUNT}.`);
console.error('  Fix with:  node tools/check-calc-count.mjs --fix');
process.exit(1);
