/**
 * =============================================================================
 *  build-blog-index.mjs  —  blog.html's index, its JSON-LD, and the sitemap
 *                           block, all written from one array.
 * =============================================================================
 *
 *  WHAT THIS SOLVES
 *  ----------------
 *  Adding a post meant editing four things in the same change and nothing
 *  failed when you missed one. On 2026-08-08 the blogPost JSON-LD listed four
 *  posts while the page displayed seven: the cards were added, the sitemap was
 *  added, the graph was not. The page rendered, the gates passed, the sitemap
 *  validated, and three posts silently had no structured data.
 *
 *  That failure mode is arithmetic on a growing archive. At one post a month
 *  you catch it. At one post a week you do not. So the three derived surfaces
 *  are now derived: tools/blog-content.mjs is the single source, this script
 *  writes all three, and --check fails the deploy if any of them has been
 *  hand-edited out of sync.
 *
 *  USAGE
 *  -----
 *      node tools/build-blog-index.mjs           # write
 *      node tools/build-blog-index.mjs --check   # verify only, exit 1 if stale
 *
 *  WHAT IT WRITES
 *  --------------
 *      blog.html    between BLOG-LD:START    / BLOG-LD:END     (JSON-LD graph)
 *      blog.html    between BLOG-INDEX:START / BLOG-INDEX:END  (the index)
 *      sitemap.xml  between BLOG:START       / BLOG:END        (<url> blocks)
 *
 *  Everything outside those markers - the hero, the CSS, the newsletter form,
 *  the stamped footer - is hand-written and is not touched.
 *
 *  WHY THE OUTPUT IS DETERMINISTIC
 *  -------------------------------
 *  Nothing here reads the clock. The "New" badge is relative to the newest
 *  post in the manifest, not to today, and sitemap lastmod comes from the
 *  manifest rather than from the build date. If it depended on the current
 *  date, --check would pass on the day of the build and start failing the
 *  deploy a week later with nothing having changed - which trains you to
 *  ignore the one gate that is supposed to mean something.
 *
 *  WHY EVERY ROW IS IN THE HTML EVEN WHEN COLLAPSED
 *  ------------------------------------------------
 *  Categories show CATEGORY_VISIBLE rows and hide the rest behind a button.
 *  The hidden rows are in the document with a CSS class on them, not withheld
 *  and injected on click. The blog exists to be crawled - it is the only
 *  unrestricted long-form content on the site, since the course lessons sit
 *  behind an authenticated Edge Function - so an internal link that only
 *  exists after a click is a link that does not exist.
 * =============================================================================
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATEGORIES, POSTS, CATEGORY_VISIBLE, NEW_FOR_DAYS,
  CATEGORY_ORDER, LATEST_WINDOW_DAYS, LATEST_MIN, LATEST_MAX,
} from './blog-content.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_HTML = join(ROOT, 'blog.html');
const SITEMAP = join(ROOT, 'sitemap.xml');
const CHECK = process.argv.includes('--check');

const ORIGIN = 'https://hustlin.org';

/* ─── helpers ──────────────────────────────────────────────────────────── */

const problems = [];
const fail = m => problems.push(m);

/* Manifest copy is written as plain text - real apostrophes, real ampersands,
   real hyphens. Escaping happens here, once per output format, because the
   same string has to survive both an HTML attribute and a JSON string and
   pre-escaping for one corrupts the other. */
const esc = s => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function parseDate(iso, where) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) { fail(`${where}: date must be YYYY-MM-DD, got "${iso}"`); return null; }
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

const longDate = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
const shortDate = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
};

/* ─── validate ─────────────────────────────────────────────────────────── */

const catByKey = new Map(CATEGORIES.map(c => [c.key, c]));
const seen = new Set();

for (const p of POSTS) {
  const where = `post "${p.slug}"`;
  if (!p.slug) { fail('a post has no slug'); continue; }
  if (seen.has(p.slug)) fail(`${where}: duplicate slug`);
  seen.add(p.slug);

  if (!p.title) fail(`${where}: no title`);
  if (!p.dek) fail(`${where}: no dek`);
  if (!Number.isInteger(p.read)) fail(`${where}: read must be an integer number of minutes`);
  if (!catByKey.has(p.category)) fail(`${where}: unknown category "${p.category}"`);
  parseDate(p.date, where);
  if (p.lastmod) parseDate(p.lastmod, `${where} lastmod`);

  const file = join(ROOT, 'blog', `${p.slug}.html`);
  if (!existsSync(file)) {
    fail(`${where}: blog/${p.slug}.html does not exist`);
    continue;
  }

  /* The index headline and the post's own Article headline have to be the
     same string. Two different names for one URL is the sort of thing that
     costs a rich result and produces no error anywhere. */
  const body = readFileSync(file, 'utf8');
  const hm = /"headline"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(body);
  if (!hm) {
    fail(`${where}: no "headline" found in the post's JSON-LD`);
  } else {
    let own;
    try { own = JSON.parse(`"${hm[1]}"`); } catch { own = hm[1]; }
    if (own !== p.title) {
      fail(`${where}: title does not match the post's own JSON-LD headline\n`
        + `    manifest: ${p.title}\n`
        + `    post:     ${own}`);
    }
  }
}

