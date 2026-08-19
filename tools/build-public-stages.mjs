/**
 * =============================================================================
 *  build-public-stages.mjs  —  generate the public copies of the free FL stages.
 * =============================================================================
 *
 *  WHY THIS EXISTS
 *  ---------------
 *  Financial Literacy Stages 1-3 are readable with no account at all
 *  (courses.anon_stages = 3). But "free to read" and "visible to Google" are
 *  different things, and for a long time only Stage 1 was both.
 *
 *  The only route to a stage is learn.html?course=fl&stage=N, which is
 *  noindex,nofollow AND renders its content from a POST to an Edge Function.
 *  Googlebot gets an empty shell. So every free stage needs a second life as a
 *  static file at the site root:
 *
 *    Financial Literacy Course/stage-N-*.html   master, uploaded to Supabase
 *    stage-N-*.html                             public, indexable, deployed
 *
 *  This replaces build-public-stage1.mjs, which did exactly this for Stage 1
 *  only and was hardcoded throughout. Stages 2 and 3 were opened to anonymous
 *  readers on 31 Jul and gained no search visibility whatsoever until this
 *  script covered them — roughly 9,200 words of content on the highest-intent
 *  queries the site has (emergency funds, debt avalanche, credit disputes,
 *  Roth IRAs) that Google could not see.
 *
 *  USAGE
 *  -----
 *      node tools/build-public-stages.mjs           # write all public stages
 *      node tools/build-public-stages.mjs --check   # verify only, exit 1 if stale
 *
 *  --check is what deploy-site.ps1 wants. It never writes; it fails if any
 *  public copy no longer matches what its master would generate.
 *
 *  WHAT THE TRANSFORM DOES
 *  -----------------------
 *    1. Inserts the "PUBLIC COPY" banner comment.
 *    2. www.hustlin.org -> hustlin.org  (canonical host has no www).
 *    3. Points og:url at the static page, not the gated learn.html route.
 *    4. Adds canonical + Article/Organization/Breadcrumb/FAQPage JSON-LD. The
 *       master has none: it is served inside learn.html, which is noindex, so
 *       schema there would be pointless.
 *    4b. Adds the visible byline and the Person author (2026-08-12). Neither is
 *       in the master: the master renders inside learn.html, where a link out
 *       to about.html is a link out of the course shell.
 *    5. Pins styles.css to ?v=DEPLOYSTAMP, which deploy-site.ps1 rewrites.
 *    6. De-nests ../ — masters sit one folder down, these sit at root.
 *    7. Routes stages to the right place: a PUBLIC stage links to its flat
 *       file so crawlers can follow it; a GATED stage links to
 *       learn.html?course=fl&stage=N. Linking a gated stage as a flat file
 *       would 404, and linking a public stage through learn.html would waste
 *       the crawl path we just built.
 *
 *  ADDING A STAGE
 *  --------------
 *  Open Stage 4 to anonymous readers? Set courses.anon_stages = 4, then add an
 *  entry to STAGES below. Everything else — routing, schema, the deploy gate —
 *  follows from that one array. Keep it in step with anon_stages: a page here
 *  whose stage is still gated would be a public copy of paid-for content.
 * =============================================================================
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { navFor } from './nav-template.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COURSE_DIR = join(ROOT, 'Financial Literacy Course');
const SITE = 'https://hustlin.org';

/* The author identity, added 2026-08-12.
   ==========================================================================
   These five pages are the site's highest-intent search surface and they are
   YMYL finance, where Google's guidelines put "Experience" first. Naming the
   Organization as `author` — which is what they did before — reads as "nobody
   in particular wrote this."

   AUTHOR_ID is a cross-page @id. The node it names lives on about.html, at the
   h3 with id="author"; the Person node emitted below is the short form so the
   reference is not dangling on this page either. Change the @id and you change
   it in three places or it breaks: here, the anchor in about.html, and
   tools/stamp-post-author.mjs, which does the same job for blog posts.

   The byline markup is BYLINE below. It is injected by the generator rather
   than living in the master, because the master is uploaded to Supabase and
   read inside learn.html, where a link out to about.html is the wrong move. */
