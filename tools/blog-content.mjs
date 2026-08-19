/**
 * =============================================================================
 *  blog-content.mjs  —  the only place a blog post is described.
 * =============================================================================
 *
 *  WHY THIS FILE EXISTS
 *  --------------------
 *  Adding a post used to mean editing four things by hand and hoping you
 *  remembered all four:
 *
 *      blog/<slug>.html      the post itself
 *      blog.html             an <a class="bp-card"> in the grid
 *      blog.html             an entry in the blogPost JSON-LD array
 *      sitemap.xml           a <url> block
 *
 *  Three of those four are now generated from this file by
 *  tools/build-blog-index.mjs. The one that drifted silently - the JSON-LD
 *  graph, which on 2026-08-08 listed four posts while the page displayed
 *  seven - cannot drift any more, because it is written from the same array
 *  that writes the cards.
 *
 *  The post body is still hand-written. That has not changed and should not:
 *  these are 1,000+ word pages, not template fills.
 *
 *  ADDING A POST - the whole procedure
 *  -----------------------------------
 *      1. write blog/<slug>.html by hand
 *      2. add one object to POSTS below, newest first
 *      3. node tools/build-blog-index.mjs
 *      4. node tools/stamp-footers.mjs
 *
 *  That is it. Step 3 rewrites the blog.html index, the JSON-LD graph and the
 *  sitemap block together, so they cannot disagree.
 *
 *  FIELD REFERENCE
 *  ---------------
 *    slug      required  filename inside blog/, without ".html"
 *    title     required  the canonical headline. MUST byte-match the
 *                        "headline" in the post's own Article JSON-LD, or
 *                        Google sees two different names for one URL.
 *                        --check enforces this.
 *    cardTitle optional  shorter display title for the index row. Falls back
 *                        to `title`. Use it when the SEO headline is long.
 *    dek       required  one or two sentences. This is the only prose a
 *                        reader gets before clicking - lead with the thing
 *                        they did not know, not with a description of the
 *                        article.
 *    category  required  must be a key in CATEGORIES below.
 *    date      required  YYYY-MM-DD, publication date. Drives ordering, the
 *                        "New" badge and datePublished.
 *    lastmod   optional  YYYY-MM-DD for the sitemap. Falls back to `date`.
 *                        Bump this when you materially revise a post.
 *    read      required  integer minutes.
 *    priority  optional  sitemap priority, defaults to 0.8.
 *    series    optional  label for a recurring column, e.g. "Week in Review".
 *                        Rendered as a pill so a weekly series reads as one
 *                        thing rather than fifty unrelated posts.
 *    featured  optional  true on exactly one post - the big panel at the top.
 *                        If none is set, the newest post is used.
 *    archived  optional  true keeps the post OFF blog.html entirely - no card,
 *                        no Latest row, not counted in its category, not in the
 *                        blogPost JSON-LD - while keeping it in sitemap.xml and
 *                        fully live at its own URL. For a recurring column whose
 *                        editions are reachable from a hub page instead of from
 *                        the grid. Set it on the dated editions, never on the
 *                        hub. An archived post cannot also be `featured`;
 *                        build-blog-index.mjs fails on that combination.
 *
 *  ---- the post's own hero, stamped by tools/stamp-post-shell.mjs ----
 *    h1        required  the on-page headline. HTML is allowed and expected:
 *                        one <br> and one <em> wrapping the second clause,
 *                        which the amber accent color picks up. This is the
 *                        punchy two-beat version and is deliberately NOT the
 *                        same string as `title` - `title` is the SEO headline
 *                        that has to match the post's Article schema, this is
 *                        the one a human reads. Both are needed.
 *    heroSub   required  the standfirst under the headline. One or two
 *                        sentences, longer and more specific than `dek`.
 *    crumb     required  the last breadcrumb segment. Short - it sits after
 *                        "Hustlin' / Blog /" and wraps badly on a phone if
 *                        you paste the full title in.
 *
 *  PUNCTUATION - type the real character, never the entity
 *  --------------------------------------------------------
 *  Em dashes, ampersands and apostrophes go in here as themselves: "—", "&",
 *  "'". Not "&mdash;", not "&amp;". The builder escapes once for HTML and
 *  once for JSON, and an entity typed here survives the HTML pass unharmed
 *  but lands in the JSON-LD literally, so Google reads a headline containing
 *  the characters a-m-p-semicolon.
 *
 *  This matters most for `title`, which --check byte-compares against the
 *  post's own Article headline. "Yes - Here's How" and "Yes — Here's How" are
 *  different strings and the build stops until they agree.
 * =============================================================================
 */