const featuredCount = POSTS.filter(p => p.featured).length;
if (featuredCount > 1) fail(`${featuredCount} posts are marked featured - exactly one, or none`);

for (const p of POSTS) {
  if (p.archived && p.featured) {
    fail(`post "${p.slug}": archived and featured at once - an archived post is not on the index, so it cannot be the panel`);
  }
}

if (problems.length) {
  console.error('blog index: manifest problems\n');
  for (const p of problems) console.error('  - ' + p);
  console.error('\nNothing was written. Fix tools/blog-content.mjs and re-run.');
  process.exit(1);
}

/* ─── order ────────────────────────────────────────────────────────────── */

const byDateDesc = (a, b) =>
  parseDate(b.date) - parseDate(a.date) || a.slug.localeCompare(b.slug);

const sorted = [...POSTS].sort(byDateDesc);

/* `sorted` is every post and is what the SITEMAP is built from - an archived
   post is still a live, indexable page and must stay in it.

   `listed` is what the INDEX is built from. A post with `archived: true` is
   dropped from the featured panel, the Latest strip, the category sections,
   the category counts and the blogPost JSON-LD graph.

   Added 2026-08-16 for the Week in Review column. The hub at
   blog/week-in-review.html is the permanent card; each dated edition is
   reachable from the hub's archive table, from the sitemap, and by its own
   URL - it just does not get a row of its own in the grid. Without this the
   Markets section grows one near-identical "Week in Review" row every week
   and reads as duplication, which is exactly the problem the hub exists to
   solve. The JSON-LD graph follows the index rather than the sitemap on
   purpose: structured data is supposed to describe what the page actually
   shows. */
const listed = sorted.filter(p => !p.archived);
if (!listed.length) {
  console.error('blog index: every post is archived - the index would be empty. Refusing to write.');
  process.exit(1);
}

const featured = listed.find(p => p.featured) || listed[0];

/* "Latest" is a time window rather than a fixed row count - a burst week
   otherwise hides posts that are three days old, and a quiet month pads the
   strip out with six-week-old work and labels it latest. Measured from the
   newest post, not from today, so the output stays deterministic. The
   min/max clamp keeps it non-empty after a gap and stops it swallowing the
   archive after a burst. */
/* The featured post is IN this strip, not excluded from it - changed
   2026-08-15 on Adam's call. It used to run over `rest`, on the reasoning
   that the post is already in the panel above and a second appearance is
   duplication. In practice that reads as a bug: the newest post is the one
   thing a returning reader is looking for, and "Latest" not containing it
   is the sort of thing you notice immediately and then distrust. The panel
   is a promotion, the strip is a chronology, and the same post can be both.
   Yes, it appears twice on the page. That is intended. */
const newest = parseDate(listed[0].date);
const windowed = listed.filter(p =>
  (newest - parseDate(p.date)) / 86400000 <= LATEST_WINDOW_DAYS);
const latest = listed.slice(0, Math.min(LATEST_MAX, Math.max(LATEST_MIN, windowed.length)));

/* Sections biggest-first. Ties fall back to the CATEGORIES order, which is
   the reader journey Adam set - so the manual order still decides anything
   the counts leave undecided, and the page re-sorts itself as the archive
   fills out instead of needing a hand every few months. */
const countOf = c => listed.filter(p => p.category === c.key).length;
const ordered = CATEGORY_ORDER === 'count'
  ? [...CATEGORIES].sort((a, b) =>
      countOf(b) - countOf(a) || CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b))
  : [...CATEGORIES];

/* Relative to the newest post, never to today - see the header note on
   determinism. */
const isNew = p => NEW_FOR_DAYS > 0
  && (newest - parseDate(p.date)) / 86400000 < NEW_FOR_DAYS;

/* ─── markup ───────────────────────────────────────────────────────────── */

const href = p => `blog/${p.slug}.html`;
const display = p => p.cardTitle || p.title;
const newBadge = p => isNew(p) ? '<span class="bl-new">New</span>' : '';

/* `showCat` is really "is this the Latest strip", and it governs the New badge
   too. Badging in the category sections as well looked like a bug: the first
   ten posts shipped in a nine-day burst, so eleven of twenty rows came back
   badged and the badge stopped meaning anything. Recency belongs to the
   featured panel and the Latest strip; the category sections are for someone
   who arrived with a problem, and to them a 2026 post and a 2027 post are
   equally relevant. */
