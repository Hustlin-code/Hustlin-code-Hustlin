/**
 * =============================================================================
 *  stamp-post-shell.mjs  —  one post layout, everywhere.
 * =============================================================================
 *
 *  WHAT THIS SOLVES
 *  ----------------
 *  On 2026-08-09 the ten blog posts were running two incompatible layout
 *  systems, and nothing in the build knew or cared:
 *
 *    · five used `.bp-*` with a private palette (--gold:#F5C520,
 *      --cream:#FAF7F0) that did not match styles.css, and - worse - had
 *      NO SITE NAV AT ALL. A reader arriving on one of those five from
 *      search had no route back into the site except the footer.
 *    · five used the shared `.hero` correctly but copy-pasted the entire
 *      post stylesheet inline, so a spacing change meant editing five files
 *      and getting all five right.
 *
 *  Both are the same failure: the parts of a post that must be identical
 *  everywhere were being hand-copied. Footers had this exact problem and it
 *  was fixed the same way, so this script is deliberately a sibling of
 *  stamp-footers.mjs rather than a new idea.
 *
 *  USAGE
 *  -----
 *      node tools/stamp-post-shell.mjs           # rewrite every post
 *      node tools/stamp-post-shell.mjs --check   # verify only, exit 1 if stale
 *
 *  WHAT IT STAMPS
 *  --------------
 *      POST-HEAD:START  / POST-HEAD:END    fonts, stylesheets, AdSense
 *      POST-SHELL:START / POST-SHELL:END   nav + hero
 *
 *  Content comes from tools/post-shell.template.html; the per-post values
 *  ({{H1}}, {{HERO_SUB}}, {{CRUMB}}, {{CATEGORY}}) come from that post's
 *  entry in tools/blog-content.mjs. One source, one template, no copies.
 *
 *  IT ALSO REFUSES A POST THAT
 *  ---------------------------
 *    · carries its own <style> block          - that is how two systems happen
 *    · does not link post.css                 - it will render unstyled
 *    · has no Article JSON-LD headline        - the index builder needs it
 *    · is not listed in tools/blog-content.mjs
 *
 *  The <style> rule is the important one. Everything else here is recoverable;
 *  a per-post stylesheet is how the site ends up with two of everything again.
 *  Post styling goes in blog/post.css, which every post links.
 * =============================================================================
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, POSTS } from './blog-content.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOG = join(ROOT, 'blog');
const TEMPLATE = join(ROOT, 'tools', 'post-shell.template.html');
const CHECK = process.argv.includes('--check');

/* Bumped by hand when styles.css or post.css changes in a way a returning
   visitor must not miss. Cloudflare is in front of GitHub Pages and caches
   CSS aggressively; without a changing query string a restyle reaches new
   visitors immediately and returning ones whenever their cache happens to
   expire, which is the hardest kind of bug to reproduce. */
const CACHEBUST = '20260809';

const MARKERS = [
  { name: 'POST-HEAD', section: '<!-- ===== POST-HEAD ===== -->' },
  { name: 'POST-SHELL', section: '<!-- ===== POST-SHELL ===== -->' },
];

/* ─── load the template, split it into its two blocks ──────────────────── */

const tplRaw = readFileSync(TEMPLATE, 'utf8');
const blocks = {};
for (let i = 0; i < MARKERS.length; i++) {
  const start = tplRaw.indexOf(MARKERS[i].section);
  if (start === -1) {
    console.error(`post shell: template is missing "${MARKERS[i].section}"`);
    process.exit(1);
  }
  const from = start + MARKERS[i].section.length;
  const next = MARKERS[i + 1] ? tplRaw.indexOf(MARKERS[i + 1].section) : tplRaw.length;
  blocks[MARKERS[i].name] = tplRaw.slice(from, next).trim();
}

/* ─── index the manifest ───────────────────────────────────────────────── */

const catName = new Map(CATEGORIES.map(c => [c.key, c.name]));
const bySlug = new Map(POSTS.map(p => [p.slug, p]));

const problems = [];
const fail = m => problems.push(m);

/* ─── walk blog/ ───────────────────────────────────────────────────────── */

const files = readdirSync(BLOG).filter(f => f.endsWith('.html')).sort();
let stale = 0;
const staleFiles = [];

