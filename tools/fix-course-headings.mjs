/* ===================================================================
   fix-course-headings.mjs
   -------------------------------------------------------------------
   One heading structure across all five courses.

   RUN:  node tools/fix-course-headings.mjs
         node tools/fix-course-headings.mjs --check   (writes nothing,
                                                       exits 1 if work is due)

   THE PROBLEM IT FIXES
   Financial Literacy Stage 1 wrote module titles as <h2> and section
   subheads as <h3>. Every other stage, and all four paid courses,
   wrote the same two things as <div class="mod-title"> and <h4>. So:

     - a module title was not a heading at all, which means a crawler
       and a screen reader saw 300+ lesson sections as unheaded text;
     - every one of those pages went <h1> hero straight to <h4>, a
       two-level skip;
     - and because .mod-body h4 is pinned at .92rem while .mod-body p
       is .93rem, the section heading rendered SMALLER than the body
       text it introduced.

   WHAT IT DOES
     1. <div class="mod-title"> -> <h2 class="mod-title">.
        .mod-title pins font-size:1rem and margin:0, so this is a
        visual no-op — the class was already doing all the work.
     2. Section subheads <h4> -> <h3>, chosen BY NESTING DEPTH: only
        direct children of .mod-body move. Headings inside .vid-section,
        .tip-txt, .warn-txt, .bud-col and friends are sub-content of a
        section rather than sections themselves, and they stay <h4>.
        A blanket regex here would promote every "Watch:" video card
        and every tip box, which is how you turn one wrong hierarchy
        into a different wrong hierarchy.
     3. A module that opens on a card heading with no section heading
        before it gets that first one promoted, because it IS the
        module's first section.

   IDEMPOTENT. Safe to re-run; a converted course reports 0.
   -------------------------------------------------------------------
   AFTER RUNNING THIS ON A PAID COURSE: re-upload those masters to the
   Courses bucket. learn.html serves course HTML from Supabase Storage,
   so a change that stays in the repo reaches nobody.
   =================================================================== */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const COURSES = [
  'Financial Literacy Course',
  'TA Course',
  'EconomicsCourse',
  'Fundemental Course',
  'TradingPsycologycourse',
];

const VOID_TAG = /^<(br|hr|img|input|meta|link|source)\b/i;

/* ---- 1. module titles ------------------------------------------- */
function titlesToH2(html) {
  let n = 0;
  const out = html.replace(/<div(\s+class="mod-title")>([\s\S]*?)<\/div>/g, (m, cls, inner) => {
    n++;
    return `<h2${cls}>${inner}</h2>`;
  });
  return { html: out, n };
}

/* ---- 2. section subheads, by depth ------------------------------ */
function subheadsToH3(html) {
  const parts = html.split(/(<[^>]*>)/);
  let depth = null;   // null = outside a .mod-body, integer = depth within one
  let n = 0;

  for (let i = 0; i < parts.length; i++) {
    const tag = parts[i];
    if (!tag.startsWith('<')) continue;

    if (/^<div\s+class="mod-body"/.test(tag)) { depth = 0; continue; }
    if (depth === null) continue;

    if (/^<div\b/.test(tag) && !tag.endsWith('/>')) depth++;
    else if (/^<\/div>/.test(tag)) { depth--; if (depth < 0) depth = null; }
    else if (depth === 0 && /^<h4(\s|>)/.test(tag)) {
      parts[i] = tag.replace('<h4', '<h3');
      for (let j = i + 1; j < parts.length; j++) {
        if (parts[j] === '</h4>') { parts[j] = '</h3>'; break; }
      }
      n++;
    }
  }
  return { html: parts.join(''), n };
}

/* ---- 3. a module whose first heading is a card heading ---------- */
function promoteFirstHeading(html) {
  const blocks = html.split(/(?=<div class="module" id=")/);
  let n = 0;
  for (let i = 1; i < blocks.length; i++) {
    const bodyAt = blocks[i].indexOf('<div class="mod-body">');
    if (bodyAt < 0) continue;
    const head = blocks[i].slice(0, bodyAt);
    let rest = blocks[i].slice(bodyAt);
    const m = /<h([34])(\s|>)/.exec(rest);
    if (!m || m[1] !== '4') continue;            // already opens on an h3
    const close = rest.indexOf('</h4>', m.index);
    if (close < 0) continue;
    rest = rest.slice(0, m.index) + rest.slice(m.index, close).replace('<h4', '<h3') +
           '</h3>' + rest.slice(close + 5);
    blocks[i] = head + rest;
    n++;
  }
  return { html: blocks.join(''), n };
}

/* ---- report ------------------------------------------------------ */
function skips(html) {
  const hs = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  let c = 0;
  for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) c++;
  return c;
}

let totalTitles = 0, totalSubs = 0, totalFirst = 0, touched = 0;
const dirty = [];

for (const course of COURSES) {
  const dir = join(ROOT, course);
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
  const lines = [];

  for (const file of files) {
    const path = join(dir, file);
    const before = readFileSync(path, 'utf8');
    if (!before.includes('class="mod-body"')) continue;   // marketing page, not a stage

    const a = titlesToH2(before);
    const b = subheadsToH3(a.html);
    const c = promoteFirstHeading(b.html);

    const changed = a.n + b.n + c.n;
    if (!changed) continue;

    if (!CHECK) writeFileSync(path, c.html, 'utf8');
    else dirty.push(`${course}/${file}`);

    totalTitles += a.n; totalSubs += b.n; totalFirst += c.n; touched++;
    lines.push(`    ${file.padEnd(38)} titles ${String(a.n).padStart(2)}  subheads ${String(b.n).padStart(3)}  first ${c.n}  skips ${skips(before)} -> ${skips(c.html)}`);
  }

  if (lines.length) { console.log(`  ${course}`); for (const l of lines) console.log(l); }
  else console.log(`  ${course.padEnd(28)} already consistent`);
}

console.log(
  `\n${CHECK ? 'would convert' : 'converted'} ${totalTitles} module title(s), ` +
  `${totalSubs} section subhead(s) and ${totalFirst} opening heading(s) across ${touched} file(s)`
);

if (CHECK && dirty.length) {
  console.log('\nThese course files still carry the old heading structure:');
  for (const d of dirty) console.log(`  ${d}`);
  console.log('\nFix with:  node tools/fix-course-headings.mjs');
  process.exitCode = 1;
}