const AUTHOR_ID = `${SITE}/about.html#author`;
const AUTHOR_NAME = 'Adam';

/* The stage banner is a DARK surface. Colors are hardcoded hex on purpose —
   the light-surface tokens used on about.html are unreadable here, and an
   inline style keeps this out of styles.css, which would otherwise force a
   ?v= cache-bust bump across every file on the site for one paragraph.
   Do not convert to CSS variables. Indented to sit level with the intro <p>
   it follows; ../ is de-nested by step 6. */
const BYLINE =
  '        <p class="stage-byline" style="margin:14px 0 0;font-size:.82rem;line-height:1.5;color:#B8B8B8">'
  + `By <a href="../about.html#author" rel="author" style="color:#F0C030;text-decoration:none;font-weight:600">${AUTHOR_NAME}</a>`
  + '<span aria-hidden="true" style="color:#5A5A5A;margin:0 7px">&middot;</span>Founder, Hustlin&rsquo;</p>';

const checkOnly = process.argv.includes('--check');

/* Every stage in the course, public or not. `public: true` must mirror
   courses.anon_stages in the database — see the header note. */
const ALL_STAGES = [
  { n: 1, file: 'stage-1-survive.html',   name: 'Survive',      public: true },
  { n: 2, file: 'stage-2-stabilize.html', name: 'Stabilize',    public: true },
  { n: 3, file: 'stage-3-rebuild.html',   name: 'Rebuild',      public: true },
  { n: 4, file: 'stage-4-invest.html',    name: 'Invest',       public: true },
  { n: 5, file: 'stage-5-wealth.html',    name: 'Build Wealth', public: true },
];

/* Per-page SEO copy. HAND-MAINTAINED — nothing derives these from the content.
   If you change a stage's topics or module list, update its description,
   dateModified and FAQ entries here. */
