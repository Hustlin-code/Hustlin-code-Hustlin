/* ===================================================================
   crosslink-modules.mjs
   -------------------------------------------------------------------
   Turns bare "Module 08" / "Stage 1, Module 02" references in the
   Financial Literacy masters into named, clickable crosslinks.

   RUN:  node tools/crosslink-modules.mjs
         node tools/crosslink-modules.mjs --check   (writes nothing)

   WHY
   "See Module 08 for the full breakdown" is meaningless to a reader.
   They are on Module 13, the sidebar shows titles and not numbers, and
   nothing about "08" tells them what they are being sent to or how to
   get there. Every reference becomes "Module 08: Your Three-Tier
   Safety Net" and every one of them is a link.

   HOW THE LINK WORKS
   course-shell.js shows ONE module at a time, so a plain href="#m7"
   anchor points at a display:none element and does nothing. Same-stage
   links therefore carry data-mod="m7" as well as href="#m7";
   course-shell.js intercepts those and calls selectModule(). The href
   is left intact so the URL is real for crawlers and for open-in-new-tab,
   and course-shell.js reads location.hash on load, which is what makes
   a cross-stage link land on the named module rather than the top of
   the stage.

   SAFE REGIONS
   Rewrites text nodes only. Never touches attribute values, <script>,
   <style>, JSON-LD, the module headers themselves (.mod-num /
   .mod-title / .mod-sub), the sidebar (.cs-item), or text already
   inside an <a>. Running it twice is a no-op.

   ORDER: run before build-public-stages.mjs. The public copies are
   generated from these masters and #anchors survive de-nesting.
   =================================================================== */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'Financial Literacy Course');
const CHECK = process.argv.includes('--check');

/* ---------- index every module in every stage ---------------------- */

const FILES = readdirSync(SRC).filter((f) => /^stage-\d-[a-z]+\.html$/.test(f)).sort();

const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/* Titles like "Understanding Your Credit Score — and What It Really Means"
   are a headline plus a subclause. Inline, mid-sentence, only the headline
   earns its space; the rest is noise the reader did not ask for. */
const shortTitle = (t) => t.split(/\s+[—–]\s+/)[0].trim();

const index = new Map();   // file -> [{id, num, title, short}]
const byStage = new Map(); // stage number -> {file, mods}

for (const file of FILES) {
  const html = readFileSync(join(SRC, file), 'utf8');
  const mods = [];
  for (const chunk of html.split(/(?=<div class="module" id=")/).slice(1)) {
    const id = (chunk.match(/^<div class="module" id="([^"]+)"/) || [])[1];
    const num = (chunk.match(/<div class="mod-num">\s*MODULE\s+(\d+)\s*<\/div>/i) || [])[1];
    /* Stage 1 marks module titles with <h2 class="mod-title">; Stages 2-5
       still use <div class="mod-title">. Both are matched here rather than
       normalised, because changing the tag is a heading-structure decision
       for the SEO gate to make, not a side effect of adding links. */
    const ttl = (chunk.match(/<(h2|div)[^>]*class="mod-title"[^>]*>([\s\S]*?)<\/\1>/i) || [])[2];
    if (!id || !num || !ttl) continue;
    const title = stripTags(ttl);
    mods.push({ id, num, title, short: shortTitle(title) });
  }
  index.set(file, mods);
  byStage.set(Number(file.match(/^stage-(\d)/)[1]), { file, mods });
}

const findMod = (mods, num) => mods.find((m) => Number(m.num) === Number(num));

/* HTML entities are how these files write dashes and apostrophes; a title
   lifted out of a heading is already escaped, so it goes back in as-is. */
const linkSame = (m, label) =>
  `<a class="mod-xref" href="#${m.id}" data-mod="${m.id}">${label}</a>`;
const linkCross = (file, m, label) =>
  `<a class="mod-xref" href="${file}#${m.id}">${label}</a>`;

/* ---------- text-node walker --------------------------------------
   A real parser is overkill and a naive global regex is wrong: it would
   rewrite "Module 02" inside <div class="mod-num">, inside the sidebar,
   and inside links that are already correct. This walks tags, keeps a
   skip depth, and only ever hands text nodes to the rewriter. */

const SKIP_TAGS = new Set(['script', 'style', 'title', 'textarea']);
const SKIP_CLASS = /\b(mod-num|mod-title|mod-sub|cs-item|cs-txt|stage-tab)\b/;

function walkText(html, rewrite) {
  const parts = html.split(/(<[^>]*>)/);
  const stack = [];
  let skip = 0;
  let out = '';

  for (const part of parts) {
    if (part.startsWith('<')) {
      out += part;
      const close = /^<\/\s*([a-zA-Z][\w-]*)/.exec(part);
      const open = /^<\s*([a-zA-Z][\w-]*)([^>]*)>/.exec(part);
      if (close) {
        const name = close[1].toLowerCase();
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].name === name) {
            if (stack[i].skip) skip--;
            stack.splice(i, 1);
            break;
          }
        }
      } else if (open && !part.endsWith('/>') && !/^<(br|hr|img|input|meta|link|source)\b/i.test(part)) {
        const name = open[1].toLowerCase();
        const attrs = open[2] || '';
        const isSkip = SKIP_TAGS.has(name) || name === 'a' || SKIP_CLASS.test(attrs);
        if (isSkip) skip++;
        stack.push({ name, skip: isSkip });
      }
      continue;
    }
    out += skip > 0 ? part : rewrite(part);
  }
  return out;
}

