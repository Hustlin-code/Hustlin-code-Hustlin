/* ===================================================================
   apply-module-sources.mjs
   -------------------------------------------------------------------
   Adds the missing per-module Sources rows, and turns named programs
   and organizations in the body copy into links.

   RUN:  node tools/apply-module-sources.mjs
         node tools/apply-module-sources.mjs --check   (writes nothing)

   Data lives in tools/module-sources.json. Every URL in there was
   fetched and confirmed live before it was written down; anything that
   could not be confirmed was dropped rather than guessed, because a
   dead citation on a site whose about page promises primary sources is
   worse than no citation at all.

   IDEMPOTENT. A module that already carries a .res-src-lbl row is left
   alone, and an inline term that is already inside an <a> is skipped.
   Safe to re-run after editing the JSON.

   ORDER: run before build-public-stages.mjs, then stamp footers.
   =================================================================== */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'Financial Literacy Course');
const CHECK = process.argv.includes('--check');

const DATA = JSON.parse(readFileSync(join(ROOT, 'tools/module-sources.json'), 'utf8'));

/* The res-link rows already on the site write emoji as numeric character
   references and the dash as &mdash;. Matching that keeps the encoding gate
   quiet and means the file stays readable in an editor with no emoji font. */
function entities(s) {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ch === '—') out += '&mdash;';
    else if (cp < 128) out += ch;
    else out += `&#${cp};`;
  }
  return out;
}