const SEO = {
  1: {
    headline: 'Stage 1: Survive - Banking, Credit, and Your First Budget',
    description:
      'Free: second-chance banking, ChexSystems, credit scores, zero-based budgeting, the paperwork that unlocks everything, and getting to work with no car.',
    datePublished: '2026-01-01',
    dateModified: '2026-07-31',
    faq: [
      ['Can I open a bank account if I have been denied before?',
       'Yes. Being reported to ChexSystems does not lock you out of banking permanently. ' +
       'Second-chance checking accounts exist specifically for this, and many credit unions ' +
       'and online banks do not screen through ChexSystems at all. Stage 1 walks through the ' +
       'specific options and what each one costs.'],
      ['What is ChexSystems and how long does a record last?',
       'ChexSystems is a reporting agency banks use to screen new account applications, mostly ' +
       'for unpaid overdrafts and accounts closed for cause. Records generally stay for five ' +
       'years. You are entitled to a free report and can dispute entries that are wrong.'],
      ['How do I start building credit from zero?',
       'The usual routes are a secured credit card backed by a deposit, a credit-builder loan, ' +
       'or being added as an authorized user on someone else’s account. What matters most ' +
       'afterwards is paying on time every time and keeping balances low relative to the limit.'],
      ['What is zero-based budgeting?',
       'Zero-based budgeting means giving every dollar of income a job until nothing is ' +
       'unassigned — income minus all allocations equals zero. It is not about spending ' +
       'everything; savings and debt payments are jobs too. It works well on an irregular income ' +
       'because you budget the money you actually have rather than money you expect.'],
    ],
  },
  2: {
    headline: 'Stage 2: Stabilize - Emergency Fund, Debt Avalanche, and Side Income',
    description:
      'Free: the $1,000 emergency fund, the debt avalanche, your rights with collectors, a resume from nothing, the GED, and side income without a car.',
    datePublished: '2026-03-01',
    dateModified: '2026-07-31',
    faq: [
      ['What is the debt avalanche method?',
       'The avalanche method means paying minimums on every debt, then putting every spare dollar ' +
       'at the debt with the highest interest rate. Mathematically it costs you the least in total ' +
       'interest. The snowball method targets the smallest balance first instead, which is slower ' +
       'but can be easier to stick with — Stage 2 covers when each one makes sense.'],
      ['How big should my emergency fund actually be?',
       'The first target is a small, reachable one — around $1,000 — because its job is to ' +
       'stop a flat tire from becoming new credit card debt. A full three-to-six month fund comes ' +
       'later, after high-interest debt is cleared. Starting with the larger number is why most ' +
       'people never start at all.'],
      ['What are my rights when a debt collector contacts me?',
       'In the US, the Fair Debt Collection Practices Act limits when and how collectors may ' +
       'contact you, bars harassment and false statements, and gives you the right to request ' +
       'written validation of the debt. You can also require them to stop contacting you. Stage 2 ' +
       'covers what to say and what to put in writing.'],
      ['Should I consolidate my debt or do a balance transfer?',
       'Both move debt rather than reduce it, and both help only if the new rate is genuinely ' +
       'lower and you stop adding to the old balances. A 0% balance transfer can be worth it if ' +
       'you can clear it inside the promotional window; consolidation loans are worth checking for ' +
       'fees and a longer term that quietly raises total interest paid.'],
      ['Can I negotiate my bills down?',
       'Frequently, yes — particularly on internet, phone, insurance and medical bills. ' +
       'Medical bills in particular are often reduced or put on an interest-free plan simply for ' +
       'asking. Stage 2 covers who to ask, what to say, and which bills have the most room.'],
    ],
  },
  3: {
    headline: 'Stage 3: Rebuild - Credit Repair, Compound Interest, and Your First Investments',
    description:
      'Free: disputing credit errors, what compound interest really does, a first brokerage account, index funds, Roth vs traditional, and paying off 22% debt.',
    datePublished: '2026-04-01',
    dateModified: '2026-07-31',
    faq: [
      ['How do I dispute an error on my credit report?',
       'Get your reports from all three bureaus, identify the specific inaccurate item, and file a ' +
       'dispute with the bureau in writing with supporting documents. The bureau generally has 30 ' +
       'days to investigate. Disputing errors is free — you never need to pay a repair company ' +
       'to do it for you.'],
      ['Roth IRA or traditional IRA — which should I open first?',
       'The core trade-off is when you pay tax. A Roth is funded with after-tax money and grows ' +
       'tax-free; a traditional IRA may give you a deduction now and is taxed on withdrawal. If ' +
       'you expect to be in a higher tax bracket later, a Roth is often favored — which is ' +
       'commonly the case for someone early in their earning years.'],
      ['What is the difference between an index fund and an ETF?',
       'Both can track the same index and hold the same underlying assets. The practical ' +
       'differences are how they trade — ETFs trade throughout the day like a stock, index ' +
       'mutual funds price once daily — and their minimums and fee structures. For a ' +
       'long-term buy-and-hold investor the distinction matters far less than the expense ratio.'],
      ['What does employer matching actually mean?',
       'Many employers contribute to your retirement account in proportion to what you put in, up ' +
       'to a limit. Contributing at least enough to capture the full match is the closest thing to ' +
       'guaranteed return available, because it is additional compensation you forfeit by not ' +
       'contributing.'],
      ['How long does it take to rebuild credit after collections or bankruptcy?',
       'Most negative marks fall off after seven years, and a Chapter 7 bankruptcy after ten — ' +
       'but their impact fades well before they disappear. Consistent on-time payments and low ' +
       'balances start moving a score within months, and rebuilding usually begins long before the ' +
       'record clears.'],
    ],
  },
  4: {
    headline: 'Stage 4: Invest - Index Funds, Dividends, and How the Market Works',
    description:
      'Free: what a share actually is, why markets exist, index funds, dollar-cost averaging, risk, and real returns on stocks, bonds, gold, cash and crypto.',
    datePublished: '2026-05-01',
    dateModified: '2026-08-01',
    faq: [
      ['How does the stock market actually work?',
       'A share of stock is a small ownership stake in a real business. The market is simply where ' +
       'those stakes change hands, and a price is whatever a buyer and a seller agree on at that ' +
       'moment. Over short periods prices swing on sentiment; over long periods they track how much ' +
       'the underlying businesses actually earn.'],
      ['Should I buy an S&P 500 fund or a total market fund?',
       'The S&P 500 holds roughly the 500 largest US companies; a total-market fund holds those ' +
       'plus thousands of mid- and small-cap companies. Their long-run returns have been very ' +
       'close because the largest companies dominate both. Either is a reasonable core holding — ' +
       'the expense ratio and whether you keep buying matter far more than the choice between them.'],
      ['What is dollar-cost averaging and does it beat timing the market?',
       'Dollar-cost averaging means investing a fixed amount on a fixed schedule regardless of ' +
       'price. It does not guarantee a better return than investing a lump sum, but it removes the ' +
       'decision that most often destroys returns — trying to guess the right moment. Missing a ' +
       'small number of the market’s best days, which cluster near the worst ones, ' +
       'disproportionately damages long-run results.'],
      ['How much money do I need to start investing?',
       'Far less than most people assume. Most major brokerages have no account minimum and support ' +
       'fractional shares, so a first contribution can be a few dollars. The amount matters much ' +
       'less than starting early and contributing consistently, because time in the market is the ' +
       'variable you control that compounds.'],
      ['What is diversification and why does it matter?',
       'Diversification means spreading money across many holdings so that no single company or ' +
       'sector can sink you. A broad index fund is diversified by construction — one purchase buys ' +
       'hundreds or thousands of companies. Concentrating in one stock is a bet on one outcome; ' +
       'diversifying is a bet that the economy as a whole keeps producing.'],
    ],
  },
  5: {
    headline: 'Stage 5: Build Wealth - Compound Growth, Tax Strategy, and Legacy',
    description:
      'Free: staying invested through crashes, the Dow since 1896, state income tax differences, buying a house, giving back, and your financial freedom number.',
    datePublished: '2026-06-01',
    dateModified: '2026-08-01',
    faq: [
      ['What is my financial freedom number?',
       'It is the amount of invested assets that could cover your annual expenses indefinitely. A ' +
       'common starting estimate is annual spending multiplied by 25, which corresponds to ' +
       'withdrawing about 4% a year. It is a planning benchmark rather than a guarantee, and it ' +
       'moves with your actual spending, so lowering expenses lowers the target on both sides.'],
      ['Why does staying invested through a crash matter so much?',
       'Because recoveries are concentrated into a small number of days that arrive without ' +
       'warning, usually while the news is still bad. An investor who sells to avoid the worst days ' +
       'almost always misses the best ones too. The Dow’s history since 1896 spans wars, ' +
       'depressions and crashes, and the long-run direction has been up for those who stayed in.'],
      ['Is a 20% down payment on a house actually necessary?',
       'It is not required for many loan programs, but it changes the arithmetic. Twenty percent ' +
       'typically removes private mortgage insurance, lowers the loan balance and often earns a ' +
       'better rate — which compounds into a materially smaller total cost over the life of the ' +
       'mortgage.'],
      ['What estate documents does an ordinary person actually need?',
       'For most people the essentials are a will, named beneficiaries on every retirement and ' +
       'bank account, and up-to-date powers of attorney. Beneficiary designations matter more than ' +
       'people expect, because they generally override whatever a will says. Complex situations ' +
       'call for an attorney.'],
      ['How do wealthy households lower their tax bill legally?',
       'Mostly through the ordinary mechanics of the tax code rather than anything exotic: holding ' +
       'investments longer than a year for lower long-term capital gains rates, using ' +
       'tax-advantaged accounts to their limits, harvesting losses, and giving through charitable ' +
       'accounts. These tools are available at ordinary incomes too, which is what Stage 5 covers.'],
    ],
  },
};

