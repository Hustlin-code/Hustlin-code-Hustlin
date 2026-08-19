/**
 * =============================================================================
 *  check-course-nav.mjs  —  the module rail must actually work.
 * =============================================================================
 *
 *  WHY THIS EXISTS
 *  ---------------
 *  On 2026-08-09 two new modules shipped with this in the sidebar:
 *
 *      onclick="selectModule(m72)"        <-- no quotes
 *
 *  instead of selectModule('m72'). Unquoted, m72 is an identifier, so the
 *  handler throws ReferenceError the instant it is clicked. The module never
 *  becomes visible and the reader gets a blank panel.
 *
 *  Nothing caught it. The page was valid HTML, the module existed with 10KB of
 *  content in it, every div balanced, the ids and the sidebar entries matched
 *  each other perfectly, and all six existing gates passed. The only way to
 *  discover it was to click that one item — which is exactly the kind of bug
 *  that reaches production, because the other fourteen items on the same page
 *  worked fine.
 *
 *  (Cause, for the record: the insert was scripted with `node -e '...'` wrapped
 *  in bash single quotes, and a literal 'm72' inside it was eaten by the shell
 *  before node ever saw it. The generated HTML was exactly what the script
 *  asked for. Use \x27 or a real .mjs file.)
 *
 *  WHAT IT CHECKS, on every page that has a module rail:
 *    1. every selectModule(...) argument is a quoted string
 *    2. every data-cs in the sidebar points at a module that exists
 *    3. every module in .course-main has a sidebar entry pointing at it
 *    4. no duplicate module ids
 *    5. the onclick target and the data-cs attribute on the same item agree
 *
 *  3 and 5 matter as much as 1. A module with no sidebar entry is unreachable
 *  — it is in the HTML, a crawler can read it, and no human can ever open it.
 *  A mismatch between onclick and data-cs shows the wrong module and marks the
 *  wrong item active, which looks like a content bug rather than a wiring one.
 *
 *  USAGE
 *  -----
 *      node tools/check-course-nav.mjs      # report and exit 1 on any finding
 *
 *  Writes nothing, so it is safe in -Check and out of it alike.
 * =============================================================================
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const findings = [];

/* Every HTML file that could carry a rail: site root plus the course masters. */
function collect() {
  const out = [];
  for (const f of readdirSync(ROOT)) {
    if (f.endsWith('.html') && f !== 'footer.template.html') out.push(f);
  }
  for (const d of readdirSync(ROOT)) {
    const p = join(ROOT, d);
    if (!existsSync(p) || !statSync(p).isDirectory()) continue;
    if (d.startsWith('_') || d === 'node_modules' || d === '.git' || d === 'tools') continue;
    for (const f of readdirSync(p)) {
      if (f.endsWith('.html')) out.push(join(d, f));
    }
  }
  return out;
}

for (const rel of collect()) {
  const html = readFileSync(join(ROOT, rel), 'utf8');
  if (!html.includes('selectModule(') && !html.includes('data-cs=')) continue;

  /* 1. unquoted argument — the one that shipped */
  for (const m of html.matchAll(/selectModule\(\s*([^)'"\s][^)]*)\)/g)) {
    findings.push([rel, `selectModule(${m[1]}) — argument is not a quoted string, this throws ReferenceError on click`]);
  }

  /* Same trap as the sidebar matcher below: the class is "module" on most
     modules and "module cs-visible" on whichever one ships visible, so a
     literal match silently missed one module per guide page and then reported
     its sidebar entry as dangling. Both matchers now look for the class as a
     word inside the attribute rather than as the whole attribute. */
  const modIds = [...html.matchAll(/<div[^>]*class="[^"]*\bmodule\b[^"]*"[^>]*id="(m\d+)"/g)].map(m => m[1]);
  const dupes = modIds.filter((id, i) => modIds.indexOf(id) !== i);
  for (const d of [...new Set(dupes)]) {
    findings.push([rel, `duplicate module id "${d}" — getElementById only ever returns the first`]);
  }

  /* the sidebar items, with both of their references to a module */
  /* The class attribute is not always exactly "cs-item" — the first module on
     every stage ships as "cs-item cs-active". Matching the literal string
     missed one item per page and reported that page's first module as
     unreachable, which was a false positive in the first version of this
     script and would have trained everyone to ignore it. */
  const items = [...html.matchAll(/<div[^>]*class="[^"]*\bcs-item\b[^"]*"[^>]*>/g)].map(m => m[0]);
  const csIds = [];
  for (const tag of items) {
    const cs = /data-cs="([^"]*)"/.exec(tag);
    const oc = /selectModule\(\s*['"]([^'"]*)['"]\s*\)/.exec(tag);
    if (cs) csIds.push(cs[1]);

    /* 5. the two references on one item must agree */
    if (cs && oc && cs[1] !== oc[1]) {
      findings.push([rel, `sidebar item mismatch: onclick opens "${oc[1]}" but data-cs says "${cs[1]}"`]);
    }
    /* 2. the target has to exist */
    if (cs && cs[1] && !modIds.includes(cs[1])) {
      findings.push([rel, `sidebar entry data-cs="${cs[1]}" has no matching module in the page`]);
    }
  }

  /* 3. and nothing may be unreachable */
  for (const id of modIds) {
    if (!csIds.includes(id)) {
      findings.push([rel, `module "${id}" has no sidebar entry — it is in the HTML but no reader can open it`]);
    }
  }
}

if (findings.length === 0) {
  console.log('  course nav: clean - every module reachable, every selectModule call quoted.');
  process.exit(0);
}

console.error('\n  COURSE MODULE NAVIGATION IS BROKEN\n');
let last = null;
for (const [file, msg] of findings) {
  if (file !== last) { console.error(`    ${file}`); last = file; }
  console.error(`      ${msg}`);
}
console.error(`
  ${findings.length} finding(s).

  These do not show up in any other gate: the HTML is valid, the divs balance
  and the module content is all there. The rail simply does not work, and only
  for the affected items — so the page looks fine until someone clicks the one
  that is broken.

  If you generated this markup from a script, check your shell quoting before
  you check the script: 'm72' inside a bash-single-quoted node -e is eaten by
  the shell, not by node.
`);
process.exit(1);