const esc = (s) => s.replace(/&(?!#?\w+;)/g, '&amp;');

function sourcesBlock(rows) {
  const links = rows
    .map(([emoji, label, url]) =>
      `          <a class="res-link" href="${url}" target="_blank" rel="noopener">${entities(emoji)} ${entities(label)}</a>`)
    .join('\n');
  return `        <div class="res-links" style="margin-top:18px">\n` +
         `          <span class="res-src-lbl">Sources</span>\n${links}\n        </div>\n`;
}

/* A term written "S&P Dow Jones Indices" in the JSON is "S&amp;P ..." in the
   HTML, and a curly apostrophe is a different byte from a straight one. Both
   would silently match nothing, so the matcher tolerates either. */
function termRegex(text) {
  const body = text
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/&/g, '&(?:amp;)?')
    .replace(/'/g, "['’]")
    .replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^\\w-])(${body})(?![\\w-])`);
}

/* Text-node walk. Skips <a> (never nest a link), <script>/<style>, the module
   header, the sidebar, and the .res-links rows themselves — linking a term
   inside a citation label would put an <a> inside an <a>. */
const SKIP_TAGS = new Set(['script', 'style', 'title', 'textarea']);
const SKIP_CLASS = /\b(mod-num|mod-title|mod-sub|cs-item|cs-txt|res-links|res-link|stage-tab)\b/;

/* Idempotency guard. linkFirst skips text already inside an <a>, but a term
   mentioned twice in a module would get its SECOND occurrence linked on the
   next run, and its third on the run after that. If any anchor in this module
   already wraps the term, there is nothing left to do. */
function alreadyLinked(html, text) {
  const rx = termRegex(text);
  for (const m of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    if (rx.test(' ' + m[1].replace(/<[^>]*>/g, ' '))) return true;
  }
  return false;
}

function linkFirst(html, text, url) {
  const rx = termRegex(text);
  const parts = html.split(/(<[^>]*>)/);
  const stack = [];
  let skip = 0;
  let done = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('<')) {
      const close = /^<\/\s*([a-zA-Z][\w-]*)/.exec(part);
      const open = /^<\s*([a-zA-Z][\w-]*)([^>]*)>/.exec(part);
      if (close) {
        const name = close[1].toLowerCase();
        for (let j = stack.length - 1; j >= 0; j--) {
          if (stack[j].name === name) { if (stack[j].skip) skip--; stack.splice(j, 1); break; }
        }
      } else if (open && !part.endsWith('/>') && !/^<(br|hr|img|input|meta|link|source)\b/i.test(part)) {
        const name = open[1].toLowerCase();
        const isSkip = SKIP_TAGS.has(name) || name === 'a' || SKIP_CLASS.test(open[2] || '');
        if (isSkip) skip++;
        stack.push({ name, skip: isSkip });
      }
      continue;
    }
    if (done || skip > 0) continue;
    const m = rx.exec(part);
    if (!m) continue;
    parts[i] = part.slice(0, m.index) + m[1] +
      `<a href="${url}" target="_blank" rel="noopener">${m[2]}</a>` +
      part.slice(m.index + m[0].length);
    done = true;
  }
  return { html: parts.join(''), done };
}

/* ---------- apply ------------------------------------------------- */

let addedRows = 0, addedLinks = 0, missedLinks = [], filesTouched = 0, relocated = 0;

for (const [file, modules] of Object.entries(DATA)) {
  if (file.startsWith('_')) continue;
  const path = join(SRC, file);
  const original = readFileSync(path, 'utf8');
  const blocks = original.split(/(?=<div class="module" id=")/);
  let changed = false;

  for (let b = 1; b < blocks.length; b++) {
    const id = (blocks[b].match(/^<div class="module" id="([^"]+)"/) || [])[1];
    const spec = modules[id];
    if (!spec) continue;
    let block = blocks[b];

    /* A Sources row that ended up inside <div class="mod-head"> renders above
       the lesson instead of under it. Move it to where every other one sits
       before deciding whether this module needs a new one. */
    const headEnd = block.indexOf('<div class="mod-body">');
    if (headEnd > -1 && block.slice(0, headEnd).includes('res-src-lbl')) {
      const head = block.slice(0, headEnd);
      const m = head.match(/[ \t]*<div class="res-links"[\s\S]*?<\/div>\s*\n?/);
      if (m) {
        block = head.replace(m[0], '') + block.slice(headEnd);
        const anchor = block.lastIndexOf('<div class="actions"');
        const at = anchor > -1 ? block.lastIndexOf('\n', anchor) + 1 : block.lastIndexOf('</div>\n      </div>');
        block = block.slice(0, at) + m[0].replace(/^\n?/, '') + block.slice(at);
        relocated++; changed = true;
      }
    }

    // 1. Sources row
    if (spec.sources.length && !block.includes('res-src-lbl')) {
      const anchor = block.lastIndexOf('<div class="actions"');
      const at = anchor > -1
        ? block.lastIndexOf('\n', anchor) + 1
        : block.search(/\s*<\/div>\s*<\/div>\s*$/);
      const insertAt = at > -1 ? at : block.length;
      block = block.slice(0, insertAt) + sourcesBlock(spec.sources) + block.slice(insertAt);
      addedRows++; changed = true;
    }

    /* 2. Inline links.
       No "is this URL already here?" guard — the same URL almost always sits
       in the Sources row directly below, and that is the point: the reader
       gets the link where the name is mentioned AND the citation underneath.
       Re-running is safe because linkFirst skips text already inside an <a>. */
    for (const [text, url] of spec.inline) {
      if (alreadyLinked(block, text)) continue;
      const r = linkFirst(block, text, url);
      if (r.done) { block = r.html; addedLinks++; changed = true; }
      else if (!termRegex(text).test(block.replace(/<[^>]*>/g, ' '))) {
        missedLinks.push(`${file} ${id}: "${text}" — not present in this module`);
      }
    }

    blocks[b] = block;
  }

  if (!changed) continue;
  filesTouched++;
  const out = blocks.join('');
  if (!CHECK) writeFileSync(path, out, 'utf8');
  console.log(`  ${file}`);
}

console.log(`\n${CHECK ? 'would add' : 'added'} ${addedRows} Sources row(s) and ${addedLinks} in-text link(s) across ${filesTouched} file(s)`);
if (relocated) console.log(`relocated ${relocated} misplaced Sources row(s) out of the module header`);
if (missedLinks.length) {
  console.log(`\nNOT LINKED — the term was not found in body copy outside an existing link:`);
  for (const m of missedLinks) console.log(`  ${m}`);
}
