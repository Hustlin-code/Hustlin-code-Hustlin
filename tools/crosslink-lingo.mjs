/* ===================================================================
   crosslink-lingo.mjs
   -------------------------------------------------------------------
   Links the first mention of a Learn the Lingo term, on the pages that
   are prose rather than generated output, to that term's glossary page.

   RUN:  node tools/crosslink-lingo.mjs
         node tools/crosslink-lingo.mjs --check     writes nothing, exits 1 on drift
         node tools/crosslink-lingo.mjs --report    what it would link, and why not
         node tools/crosslink-lingo.mjs --strip     remove every link it owns

   WHY THIS EXISTS

   On 2026-08-12 the glossary was twenty-eight pages of original long-form
   writing, the largest crawlable surface on the site, and it was linked from
   FIVE pages in the entire repo: index.html, death-of-a-spouse.html,
   retirement-withdrawal.html, stage-5-wealth.html and the hub itself. Nothing
   in the nav pointed at it at all. Meanwhile the guides said "charge-off" and
   "credit utilization" and "cost basis" in plain prose, dozens of times,
   linking nothing.

   That is the same ownership failure the nav had before nav.template.html:
   not a design decision, just nobody owning it. Hand-adding the links would
   have worked once and then rotted, because the next term added would not know
   which pages should mention it.

   WHAT IT OWNS, AND ONLY THIS

   Every link it inserts carries class="lingo-x". It owns those and nothing
   else. That is what makes --check a real gate rather than a guess: strip the
   lingo-x links, re-insert from scratch, and compare. Same contract as
   stamp-footers and stamp-nav.

   A HAND-WRITTEN LINK ALWAYS WINS. If a page already links to a term's page
   by any other means, this tool leaves that term alone on that page entirely.
   So an editor who writes a better link in better prose is never overwritten,
   and does not have to know this tool exists.

   WHAT IT WILL NOT TOUCH — and why each one is deliberate

   Generated pages, because editing generated HTML is a lie that survives
   exactly until the next build:

     stage-N-*.html            build-public-stages.mjs writes these whole, from
                               the masters in "Financial Literacy Course/".
                               Crosslinking a stage means editing the master AND
                               re-uploading to Supabase Storage, which needs the
                               secret key. See KNOWN GAPS at the bottom.
     *-calculator.html         build-calculators.mjs writes these whole from
     calculate-your-hustle     tools/calc-content.mjs. Same story: the copy
                               lives in the content module, so that is where a
                               link would have to go. Also in KNOWN GAPS.
     learn-the-lingo/*         build-lingo.mjs owns them and they already
     learn-the-lingo.html      cross-link each other through `related`.

   Pages where a marketing link is the wrong thing:

     terms-of-service, privacy-policy, dmca   legal text. Do not decorate it.
     login / signup / reset / forgot-password / change-password / auth-callback
     checkout-success, 404                    not reading surfaces.
     learn.html                               noindex, and it is a viewer shell.
     *.template.html                          templates, stamped elsewhere.
     symbol-check.html, Markets/*             tool pages; and no ads or extra
                                              links on Markets/ by standing rule.

   WITHIN a page it also refuses to touch:

     - anything inside a marker block: NAV, FOOTER, SHARE, POST-HEAD,
       POST-SHELL, MKT:*. Those belong to other generators, and stamp-nav
       byte-compares its block, so a link inserted there fails the deploy.
     - anything already inside an <a>. Nested anchors are invalid HTML and the
       browser's recovery from them is not something to rely on.
     - headings h1-h6. A link in a heading fights the heading gate and reads
       badly; the term will almost always appear in the prose underneath.
     - <script>, <style>, <code>, <pre>, and HTML comments.
     - everything before <body>. Linking inside <title> or a meta description
       would corrupt them.

   THE CAP IS REAL AND IS LOGGED

   MAX_PER_PAGE stops a guide that says "credit score" nine times from turning
   into a link farm. When the cap bites, --report says so by name. A tool that
   silently drops work reads as "covered everything" when it did not.
   =================================================================== */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TERMS } from './lingo-content.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const REPORT = process.argv.includes('--report');
const STRIP = process.argv.includes('--strip');

