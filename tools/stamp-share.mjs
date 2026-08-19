#!/usr/bin/env node
/* ============================================================================
   stamp-share.mjs — the course share bar, on the guides and the blog
   ============================================================================

   WHAT THIS WRITES

   Not markup. The share bar itself — "Somebody you know needs this", Copy
   link / Text it / Post / Facebook / Follow on IG, and the QR plate — is
   built by stage-outro.js and has been running on the course stages all
   along. This script writes only the CONFIG that tells that bar which page
   is being shared and in whose words.

   Doing it the other way round, by pasting a second copy of the bar's markup
   into the guides, would have given the site two share bars to keep in step:
   the clipboard fallback, the QR block and the button set would all exist
   twice. That is the shape of every bug this repo has already fixed once —
   four navs, nine copies of .breadcrumb, two blog layouts.

   WHY THE COPY IS PER PAGE

   The share text is what appears in somebody else's feed. A guide about
   coming home from prison cannot post the sentence written for a budgeting
   course, and "check out this site" is the version nobody clicks. So the
   words live here, in one manifest, and --check fails the deploy if a page
   drifts from it.

   data-share-only is what keeps a guide from getting the rest of the outro:
   stage-outro.js also congratulates you for finishing a stage, prompts for
   an account, and cross-sells the paid catalogue. All correct at the end of
   Stage 3. All wrong at the end of a guide about losing your spouse.

   WHY THE GUIDES AND NOT THE COURSE PAGES

   The guides are what people forward. A course page is something you buy;
   "After Losing a Spouse" is something you send to a friend at 1am.
   ========================================================================== */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { POSTS } from './blog-content.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://hustlin.org';
const checkOnly = process.argv.includes('--check');

const START = '<!-- SHARE:START -->';
const END = '<!-- SHARE:END -->';

/* `text` is posted as-is, so it is written to stand alone in a stranger's
   feed rather than to describe the page. `lead` and `sub` are the two lines
   on the bar itself. Keep `text` under ~120 chars so X does not truncate the
   URL out of view. */
/* Blog posts are DERIVED, not listed. Their titles and deks already live in
   tools/blog-content.mjs — the single source of truth the blog index, the
   JSON-LD and the sitemap are all generated from — so writing share copy for
   them by hand here would be a tenth surface to keep in step, and the one
   that drifts silently because nothing renders it on the page.

   The dek is already the "why you would click this" sentence, which is
   exactly what a share needs, so it IS the share text. Trimmed at a sentence
   boundary rather than mid-word, because X truncates the URL out of view
   past roughly 120 characters and a share whose link is invisible is a
   share that does nothing. */
function postShare(post) {
  let text = String(post.dek || post.title || '').trim();
  if (text.length > 118) {
    const cut = text.slice(0, 118);
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' — '), cut.lastIndexOf(', '));
    text = (stop > 60 ? cut.slice(0, stop) : cut.replace(/\s+\S*$/, '')) + '…';
  }
  return {
    file: `blog/${post.slug}.html`,
    lead: 'Somebody you know needs this.',
    sub: 'Free to read, no account. Send it to one person.',
    text,
  };
}

const PAGES = [
  {
    file: 'starting-over-after-prison.html',
    lead: 'Somebody coming home needs this.',
    sub: 'This guide is free. Send it to one person who is getting out.',
    text: 'Free reentry money guide — ID, banking, benefits and child support, with no account and nothing to buy.',
  },
  {
    file: 'recovering-from-divorce.html',
    lead: 'Somebody you know is going through this.',
    sub: 'This guide is free. Send it to one person in the middle of it.',
    text: 'Free guide to money after divorce — retirement splits, joint debt, and the Social Security rule nobody mentions.',
  },
  {
    file: 'after-financial-collapse.html',
    lead: 'Somebody you know is starting over.',
    sub: 'This guide is free. Send it to one person who needs a first step.',
    text: 'Free guide to rebuilding after bankruptcy or collapse — what collectors can actually do, and the order to rebuild in.',
  },
  {
    file: 'starting-late.html',
    lead: 'It is not too late, and somebody needs to hear that.',
    sub: 'This guide is free. Send it to one person who thinks they missed it.',
    text: 'Free guide for late starters — the honest arithmetic at 30, 40 and 50, and the four levers only late starters have.',
  },
  {
    file: 'disability-wealth-guide.html',
    lead: 'Somebody is being told they cannot save. They can.',
    sub: 'This guide is free. Send it to one person who was told no.',
    text: 'Free guide to saving and investing on SSDI or SSI — ABLE accounts and Special Needs Trusts, without losing benefits.',
  },
  {
    file: 'death-of-a-spouse.html',
    lead: 'Somebody you know is in the middle of this.',
    sub: 'This guide is free. Send it to one person who is in it right now.',
    text: 'Free guide for after losing a spouse — survivor benefits nobody offers you, debts you probably do not owe.',
  },
  {
    file: 'retirement-withdrawal.html',
    lead: 'Somebody you know is about to retire.',
    sub: 'This guide is free and sells nothing. Send it to one person deciding when to claim.',
    text: 'Free guide to spending retirement savings down — how much you can take, what to pull first, and what the IRS forces at 73 or 75.',
  },
];