const PUBLIC = ALL_STAGES.filter((s) => s.public);

function banner(stage) {
  return `<!-- ===================================================================
     PUBLIC COPY - generated from "Financial Literacy Course/${stage.file}"
     Stages 1-${PUBLIC.length} are free to anonymous users, so this ships as a static,
     indexable page. Paths de-nested to root, gated stages routed to the
     gated shell, canonical + Article/FAQ schema added.
     EDIT THE MASTER IN THE COURSE FOLDER, then regenerate this file:
       node tools/build-public-stages.mjs
     =================================================================== -->`;
}

function seoHead(stage) {
  const meta = SEO[stage.n];
  const url = `${SITE}/${stage.file}`;
  const faq = meta.faq
    .map(
      ([q, a]) => `        {
          "@type": "Question",
          "name": ${JSON.stringify(q)},
          "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(a)} }
        }`
    )
    .join(',\n');

  return `<link rel="canonical" href="${url}">

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": ${JSON.stringify(meta.headline)},
      "description": ${JSON.stringify(meta.description)},
      "url": "${url}",
      "image": "${SITE}/assets/social-preview.png",
      "datePublished": "${meta.datePublished}",
      "dateModified": "${meta.dateModified}",
      "inLanguage": "en-US",
      "isAccessibleForFree": true,
      "author":    { "@id": "${AUTHOR_ID}" },
      "publisher": { "@id": "${SITE}/#organization" },
      "mainEntityOfPage": "${url}"
    },
    {
      "@type": "Person",
      "@id": "${AUTHOR_ID}",
      "name": "${AUTHOR_NAME}",
      "url": "${AUTHOR_ID}",
      "jobTitle": "Founder and Writer",
      "worksFor": { "@id": "${SITE}/#organization" }
    },
    {
      "@type": "Organization",
      "@id": "${SITE}/#organization",
      "name": "Hustlin'",
      "url": "${SITE}/",
      "logo": { "@type": "ImageObject", "url": "${SITE}/assets/hustlin-logo.png" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Hustlin'",           "item": "${SITE}/" },
        { "@type": "ListItem", "position": 2, "name": "Financial Literacy", "item": "${SITE}/financial-literacy.html" },
        { "@type": "ListItem", "position": 3, "name": ${JSON.stringify(`Stage ${stage.n}: ${stage.name}`)}, "item": "${url}" }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
${faq}
      ]
    }
  ]
}
</script>

`;
}