/* Ten is a judgment call, not a rule from anywhere. It is roughly one link per
   two screens on a 3,000-word guide, which is dense enough to be useful and
   sparse enough that the prose still reads as prose. */
const MAX_PER_PAGE = 10;

/* ---------- which files ------------------------------------------- */

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.github', '_deploy', 'assets', 'mascot', 'supabase',
  'tools', 'terms', 'learn-the-lingo', 'Markets',
  'Financial Literacy Course', 'EconomicsCourse', 'Fundemental Course',
  'TA Course', 'TradingPsycologycourse',
]);
const SKIP_DIR_RE = /^_backup/;

/* Exact filenames, root-relative with forward slashes. */
const SKIP_FILES = new Set([
  'learn-the-lingo.html', 'learn.html',
  /* blog.html is an index: its text is post excerpts, and every one of them
     should be pointing at its own post, not off to the glossary. */
  'blog.html',
  'login.html', 'signup.html', 'forgot-password.html', 'reset-password.html',
  'change-password.html', 'auth-callback.html', 'checkout-success.html',
  '404.html', 'symbol-check.html',
  'terms-of-service.html', 'privacy-policy.html', 'dmca.html',
  'footer.template.html', 'nav.template.html',
  'calculate-your-hustle.html', 'sinking-fund-calculator.html',
]);
const SKIP_FILE_RE = [
  /^stage-\d-[a-z]+\.html$/,      // build-public-stages.mjs owns these
  /-calculator\.html$/,           // build-calculators.mjs owns these
  /\.template\.html$/,
];

/* Why each excluded page is excluded, for --report. Keyed by the rule, not the
   file, so this list does not have to be maintained per page. */