/* Sections are ordered BY POST COUNT, biggest first - see CATEGORY_ORDER
   below - so the array order here is only the tie-break. Two categories on
   three posts each appear in the order they are listed here, which is a
   reader journey rather than an alphabet: someone who cannot open a checking
   account is not there for the market recap.

   Order the array by who needs it most and let the counts do the rest. */
export const CATEGORIES = [
  {
    key: 'banking',
    name: 'Banking',
    blurb: 'Getting an account, keeping it, and what to do after a denial.',
  },
  {
    key: 'credit',
    name: 'Credit',
    blurb: 'What the score is actually measuring, and which levers move it.',
  },
  {
    key: 'debt',
    name: 'Debt',
    blurb: 'Payoff order, interest math, and which shortcuts are real.',
  },
  {
    key: 'saving',
    name: 'Saving',
    blurb: 'Building a buffer on an income that does not leave much room.',
  },
  {
    key: 'taxes',
    name: 'Taxes',
    blurb: 'What the rules actually say about the money taken out of your check.',
  },
  {
    key: 'reentry',
    name: 'Reentry',
    blurb: 'Money after incarceration — work, banking, and ID.',
  },
  {
    key: 'disability',
    name: 'Disability Finance',
    blurb: 'Saving without losing benefits. ABLE accounts, limits, and rules.',
  },
  {
    key: 'markets',
    name: 'Markets',
    blurb: 'How the tape actually moves, plus the weekly recap.',
  },
];

/* Newest first. The builder sorts by date anyway, so ordering here is for
   your benefit when you open the file, not the page's. */