function row(p, { showCat }) {
  const lead = showCat
    ? `<span class="bl-row-cat">${esc(catByKey.get(p.category).name)}</span>`
    : `<span class="bl-row-cat">${p.series ? esc(p.series) : ''}</span>`;
  const badge = showCat ? newBadge(p) : '';

  return `        <a class="bl-row" href="${href(p)}">
          ${lead}
          <span class="bl-row-body">
            <span class="bl-row-title">${esc(display(p))}${badge}</span>
            <span class="bl-row-dek">${esc(p.dek)}</span>
          </span>
          <span class="bl-row-meta">
            <span class="bl-row-date">${esc(shortDate(p.date))}</span>
            <span class="bl-row-read">${p.read} min</span>
          </span>
          <span class="bl-row-go" aria-hidden="true">&rarr;</span>
        </a>`;
}

/* Featured panel. Dark on a cream page: the strongest contrast available in
   the palette, spent on the one post we most want opened. */
const heroSeries = featured.series
  ? `<span class="bl-hero-series">${esc(featured.series)}</span>` : '';
const heroNew = isNew(featured)
  ? '<span class="bl-new bl-new-on-dark">New</span>' : '';

const heroBlock = `      <a class="bl-hero" href="${href(featured)}">
        <span class="bl-hero-kick">
          <span class="bl-hero-cat">${esc(catByKey.get(featured.category).name)}</span>
          ${heroSeries}
          ${heroNew}
        </span>
        <span class="bl-hero-title">${esc(display(featured))}</span>
        <span class="bl-hero-dek">${esc(featured.dek)}</span>
        <span class="bl-hero-foot">
          <span class="bl-hero-meta">${esc(longDate(featured.date))} &middot; ${featured.read} min read</span>
          <span class="bl-hero-go">Read it &rarr;</span>
        </span>
      </a>`;

const chips = [
  `        <a class="bl-chip" href="#latest">Latest</a>`,
  ...ordered
    .filter(c => listed.some(p => p.category === c.key))
    .map(c => {
      const n = listed.filter(p => p.category === c.key).length;
      return `        <a class="bl-chip" href="#cat-${c.key}">${esc(c.name)} <span class="bl-chip-n">${n}</span></a>`;
    }),
].join('\n');

const latestBlock = `      <div class="bl-block" id="latest">
        <div class="bl-block-head">
          <h3 class="bl-block-name">Latest</h3>
          <p class="bl-block-blurb">Everything else from the last month.</p>
          <span class="bl-block-n">${latest.length} post${latest.length === 1 ? '' : 's'}</span>
        </div>
        <div class="bl-rows">
${latest.map(p => row(p, { showCat: true })).join('\n')}
        </div>
      </div>`;

const catBlocks = ordered.map(c => {
  const posts = listed.filter(p => p.category === c.key);
  if (!posts.length) return null;

  const overflow = posts.length > CATEGORY_VISIBLE;
  const rows = posts.map((p, i) => {
    const html = row(p, { showCat: false });
    return overflow && i >= CATEGORY_VISIBLE
      ? html.replace('class="bl-row"', 'class="bl-row bl-row-over"')
      : html;
  }).join('\n');

  const more = overflow
    ? `\n        <button class="bl-more" type="button" data-more>Show all ${posts.length} <span aria-hidden="true">&darr;</span></button>`
    : '';

  return `      <div class="bl-block" id="cat-${c.key}">
        <div class="bl-block-head">
          <h3 class="bl-block-name">${esc(c.name)}</h3>
          <p class="bl-block-blurb">${esc(c.blurb)}</p>
          <span class="bl-block-n">${posts.length} post${posts.length === 1 ? '' : 's'}</span>
        </div>
        <div class="bl-rows"${overflow ? ' data-collapsed' : ''}>
${rows}
        </div>${more}
      </div>`;
}).filter(Boolean).join('\n\n');

const indexBlock = [
  '<!-- BLOG-INDEX:START — generated by tools/build-blog-index.mjs from',
  '     tools/blog-content.mjs. DO NOT EDIT BY HAND: the next build overwrites',
  '     it, and deploy-site.ps1 fails stage 1 if this block is stale. -->',
  '    <div class="bl-featured-wrap">',
  '      <div class="bl-featured-lbl">Read this first</div>',
  heroBlock,
  '    </div>',
  '',
  '    <nav class="bl-chips" aria-label="Jump to a topic">',
  chips,
  '    </nav>',
  '',
  '    <div class="bl-blocks">',
  latestBlock,
  '',
  catBlocks,
  '    </div>',
  '<!-- BLOG-INDEX:END -->',
].join('\n');

/* ─── JSON-LD ──────────────────────────────────────────────────────────── */