/* ---------- the rewrite ------------------------------------------- */

/* ONE regex, not two. Two passes looked fine and were wrong: the cross-stage
   pass inserts "...Module 02: The Paperwork Is the Hustle</a>" into the string,
   and a following same-stage pass then matched "Module 02" INSIDE the link it
   had just written, nesting an <a> in an <a>. The optional Stage prefix keeps
   it to a single left-to-right pass. */
const REF_RX = /\b(?:Stage\s+([1-5]),\s*)?Module\s+(\d+)\b/g;

let totalHits = 0;
let touched = 0;
const unresolved = [];

for (const file of FILES) {
  const path = join(SRC, file);
  let html = readFileSync(path, 'utf8');
  const before = html;
  const mods = index.get(file);
  const hits = [];

  /* Pre-pass: a reference that is ALREADY a link but only says
     "Stage 3, Module 11". Upgrade the label and point the href at the
     module rather than the top of the stage. */
  html = html.replace(
    /<a([^>]*?)href="\/?(stage-([1-5])-[a-z]+\.html)"([^>]*)>\s*Stage\s+([1-5]),\s*Module\s+(\d+)\s*<\/a>/g,
    (whole, a1, target, sNum, a2, refStage, refNum) => {
      const st = byStage.get(Number(refStage));
      const m = st && findMod(st.mods, refNum);
      if (!m) return whole;
      hits.push(`Stage ${refStage}, Module ${refNum} (relabelled)`);
      return `<a class="mod-xref" href="${st.file}#${m.id}">Stage ${refStage}, Module ${refNum}: ${m.short}</a>`;
    }
  );

  html = walkText(html, (text) => {
    if (!/\bModule\s+\d/.test(text)) return text;

    return text.replace(REF_RX, (whole, sNum, mNum) => {
      if (sNum) {
        const st = byStage.get(Number(sNum));
        const m = st && findMod(st.mods, mNum);
        if (!m) { unresolved.push(`${file}: "${whole}" — Stage ${sNum} has no Module ${mNum}`); return whole; }
        hits.push(`Stage ${sNum}, Module ${mNum} → ${m.short}`);
        return linkCross(st.file, m, `Stage ${sNum}, Module ${mNum}: ${m.short}`);
      }
      const m = findMod(mods, mNum);
      if (!m) { unresolved.push(`${file}: "${whole}" — this stage has no Module ${mNum}`); return whole; }
      hits.push(`Module ${mNum} → ${m.short}`);
      return linkSame(m, `Module ${mNum}: ${m.short}`);
    });
  });

  if (html === before) continue;
  touched++;
  totalHits += hits.length;
  if (!CHECK) writeFileSync(path, html, 'utf8');
  console.log(`  ${String(hits.length).padStart(3)}  ${file}`);
  for (const h of hits) console.log(`        ${h}`);
}

console.log(`\n${CHECK ? 'would link' : 'linked'} ${totalHits} reference(s) across ${touched} file(s)`);

/* A reference to a module that does not exist is a content bug, not a linking
   bug — it means a module was renumbered or removed and the prose was not
   followed through. Report it loudly; do not invent a target. */
if (unresolved.length) {
  console.log(`\nUNRESOLVED — these point at modules that do not exist:`);
  for (const u of unresolved) console.log(`  ${u}`);
}
