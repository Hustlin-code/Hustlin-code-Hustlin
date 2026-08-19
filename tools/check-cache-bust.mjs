#!/usr/bin/env node
/* ============================================================================
   check-cache-bust.mjs — every local .js/.css reference must carry ?v=
   ============================================================================

   WHY THIS EXISTS

   A reference without a version token is cached by URL. The browser has no
   reason to ask for it again, so a reader keeps whatever copy they first
   downloaded and NO DEPLOY CAN DISLODGE IT. Step 6 of deploy-site.ps1 exists
   precisely to rewrite `?v=DEPLOYSTAMP` to the build date — but it can only
   rewrite tokens that are there.

   This has now bitten twice:

     app.js            shipped untokenised on the course masters while every
                       other asset carried ?v=. Readers were pinned to a stale
                       engine indefinitely. Recorded in build-public-stages.mjs
                       step 5b.

     stage-outro.js    the 2026-08-10 share rollout added 16 references with no
                       token, immediately after changing that very script. The
                       symptom would have been the share bar simply never
                       appearing for anyone who had visited the site before —
                       indistinguishable from "the feature does not work".

   Both were caught by eye. Neither was caught by a gate, because no gate was
   looking. That is what this fixes.

   WHAT COUNTS

   Local .js and .css only. External CDN and font URLs are versioned by the
   host and are none of our business; data: and inline scripts have no URL to
   cache. A token of any value passes — this checks that versioning EXISTS,
   not what it says, because step 6 owns the value.
   ========================================================================== */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIRS = new Set([
  'node_modules', '_deploy', '_gitwork', '.git', '.github', 'supabase',
  'assets', 'mascot', 'tools', '_seo-backup', '_refactor-backup',
  /* The course masters are gitignored, never served as pages, and reference
     `../app.js` untokenised ON PURPOSE — build-public-stages.mjs step 5b adds
     the token while generating the public copy, which is the file that
     actually ships. Scanning them here would report 37 findings that are all
     correct, which is how a gate gets ignored. The PUBLIC copies are still
     checked, so if step 5b ever stops adding the token this still fails. */
  'Financial Literacy Course', 'TA Course', 'Fundemental Course',
  'EconomicsCourse', 'TradingPsycologycourse',
]);
const SKIP_DIR_RE = /^_backup-/;

/* Templates are fragments, not pages, and are stripped from _deploy. They are
   still checked: nav.template.html is stamped INTO 48 pages, so an untokenised
   reference there would propagate everywhere at once. */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || SKIP_DIR_RE.test(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

/* src="..." on <script> and href="..." on <link rel=stylesheet>. Matching the
   attribute rather than the tag keeps this readable and catches both. */
const REF = /(?:src|href)="([^"]+\.(?:js|css))(\?[^"]*)?"/g;

const findings = [];
let checked = 0;
let refs = 0;

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const html = readFileSync(file, 'utf8');
  checked++;

  for (const m of html.matchAll(REF)) {
    const [, url, query] = m;
    // Off-site assets are versioned by whoever serves them.
    if (/^(https?:)?\/\//.test(url) || url.startsWith('data:')) continue;
    refs++;
    if (!query || !/[?&]v=/.test(query)) findings.push({ rel, url });
  }
}

if (!findings.length) {
  console.log(`  cache-bust: clean - ${refs} local asset reference(s) across ${checked} pages, all versioned.`);
  process.exit(0);
}

console.error(`\n  ${findings.length} local asset reference(s) ship with no ?v= token:\n`);
for (const f of findings) console.error(`    ${f.rel}\n      ${f.url}`);
console.error('\n  Add ?v=DEPLOYSTAMP to each. Step 6 of deploy-site.ps1 rewrites it to the');
console.error('  build date; without it the file is cached by URL and no deploy can');
console.error('  replace it for anyone who has already visited.\n');
process.exit(1);
