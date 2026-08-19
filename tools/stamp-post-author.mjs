/**
 * =============================================================================
 *  stamp-post-author.mjs  —  put the Person author into every blog post's
 *                            Article JSON-LD.
 * =============================================================================
 *
 *  WHY THIS EXISTS
 *  ---------------
 *  post-shell.template.html deliberately does not own a blog post's <title>,
 *  meta description, canonical, OG tags or Article/Breadcrumb/FAQPage JSON-LD.
 *  Its header says why: those are genuinely per-post prose, and stamping them
 *  would turn tools/blog-content.mjs into a database.
 *
 *  The Article node's "author" is the one property in that block which is NOT
 *  per-post prose. It is the same Person on all ten posts and on every post
 *  that will ever be added. Leaving it hand-typed means post eleven silently
 *  ships with the Organization as author and nothing catches it — which is
 *  exactly the class of drift that put four different calculator counts on the
 *  site at once. So it gets a generator, and the generator gets a --check.
 *
 *  Google's guidance for YMYL content wants a named person as `author` and the
 *  publisher as `publisher`. Before this script every post named the
 *  Organization as both, which says "nobody in particular wrote this."
 *
 *  WHAT IT DOES, per file in blog/*.html
 *  -------------------------------------
 *    1. Repoints  "author": { "@id": ".../#organization" }
 *              to "author": { "@id": ".../about.html#author" }
 *       preserving the file's own key alignment, because two of the ten posts
 *       align the value with extra spaces and reformatting them would produce
 *       a diff nobody asked for.
 *    2. Inserts the Person node into the @graph, immediately before the
 *       Organization node, if it is not already there. A bare @id reference
 *       with no node behind it is a dangling reference; Google tolerates it
 *       across pages but the graph is cheap to make whole.
 *    3. Re-parses the whole JSON-LD block afterwards and fails if it no longer
 *       parses. This script edits JSON with string surgery, so that check is
 *       not optional.
 *
 *  It does NOT touch "publisher". The Organization stays the publisher.
 *
 *  USAGE
 *  -----
 *      node tools/stamp-post-author.mjs           # write
 *      node tools/stamp-post-author.mjs --check   # verify only, exit 1 if stale
 *
 *  --check is what deploy-site.ps1 wants. It never writes.
 *
 *  IF THE AUTHOR @id EVER CHANGES it changes in three places, or the reference
 *  dangles: PERSON_ID below, the id="author" anchor in about.html, and
 *  tools/build-public-stages.mjs.
 * =============================================================================
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOG = join(ROOT, 'blog');
const CHECK = process.argv.includes('--check');

const SITE = 'https://hustlin.org';
const PERSON_ID = `${SITE}/about.html#author`;
const ORG_ID = `${SITE}/#organization`;

/* The node, written at the indentation the surrounding @graph uses (4 spaces
   for the node, 6 for its properties). Kept deliberately short: the full
   Person — description, email, knowsAbout — lives on about.html, which is the
   canonical page for this entity. Repeating it on ten posts is ten copies to
   keep in step. */
const PERSON_NODE = `{
      "@type": "Person",
      "@id": "${PERSON_ID}",
      "name": "Adam",
      "url": "${PERSON_ID}",
      "jobTitle": "Founder and Writer",
      "worksFor": { "@id": "${ORG_ID}" }
    }`;

const problems = [];
const fail = (m) => problems.push(m);

const files = readdirSync(BLOG).filter((f) => f.endsWith('.html')).sort();

if (!files.length) {
  console.error('post author: no files in blog/ - wrong directory?');
  process.exit(1);
}

let stale = 0;
const staleFiles = [];

for (const file of files) {
  const path = join(BLOG, file);
  const s = readFileSync(path, 'utf8');
  let next = s;

  /* ── 1. repoint the author ─────────────────────────────────────────────
     The capture keeps whatever spacing the file uses after the colon, so
     `"author":    {` stays aligned and `"author": {` stays tight. */
  const authorRe = /("author"\s*:\s*)\{\s*"@id"\s*:\s*"[^"]*"\s*\}/g;
  if (!authorRe.test(next)) {
    fail(`blog/${file}: no "author": { "@id": ... } in its JSON-LD.\n`
      + `    Every post needs an Article author. Add one, then re-run.`);
    continue;
  }
  next = next.replace(authorRe, `$1{ "@id": "${PERSON_ID}" }`);

  /* ── 2. insert the Person node, once ────────────────────────────────────
     Anchored on the Organization node rather than on the top of the @graph,
     because the graph's first node differs by post (Article here, but a
     future post could lead with something else) while every post has exactly
     one Organization. Scan back from its @type to the `{` that opens it and
     splice the Person in ahead of it. */
  if (!next.includes(`"@id": "${PERSON_ID}"`) || !/"@type"\s*:\s*"Person"/.test(next)) {
    const at = next.search(/"@type"\s*:\s*"Organization"/);
    if (at === -1) {
      fail(`blog/${file}: no Organization node to anchor the Person node against`);
      continue;
    }
    const open = next.lastIndexOf('{', at);
    if (open === -1) {
      fail(`blog/${file}: could not find the brace opening the Organization node`);
      continue;
    }
    next = next.slice(0, open) + PERSON_NODE + ',\n    ' + next.slice(open);
  }

  /* ── 3. the JSON must still parse ───────────────────────────────────────
     String surgery on JSON earns a hard validation pass, not a warning. */
  const blocks = [...next.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!blocks.length) {
    fail(`blog/${file}: no application/ld+json block`);
    continue;
  }
  let broke = false;
  for (const b of blocks) {
    try {
      JSON.parse(b[1]);
    } catch (e) {
      fail(`blog/${file}: JSON-LD no longer parses after stamping - ${e.message}\n`
        + `    Nothing was written for this file. The block's formatting is\n`
        + `    probably unusual enough to defeat the splice above.`);
      broke = true;
      break;
    }
  }
  if (broke) continue;

  /* Belt and braces: the publisher must survive untouched. */
  if (!next.includes(`"publisher": { "@id": "${ORG_ID}" }`)
    && !/"publisher"\s*:\s*\{\s*"@id"\s*:\s*"[^"]*#organization"\s*\}/.test(next)) {
    fail(`blog/${file}: lost its Organization publisher - refusing to write`);
    continue;
  }

  if (next !== s) {
    stale++;
    staleFiles.push(file);
    if (!CHECK) writeFileSync(path, next, 'utf8');
  }
}

if (problems.length) {
  console.error('post author: problems\n');
  for (const p of problems) console.error('  - ' + p);
  console.error('\nNothing was written.');
  process.exit(1);
}

if (CHECK) {
  if (stale) {
    console.error(`post author: ${stale} post(s) stale - run: node tools/stamp-post-author.mjs`);
    for (const f of staleFiles) console.error('    blog/' + f);
    process.exit(1);
  }
  console.log(`post author: current across ${files.length} posts.`);
  process.exit(0);
}

console.log(`post author: ${stale} of ${files.length} post(s) updated.`);