for (const post of POSTS) PAGES.push(postShare(post));

/* ?v=DEPLOYSTAMP is not optional. Step 6 of deploy-site.ps1 rewrites that
   token to the build date on every deploy; a reference WITHOUT it is cached
   by URL forever, so a returning reader keeps whatever copy of the script
   they first downloaded and no deploy can dislodge it.

   build-public-stages.mjs step 5b records this exact bug happening to app.js
   — it shipped untokenised while every other asset carried ?v=, and readers
   were pinned to a stale engine indefinitely. Shipping these 16 references
   untokenised would have repeated it, and the symptom would have been the
   share bar simply never appearing for anyone who had visited before. */
function block(p) {
  const url = `${SITE}/${p.file}`;
  return `  <!-- Config for the share bar built by stage-outro.js. Attributes, not a
       second copy of the markup: the buttons, the clipboard fallback and the
       QR plate stay in one place. This only says which page is being shared
       and in whose words. -->
  <script>
    (function () {
      var b = document.body;
      b.dataset.shareOnly = '';
      b.dataset.shareUrl  = ${JSON.stringify(url)};
      b.dataset.shareText = ${JSON.stringify(p.text)};
      b.dataset.shareLead = ${JSON.stringify(p.lead)};
      b.dataset.shareSub  = ${JSON.stringify(p.sub)};
    })();
  </script>
  <script src="${p.file.includes('/') ? '../' : ''}stage-outro.js?v=DEPLOYSTAMP" defer></script>`;
}

const stale = [];
const written = [];
const problems = [];

for (const p of PAGES) {
  const file = join(ROOT, p.file);
  if (!existsSync(file)) { problems.push(`${p.file} — listed in PAGES but not on disk`); continue; }

  const html = readFileSync(file, 'utf8');
  if (!html.includes(START) || !html.includes(END)) {
    problems.push(`${p.file} — no SHARE:START/END markers`);
    continue;
  }

  /* The bar mounts itself before .course-layout. Without that anchor
     buildShareBar() returns silently and the page just has no share bar —
     the exact kind of quiet nothing this repo keeps getting bitten by. */
  if (!html.includes('course-layout') && !html.includes('hfyShareMount')) {
    problems.push(`${p.file} — no .course-layout and no #hfyShareMount for the bar`);
    continue;
  }

  const re = new RegExp(`${START}[\\s\\S]*?${END}`);
  const next = html.replace(re, `${START}\n${block(p)}\n  ${END}`);

  /* Normalise the cache-bust token before comparing, or this gate cries wolf
     after EVERY deploy and teaches you to ignore it.

     This script emits `stage-outro.js?v=DEPLOYSTAMP`. Step 6 of
     deploy-site.ps1 then rewrites that in place to `?v=<today>`. So from the
     moment a deploy runs, the file on disk and the freshly generated block
     differ by exactly that token and nothing else — every page would report
     stale, forever, with nobody having touched them.

     build-public-stages.mjs carries the identical guard for the identical
     reason. If a third generator ever emits DEPLOYSTAMP, it needs this too. */
  const norm = (t) => t.replace(/(\.js\?v=)[^"']*/g, '$1DEPLOYSTAMP');
  if (norm(next) === norm(html)) continue;

  if (checkOnly) { stale.push(p.file); continue; }
  writeFileSync(file, next, 'utf8');
  written.push(p.file);
}

if (problems.length) {
  console.error('\n  Share config cannot be written:\n');
  for (const m of problems) console.error(`    ${m}`);
  console.error('');
  process.exit(1);
}

if (checkOnly) {
  if (!stale.length) {
    console.log(`  share config current across ${PAGES.length} pages `
      + `(${PAGES.length - POSTS.length} guides, ${POSTS.length} blog posts).`);
    process.exit(0);
  }
  console.error('\n  These share configs are stale:\n');
  for (const f of stale) console.error(`    ${f}`);
  console.error('\n  Fix with:  node tools/stamp-share.mjs\n');
  process.exit(1);
}

if (!written.length) console.log('  Share config already current — nothing written.');
else for (const f of written) console.log(`  ${f} share config written.`);