/* The shared nav, read from nav.template.html at build time.
   ==========================================================================
   The five public stage pages are GENERATED, so stamp-nav.mjs cannot touch
   them: editing the public copy makes it disagree with its master and
   `build-public-stages --check` goes red on a change nobody made by hand.
   That is the gate working, and it is exactly what happened on the first
   attempt to roll the nav out to all 19 stage-strip pages.

   So the generator injects the nav instead. The master keeps its own
   hand-written <nav> — masters are uploaded to Supabase and read inside the
   course shell, where the site nav would be wrong — and it is replaced here,
   on the way to the public copy only.

   Written with ../ paths to match the master's own depth, because step 6
   de-nests ../ across the whole document afterwards. Getting this order wrong
   produces a nav that works nowhere.

   FOURTH CONSUMER. nav.template.html now carries a {{CALC_COUNT_WORD_CAP}}
   token that nav-template.mjs fills from CALCS.length. This file used to read
   the template raw, which put the literal token into all five public stage
   pages and failed gate 3 with "public copies are stale" — a message that says
   nothing about the actual cause. navFor(1) resolves the token AND applies the
   ../ depth transform, which is the same thing this code was doing by hand.

   If a fifth consumer of nav.template.html ever appears, it goes through
   nav-template.mjs too. Reading the template directly is now a bug. */
const SHARED_NAV = navFor(1);