for (const file of files) {
  const slug = file.replace(/\.html$/, '');
  const path = join(BLOG, file);
  let s = readFileSync(path, 'utf8');

  const post = bySlug.get(slug);
  if (!post) {
    fail(`blog/${file}: not listed in tools/blog-content.mjs.\n`
      + `    Every post in blog/ must have a manifest entry - that is what puts it\n`
      + `    on the index, in the JSON-LD graph and in the sitemap. Add it, or\n`
      + `    delete the file if it was scratch.`);
    continue;
  }

  for (const f of ['h1', 'heroSub', 'crumb']) {
    if (!post[f]) fail(`post "${slug}": manifest has no ${f} - required to stamp the hero`);
  }

  if (problems.length) continue;

  /* ─── splice ───
     Splice BEFORE validating. post.css is linked from inside the POST-HEAD
     block, so checking the file as found would report every post as missing
     its stylesheet on the run that is about to add it - a gate that fails on
     the state it exists to produce. Validate the result instead. */
  let next = s;
  for (const { name } of MARKERS) {
    const startMark = `<!-- ${name}:START`;
    const endMark = `<!-- ${name}:END -->`;
    const i = next.indexOf(startMark);
    const j = next.indexOf(endMark);
    if (i === -1 || j === -1) {
      fail(`blog/${file}: missing ${name}:START / ${name}:END markers`);
      break;
    }

    const body = blocks[name]
      .replaceAll('{{CACHEBUST}}', CACHEBUST)
      .replaceAll('{{CRUMB}}', post.crumb)
      .replaceAll('{{CATEGORY}}', catName.get(post.category))
      .replaceAll('{{H1}}', post.h1)
      .replaceAll('{{HERO_SUB}}', post.heroSub);

    const block =
      `<!-- ${name}:START — generated by tools/stamp-post-shell.mjs from\n`
      + `     tools/post-shell.template.html + tools/blog-content.mjs.\n`
      + `     DO NOT EDIT BY HAND. -->\n`
      + body + '\n'
      + `<!-- ${name}:END -->`;

    next = next.slice(0, i) + block + next.slice(j + endMark.length);
  }

  /* A post-local <style> block is the thing that produced two layout systems
     in the first place, so it is fatal rather than a warning. */
  if (/<style[\s>]/i.test(next)) {
    fail(`blog/${file}: carries its own <style> block.\n`
      + `    Post styling belongs in blog/post.css, which every post links.\n`
      + `    Inline copies are how the .bp-* and .p* systems both came to exist.`);
  }
  if (!/href="post\.css/.test(next)) {
    fail(`blog/${file}: does not link post.css - it will render unstyled`);
  }
  if (!/"headline"\s*:\s*"/.test(next)) {
    fail(`blog/${file}: no Article JSON-LD headline`);
  }
  /* The five `.bp-*` posts shipped with no <nav> at all, so a reader arriving
     from search had no route into the site but the footer. The shell supplies
     one now; this makes sure it stays supplied. */
  if (!/<nav class="nav">/.test(next)) {
    fail(`blog/${file}: no site nav`);
  }

  if (next !== s) { stale++; staleFiles.push(file); if (!CHECK) writeFileSync(path, next, 'utf8'); }
}

/* Manifest entries pointing at files that are not there. build-blog-index
   catches this too, but it is cheap here and this script runs first. */
for (const p of POSTS) {
  if (!files.includes(`${p.slug}.html`)) fail(`post "${p.slug}": blog/${p.slug}.html does not exist`);
}

if (problems.length) {
  console.error('post shell: problems\n');
  for (const p of problems) console.error('  - ' + p);
  console.error('\nNothing was written.');
  process.exit(1);
}

if (CHECK) {
  if (stale) {
    console.error(`post shell: ${stale} post(s) stale - run: node tools/stamp-post-shell.mjs`);
    for (const f of staleFiles) console.error('    blog/' + f);
    process.exit(1);
  }
  console.log(`post shell: current across ${files.length} posts.`);
  process.exit(0);
}

console.log(stale
  ? `post shell: stamped ${stale} of ${files.length} post(s) - ${staleFiles.join(', ')}`
  : `post shell: current across ${files.length} posts, nothing to do.`);