export const POSTS = [
  /* The Week in Review hub.
     This is deliberately NOT another dated edition. Every dated edition starts
     ranking from zero and is stale in a week - on the 2026-08-15 search export
     the August 3-7 edition pulled 2,956 impressions at average position 9.9 and
     converted zero clicks, because the queries behind it ("s&p 500 august 7 2026
     close") die with the news. This page is the permanent address for the column,
     so links and authority accrue to one URL instead of scattering across 52.

     It does NOT duplicate the current edition and the dated editions do NOT
     canonical to it - they stay self-canonical so they can keep catching the
     dated news queries during their live window. This page earns its own
     ranking on evergreen "how to read a market week" intent.

     Bump `lastmod` whenever a new edition is added to the archive list.

     ADDING NEXT WEEK'S EDITION: write blog/week-in-review-<date>.html, add its
     manifest entry with `archived: true`, add a row to the archive table on
     this hub, and bump the hub's `lastmod`. The dated edition is then live and
     in the sitemap but does not add a card to the grid - one Week in Review row
     on blog.html, permanently, no matter how many editions exist. */
  {
    slug: 'week-in-review',
    h1: 'The Market Had a Week.<br><em>Here Is What Actually Moved.</em>',
    heroSub: 'A plain-English recap of every market week, and the part most recaps skip: how to read one yourself, so a headline stops being the same thing as a signal.',
    crumb: 'Week in Review',
    title: 'Stock Market Week in Review: How to Read the Market Week',
    cardTitle: 'Week in Review: The Archive',
    dek: 'What moved the market this week, in plain English — plus the part most recaps skip: how to read a market week yourself and tell a real signal from a headline.',
    category: 'markets',
    series: 'Week in Review',
    date: '2026-08-15',
    lastmod: '2026-08-15',
    read: 7,
    priority: 0.8,
  },
  {
    slug: 'does-this-company-hire-felons',
    h1: 'Does This Company Hire Felons?<br><em>How to Actually Find Out.</em>',
    heroSub: 'The employer lists are copied from each other. Here is the ten-minute check that works on any company, including the ones nobody has listed.',
    crumb: 'Does This Company Hire Felons?',
    title: 'Does This Company Hire Felons? How to Actually Find Out',
    cardTitle: 'Does This Company Hire Felons?',
    dek: 'We checked 31 employers the "felon-friendly" lists keep naming. Seven had a position published by the company itself. Here is the ten-minute check that works on any employer, listed or not.',
    category: 'reentry',
    date: '2026-08-17',
    read: 11,
    featured: true,
  },
  {
    slug: 'no-tax-on-overtime-what-you-actually-get',
    h1: 'No Tax on Overtime.<br><em>Except on Most of It.</em>',
    heroSub: 'The deduction covers only the premium half of federally required overtime, your employer still withholds tax on every dollar of it, and one blank box on your W-2 can erase the whole thing.',
    crumb: 'No Tax on Overtime',
    title: 'No Tax on Overtime: What the Deduction Actually Gets You',
    cardTitle: 'No Tax on Overtime: What You Actually Get',
    dek: 'Only the "half" in time-and-a-half qualifies, and payroll tax never stopped. On $13,200 of overtime the break is about $528, not $2,594 — and if box 12 code TT is blank on your 2026 W-2, it is $0.',
    category: 'taxes',
    date: '2026-08-14',
    read: 8,
  },
  {
    slug: 'savings-account-losing-to-inflation',
    h1: 'Is Your Savings Account<br><em>Losing to Inflation?</em>',
    heroSub: 'A savings account is never standing still. It is either beating inflation or losing to it, and one subtraction tells you which. Here is how to run it, and what to do if the answer is the second one.',
    crumb: 'Savings vs. Inflation',
    title: 'Is Your Savings Account Losing to Inflation?',
    dek: 'The average account pays 0.38% while prices rise 3.4% — so the balance goes up and the buying power goes down. What the gap costs on $8,000, after tax, and the fifteen minutes that closes it.',
    category: 'saving',
    date: '2026-08-13',
    read: 7,
  },
  {
    slug: 'buy-now-pay-later-payment-calendar',
    h1: 'Buy Now, Pay Later.<br><em>The Calendar Nobody Shows You.</em>',
    heroSub: 'Pay-in-4 really is 0% interest — that part is not a trick. It also quietly rearranges your next two months of cash flow, and the checkout screen never shows you that page.',
    crumb: 'Buy Now, Pay Later',
    title: 'Buy Now, Pay Later: The Calendar Nobody Shows You',
    cardTitle: 'The BNPL Calendar Nobody Shows You',
    dek: '$860 across three pay-in-4 plans is not $860 in August. It is $510 in August and $350 in September — nine charges from three apps. Plus the part that now reaches your credit file, and the part that still doesn\'t.',
    category: 'debt',
    date: '2026-08-13',
    read: 8,
  },
  {
    slug: 'week-in-review-august-7-2026',
    h1: 'A $45 Billion Fund Blew Up.<br><em>The Market Closed at a Record.</em>',
    heroSub: 'The week of August 3–7, 2026, read out loud: earnings that beat, a forced liquidation, gold waking up, and one jobs number that quietly rewrote the story.',
    crumb: 'The Week That Was: August 3–7, 2026',
    title: 'S&P 500 and Nasdaq Record Closes: The Week of August 3-7, 2026',
    cardTitle: 'The Week That Was: Aug 3–7, 2026',
    dek: 'The S&P 500 closed at a record 7,757.64 and the Nasdaq at 26,690.62 — in the same week a $45 billion AI fund was liquidated and payrolls missed by 103,000.',
    category: 'markets',
    series: 'Week in Review',
    date: '2026-08-09',
    read: 9,
    priority: 0.7,
    /* Reachable from the hub's archive table and from the sitemap, but not
       given its own row in the grid - see `archived` in the field reference.
       Every future dated edition gets this too. */
    archived: true,
  },
  {
    slug: 'how-to-save-your-first-1000',
    h1: 'How to Save<br><em>Your First $1,000.</em>',
    heroSub: 'The hardest thousand dollars you\'ll ever save, and the most valuable. Where to find it on a tight income, and where to put it so it survives.',
    crumb: 'Your First $1,000',
    title: 'How to Save Your First $1,000',
    dek: 'The protection starts at $250, not $1,000 — and the money usually comes from fees you\'re already paying and credits you\'re already owed, not from cutting coffee.',
    category: 'saving',
    date: '2026-08-08',
    read: 9,
  },
  {
    slug: 'credit-utilization-explained',
    h1: 'Credit Utilization.<br><em>The 30% Rule Is Wrong.</em>',
    heroSub: 'It\'s about a third of your score, it resets every month, and the date you pay matters more than the amount. Almost nobody is told the second part.',
    crumb: 'Credit Utilization',
    title: 'Credit Utilization Explained: Why the 30% Rule Is Wrong',
    cardTitle: 'Credit Utilization Explained',
    dek: 'About a third of your score, and it has no memory. Why the date you pay matters more than the amount — and why 30% was never the target.',
    category: 'credit',
    date: '2026-08-08',
    read: 8,
  },
  {
    slug: 'why-unrelated-stocks-move-together',
    h1: 'Seven Stocks, One Reason.<br><em>And It Wasn\'t Any of Them.</em>',
    heroSub: 'A software company, a discount retailer and a tool manufacturer all moved the same direction on the same day. When that happens, the story is never the companies.',
    crumb: 'Why Unrelated Stocks Move Together',
    title: 'Why Unrelated Stocks Move Together: One Real Market Day',
    cardTitle: 'Why Unrelated Stocks Move Together',
    dek: 'A software firm, a dollar store and a drill manufacturer all rose on the same day. The reason wasn\'t any of them — it was oil. A worked example of reading a macro-driven tape, sources included.',
    category: 'markets',
    date: '2026-08-03',
    read: 7,
    priority: 0.7,
  },
  {
    slug: 'jobs-that-hire-felons',
    h1: 'Jobs That Hire Felons.<br><em>And Who Pays Employers to.</em>',
    heroSub: 'Which industries actually hire, the federal programs that pay employers to take the risk, and how to answer the question when it comes.',
    crumb: 'Jobs That Hire Felons',
    title: 'Jobs That Hire Felons: Industries, Programs, and How to Apply',
    cardTitle: 'Jobs That Hire Felons',
    dek: 'Which industries actually hire, and the two federal programs that lower an employer’s risk of taking you on — free bonding, which is live, and the $2,400 tax credit, which lapsed in January. Most applicants never mention either.',
    category: 'reentry',
    date: '2026-08-01',
    read: 9,
  },
  {
    slug: 'second-chance-bank-accounts',
    h1: 'Turned Down Once.<br><em>Not Locked Out.</em>',
    heroSub: 'Being turned down once does not lock you out. It changes which door you use. Here is which institutions take you, what it actually costs, and how to get back to a normal account.',
    crumb: 'Second-Chance Bank Accounts',
    title: 'Second-Chance Bank Accounts: How to Get Approved After a Denial',
    cardTitle: 'Second-Chance Bank Accounts',
    dek: 'Turned down once doesn\'t lock you out — it changes which door you use. Which institutions take you, what the fee really costs next to check-cashing, and how to get back to a normal account.',
    category: 'banking',
    date: '2026-08-01',
    read: 8,
  },
  {
    slug: 'banking-after-incarceration',
    h1: 'Opening a Bank Account<br><em>After Prison.</em>',
    heroSub: 'Your record is not what stops you. Missing documents and the wrong branch are. Here is the order to do this in, what to bring, and what to walk away from.',
    crumb: 'Banking After Prison',
    title: 'Opening a Bank Account After Prison: ID, Address, and Getting Approved',
    cardTitle: 'Opening a Bank Account After Prison',
    dek: 'Your record isn\'t what stops you — banks don\'t run criminal checks to open checking. Missing ID and the wrong branch are the real obstacles. What to bring, what address works from a halfway house, and what to walk away from.',
    category: 'reentry',
    date: '2026-08-01',
    read: 9,
  },
  {
    slug: 'chexsystems-explained',
    h1: 'Denied a Bank Account?<br><em>It\'s Probably ChexSystems.</em>',
    heroSub: 'Nobody tells you this exists until it\'s already cost you an account. Here\'s what it is, how to read your file, how to fight what\'s wrong on it, and how to get banked this week regardless.',
    crumb: 'ChexSystems',
    title: 'Denied a Bank Account? ChexSystems, Explained',
    cardTitle: 'Denied a Bank Account? It\'s Probably ChexSystems.',
    dek: 'The reporting system nobody warns you about until it\'s already cost you an account. How to pull your free report, dispute what\'s wrong, and get banked this week anyway.',
    category: 'banking',
    date: '2026-07-27',
    lastmod: '2026-07-31',
    read: 6,
  },
  {
    slug: 'save-money-on-ssi',
    h1: 'You Can Save Money<br><em>On SSI. Legally.</em>',
    heroSub: 'The $2,000 limit is real. So is the federal law written specifically to get around it. Most people who qualify have never had either one explained to them.',
    crumb: 'Saving on SSI',
    title: 'Can You Save Money on SSI? Yes — Here\'s How',
    cardTitle: 'You Can Save Money on SSI. Legally.',
    dek: 'The $2,000 limit is real. So is the federal law written specifically to get around it. ABLE accounts, the 2026 rules, and what to do this week.',
    category: 'disability',
    date: '2026-07-27',
    lastmod: '2026-07-31',
    read: 7,
  },
  {
    slug: 'debt-avalanche-vs-snowball',
    h1: 'Avalanche vs. Snowball.<br><em>The Honest Answer.</em>',
    heroSub: 'One saves you more money. The other gets more people to the finish line. Anyone who tells you there\'s only one right answer is selling something.',
    crumb: 'Avalanche vs. Snowball',
    title: 'Debt Avalanche vs. Snowball: Which Actually Works?',
    cardTitle: 'Avalanche vs. Snowball: The Honest Answer.',
    dek: 'One saves you more money. The other gets more people to the finish line. The real math on both — and why you don\'t have to pick a team.',
    category: 'debt',
    date: '2026-07-27',
    lastmod: '2026-07-31',
    read: 6,
    priority: 0.7,
  },
];