function build(master, stage) {
  let s = master;

  /* 0. Swap the master's nav for the shared one. Before everything else, so
     the canonical/cache-bust/de-nest passes below treat the injected markup
     exactly like the rest of the document rather than special-casing it. */
  if (SHARED_NAV) {
    s = s.replace(/[ \t]*<nav\b[\s\S]*?<\/nav>/i,
      () => `<!-- NAV:START -->\n${SHARED_NAV}\n<!-- NAV:END -->`);
  }

  // 1. Banner, immediately after <head>.
  // Replacement FUNCTIONS, not strings. A replacement string treats $1, $&
  // and friends as capture references — and Stage 2's FAQ legitimately
  // contains "$1,000", which silently expanded into the matched tag and
  // produced invalid JSON-LD. A function receives the match verbatim and
  // gives $ no special meaning.
  s = s.replace(/(<head>\r?\n)/, (m) => m + banner(stage) + '\n');

  // 1b. Visible byline, straight under the stage banner's intro paragraph.
  //     Injected here and not written into the master for the same reason the
  //     nav is: the master is uploaded to Supabase and rendered inside
  //     learn.html, where a byline linking out to about.html is a link out of
  //     the course shell. This is the public copy only.
  //
  //     Written with ../ so step 6's de-nest pass converts it, exactly like
  //     SHARED_NAV. A replacement FUNCTION, not a string — see the note on
  //     step 1: these intro paragraphs contain dollar figures.
  //
  //     Fatal if the anchor is missing. A byline that silently stops being
  //     injected because a master's banner was restructured is worse than a
  //     failed build: the page still looks right and the E-E-A-T signal is
  //     gone.
  const bannerIntro = /(<h1>[\s\S]*?<\/h1>\s*<p>[\s\S]*?<\/p>)/;
  if (!bannerIntro.test(s)) {
    console.error(
      `public stages: ${stage.file} - could not find the <h1> + intro <p> in the\n`
      + `    stage banner, so there is nowhere to put the byline. The master's\n`
      + `    banner markup changed; update BYLINE's anchor in build-public-stages.mjs.`
    );
    process.exit(1);
  }
  s = s.replace(bannerIntro, (m) => m + '\n' + BYLINE);

  // 2/3. Canonical host, and og:url pointed at the static page.
  s = s.replaceAll('https://www.hustlin.org/', `${SITE}/`);
  s = s.replace(
    /<meta property="og:url" content="[^"]*">/,
    `<meta property="og:url" content="${SITE}/${stage.file}">`
  );

  // 4. Canonical + schema, straight after the last twitter: tag.
  s = s.replace(/(<meta name="twitter:image" content="[^"]*">\r?\n)/, (m) => m + seoHead(stage));

  // 5. Cache-bust token the deploy script rewrites.
  s = s.replace(/styles\.css\?v=[^"']*/, 'styles.css?v=DEPLOYSTAMP');

  // 5b. app.js ships with NO version token on the masters — plain
  //     <script src="../app.js"></script>. Every other local asset carries
  //     ?v=, so app.js alone was permanently cached by URL: readers kept
  //     whatever copy of the engine they first downloaded, forever, and no
  //     deploy could dislodge it. Give it the same token as everything else.
  s = s.replace(/(<script src=")(\.\.\/)?app\.js(")/, '$1$2app.js?v=DEPLOYSTAMP$3');

  // 5c. rewards.js — the reason the reward popups stopped appearing.
  //
  //     rewards.js registers a HFY.onCompletion listener; without it, ticking
  //     the last action step in a module still saves progress and still emits
  //     the completion event, but nothing is listening, so no toast is ever
  //     shown. learn.html loads it. These public copies never did.
  //
  //     That is an omission, not a decision. rewards.js says so itself at the
  //     top: "Signed-out readers still get every celebration. Stage 1 of
  //     Financial Literacy needs no account, and that reader is exactly the
  //     one we're trying to convert." The signed-out reader IS this page. It
  //     degrades to local-only when Supabase is absent, which is exactly the
  //     case here, so it is safe to load with no auth stack behind it.
  //
  //     Injected only into the public copies, never into the masters: the
  //     masters are rendered inside learn.html, which already loads
  //     rewards.js, and a second copy there would double-register.
  s = s.replace(
    /(<script src="(?:\.\.\/)?stage-outro\.js[^"]*"><\/script>)/,
    '$1\n<script src="rewards.js?v=DEPLOYSTAMP"></script>'
  );

  // 6. De-nest. Masters are one folder down; these files are at root.
  s = s.replaceAll('../', '');

  // 7. Route every OTHER stage. Public stages keep a flat link so a crawler can
  //    follow it; gated stages go through learn.html. HTML attributes need
  //    &amp;, the JSON in the HFY_COURSE block needs a bare & — do the JSON
  //    form first so the attribute pass cannot corrupt it.
  for (const other of ALL_STAGES) {
    if (other.n === stage.n) continue;
    const target = other.public ? other.file : `learn.html?course=fl&stage=${other.n}`;
    const attr = other.public ? other.file : `learn.html?course=fl&amp;stage=${other.n}`;
    s = s.replaceAll(`"href": "${other.file}"`, `"href": "${target}"`);
    s = s.replaceAll(`href="${other.file}"`, `href="${attr}"`);
  }

  return s;
}

/* -------------------------------------------------------------------- main */

let stale = [];
let written = [];

for (const stage of PUBLIC) {
  const masterPath = join(COURSE_DIR, stage.file);
  const publicPath = join(ROOT, stage.file);

  if (!existsSync(masterPath)) {
    console.error(`  Master not found: ${masterPath}`);
    console.error('  The course folder is gitignored — this only runs in the working copy.');
    process.exit(1);
  }
  if (!SEO[stage.n]) {
    console.error(`  No SEO block defined for stage ${stage.n}. Add one to SEO.`);
    process.exit(1);
  }

  const generated = build(readFileSync(masterPath, 'utf8'), stage);
  const current = existsSync(publicPath) ? readFileSync(publicPath, 'utf8') : null;

  // Normalize the cache-bust token before comparing, or this gate cries wolf
  // after EVERY deploy and teaches you to ignore it.
  //
  // This script emits `styles.css?v=DEPLOYSTAMP`. Step 6 of deploy-site.ps1
  // then rewrites that to `styles.css?v=<today>`. So from the moment a deploy
  // finishes, the file on disk permanently differs from freshly generated
  // output by exactly one line per page — a difference the deploy itself
  // created, on a token that is regenerated on the next deploy anyway.
  //
  // On 2026-08-01 this reported all five stage pages as drifted from their
  // masters. The real diff was the token and nothing else. A gate that always
  // fails is indistinguishable from a gate that is broken, and the whole value
  // of this one is catching a REAL edit to a public copy.
  //
  // 2026-08-08: it cried wolf again, and the reason is worth writing down.
  // The rule below used to read `styles\.css\?v=` — correct on 01 Aug, when
  // styles.css was the only asset step 6 stamped. Step 6 was then widened to
  // cover all thirteen (`.js?v=` / `.css?v=`) because the other twelve were
  // shipping the literal string "DEPLOYSTAMP" and never busting. This
  // normaliser was not widened with it, so app.js and rewards.js started
  // producing exactly the phantom diff this code exists to absorb.
  //
  // The pattern is now deliberately IDENTICAL to step 6's. If one of them
  // changes, the other has to change in the same commit — they are two halves
  // of one rule, and the failure mode when they disagree is a gate that fails
  // on every deploy after the first.
  //
  // The `\.(js|css)` anchor is load-bearing for the same reason it is in
  // step 6: it must not match YouTube's watch?v=<id>, which appears all
  // through the course pages and is real content, not a cache-bust token.
  const norm = (s) =>
    s === null ? null : s.replace(/\.(js|css)\?v=[^"']*/g, '.$1?v=X');

  if (norm(current) === norm(generated)) continue;

  if (checkOnly) stale.push(stage.file);
  else {
    writeFileSync(publicPath, generated, 'utf8');
    written.push(stage.file);
  }
}

if (checkOnly) {
  if (!stale.length) {
    console.log(`  Public stages current (${PUBLIC.map((s) => s.file).join(', ')}).`);
    process.exit(0);
  }
  console.error('\n  These public copies do not match their masters:\n');
  for (const f of stale) console.error(`    ${f}`);
  console.error('\n  Someone edited a public copy directly, or edited a master');
  console.error('  without regenerating. Fix with:\n');
  console.error('    node tools/build-public-stages.mjs\n');
  process.exit(1);
}

if (!written.length) console.log('  Public stages already current — nothing written.');
else for (const f of written) console.log(`  ${f} regenerated from the course master.`);
