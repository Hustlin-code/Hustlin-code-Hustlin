/**
 * =============================================================================
 *  check-hero.mjs  —  the hero standard is one file. Keep it that way.
 * =============================================================================
 *
 *  WHY THIS EXISTS
 *  ---------------
 *  On 2026-08-09 the hero was edited three times in one day, and none of the
 *  three edits were about design. They were about the fact that six pages each
 *  carried their own hero font-size, in their own inline <style>, which loads
 *  after styles.css and therefore beats it at every width.
 *
 *  That made "change the hero" a six-file operation where missing one file was
 *  invisible. Two real instances shipped and survived a full deploy:
 *
 *    about.html          font-size on a style="" attribute on the <h1>
 *    work-with-us.html   same
 *
 *  An inline attribute outranks every stylesheet including a media query, so
 *  when the sitewide mobile pass brought every other hero down to 28px, those
 *  two sat at ~40px on a phone. Nothing failed. The pages rendered. They were
 *  just wrong, and the only way to notice was to open them on a phone.
 *
 *  A third instance was subtler: disability-wealth-guide.html declared
 *  .hero-h1 unconditionally, which silently beat the phone block in
 *  styles.css — so the one page most likely to be read on a cheap phone was
 *  the one page the mobile fix could not reach.
 *
 *  THE RULE
 *  --------
 *  styles.css owns hero SIZE. Pages may own hero THEME.
 *
 *    shared (styles.css only)  font-size / line-height on .hero-h1, .hero-sub
 *    per-page (allowed)        font-family, color, -webkit-text-stroke,
 *                              text-shadow, font-weight, letter-spacing
 *
 *  The split is not arbitrary. Theme is genuinely per-page — Technical
 *  Analysis is blue, Fundamental is green, Economics is orange — and it has
 *  never caused a cross-page bug, because a wrong colour is visible the
 *  instant you look at the page. Size is shared, and a wrong size is not
 *  visible unless you happen to be looking at that page on that width.
 *
 *  If a page genuinely needs a different size, it belongs in styles.css as a
 *  named variant. There is one: .blog-hero, because a post title is not a
 *  landing page's proposition. Adding a second should feel like a decision.
 *
 *  USAGE
 *  -----
 *      node tools/check-hero.mjs        # report and exit 1 on any finding
 *
 *  Deliberately has NO allowlist. An allowlist is the right tool when the
 *  exceptions are real and rare (see check-shared-css.mjs, which has three).
 *  Here every exception found so far has been an accident, and the fix has
 *  always been "move it to styles.css" — so there is nothing legitimate for a
 *  list to hold, and an empty allowlist is just an invitation.
 * =============================================================================
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Properties that must come from styles.css. Everything else is theme and is
   a page's own business. */
const SHARED_PROPS = /(^|[;{\s])(font-size|line-height)\s*:/;

/* A selector "targets the hero" if it ends in one of these. `.fl-hero
   .hero-h1` counts; `.hero-h1 em` does not — the <em> carries colour and
   stroke only, and its size is inherited from the rule we already police. */
const HERO_TARGET = /\.(hero-h1|hero-sub)\s*$/;

const findings = [];

/* ── 1. inline style="" attributes on hero elements ─────────────────────────
   Checked first because this is the failure that actually shipped. An
   attribute beats every stylesheet, so it cannot be overridden by any amount
   of correct CSS elsewhere — it can only be deleted. */
function checkStyleAttributes(file, html) {
  const re = /<[^>]*class="[^"]*\b(hero-h1|hero-sub)\b[^"]*"[^>]*style="([^"]*)"/g;
  for (const m of html.matchAll(re)) {
    if (SHARED_PROPS.test(m[2])) {
      findings.push({
        file,
        kind: 'style attribute',
        detail: `<${m[0].slice(1).split(/\s/)[0]} class="…${m[1]}…" style="${m[2]}">`,
      });
    }
  }
}

/* ── 2. page-local <style> blocks ───────────────────────────────────────────
   Walks brace depth so a rule inside @media is still attributed to its own
   selector, and so a media query's own text is never mistaken for one. */
function checkStyleBlocks(file, html) {
  for (const block of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    const css = stripComments(block[1]);
    const stack = [];
    let buf = '';

    for (const tok of css.split(/(\{|\})/)) {
      if (tok === '{') {
        stack.push(buf.trim());
        buf = '';
      } else if (tok === '}') {
        stack.pop();
        buf = '';
      } else {
        const sel = stack[stack.length - 1];
        if (sel && !sel.startsWith('@') && SHARED_PROPS.test(tok)) {
          /* A selector list may target the hero in only one of its parts. */
          const hits = sel.split(',').map(s => s.trim()).filter(s => HERO_TARGET.test(s));
          if (hits.length) {
            const media = stack.filter(s => s.startsWith('@media')).join(' and ') || 'all widths';
            findings.push({
              file,
              kind: 'style block',
              detail: `${hits.join(', ')}  {${firstShared(tok)}}   [${media}]`,
            });
          }
        }
        buf = tok;
      }
    }
  }
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function firstShared(decls) {
  const hit = decls.split(';').find(d => SHARED_PROPS.test(';' + d));
  return (hit || '').trim();
}

/* ── run ──────────────────────────────────────────────────────────────────── */
const files = [];
for (const f of readdirSync(ROOT)) {
  if (f.endsWith('.html') && f !== 'footer.template.html') files.push(f);
}
const blogDir = join(ROOT, 'blog');
if (existsSync(blogDir)) {
  for (const f of readdirSync(blogDir)) {
    if (f.endsWith('.html')) files.push(join('blog', f));
  }
}

for (const rel of files) {
  const html = readFileSync(join(ROOT, rel), 'utf8');
  checkStyleAttributes(rel, html);
  checkStyleBlocks(rel, html);
}

if (findings.length === 0) {
  console.log(`  hero standard: clean - ${files.length} pages, no page-local hero sizing.`);
  process.exit(0);
}

console.error('\n  HERO SIZING FOUND OUTSIDE styles.css\n');
for (const f of findings) {
  console.error(`    ${f.file}`);
  console.error(`      via ${f.kind}: ${f.detail}`);
}
console.error(`
  ${findings.length} finding(s).

  styles.css owns hero font-size and line-height at every width — see
  "THE HERO STANDARD" in that file. A page may still set font-family,
  colour, stroke and shadow; those are theme and are per-page on purpose.

  Fix by MOVING the size into styles.css, not by pasting it into a second
  page. If this page genuinely needs a different size, add a named variant
  there (there is one already: .blog-hero) rather than an exception here.
`);
process.exit(1);
