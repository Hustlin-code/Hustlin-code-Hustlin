/* ===================================================================
   sync-hub-sections.mjs
   -------------------------------------------------------------------
   Re-writes the 14 calculator widgets inside calculate-your-hustle.html
   from the same source the standalone pages are built from, so the hub
   and the standalone pages can never drift apart.

   IDEMPOTENT. Run it as many times as you like. The one-time structural
   conversion of the hub (chip nav -> sidebar rail, inline CSS/JS ->
   shared files) was a separate migration and is already done; this
   script only swaps section bodies and therefore stays safe to re-run.

   ORDER:  build-calculators.mjs -> sync-hub-sections.mjs -> stamp-footers.mjs
   =================================================================== */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CALCS } from './calc-content.mjs';
import { SECTIONS, sidebar } from './build-calculators.mjs';
import { CALC_COUNT, CALC_COUNT_WORD } from './nav-template.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const F = join(ROOT, 'calculate-your-hustle.html');
let s = readFileSync(F, 'utf8');
const before = s;

/* INSERT IF MISSING, rather than fail.

   This used to process.exit(1) on any CALCS id with no matching section
   already in the hub, which meant adding a calculator was a two-step dance:
   hand-paste a stub section into calculate-your-hustle.html first, then run
   the sync. Nobody remembers step one, so the first run after adding a
   calculator always failed and always looked like a real error.

   A new section is appended in CALCS order, immediately after the last
   section that IS present, so the hub keeps the same running order as the
   rail and the standalone pages. */
let replaced = 0, inserted = [];
const withCta = (c) => SECTIONS[c.id].replace(/<\/section>$/,
  `  <p style="margin:18px 0 0;font-size:13.5px"><a href="${c.slug}.html" ` +
  `style="color:#8A6D08;font-weight:700;text-decoration:none">` +
  `Full guide, worked example and FAQ &rarr;</a></p>\n</section>`);

let lastEnd = -1;
for (const c of CALCS) {
  const re = new RegExp(`<section class="cyh-tool" id="${c.id}">[\\s\\S]*?\\n</section>`);
  const m = re.exec(s);
  if (m) {
    s = s.slice(0, m.index) + withCta(c) + s.slice(m.index + m[0].length);
    lastEnd = m.index + withCta(c).length;
    replaced++;
    continue;
  }
  if (lastEnd < 0) {
    console.error(`  cannot place "${c.id}": no earlier section exists in the hub to place it after`);
    process.exit(1);
  }
  const block = '\n\n' + withCta(c);
  s = s.slice(0, lastEnd) + block + s.slice(lastEnd);
  lastEnd += block.length;
  inserted.push(c.id);
}

/* ------------------------------------------------------------ the count --
   The number of calculators is written in prose in four hand-maintained
   places on this page, and it has drifted three separate times: the hub said
   "Fourteen calculators" and "14 Tools" while the rail said fifteen and the
   nav said sixteen, all at once, for a set of fifteen. Every time it was
   fixed by hand it broke again on the next calculator added.

   sidebar() has always derived it from CALCS.length. These four now do too.
   The fifth place — the nav panel — lives inside the NAV block and is filled
   from the same source by nav-template.mjs when stamp-nav runs.

   The regexes are anchored on the surrounding prose rather than searching for
   a number, so they cannot wander into a figure that belongs to something
   else on the page. */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const WORD = cap(CALC_COUNT_WORD);
const counts = [
  [/(<meta name="description" content=")[A-Za-z-]+( free calculators)/, WORD],
  [/("description": ")[A-Za-z-]+( free personal finance)/, WORD],
  [/(\n\s{4})[A-Za-z-]+( calculators that run your actual numbers)/, WORD],
  [/(<span class="cyh-badge">)\d+( Tools<\/span>)/, String(CALC_COUNT)]
];
let countsFixed = 0;
for (const [re, value] of counts) {
  const before = s;
  s = s.replace(re, (m, a, b) => a + value + b);
  if (s !== before) countsFixed++;
}

/* ---------------------------------------------------------------- sidebar --
   The hub's rail used to be static. _hub-rewrite.mjs wrote it once from
   sidebar(null) and nothing ever wrote it again, so the moment a calculator
   was renamed or its slug changed, the fourteen standalone pages updated and
   the hub quietly kept pointing at the old name and the old URL.

   That is exactly what happened renaming the Sinking Fund: every standalone
   page picked up "Life Just Happened Fund", and the hub — the page most
   readers actually start on — still said "Sinking Fund" and linked to a URL
   that had become a redirect stub. It was found by grep, not by a gate, which
   is the part worth fixing.

   sidebar(null) is the same function the standalone pages use, so the rail is
   now generated from one source in both places and cannot drift again. null
   means "no current page", which is right for the hub: every calculator on it
   is present, so none of them is the one you are on. */
const rail = /<aside class="cyh-side">[\s\S]*?<\/aside>/;
if (!rail.test(s)) {
  console.error('  MISSING from hub: the <aside class="cyh-side"> rail');
  process.exit(1);
}
s = s.replace(rail, sidebar(null));
const note = (inserted.length ? `, ${inserted.length} inserted (${inserted.join(', ')})` : '') +
             (countsFixed ? `, count -> ${CALC_COUNT}` : '');

/* --check exists so this can be a deploy gate. deploy-site.ps1 does not run the
   calculator builder, so without a gate the sequence "edit calc-content.mjs,
   forget to sync, ship" puts a stale hub live with a wrong calculator count and
   section bodies that disagree with the standalone pages. That is the exact
   failure this script was written to prevent, and it was only prevented as long
   as somebody remembered to run it. */
if (s === before) {
  console.log(`  hub already in sync (${replaced} sections + rail)`);
} else if (CHECK) {
  console.error(`  hub is STALE: ${replaced} sections${note} + rail would change`);
  console.error('  Fix with:  node tools/sync-hub-sections.mjs');
  process.exit(1);
} else {
  writeFileSync(F, s, 'utf8');
  console.log(`  hub updated: ${replaced} sections${note} + rail synced`);
}