const graph = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  '@id': `${ORIGIN}/blog.html#blog`,
  url: `${ORIGIN}/blog.html`,
  name: "The Hustlin' Blog",
  description: 'Real talk on banking, credit, debt, and investing. No jargon, no judgment.',
  inLanguage: 'en-US',
  publisher: {
    '@type': 'Organization',
    '@id': `${ORIGIN}/#organization`,
    name: "Hustlin'",
    url: `${ORIGIN}/`,
    logo: { '@type': 'ImageObject', url: `${ORIGIN}/assets/hustlin-logo.png` },
  },
  blogPost: listed.map(p => ({
    '@type': 'BlogPosting',
    headline: p.title,
    description: p.dek,
    url: `${ORIGIN}/blog/${p.slug}.html`,
    datePublished: p.date,
    dateModified: p.lastmod || p.date,
    author: { '@id': `${ORIGIN}/#organization` },
  })),
};

const ldBlock = `<!-- BLOG-LD:START — generated by tools/build-blog-index.mjs. DO NOT EDIT BY HAND. -->
<script type="application/ld+json">
${JSON.stringify(graph, null, 2)}
</script>
<!-- BLOG-LD:END -->`;

/* ─── sitemap ──────────────────────────────────────────────────────────── */

const sitemapUrls = [
  `  <url>
    <loc>${ORIGIN}/blog.html</loc>
    <lastmod>${listed[0].lastmod || listed[0].date}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`,
  ...sorted.map(p => `  <url>
    <loc>${ORIGIN}/blog/${p.slug}.html</loc>
    <lastmod>${p.lastmod || p.date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${(p.priority ?? 0.8).toFixed(1)}</priority>
  </url>`),
].join('\n\n');

const sitemapBlock = `  <!-- BLOG:START -->
  <!-- Blog. Generated by tools/build-blog-index.mjs from tools/blog-content.mjs.
       Do not hand-edit - the next build overwrites it.

       blog.html itself carries changefreq weekly because it genuinely is:
       posts ship on a weekly cadence and the index is rewritten each time.
       The posts are monthly, since a published post changes only when it is
       revised, and lastmod then comes from the manifest's lastmod field
       rather than from the build date. Claiming a lastmod that is really
       "whenever I last deployed" is how a sitemap stops being believed. -->

${sitemapUrls}
  <!-- BLOG:END -->`;

/* ─── splice ───────────────────────────────────────────────────────────── */

function splice(source, file, startMark, endMark, block, label) {
  const s = source.indexOf(startMark);
  const e = source.indexOf(endMark);
  if (s === -1 || e === -1) {
    console.error(`blog index: ${label} markers not found in ${file}.`);
    console.error(`  expected "${startMark}" ... "${endMark}"`);
    process.exit(1);
  }
  return source.slice(0, s) + block + source.slice(e + endMark.length);
}

let html = readFileSync(BLOG_HTML, 'utf8');
const htmlBefore = html;
html = splice(html, 'blog.html', '<!-- BLOG-LD:START', '<!-- BLOG-LD:END -->', ldBlock, 'JSON-LD');
html = splice(html, 'blog.html', '<!-- BLOG-INDEX:START', '<!-- BLOG-INDEX:END -->', indexBlock, 'index');

let xml = readFileSync(SITEMAP, 'utf8');
const xmlBefore = xml;
xml = splice(xml, 'sitemap.xml', '  <!-- BLOG:START', '  <!-- BLOG:END -->', sitemapBlock, 'sitemap');

const staleHtml = html !== htmlBefore;
const staleXml = xml !== xmlBefore;

if (CHECK) {
  if (staleHtml) console.error('blog index: blog.html is stale - run: node tools/build-blog-index.mjs');
  if (staleXml) console.error('blog index: sitemap.xml blog block is stale - run: node tools/build-blog-index.mjs');
  if (staleHtml || staleXml) process.exit(1);
  console.log(`blog index: current - ${POSTS.length} post(s) in the sitemap, `
    + `${listed.length} on the index`
    + `${POSTS.length - listed.length ? ` (${POSTS.length - listed.length} archived)` : ''}`
    + `, ${CATEGORIES.length} categories`);
  process.exit(0);
}

if (staleHtml) writeFileSync(BLOG_HTML, html, 'utf8');
if (staleXml) writeFileSync(SITEMAP, xml, 'utf8');

console.log(`blog index: ${POSTS.length} post(s), ${listed.length} shown on the index`
  + `${POSTS.length - listed.length ? ` (${POSTS.length - listed.length} archived, still in the sitemap)` : ''}`
  + `, across ${new Set(listed.map(p => p.category)).size} categories`);
console.log(`  featured: ${featured.slug}`);
console.log(`  blog.html   ${staleHtml ? 'rewritten' : 'unchanged'}`);
console.log(`  sitemap.xml ${staleXml ? 'rewritten' : 'unchanged'}`);