const SKIP_REASON = [
  [/^stage-\d-[a-z]+\.html$/, 'generated by build-public-stages.mjs from the course master'],
  [/-calculator\.html$/, 'generated by build-calculators.mjs from tools/calc-content.mjs'],
  [/^calculate-your-hustle\.html$/, 'generated by build-calculators.mjs'],
  [/^(terms-of-service|privacy-policy|dmca)\.html$/, 'legal text - not a marketing surface'],
  [/^(login|signup|forgot-password|reset-password|change-password|auth-callback|checkout-success|404)\.html$/, 'not a reading surface'],
  [/^learn\.html$/, 'noindex viewer shell'],
  [/^learn-the-lingo\.html$/, 'the hub - build-lingo.mjs owns its index'],
  [/^blog\.html$/, 'index page - excerpts should link their own post'],
  [/^sinking-fund-calculator\.html$/, 'redirect stub'],
  [/\.template\.html$/, 'template, stamped into pages elsewhere'],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || SKIP_DIR_RE.test(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

const rel = (p) => relative(ROOT, p).split(sep).join('/');
const base = (p) => rel(p).split('/').pop();

function isTarget(p) {
  const b = base(p);
  if (SKIP_FILES.has(b)) return false;
  if (SKIP_FILE_RE.some((re) => re.test(b))) return false;
  return true;
}

/* ---------- the phrases ------------------------------------------- */

/* Defaults are `term` and `shortName`. These are the ones where the default is
   wrong, and each entry says why.

   `ci: false` means case-sensitive, which is how an acronym avoids matching an
   ordinary word. "PMI" must not match "pmi" in a URL fragment; "ABLE account"
   must not match "able account" in "was able to account for it".

   A phrase is only ever matched on word boundaries, so nothing here needs to
   worry about matching inside a longer word. It DOES need to worry about
   matching inside a longer PHRASE, which is what the longest-first sort at the
   bottom of this block handles: "interest rate" cannot steal a match from
   "real interest rate" because the longer phrase is tried first. */
const OVERRIDE = {
  /* "Utilization" alone is far too generic - it shows up about business
     capacity and about credit limits, and only one of those is this term. */
  'credit-utilization': [['credit utilization', true]],

  /* Acronyms: case-sensitive, plus the plural where it reads naturally. */
  apr: [['APR', false], ['APRs', false], ['annual percentage rate', true]],
  apy: [['APY', false], ['annual percentage yield', true]],

  /* NO BARE "PMI". On this site PMI is two different things: Private Mortgage
     Insurance in the housing material, and the Purchasing Managers' Index in
     the economics material. The first run of this tool linked
     "Diffusion index (PMI)" in economics.html's indicator table straight to the
     mortgage insurance page, which is simply a wrong fact on the page.
     Acronym collision cannot be resolved by word boundaries - only by context,
     which this tool does not model - so the acronym is not a phrase and the
     unambiguous spelled-out form does the work. When purchasing-managers-index
     is written as a term, it gets the same treatment for the same reason. */
  pmi: [['private mortgage insurance', true]],
  ssi: [['SSI', false], ['Supplemental Security Income', true]],
  'relative-strength-index-rsi': [['RSI', false], ['relative strength index', true]],
  'required-minimum-distribution': [
    ['RMD', false], ['RMDs', false],
    ['required minimum distribution', true], ['required minimum distributions', true],
  ],

  /* "ABLE" is a defined term in the statute and is always capitalized. Lower
     case "able account" is a false positive every time. */
  'able-account': [['ABLE account', false], ['ABLE accounts', false]],

  /* Hyphenated, and the open-spaced form is a different part of speech that
     usually should not be linked ("charge off the balance"). Plural included
     because the guides use it more often than the singular. */
  'charge-off': [['charge-off', true], ['charge-offs', true]],

  /* The adjectival form is how this one almost always appears in prose. */
  'step-up-in-basis': [
    ['step-up in basis', true], ['stepped-up basis', true], ['step-up basis', true],
  ],

  /* Both orders are in use across the site. */
  'support-and-resistance': [
    ['support and resistance', true], ['support-and-resistance', true],
  ],

  'yield-curve-inversion': [
    ['yield curve inversion', true], ['inverted yield curve', true],
  ],

  /* Plurals worth having: these are the terms the prose pluralizes. */
  'discount-points': [['discount points', true], ['discount point', true]],
  'emergency-fund': [['emergency fund', true], ['emergency funds', true]],
  'sinking-fund': [['sinking fund', true], ['sinking funds', true]],
  'secured-credit-card': [['secured credit card', true], ['secured credit cards', true]],
  'finance-charge': [['finance charge', true], ['finance charges', true]],
  'grace-period': [['grace period', true], ['grace periods', true]],
  'credit-score': [['credit score', true], ['credit scores', true]],
  'cost-basis': [['cost basis', true]],
  'net-worth': [['net worth', true]],
  'interest-rate': [['interest rate', true], ['interest rates', true]],
  'prime-rate': [['prime rate', true]],
  'compound-interest': [['compound interest', true], ['compounding interest', true]],
  'roth-ira': [['Roth IRA', false], ['Roth IRAs', false]],
  probate: [['probate', true]],
  amortization: [['amortization', true]],
  inflation: [['inflation', true]],
};

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* One flat list, longest phrase first so a longer phrase always wins. The
   secondary sort on slug keeps the order stable across runs, which is what
   lets --check byte-compare. */
const PHRASES = TERMS.flatMap((t) => {
  const raw = OVERRIDE[t.slug] || [[t.term, true], ...(t.shortName && t.shortName !== t.term ? [[t.shortName, true]] : [])];
  return raw.map(([phrase, ci]) => ({
    slug: t.slug,
    phrase,
    /* \b is wrong at a hyphen: /\bcharge-off\b/ works, but a phrase ending in a
       hyphenated word can sit next to punctuation \b does not see. Explicit
       lookarounds on "word character or hyphen" behave the same for plain
       words and correctly for hyphenated ones. */
    re: new RegExp(`(?<![\\w-])${escRe(phrase)}(?![\\w-])`, ci ? 'i' : ''),
  }));
}).sort((a, b) => b.phrase.length - a.phrase.length || a.slug.localeCompare(b.slug) || a.phrase.localeCompare(b.phrase));

/* ---------- strip: the inverse, and the basis of --check ---------- */

/* Deliberately anchored on class="lingo-x" as the FIRST attribute, which is
   how insert() writes it. Anything else in the file with that class was not
   written by this tool and is left alone. */
const LINK_RE = /<a class="lingo-x" href="[^"]*">([\s\S]*?)<\/a>/g;
const strip = (html) => html.replace(LINK_RE, '$1');

/* Everything inside a marker block, blanked.
   ---------------------------------------------------------------------------
   This exists because of a bug this tool shipped with and hit on its first run.
   The "a hand-written link always wins" check scanned the whole file for a link
   to a term's page - and the Lingo nav panel added on 2026-08-12 links all
   twenty-eight terms, inside NAV:START/END, on every stamped page. So every
   term looked hand-linked, and the first --report claimed all twenty-two prose
   pages were already fully crosslinked while linking nothing. Only the ten blog
   posts got links, because their nav is the two-link post shell.

   The lesson is the one in the standing rules: a finding has to be checked
   against the file even when the finding is the tool's own. Pre-existing links
   are looked for in the PROSE only, which is the same region insert() is
   willing to write into. */
const MARKER_BLOCK_RE = /<!--\s*[A-Z][A-Za-z0-9_:-]*:START\s*-->[\s\S]*?<!--\s*[A-Z][A-Za-z0-9_:-]*:END\s*-->/g;
const proseOnly = (html) => html.replace(MARKER_BLOCK_RE, '');

/* ---------- insert ------------------------------------------------ */

const SKIP_TAGS = new Set(['script', 'style', 'code', 'pre', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'textarea', 'select', 'option', 'button', 'svg']);

/* A link is only inserted inside a <p> or an <li>. Nothing else counts as prose.
   ---------------------------------------------------------------------------
   Without this rule the first clean run put links in exactly the wrong places:
   a card title (<div class="scenario-name">SSI</div>), the guide teasers on
   financial-literacy.html (<div class="p-desc">SSDI, SSI, ABLE...</div>), and
   the journey-card blurbs (<div class="j-desc">Emergency fund, debt avalanche,
   side income</div>). None of those are sentences. They are labels, and a label
   is already doing a navigational job for the card it sits in - sending that
   click to the glossary instead is worse for the reader and reads as keyword
   stuffing to a crawler.

   Requiring a <p> or <li> ancestor is a blunt rule and it does drop a handful
   of legitimate spots in table cells and definition lists. That trade is worth
   it: every link it does place is inside a sentence, which is the only place a
   glossary link belongs. Widening this later means naming the container tag
   explicitly, not loosening it to "any element". */
const PROSE_TAGS = new Set(['p', 'li']);

/* These match the marker token at the START of the comment and deliberately do
   NOT anchor at the end.

   FIXED 2026-08-13. They used to require the comment to be *nothing but* the
   marker (`...:START\s*-->$`). Every marker this file claims to protect is
   written by its generator with an explanatory tail:

       <!-- POST-SHELL:START — generated by tools/stamp-post-shell.mjs from
            tools/post-shell.template.html + tools/blog-content.mjs.
            DO NOT EDIT BY HAND. -->

   That never matched, so markerDepth never incremented, and this tool has been
   free to insert links inside POST-HEAD, POST-SHELL, FOOTER and SHARE on every
   blog post since those markers were introduced — the exact opposite of what
   the header comment above promises.

   Nothing broke for months only by luck: on the existing posts, every glossary
   term in a hero or footer had already been linked in the body, or the
   MAX_PER_PAGE cap was reached before the walker got there. The first post with
   an unlinked term in its heroSub ("inflation", 2026-08-13) had the link
   written straight into its POST-SHELL block, which failed gate 2a0 on the next
   deploy with "post shells are stale" — a message that points at
   stamp-post-shell and says nothing about the tool that actually did it.

   Do not re-anchor these to `-->$`. The generators own the tail text and it
   changes. */
/* THE CHARACTER CLASS MUST ALLOW LOWERCASE. Third instance of this same bug.
   `[A-Z][A-Z0-9_:-]*` matches NAV:START, FOOTER:START and POST-SHELL:START —
   and matches none of the twelve MKT markers, because every market set name is
   lower camel case: MKT:quotes:START, MKT:changed:START, MKT:earningsScore:START.
   So this tool has been free to write links inside blocks owned by
   tools/inject-market-data.mjs since the markers existed, and four such links
   were live on markets.html when this was found on 2026-08-16.

   The failure is delayed and the message points at the wrong tool, exactly like
   the POST-SHELL case above: the injector wipes the block on its next bake,
   crosslink-lingo --check then reports the page stale, and gate 2a0000000b
   fails a deploy that changed nothing. */
const MARKER_START = /^<!--\s*[A-Z][A-Za-z0-9_:-]*:START\b/;
const MARKER_END = /^<!--\s*[A-Z][A-Za-z0-9_:-]*:END\b/;

/**
 * Walk the document once, in order, and wrap the first eligible mention of each
 * term. Returns { html, linked: [slug], capped: [slug] }.
 *
 * Written as a hand-rolled tag scanner rather than a regex over the whole file
 * because the thing that matters is knowing which text is inside which element.
 * A regex cannot know it is inside an <a>, and "replace the term everywhere
 * except..." is how you get a nested anchor in a footer.
 */
function insert(html, prefix, alreadyLinked) {
  const done = new Set(alreadyLinked);
  const linked = [];
  const capped = new Set();

  /* Nothing before <body> is prose. */
  const bodyAt = html.search(/<body[\s>]/i);
  const start = bodyAt < 0 ? 0 : html.indexOf('>', bodyAt) + 1;

  let out = html.slice(0, start);
  let i = start;
  const openSkips = [];   // stack of skip-inducing tag names
  const openProse = [];   // stack of open <p>/<li> - must be non-empty to link
  let markerDepth = 0;

  while (i < html.length) {
    const lt = html.indexOf('<', i);

    /* ---- a run of text ---- */
    const text = html.slice(i, lt < 0 ? html.length : lt);
    if (text) {
      const eligible = openSkips.length === 0 && markerDepth === 0 && openProse.length > 0;
      if (eligible && linked.length < MAX_PER_PAGE) {
        out += linkInText(text);
      } else {
        if (eligible) {
          /* Cap already reached: note anything we would have linked. */
          for (const p of PHRASES) if (!done.has(p.slug) && p.re.test(text)) capped.add(p.slug);
        }
        out += text;
      }
    }
    if (lt < 0) break;

    /* ---- a tag or comment ---- */
    let end;
    if (html.startsWith('<!--', lt)) {
      end = html.indexOf('-->', lt);
      end = end < 0 ? html.length : end + 3;
    } else {
      end = html.indexOf('>', lt);
      end = end < 0 ? html.length : end + 1;
    }
    const tag = html.slice(lt, end);
    out += tag;
    i = end;

    if (tag.startsWith('<!--')) {
      const t = tag.trim();
      if (MARKER_START.test(t)) markerDepth++;
      else if (MARKER_END.test(t) && markerDepth > 0) markerDepth--;
      continue;
    }

    const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(tag);
    if (!m) continue;
    const [, slash, nameRaw] = m;
    const name = nameRaw.toLowerCase();

    if (PROSE_TAGS.has(name)) {
      if (slash) {
        const at = openProse.lastIndexOf(name);
        if (at >= 0) openProse.splice(at, 1);
      } else if (!/\/>$/.test(tag)) {
        /* <p> and <li> both close implicitly when the next one opens, and the
           site's markup relies on that in places. Without honoring it the stack
           only ever grows and every later paragraph looks nested inside the
           first, which is harmless here but would quietly break any future rule
           that cares about depth. */
        const at = openProse.lastIndexOf(name);
        if (at >= 0) openProse.splice(at, 1);
        openProse.push(name);
      }
      continue;
    }

    if (!SKIP_TAGS.has(name)) continue;

    if (slash) {
      /* Close the most recent matching open, not blindly pop: malformed markup
         should not leave the scanner permanently inside a skip. */
      const at = openSkips.lastIndexOf(name);
      if (at >= 0) openSkips.splice(at, 1);
    } else if (!/\/>$/.test(tag)) {
      openSkips.push(name);
    }
  }

  function linkInText(text) {
    let s = text;
    for (const p of PHRASES) {
      if (linked.length >= MAX_PER_PAGE) break;
      if (done.has(p.slug)) continue;
      const hit = p.re.exec(s);
      if (!hit) continue;
      const matched = hit[0];
      s = s.slice(0, hit.index) +
          `<a class="lingo-x" href="${prefix}learn-the-lingo/${p.slug}.html">${matched}</a>` +
          s.slice(hit.index + matched.length);
      done.add(p.slug);
      linked.push(p.slug);
    }
    return s;
  }

  return { html: out, linked, capped: [...capped] };
}

/* ---------- run --------------------------------------------------- */

const pages = walk(ROOT).filter(isTarget).sort();
let wrote = 0;
let totalLinks = 0;
const stale = [];
const rows = [];

for (const p of pages) {
  const r = rel(p);
  const depth = r.split('/').length - 1;
  const prefix = '../'.repeat(depth);
  const current = readFileSync(p, 'utf8');
  const bare = strip(current);

  if (STRIP) {
    if (bare !== current) {
      writeFileSync(p, bare, 'utf8');
      wrote++;
      console.log(`  stripped ${r}`);
    }
    continue;
  }

  /* A link to a term that this tool did not write means a human linked it in
     better prose than a first-mention wrap. Leave that term alone here.
     Looked for in the prose only - see the note on proseOnly() above. */
  const prose = proseOnly(bare);
  const preLinked = TERMS
    .filter((t) => new RegExp(`href="[^"]*learn-the-lingo/${escRe(t.slug)}\\.html`).test(prose))
    .map((t) => t.slug);

  const { html: next, linked, capped } = insert(bare, prefix, preLinked);
  rows.push({ r, linked, capped, preLinked });
  totalLinks += linked.length;

  if (next === current) continue;
  if (CHECK) { stale.push(r); continue; }
  /* --report is read-only. It was not, on the first version, and running it to
     preview the pass wrote twenty-eight files - including the wrong PMI link
     described above, which is how that got found. A flag whose name promises a
     report has to keep that promise. */
  if (REPORT) { stale.push(r); continue; }
  writeFileSync(p, next, 'utf8');
  wrote++;
  console.log(`  ${r}  +${linked.length}`);
}

if (REPORT) {
  console.log('\nPER PAGE\n');
  for (const { r, linked, capped, preLinked } of rows) {
    console.log(`${r}`);
    console.log(`   linked (${linked.length}): ${linked.join(', ') || '-'}`);
    if (preLinked.length) console.log(`   left alone, already linked by hand: ${preLinked.join(', ')}`);
    if (capped.length) console.log(`   NOT LINKED, hit the ${MAX_PER_PAGE}-link cap: ${capped.join(', ')}`);
  }

  const seen = new Set(rows.flatMap((x) => [...x.linked, ...x.preLinked]));
  const orphans = TERMS.map((t) => t.slug).filter((s) => !seen.has(s));
  console.log(`\nTerms linked from at least one prose page: ${seen.size}/${TERMS.length}`);
  if (orphans.length) {
    console.log(`Terms no prose page mentions (reachable only from the nav and the hub):`);
    for (const o of orphans) console.log(`   ${o}`);
  }

  console.log(`\nEXCLUDED FROM THIS PASS`);
  const all = walk(ROOT).sort();
  for (const p of all) {
    if (isTarget(p)) continue;
    const b = base(p);
    const why = SKIP_REASON.find(([re]) => re.test(b));
    console.log(`   ${rel(p).padEnd(46)} ${why ? why[1] : 'excluded by directory'}`);
  }
  console.log(`
KNOWN GAPS - these need a different tool, not this one:
   stage-1..5           the copy lives in "Financial Literacy Course/stage-N-*.html",
                        which is the Supabase Storage master. Editing it needs
                        supabase/upload-courses.ps1 to follow, which needs the
                        secret key. Adam runs that.
   26 calculator pages  the copy lives in tools/calc-content.mjs. Crosslinking
                        there means editing JSON-escaped strings inside a
                        content module and re-running build-calculators.mjs.
   10 blog posts        included in this pass, but note their nav is the
                        two-link post shell, not the shared nav, so the Lingo
                        panel does not reach them.
`);
}

if (!REPORT) {
  console.log(`\n${CHECK ? 'checked' : 'linked'} ${pages.length} prose page(s)` +
    (STRIP ? `, ${wrote} stripped` : `, ${totalLinks} link(s) across ${CHECK ? stale.length : wrote} file(s)`));
}

if (CHECK && stale.length) {
  console.log('\nThese are out of date with the glossary:');
  for (const s of stale) console.log(`  ${s}`);
  console.log('\nFix with:  node tools/crosslink-lingo.mjs');
  process.exitCode = 1;
}
