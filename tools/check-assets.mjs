/**
 * =============================================================================
 *  check-assets.mjs  —  does every file a page asks for actually ship?
 * =============================================================================
 *
 *  WHAT THIS SOLVES
 *  ----------------
 *  deploy-site.ps1 uses an allow-list ($Files / $Folders). Anything not named
 *  there silently does not deploy. That is safe for secrets and fatal for
 *  assets: when course-shell.js was extracted out of the 12 stage pages, it was
 *  never added to the list, so stage-1-survive.html and
 *  disability-wealth-guide.html — the two public, indexable pages — shipped
 *  asking for a script that returned 404. Module navigation was dead on the
 *  site's main organic-traffic pages and nothing anywhere said so.
 *
 *  This walks the STAGED CLONE, not the source folder. That distinction is the
 *  whole point: the source folder has course-shell.js sitting right there, so
 *  checking it would have passed happily. Only the clone reflects what the
 *  allow-list actually let through.
 *
 *  USAGE
 *  -----
 *      node tools/check-assets.mjs <dir>
 *
 *  Exits 1 and lists every page + missing asset if anything is unresolved.
 *  deploy-site.ps1 runs this after staging and before commit.
 *
 *  WHAT COUNTS AS AN ERROR
 *  -----------------------
 *  A local script, stylesheet, image, or url() target that does not exist in
 *  the staged tree. External URLs, data:, mailto:, tel:, and #fragments are
 *  skipped — they are not ours to verify.
 *
 *  Missing .html link targets are reported as warnings, not failures. Several
 *  are intentional: gated stages live in Supabase and are reached through
 *  learn.html, so a link to a stage file that is not in the repo is expected.
 * =============================================================================
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const root = process.argv[2];
if (!root || !existsSync(root)) {
  console.error('  usage: node tools/check-assets.mjs <dir>');
  process.exit(1);
}

const SKIP_DIRS = new Set(['node_modules', '.git', '_seo-backup', '_refactor-backup']);

// Build output and timestamped backups are not part of the site. Walking them
// makes this report thousands of files and flags stale copies that never ship.
const SKIP_DIR_RE = /^_(deploy|backup|refactor|seo)/i;

/* A *.template.html is a FRAGMENT, not a page, and checking it here is a
   category error that produces a guaranteed false failure.

   Its hrefs are written for the place it gets STAMPED INTO, not for where it
   sits on disk. tools/post-shell.template.html says href="post.css" because
   the stamped output lands in blog/, where blog/post.css is a sibling.
   Resolved against tools/ instead, it can never exist. footer.template.html
   has the same shape one step further out: its paths are {{BASE}}-prefixed and
   {{BASE}} is only substituted at stamp time.

   NOTHING IS LOST BY SKIPPING THEM. Every reference a template carries is
   checked in the pages it was stamped into — blog/*.html all carry that same
   post.css link and all get walked here. The template is verified through its
   output, which is the only place the reference has a defined meaning.

   This was logged as a permanent false positive on 2026-08-12 and was harmless
   only because the templates never reached _deploy. On 2026-08-19 the tools/
   filter became a denylist so the build system could get version history, and
   the false positive turned into a hard BUILD FAILED at step 11. */
const isTemplate = (name) => name.endsWith('.template.html');

function htmlFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || SKIP_DIR_RE.test(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) htmlFiles(full, acc);
    else if (name.endsWith('.html') && !isTemplate(name)) acc.push(full);
  }
  return acc;
}

/** True for anything we have no business resolving on disk. */
function isExternal(u) {
  return !u
    || /^[a-z][a-z0-9+.-]*:/i.test(u)   // http:, https:, data:, mailto:, tel:
    || u.startsWith('//')
    || u.startsWith('#');
}

/** Strip ?query and #hash, decode %20 etc. Returns null if not checkable. */
function cleanTarget(raw) {
  const u = raw.trim().split('#')[0].split('?')[0];
  if (!u || isExternal(u)) return null;
  try { return decodeURIComponent(u); } catch { return u; }
}

const files = htmlFiles(root);
const errors = [];
const warnings = [];

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  const rel = relative(root, file);
  const base = dirname(file);

  const seen = new Set();
  const add = (raw, kind) => {
    const target = cleanTarget(raw);
    if (target === null) return;
    const key = kind + '|' + target;
    if (seen.has(key)) return;
    seen.add(key);

    // Leading "/" means site root on GitHub Pages, not filesystem root.
    const abs = target.startsWith('/')
      ? resolve(root, '.' + target)
      : resolve(base, target);

    if (existsSync(abs)) return;
    (kind === 'link' ? warnings : errors).push({ rel, target, kind });
  };

  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) add(m[1], 'script');
  for (const m of html.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    if (/rel\s*=\s*["'][^"']*(stylesheet|icon)/i.test(m[0])) add(m[1], 'stylesheet');
  }
  for (const m of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) add(m[1], 'image');
  // CSS url() — scanned with inline SCRIPT BODIES BLANKED OUT.
  //
  // This regex is case-insensitive and matches "url(" anywhere in the file,
  // which means ordinary JavaScript trips it: `new URL(window.location.href)`
  // was reported as a missing asset named "window.location.href", failing the
  // deploy for a file that does not exist and was never referenced. Any page
  // using the URL constructor would hit this.
  //
  // A CSS url() can only legitimately appear in a <style> block or a style=
  // attribute, never inside <script>. Opening tags are preserved so the
  // <script src="..."> scan above still sees everything it needs.
  const cssScope = html.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2');
  for (const m of cssScope.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) add(m[1], 'css-url');
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+\.html)["']/gi)) add(m[1], 'link');
}

if (warnings.length) {
  console.log(`\n  ${warnings.length} link target(s) not in the deploy (usually gated pages behind learn.html):`);
  for (const w of warnings.slice(0, 15)) console.log(`    ${w.rel}  ->  ${w.target}`);
  if (warnings.length > 15) console.log(`    ... and ${warnings.length - 15} more`);
}

if (errors.length) {
  console.error(`\n  ${errors.length} MISSING ASSET(S) — these would 404 on the live site:\n`);
  for (const e of errors) console.error(`    ${e.rel}\n      ${e.kind}: ${e.target}`);
  console.error(`\n  Add the file to $Files (or $Folders) in supabase/deploy-site.ps1, then re-run.\n`);
  process.exit(1);
}

console.log(`  Assets OK — every local reference across ${files.length} staged page(s) resolves.`);