/* How the category sections are ordered on the index.
 *
 *   'count'   biggest section first, ties broken by CATEGORIES order
 *   'manual'  exactly the CATEGORIES order, counts ignored
 *
 * 'count' is the default and it is the one that survives weekly publishing.
 * A fixed order means whichever topic happens to be listed first keeps the
 * top of the page for a year regardless of whether anything has been written
 * about it - today Banking leads on two posts while Markets, also on two,
 * sits at the bottom behind five one-post sections that are mostly empty
 * space. Sorting by count puts the sections that actually have something in
 * them where the scrolling starts, and it re-sorts itself as the archive
 * fills out, so it needs no maintenance.
 *
 * The chip bar follows the same order, so the chips and the sections below
 * them always read top-to-bottom in the same sequence. */
export const CATEGORY_ORDER = 'count';

/* The "Latest" strip is a time window, not a fixed row count.
 *
 * It was four rows, which is wrong in both directions: in a burst week it
 * hides posts that are days old, and in a quiet month it pads the strip with
 * things from six weeks ago and calls them latest. A window says what it
 * means - "this is roughly the last month" - and at a weekly cadence it
 * naturally lands at four or five.
 *
 * Measured from the newest post in the manifest, never from today, so the
 * built output is deterministic and --check does not start failing a week
 * after a deploy with nothing having changed.
 *
 * LATEST_MIN / LATEST_MAX are the guard rails: after a gap the window would
 * be empty, and after a burst it would swallow the whole archive and make
 * the category sections pure duplication. */
export const LATEST_WINDOW_DAYS = 31;
export const LATEST_MIN = 3;
export const LATEST_MAX = 8;

/* How many rows a category shows before the "Show all" toggle appears.
   Every row is in the HTML either way - the overflow is hidden with CSS, not
   withheld from the document - so a crawler sees the complete list and the
   internal link graph stays intact no matter how long the archive gets. */
export const CATEGORY_VISIBLE = 6;

/* A post is badged "New" for this many days after its date. Set to 0 to turn
   the badge off.
 *
 * Was 9, cut to 2 on 2026-08-15. The 9-day reasoning assumed a strict one-a-week
 * cadence, where it badges this week's post and drops last week's a couple of
 * days late. Publishing does not actually run that way: three posts landed on
 * 08-13 and 08-14, which under a 9-day window pulled in everything back to
 * 08-08 and badged six of thirteen rows. A badge on half the index is not a
 * badge, it is a background color.
 *
 * Two days badges the current drop and nothing else, and it degrades correctly
 * in both directions - a burst still badges only the burst, and a quiet
 * fortnight badges only the post that ends it. Measured from the newest post
 * in the manifest, never from today, so --check stays deterministic. */
export const NEW_FOR_DAYS = 2;
