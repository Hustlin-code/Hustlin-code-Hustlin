/**
 * =============================================================================
 *  inject-market-data.mjs — bake live economic data into the Markets pages
 * =============================================================================
 *
 *  THE PROBLEM THIS SOLVES
 *
 *  Everything on the Markets page used to be a TradingView widget, and widget
 *  content lives inside an <iframe>. Iframe content is not part of your page for
 *  ranking purposes — Google attributes it to tradingview.com, not hustlin.org.
 *  A page made entirely of widgets is, to a crawler, an empty page with a nice
 *  layout. That is why markets.html never ranked, and it is also why all nine
 *  Markets/*.html viewer pages had to be set noindex after AdSense flagged them
 *  as low-value content. Do not build another page like that.
 *
 *  Fetching the numbers client-side does not fix it either. Google does render
 *  JavaScript, but on a second pass, days later, unreliably, and it will not
 *  wait on a third-party API. Content that only exists after fetch() is content
 *  you cannot count on being indexed.
 *
 *  So: fetch at BUILD time and write the numbers into the HTML. The file you
 *  upload already says "Inflation 3.5%". Googlebot sees text. Visitors see the
 *  same text instantly.
 *
 *  Widgets make the page useful. Baked numbers make it rank. It needs both.
 *
 *  HOW IT WORKS
 *
 *  Each page carries marker pairs:
 *
 *      <!-- MKT:macro:START -->  ...generated...  <!-- MKT:macro:END -->
 *
 *  This script replaces whatever is between them. Anything outside the markers
 *  is never touched, so hand-written copy and existing widgets are safe.
 *
 *  A marker name maps to { set, render } in PAGES below: `set` is what the
 *  edge function is asked for, `render` turns it into HTML. Two markers can
 *  share a set and render it differently — markets.html and markets-economic.html
 *  both use `sectors`, with and without the cycle column.
 *
 *  USAGE
 *      node tools/inject-market-data.mjs           write
 *      node tools/inject-market-data.mjs --check   verify only, exit 1 if stale
 *      node tools/inject-market-data.mjs --offline keep existing, do not fetch
 *
 *  FAILURE POLICY — read this before "fixing" it
 *
 *  If the endpoint is unreachable this script leaves the EXISTING baked numbers
 *  in place and exits 0 with a warning. It does NOT blank the section and does
 *  NOT fail the build. Slightly stale inflation data is a minor problem; a
 *  Markets page that ships empty because an API blipped during deploy is a real
 *  one. Staleness is visible to you in the "as of" date; emptiness is not.
 *
 *  Every figure is stamped with its own source date from FRED, because these
 *  series are revised and a number without a date is not a citation.
 *
 *  THE SNAPSHOT
 *
 *  tools/.market-snapshot.json holds the last successfully baked value of every
 *  figure. The next build diffs against it to produce the "what changed" block.
 *  That block is the single biggest reason for a reader to come back, so it has
 *  to be honest: it is labelled with the two dates it is actually comparing,
 *  never "since yesterday" unless yesterday is what it compared. --check never
 *  writes the snapshot, or running the gate would consume the diff.
 * =============================================================================
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SNAPSHOT = join(ROOT, 'tools', '.market-snapshot.json')
// Overridable so the renderers can be exercised against a local fixture server
// without touching production. Deploys never set it; leave it unset.
const ENDPOINT = process.env.MARKET_DATA_ENDPOINT
  || 'https://zddtobudaxyrndjgvhfd.supabase.co/functions/v1/market-data'

/* Headlines come from their own function as of 2026-08-02. market-data's
   Finnhub feed was overwhelmingly CNBC, and its non-CNBC filler was Bloomberg,
   which is paywalled end to end. market-news aggregates RSS from CNBC, Yahoo
   Finance, MarketWatch, BBC, the Guardian, NPR and Investing.com — no key, no
   rate limit, and every link free to read.
   To roll back: delete this constant and the news override in main(). The
   Finnhub 'news' set is still live in market-data and is already the fallback
   used when this endpoint cannot be reached. */
const NEWS_ENDPOINT = process.env.MARKET_NEWS_ENDPOINT
  || ENDPOINT.replace(/\/market-data$/, '/market-news')

/* Tape quotes come from their own function as of 2026-08-02, for two reasons.
   The list changed to a cross-asset set (indexes, the curve, the dollar, gold,
   oil, copper, bitcoin), and market-data's quotes builder drops a symbol
   silently when its upstream call fails — on 2026-08-02 that rendered a six-card
   tape as two cards with nothing anywhere saying why. market-quotes reports
   failures per symbol instead.
   v3 (2026-08-12) is eleven cards, FRED-first, with a one-year range on each.
   To roll back: delete this constant and the quotes override in main(). */
const QUOTES_ENDPOINT = process.env.MARKET_QUOTES_ENDPOINT
  || ENDPOINT.replace(/\/market-data$/, '/market-quotes')

/* Earnings come from their own function as of 2026-08-02 so the calendar can be
   filtered by MARKET CAP. Finnhub's calendar endpoint carries no cap, so the
   filter needs a profile lookup per symbol — server-side work that does not
   belong in a build script. minCapM is in millions: 2000 = $2 billion.
   To roll back: delete this constant and the earnings override in main(). */
const EARNINGS_ENDPOINT = process.env.MARKET_EARNINGS_ENDPOINT
  || ENDPOINT.replace(/\/market-data$/, '/market-earnings')
const EARNINGS_MIN_CAP_M = Number(process.env.EARNINGS_MIN_CAP_M ?? 2000)

/* How many rows each earnings tab renders. Was a bare .slice(0, 25) repeated in
   three places, which quietly capped the calendar at 25 companies per tab no
   matter how many cleared the $2B floor — on a heavy day in earnings season
   that hid most of the list, and it looked like missing data rather than a
   display limit. The tables already live in .mkt-scroll, so a longer list
   scrolls rather than running off the page. */
const EARNINGS_ROWS = Number(process.env.EARNINGS_ROWS ?? 100)

/* How many rows a reader sees at once before flipping the page. The tables ship
   COMPLETE — every row is in the HTML — and market-tables.js hides all but the
   current page on top. So this number is a reading comfort setting and nothing
   else: with JavaScript off, or to a crawler, every row is still there. */
const EARNINGS_PAGE_SIZE = Number(process.env.EARNINGS_PAGE_SIZE ?? 10)

/* ────────────────────────── THE CAP CACHE, AND WHY ─────────────────────────
   Until 2026-08-12 the $2B filter ran inside market-earnings, which can afford
   36 market-cap lookups per invocation. In earnings season the calendar carries
   several hundred symbols. So the filter was never "every company above $2B";
   it was "the up-to-36 we could afford to price this run, minus the ones that
   came in under" — and which 36 changed every hour, so the tab counts moved and
   companies came and went for no reason visible on the page.

   The budget was never really the problem. A market cap barely moves; the
   problem was that nothing remembered it between builds, so every run re-bought
   the same numbers. This snapshot is committed to the repo hourly, so it is the
   one place a cache CAN survive. Now the lookups go only to symbols nobody has
   ever priced, coverage converges on the whole calendar within a few builds,
   and the filter is finally the one rule it always claimed to be.

   TTL is long on purpose. A refresh is only worth a slot once every unknown
   symbol has one, which is what the priority order below enforces. A company
   drifting across $2B between refreshes is a rounding error next to a company
   missing entirely. */
const CAP_TTL_DAYS = Number(process.env.EARNINGS_CAP_TTL_DAYS ?? 30)
const CAP_LOOKUPS = Number(process.env.EARNINGS_CAP_LOOKUPS ?? 45)

/* Watch-list horizons, all in days back from today (Eastern).

   WATCH keeps the accumulated record — it is what makes Today and Tomorrow
   stable, and what the scoreboard counts. REPORTED is what the "Just reported"
   tab shows, which has to stay short or the label stops being true. CHASE is
   how long we keep spending actuals lookups on a company that never resolved;
   past that it is almost certainly a delisting or a symbol change, and chasing
   it forever starves companies that just reported. */
const WATCH_DAYS = Number(process.env.EARNINGS_WATCH_DAYS ?? 45)
const REPORTED_DAYS = Number(process.env.EARNINGS_REPORTED_DAYS ?? 10)
const CHASE_DAYS = Number(process.env.EARNINGS_CHASE_DAYS ?? 21)

/* Year-over-year EPS growth, one lookup per company per reported quarter, so
   this is a trickle rather than a sweep. See the scoreboard note in
   renderEarnings for what this number is and — more importantly — what it is
   not allowed to be called. */
const GROWTH_LOOKUPS = Number(process.env.EARNINGS_GROWTH_LOOKUPS ?? 25)

/* Sector total returns at six horizons, from Yahoo monthly adjusted closes.
   Not available from market-data at all — Finnhub's free tier dropped
   historical candles, so 3Y/5Y/10Y cannot be computed from it. */
const SECTORS_ENDPOINT = process.env.MARKET_SECTORS_ENDPOINT
  || ENDPOINT.replace(/\/market-data$/, '/market-sectors')

/* Sets served by a market-* function other than market-data. They must not be
   included in the market-data request — it does not know them and there is no
   sense asking. */
const LOCAL_SETS = new Set(['sectorReturns', 'earningsScore'])

/* ---------------------------------------------------------- EASTERN DATES --
   Every date decision about earnings is made in America/New_York, never UTC
   and never the build machine's local zone.

   Why it has to be explicit: GitHub's runners are UTC, so
   `new Date().toISOString().slice(0,10)` is a day AHEAD of the US market for
   the entire evening — from 19:00 Eastern (20:00 under EDT) to midnight. A
   build at 21:00 ET therefore believed "today" was tomorrow, emptied the
   today tab, and pushed that evening's after-close reporters into "just
   reported" while the market day was still running. It went green doing it.

   Intl with an explicit timeZone is the fix. 'en-CA' because it formats as
   YYYY-MM-DD, which sorts and compares as a string — the same shape every
   date from the API arrives in.

   This also handles DST for free, which is the other reason not to do it with
   arithmetic on UTC offsets. */
const etFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
})
const etDay = (d = new Date()) => etFmt.format(d)
const etDayOffset = (n) => etDay(new Date(Date.now() + n * 864e5))
const ET_TODAY = etDay()

const checkOnly = process.argv.includes('--check')
const offline = process.argv.includes('--offline')

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/* Format a US date without pulling in a dependency. FRED monthly and quarterly
   dates are always the FIRST of the reference period, so showing "1 Apr 2026"
   implies a precision that is not there — month + year only. Daily and weekly
   series really are that day, so they get the full date. */
function refDate(iso, freq) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const mon = names[Number(m) - 1] ?? ''
  if (freq === 'd' || freq === 'w') return `${Number(d)} ${mon} ${y}`
  // FRED dates a quarter to its FIRST month, so Q2 arrives as 2026-04-01.
  // Printing that as "Apr 2026" reads as a monthly figure and quietly hides
  // that the number covers three months.
  if (freq === 'q') return `Q${Math.floor((Number(m) - 1) / 3) + 1} ${y}`
  return `${mon} ${y}`
}

/* Units for the "up 0.3 pts" sentence.
   Derived from `fmt` HERE rather than trusting the `deltaUnit` field the edge
   function sends, so a function running a version behind cannot put a wrong
   unit on the page. Getting this wrong is not cosmetic: FRED reports housing
   starts and job openings in THOUSANDS, so an unscaled delta labelled "million"
   overstates the move by a factor of a thousand. */
function unitFor(fmt) {
  switch (fmt) {
    case 'pct1':
    case 'pct2':   return 'pts'
    case 'countK': return 'thousand'   // raw persons, scaled to thousands below
    case 'thouM':  return 'thousand'   // series is already in thousands
    case 'deltaK': return 'thousand jobs'
    case 'idx':    return 'points'
    default:       return ''
  }
}

/* Direction is not the same as good. Falling unemployment is good; falling GDP
   growth is not. Each series declares which way is better, so the arrow colour
   means something instead of just "up = green". */
function trend(row) {
  const d = row.changeYoY
  const unit = unitFor(row.fmt)
  if (d === null || d === undefined || d === 0) return { arrow: '→', cls: 'flat', txt: 'flat vs a year ago' }
  const rising = d > 0
  const good = (rising && row.better === 'up') || (!rising && row.better === 'down')
  // countK series are raw persons; "up 41000 thousand" is nonsense, so scale.
  const mag = row.fmt === 'countK' ? Math.abs(d) / 1000 : Math.abs(d)
  const num = mag >= 100 ? Math.round(mag) : mag.toFixed(1)
  // A payrolls delta is a change in a LEVEL, not in a rate. "up 506 pts vs a
  // year ago" next to a headline of "+57K" reads as though the monthly figure
  // grew by 506 — it did not. Say what the number actually is.
  const txt = row.fmt === 'deltaK'
    ? `${num} thousand jobs ${rising ? 'added' : 'lost'} over the past year`
    : `${rising ? 'up' : 'down'} ${num}${unit ? ' ' + unit : ''} vs a year ago`
  return { arrow: rising ? '↑' : '↓', cls: good ? 'good' : 'bad', txt }
}

/* ------------------------------------------------------------- stat renderer */

/** The workhorse. Every FRED group renders as the same card grid, so growth,
    inflation, rates, labor and the household block are visually one system
    rather than five bespoke layouts nobody can maintain. */
function statGrid(rows) {
  if (!rows?.length) return ''
  return `<div class="mkt-stat-grid">
${rows.map(r => {
  const t = trend(r)
  return `      <article class="mkt-stat" data-series="${esc(r.seriesId)}">
        <h3 class="mkt-stat-label">${esc(r.label)}</h3>
        <p class="mkt-stat-value" data-fill="${esc(r.key)}">${esc(r.display)}</p>
        <p class="mkt-stat-trend ${t.cls}"><span aria-hidden="true">${t.arrow}</span> ${esc(t.txt)}</p>
        <p class="mkt-stat-blurb">${esc(r.blurb)}</p>
        <p class="mkt-stat-src">${esc(refDate(r.date, r.freq))} · <a href="${esc(r.source)}" target="_blank" rel="noopener">FRED ${esc(r.seriesId)}</a></p>
      </article>`
}).join('\n')}
</div>`
}

// Named wrappers so a marker reads as what it is in the page source.
const renderMacro = statGrid
const renderGrowth = statGrid
const renderInflation = statGrid
const renderLabor = statGrid
const renderConsumer = statGrid

/** Rates render as a table, not cards: the whole point of the rates block is
    comparing one row against another down a column, which cards make harder. */
function renderRates(rows) {
  if (!rows?.length) return ''
  const order = ['fedFunds','threeMonth','twoYear','tenYear','thirtyYear','realTenYear','mortgage30','curve10y2y','curve10y3m','hySpread']
  const sorted = [...rows].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
  return `<table class="mkt-table">
      <caption class="mkt-table-cap">Every rate below is published by the Federal Reserve. Read down the column: the shape of the ladder matters more than any single rung.</caption>
      <thead><tr><th scope="col">Rate</th><th scope="col">Now</th><th scope="col">Vs a year ago</th><th scope="col">As of</th></tr></thead>
      <tbody>
${sorted.map(r => {
  const t = trend(r)
  return `        <tr>
          <th scope="row"><a href="${esc(r.source)}" target="_blank" rel="noopener">${esc(r.label)}</a></th>
          <td data-fill="${esc(r.key)}"><strong>${esc(r.display)}</strong></td>
          <td class="${t.cls === 'good' ? 'up' : t.cls === 'bad' ? 'down' : ''}">${esc(t.txt.replace(' vs a year ago', ''))}</td>
          <td>${esc(refDate(r.date, r.freq))}</td>
        </tr>`
}).join('\n')}
      </tbody>
    </table>`
}

/* v2 yields block — markets.html still renders this. Do not remove. */
function renderYields(y) {
  if (!y?.series?.length) return ''
  const spread = y.spread === null || y.spread === undefined ? '—' : `${y.spread > 0 ? '+' : ''}${y.spread.toFixed(2)}%`
  return `<table class="mkt-table">
      <caption class="mkt-table-cap">Rates, and what the gap between them is saying</caption>
      <thead><tr><th scope="col">Rate</th><th scope="col">Now</th><th scope="col">As of</th></tr></thead>
      <tbody>
${y.series.map(s => `        <tr><th scope="row">${esc(s.label)}</th><td data-fill="${esc(s.key)}">${esc(s.display)}</td><td>${esc(refDate(s.date, s.freq))}</td></tr>`).join('\n')}
      </tbody>
    </table>
    <p class="mkt-spread ${y.inverted ? 'inverted' : 'normal'}">
      <strong>10-year minus 2-year: <span data-fill="spread">${esc(spread)}</span></strong><br>
      ${esc(y.note ?? '')}
    </p>`
}

function renderSectors(rows) {
  if (!rows?.length) return ''
  return `<table class="mkt-table">
      <caption class="mkt-table-cap">Sector ETFs, ranked by today's move. These funds are how a retail investor actually buys a sector.</caption>
      <thead><tr><th scope="col">Sector</th><th scope="col">ETF</th><th scope="col">Today</th></tr></thead>
      <tbody>
${rows.map(r => `        <tr><th scope="row">${esc(r.name)}</th><td>${esc(r.symbol)}</td><td class="${(r.changePct ?? 0) >= 0 ? 'up' : 'down'}" data-fill="sector-${esc(r.symbol)}">${esc(r.display)}</td></tr>`).join('\n')}
      </tbody>
    </table>`
}

/** Same data, plus where each sector has historically tended to lead. The
    caption does the heavy lifting: this is a textbook generalization about
    average behaviour across many cycles, and stating it without that caveat
    would be the single most misleading thing on the page. */
const CYCLE_LABEL = {
  early: 'Early expansion', mid: 'Mid cycle',
  late: 'Late cycle', recession: 'Defensive',
}

function renderSectorsCycle(rows) {
  if (!rows?.length) return ''
  return `<table class="mkt-table">
      <caption class="mkt-table-cap">Sector ETFs ranked by today's move, with the phase each has <em>historically tended</em> to lead in. That last column is a long-run generalization across many cycles, not a claim about this one &mdash; sectors regularly lead out of turn, and one day's move tells you nothing about a phase.</caption>
      <thead><tr><th scope="col">Sector</th><th scope="col">ETF</th><th scope="col">Today</th><th scope="col">Historically leads</th></tr></thead>
      <tbody>
${rows.map(r => `        <tr><th scope="row">${esc(r.name)}</th><td>${esc(r.symbol)}</td><td class="${(r.changePct ?? 0) >= 0 ? 'up' : 'down'}" data-fill="sector-${esc(r.symbol)}">${esc(r.display)}</td><td>${esc(CYCLE_LABEL[r.cycle] ?? '—')}</td></tr>`).join('\n')}
      </tbody>
    </table>`
}

/* The tape. Baked rather than left to the TradingView ticker alone, because the
   ticker is an iframe — a crawler sees nothing there.

   THE RANGE IS ONE YEAR, NOT ONE DAY (changed 2026-08-12). This tape is written
   into the HTML at build time; it does not tick. A day range from the last
   deploy is stale the moment the deploy finishes and tells a reader nothing. A
   one-year range says where today sits inside the last twelve months, which is
   the only context a static number can honestly carry.

   THE CARDS ARE THE REAL THING WHERE A FREE, LICENSED SOURCE PUBLISHES IT.
   market-quotes v3 reads the actual index levels, WTI spot, the constant-
   maturity Treasury yields, the Fed's broad dollar index and Coinbase's bitcoin
   print from FRED. Russell 2000, Gold and Copper stay ETFs because FRED lost the
   Russell license in 2019 and the gold benchmark in 2022, and Finnhub's free
   tier carries no futures. Those three say so on the card.

   Each row therefore carries its OWN source and its OWN as-of date. Do not
   collapse them into one sitewide "as of" line — DGS2 lands the next morning,
   DTWEXBGS is published weekly, DCOILWTICO runs several days behind, and the
   Finnhub cards are last close with no date at all.

   A yield is not a price: kind === 'yield' rows arrive with the change already
   formatted in basis points and the range already suffixed with %. Nothing here
   re-formats a number — market-quotes owns the formatting so the units cannot
   drift between the function and the page.

   FALLBACK. If market-quotes is unreachable, main() leaves market-data's own
   quotes in place. Those are v2-shaped: no rangeDisplay, no note, no asOf. The
   range line then prints an em dash rather than silently falling back to a day
   range under a "1-year range" label. Same rule as everywhere else on this
   site — a missing number is a gap, a mislabeled one is a lie. */
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/* '2026-08-11' -> 'Aug 11'. Split rather than parsed: `new Date('2026-08-11')`
   is UTC midnight, which prints as the 10th anywhere west of Greenwich. */
function shortDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''))
  if (!m) return ''
  return `${SHORT_MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`
}

function renderQuotes(rows) {
  if (!rows?.length) return ''
  return `<div class="mkt-quote-row">
${rows.map(r => {
  const up = (r.changePct ?? 0) >= 0
  const fill = r.key ?? r.symbol
  const range = r.rangeDisplay ?? '—'
  const day = shortDay(r.asOf)
  const src = [r.note ?? r.symbol, [r.source, day].filter(Boolean).join(', ')]
    .filter(Boolean).join(' · ')
  return `      <article class="mkt-quote ${up ? 'up' : 'down'}">
        <h3 class="mkt-quote-name">${esc(r.name)}</h3>
        <p class="mkt-quote-px" data-fill="q-${esc(fill)}">${esc(r.display)}</p>
        <p class="mkt-quote-chg">${esc(r.pctDisplay)}</p>
        <p class="mkt-quote-sym">1-year range ${esc(range)}</p>
        <p class="mkt-quote-sym">${esc(src)}</p>
      </article>`
}).join('\n')}
</div>`
}

/* Headlines. Summaries are truncated hard: the point is to send the reader to
   the source, not to republish someone else's article on your domain. Reposting
   full summaries at scale is both a copyright question and a thin-content one.
   90 characters is roughly fifteen words — enough to say what the story is about,
   short enough that it is a pointer rather than a substitute for the article.
   The 2026-08-11 IP scan flagged the previous 150-character clip as reproducing a
   news organization's editorial copy. Do not raise it back. */
const clip = (t, n) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim()
  return s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n)) + '…'
}

/* The whole card is the link, not just the headline. A card that looks
   clickable and is only clickable on one line of text reads as broken.
   Spans rather than <p> because an <a> wrapping block elements is legal in
   HTML5 but trips some older parsers and every linter; display:block on a
   span gets identical layout with none of the argument. */
const NEWS_COUNT = 12

/* Hard-paywalled sources, dropped before anything else happens.

   Linking a reader to an article they cannot open is worse than not linking at
   all: it spends their click and our credibility on somebody else's
   subscription wall, and the card promised a story it cannot deliver. Bloomberg
   is what prompted this (2026-08-02) — every headline Finnhub returned from it
   was gated. The others are here because they gate at least as hard.

   Matched on BOTH the hostname and Finnhub's source label, because the two do
   not reliably agree — the label is free text from an upstream feed. Sources
   that are metered rather than hard-walled (MarketWatch, Reuters, Seeking
   Alpha) are deliberately NOT here: a reader usually gets those articles, and
   dropping them would leave the mix too thin to be a mix.

   To drop another outlet, add it here. Do not filter in renderNews — this list
   is the one place that decides what a reader can actually read. */
const PAYWALLED_DOMAINS = [
  'bloomberg.com',
  'wsj.com',
  'ft.com',
  'barrons.com',
  'theinformation.com',
  'economist.com',
  'nytimes.com',
]
const PAYWALLED_SOURCES = new Set([
  'bloomberg',
  'the wall street journal', 'wall street journal', 'wsj',
  'financial times', 'ft',
  "barron's", 'barrons',
  'the information',
  'the economist',
  'the new york times',
])

function isReadable(item) {
  const label = String(item?.source ?? '').trim().toLowerCase()
  if (PAYWALLED_SOURCES.has(label)) return false
  let host
  try {
    host = new URL(item.url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return false // no parseable URL means no working link — drop it
  }
  return !PAYWALLED_DOMAINS.some(d => host === d || host.endsWith('.' + d))
}

/* Source mix.

   Finnhub's general feed is ordered purely by recency, and CNBC publishes far
   more often than anybody else in it. Taking the newest N therefore produced a
   wall of one masthead even though Bloomberg, Reuters, MarketWatch and others
   were sitting in the same response — which reads as if we only have one
   source, and puts all our outbound authority on one domain.

   Round-robin instead: one story per outlet per pass, newest-first within each
   outlet. The freshest story from every source that filed today appears before
   any source's second story. Degrades to plain recency when only one source
   came back, so a thin day still fills the grid. */
function mixSources(items, limit) {
  const bySource = new Map()
  for (const n of items) {
    const key = n.source || 'Other'
    if (!bySource.has(key)) bySource.set(key, [])
    bySource.get(key).push(n)
  }
  const queues = [...bySource.values()]
  const out = []
  while (out.length < limit) {
    let took = false
    for (const q of queues) {
      if (!q.length) continue
      out.push(q.shift())
      took = true
      if (out.length === limit) break
    }
    if (!took) break // every queue drained before we hit the limit
  }
  return out
}

function renderNews(items) {
  if (!items?.length) return ''
  const readable = items.filter(isReadable)
  // Returning '' makes main() log "nothing usable returned" and keep whatever is
  // already baked into the page. A grid of zero cards is worse than stale ones.
  if (!readable.length) return ''
  return `<ul class="mkt-news">
${mixSources(readable, NEWS_COUNT).map(n => {
  // Not every feed carries a description — Yahoo Finance ships title and link
  // only. An empty <span> still claims its 12px/16px margins, so the card gets
  // a mystery gap between headline and source. Omit the element entirely and
  // let the flex column close up.
  const sum = clip(n.summary, 90)
  return `      <li class="mkt-news-item">
        <a class="mkt-news-card" href="${esc(n.url)}" target="_blank" rel="noopener nofollow">
          <span class="mkt-news-hd">${esc(clip(n.headline, 110))}</span>${sum ? `
          <span class="mkt-news-sum">${esc(sum)}</span>` : ''}
          <span class="mkt-news-src">${esc(n.source ?? '')} <span class="mkt-news-go" aria-hidden="true">&rarr;</span></span>
        </a>
      </li>`
}).join('\n')}
</ul>`
}

/* -------------------------------------------------------- sector breadth --- */
/*
   Sector performance across six horizons plus position in the 52-week range.

   A one-day sector table is the shallowest read available: sector moves are
   almost pure noise day to day, and the reason anyone watches sectors is
   PERSISTENCE. Sorted by three-month return, because that is the horizon where
   rotation is legible — sorting by today puts whatever gapped this morning on
   top, which is exactly the noise this table exists to see past.

   `fromHigh` and `rangePos` are the breadth part. A sector can be up today and
   still be 25% below its 52-week high, and those two facts together say
   something neither says alone.
*/
function renderSectorBreadth(rows) {
  if (!rows?.length) return ''
  const pc = (v) => v === null || v === undefined ? '<span class="tec-na">&mdash;</span>'
    : `<span class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : ''}${v.toFixed(1)}%</span>`
  const bar = (p) => {
    if (p === null || p === undefined) return '<span class="tec-na">&mdash;</span>'
    const cls = p >= 80 ? 'hot' : p >= 50 ? 'warm' : p >= 20 ? 'cool' : 'cold'
    return `<span class="tec-range"><span class="tec-range-bar ${cls}" style="width:${Math.max(3, Math.min(100, p))}%"></span></span><span class="tec-range-n">${p}</span>`
  }
  return `<div class="tec-scroll">
    <table class="mkt-table tec-wide">
      <caption class="mkt-table-cap">All eleven S&amp;P 500 sectors, ranked by three-month return. <strong>Range</strong> is where the sector sits between its 52-week low and high (0 = at the low, 100 = at the high). <strong>Off high</strong> is how far below the 52-week high it trades. Read across a row for persistence; read down the range column for participation.</caption>
      <thead><tr>
        <th scope="col">Sector</th><th scope="col">ETF</th>
        <th scope="col">Today</th><th scope="col">1W</th><th scope="col">3M</th>
        <th scope="col">6M</th><th scope="col">YTD</th><th scope="col">1Y</th>
        <th scope="col">52w range</th><th scope="col">Off high</th>
      </tr></thead>
      <tbody>
${rows.map(r => `        <tr>
          <th scope="row">${esc(r.name)}</th>
          <td class="tec-sym">${esc(r.symbol)}</td>
          <td>${pc(r.day)}</td>
          <td>${pc(r.week)}</td>
          <td><strong>${pc(r.threeMonth)}</strong></td>
          <td>${pc(r.sixMonth)}</td>
          <td>${pc(r.ytd)}</td>
          <td>${pc(r.year)}</td>
          <td class="tec-rangecell">${bar(r.rangePos)}</td>
          <td>${pc(r.fromHigh)}</td>
        </tr>`).join('\n')}
      </tbody>
    </table>
  </div>`
}

/* ------------------------------------------------------------- earnings ---- */
/*
   Finnhub's earnings calendar. Estimates only — actuals are absent for dates
   that have not happened yet, which is the entire point of a calendar.

   Deliberately NOT rendering a "beat/miss" verdict. Whether a company beat its
   estimate is a fact about the estimate, not about the business, and framing it
   as a scorecard is how retail investors end up trading the number instead of
   reading the report. The page says this in prose next to the table.
*/
/* The size filter is applied UPSTREAM, in the market-earnings function, because
   it needs a market cap and the earnings calendar does not carry one — that
   costs a profile lookup per symbol, which belongs on the server, not here.
   Change the floor with ?minCapM= on the endpoint (2000 = $2B).

   An earlier version filtered here on revenue estimate as a size proxy. It was
   wrong in a way worth remembering: a grocery chain books enormous revenue on
   thin margins and a software company books little on fat ones, so a revenue
   floor quietly deleted the large-cap tech names a reader most wants. */
function renderEarnings(input) {
  /* ── SHAPES ────────────────────────────────────────────────────────────────
     Current shape is { today, tomorrow, reported }, all Eastern-bucketed by
     the caller. Two older shapes still have to render rather than throw:

       { upcoming, reported }  — the pre-2026-08-07 caller
       [ ...rows ]             — market-data's own fallback calendar

     Both are re-bucketed here against the Eastern date. That keeps a build
     green when market-earnings is unreachable and market-data answers instead,
     which is the whole point of the failure policy at the top of this file. */
  const TODAY = ET_TODAY
  const TOMORROW = etDayOffset(1)

  let today, tomorrow, reported
  if (Array.isArray(input)) {
    today = input.filter(r => String(r.date) === TODAY)
    tomorrow = input.filter(r => String(r.date) === TOMORROW)
    reported = input.filter(r => String(r.date) < TODAY)
  } else if (input && (input.today || input.tomorrow)) {
    today = input.today ?? []
    tomorrow = input.tomorrow ?? []
    reported = input.reported ?? []
  } else {
    const up = input?.upcoming ?? []
    today = up.filter(r => String(r.date) === TODAY)
    tomorrow = up.filter(r => String(r.date) === TOMORROW)
    reported = input?.reported ?? []
  }
  if (!today.length && !tomorrow.length && !reported.length) return ''

  const when = { bmo: 'Before open', amc: 'After close', dmh: 'During hours' }
  const cap = (v) => {
    if (typeof v !== 'number' || !v) return '—'
    if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B'
    return '$' + (v / 1e6).toFixed(0) + 'M'
  }
  const money = (v) => {
    if (typeof v !== 'number' || !v) return '—'
    const b = v / 1e9
    return b >= 1 ? '$' + b.toFixed(2) + 'B' : '$' + (v / 1e6).toFixed(0) + 'M'
  }
  const eps = (v) => (typeof v === 'number' ? '$' + v.toFixed(2) : '—')
  const day = (iso) => {
    if (!iso) return '—'
    const [y, m, d] = iso.split('-')
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${Number(d)} ${names[Number(m) - 1] ?? ''}`
  }

  /* SORT KEYS. Every cell that is not plain text carries data-v, a raw number
     the client-side sorter reads instead of the formatted string. Without it
     "$1.2B" sorts before "$900M" because that is correct alphabetically and
     nonsense financially, and "—" sorts wherever the browser's collator feels
     like putting it. Missing values get -Infinity so blanks always sink to the
     bottom whichever direction you sort. */
  const sv = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : -Infinity)
  const td = (v, txt, cls) =>
    `<td data-v="${sv(v)}"${cls ? ` class="${cls}"` : ''}>${esc(txt)}</td>`

  /* Beat or miss, in dollars per share rather than a percentage.
     A percentage surprise explodes toward infinity as the estimate approaches
     zero — a company expected to earn $0.01 that earns $0.05 is "up 400%",
     which is arithmetic rather than news. The dollar gap stays readable. */
  const surprise = (r) => {
    if (typeof r.epsActual !== 'number' || typeof r.epsEstimate !== 'number') {
      return { txt: 'Not in yet', cls: 'mkt-pending', v: null }
    }
    const d = r.epsActual - r.epsEstimate
    if (Math.abs(d) < 0.005) return { txt: 'In line', cls: '', v: 0 }
    return { txt: (d > 0 ? '+' : '−') + '$' + Math.abs(d).toFixed(2), cls: d > 0 ? 'up' : 'down', v: d }
  }

  /* Two links per company, because they answer different questions.
     PRESS RELEASE (Yahoo Finance) — the company's own announcement in full,
     free and unwalled. Not Seeking Alpha, which now registration-walls most
     symbol pages; shipping a link a reader cannot open is the exact thing that
     got Bloomberg dropped from the news feed.
     SEC 8-K — the same release as filed with the regulator, attached as
     Exhibit 99.1. Uglier, slower to appear, never going to paywall. */
  const presser = (sym) =>
    'https://finance.yahoo.com/quote/' + encodeURIComponent(sym) + '/press-releases/'
  const edgar = (sym) =>
    'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=' +
    encodeURIComponent(sym) + '&type=8-K&dateb=&owner=include&count=40'

  const readCell = (sym) =>
    `<td class="mkt-rel"><a href="${esc(presser(sym))}" target="_blank" rel="noopener nofollow">Release &rarr;</a>` +
    `<a class="sec" href="${esc(edgar(sym))}" target="_blank" rel="noopener">SEC</a></td>`

  /* THE TICKER IS A LINK INTO THE SYMBOL LOOKUP.
     ?symbol= is a real href, not an onclick, so it works with JavaScript off,
     survives a middle-click into a new tab, and shows a destination on hover.

     ROOT-RELATIVE, because this renderer feeds THREE pages: markets.html and
     markets-fundamental.html at the root, and Markets/spotlight.html one level
     down. Only spotlight carries the lookup form, so a bare "?symbol=" would
     do nothing at all on the other two — it would set a query string on a page
     with nothing to read it. An absolute path resolves to the same place from
     any depth, and the site is served from the domain root, so this is safe.

     What each page then does with it:
       · spotlight.html   — its inline script intercepts the click, fills the
                            field and scrolls, no reload.
       · the other two    — plain navigation to spotlight, symbol prefilled,
                            which is exactly the intended behaviour.

     rel="nofollow" is deliberate. Every row would otherwise mint a distinct
     crawlable ?symbol= URL — up to 25 per table, three tables, three pages —
     and that is a lot of near-duplicate URLs to hand a crawler for no gain.
     Do not remove it if spotlight is ever indexed. */
  const nameCell = (r) => {
    const sym = String(r.symbol ?? '')
    return `<th scope="row" data-v="${esc(sym)}">` +
      `<a class="mkt-sym" href="/Markets/spotlight.html?symbol=${encodeURIComponent(sym)}#lookup"` +
      ` rel="nofollow" title="Look up ${esc(sym)}">${esc(sym)}</a>` +
      (r.name && r.name !== sym ? `<span class="mkt-co">${esc(r.name)}</span>` : '') +
      `</th>`
  }

  /* Sortable header. A <button> rather than a click handler on the <th>: it is
     keyboard reachable and screen readers announce it as actionable, which a
     bare th with a cursor:pointer is not. aria-sort lives on the th and the
     sorter updates it. */
  const th = (label, type, extraClass) =>
    `<th scope="col"${extraClass ? ` class="${extraClass}"` : ''} aria-sort="none" data-type="${type}">` +
    `<button type="button" class="mkt-sort">${esc(label)}<span class="mkt-arrow" aria-hidden="true"></span></button></th>`

  const WHEN_RANK = { bmo: 0, dmh: 1, amc: 2 }

  /* Row order within a day: before-open, then during hours, then after close,
     then largest first. A reader planning a day wants the pre-market names
     separated — they are the ones that gap while the market is shut. Sorting a
     COPY, because these arrays are the same objects the snapshot writer
     persists and mutating a caller's data from a render function is the kind
     of thing that produces a bug three files away. */
  const bySession = (a, b) =>
    ((WHEN_RANK[a.hour] ?? 3) - (WHEN_RANK[b.hour] ?? 3)) ||
    ((b.marketCap || 0) - (a.marketCap || 0))

  /* ── TODAY ────────────────────────────────────────────────────────────────
     Estimate and actual side by side. Every row starts the day with the actual
     columns reading "—", and they fill in through the session as companies
     report, because the build now runs hourly. */
  /* THE PAGINATION WRAPPER.
     `data-page-size` is the only thing market-tables.js needs; it finds the
     table itself. The pager UI is created by that script and does not exist in
     the shipped HTML, which is deliberate — a Prev/Next control that cannot
     work without JavaScript should not be on the page when JavaScript is off.
     With the script absent, or to a crawler, every row is simply visible. */
  const paged = (inner) =>
    `<div class="mkt-paged" data-page-size="${EARNINGS_PAGE_SIZE}">${inner}</div>`

  /* NO SILENT CAPS. EARNINGS_ROWS is a page-weight limit, not an editorial one,
     and in a heavy week "Just reported" genuinely exceeds it. A list that stops
     at 100 without saying so reads as "that is all of them", which is the one
     thing it must not read as. This line only appears when the cap actually
     bites, so on a normal day there is nothing to explain. */
  const cutNote = (total) => total > EARNINGS_ROWS
    ? `<p class="mkt-cut">Showing the ${EARNINGS_ROWS} largest of ${total} companies above the size floor. The rest are on the calendar and simply do not fit on one page.</p>`
    : ''

  const todayTable = today.length ? cutNote(today.length) + paged(`<div class="mkt-scroll"><table class="mkt-table mkt-sortable">
      <thead><tr>${th('Company','text')}${th('When','text')}${th('Market cap','num','mkt-hide-sm')}${th('EPS est.','num')}${th('EPS actual','num')}${th('Surprise','num')}${th('Revenue est.','num','mkt-hide-sm')}${th('Revenue actual','num')}<th scope="col">Read it</th></tr></thead>
      <tbody>
${[...today].sort(bySession).slice(0, EARNINGS_ROWS).map(r => {
    const s = surprise(r)
    return `        <tr>
          ${nameCell(r)}
          <td data-v="${WHEN_RANK[r.hour] ?? 3}">${esc(when[r.hour] ?? '—')}</td>
          ${td(r.marketCap, cap(r.marketCap), 'mkt-hide-sm')}
          ${td(r.epsEstimate, eps(r.epsEstimate))}
          ${td(r.epsActual, eps(r.epsActual))}
          <td data-v="${sv(s.v)}" class="${s.cls}">${esc(s.txt)}</td>
          ${td(r.revenueEstimate, money(r.revenueEstimate), 'mkt-hide-sm')}
          ${td(r.revenueActual, money(r.revenueActual))}
          ${readCell(r.symbol)}
        </tr>`
  }).join('\n')}
      </tbody>
    </table></div>`) : `<p class="mkt-empty">No company above $${(EARNINGS_MIN_CAP_M / 1000).toFixed(0)} billion is scheduled to report today. That is normal — reporting clusters into a few weeks each quarter and thins out to nothing in between. Try the Tomorrow tab, or Just reported for the ones already in.</p>`

  /* ── TOMORROW ─────────────────────────────────────────────────────────────
     Estimates only, by definition. No actual columns: a column that is
     structurally always empty is worse than no column, because it reads as
     missing data rather than as data that cannot exist yet. */
  const tomorrowTable = tomorrow.length ? cutNote(tomorrow.length) + paged(`<div class="mkt-scroll"><table class="mkt-table mkt-sortable">
      <thead><tr>${th('Company','text')}${th('When','text')}${th('Market cap','num','mkt-hide-sm')}${th('EPS est.','num')}${th('Revenue est.','num')}<th scope="col">Read it</th></tr></thead>
      <tbody>
${[...tomorrow].sort(bySession).slice(0, EARNINGS_ROWS).map(r => `        <tr>
          ${nameCell(r)}
          <td data-v="${WHEN_RANK[r.hour] ?? 3}">${esc(when[r.hour] ?? '—')}</td>
          ${td(r.marketCap, cap(r.marketCap), 'mkt-hide-sm')}
          ${td(r.epsEstimate, eps(r.epsEstimate))}
          ${td(r.revenueEstimate, money(r.revenueEstimate))}
          ${readCell(r.symbol)}
        </tr>`).join('\n')}
      </tbody>
    </table></div>`) : `<p class="mkt-empty">Nothing above the size floor is on the calendar for tomorrow yet. Dates move, and companies confirm late — this fills in as they do.</p>`

  /* ── JUST REPORTED ────────────────────────────────────────────────────────
     Actual revenue is present for companies caught on their own day and absent
     for older ones, because Finnhub's per-symbol endpoint carries EPS only.
     That gap is explained in the note above the tabs rather than hidden. */
  const reportedTable = reported.length ? cutNote(reported.length) + paged(`<div class="mkt-scroll"><table class="mkt-table mkt-sortable">
      <thead><tr>${th('Company','text')}${th('Date','num')}${th('Market cap','num','mkt-hide-sm')}${th('EPS est.','num')}${th('EPS actual','num')}${th('Surprise','num')}${th('Revenue est.','num','mkt-hide-sm')}${th('Revenue actual','num')}<th scope="col">Read it</th></tr></thead>
      <tbody>
${reported.slice(0, EARNINGS_ROWS).map(r => {
    const s = surprise(r)
    return `        <tr>
          ${nameCell(r)}
          <td data-v="${esc(String(r.date ?? '').replace(/-/g, ''))}">${esc(day(r.date))}</td>
          ${td(r.marketCap, cap(r.marketCap), 'mkt-hide-sm')}
          ${td(r.epsEstimate, eps(r.epsEstimate))}
          ${td(r.epsActual, eps(r.epsActual))}
          <td data-v="${sv(s.v)}" class="${s.cls}">${esc(s.txt)}</td>
          ${td(r.revenueEstimate, money(r.revenueEstimate), 'mkt-hide-sm')}
          ${td(r.revenueActual, money(r.revenueActual))}
          ${readCell(r.symbol)}
        </tr>`
  }).join('\n')}
      </tbody>
    </table></div>`) : `<p class="mkt-empty">Nothing has dropped through to reported yet. This fills in as each day ends.</p>`

  /* Tabs are three radio inputs and a sibling selector — no JavaScript.
     That matters for more than elegance: ALL THREE tables ship in the HTML and
     are only hidden with CSS, so a crawler reads every row of every one.
     Building the panels with JS would have hidden two thirds of this content
     from Google, which is the exact mistake these pages were rewritten to stop
     making. The column sorter is a genuine enhancement layered on top and the
     tables are complete and readable without it.

     "Today" is checked by default because that is the question the section
     asks. */
  return `<div class="mkt-filter-note">
      <p><strong>How this list is filtered, so you know what is missing.</strong> Around 1,500 US companies report in any given week. There is exactly one filter on this list: a company has to be worth more than $2 billion. Nothing else is applied &mdash; not a shortlist, not a selection, not a cap on how many make it in. Below that size a company can double or halve on its results without moving an index, a sector, or anything you are likely to hold.</p>
      <p>That is an editorial choice rather than a judgment about those businesses, and it does mean genuinely interesting small companies are missing. <strong>Estimates</strong> are what analysts expect: a forecast, not a target the company agreed to. <strong>Surprise</strong> is actual EPS minus estimate, in dollars per share. <strong>Release</strong> is the company's own press release in full; <strong>SEC</strong> is that same release as filed with the regulator.</p>
      <p><strong>Two honest limits.</strong> Actual figures appear within about an hour of a company releasing them, not instantly, so a name that has just reported may still show a dash. And <strong>actual revenue is only kept for companies we caught on their own reporting day</strong> &mdash; our data source sells no revenue history, so older rows in Just reported show actual EPS with a dash beside it for revenue. A dash means we do not have it, never that the company did not report it.</p>
    </div>
    <div class="mkt-tabs">
      <input type="radio" name="earnwin" id="earnwin-today" class="mkt-tab-in" checked>
      <input type="radio" name="earnwin" id="earnwin-tomorrow" class="mkt-tab-in">
      <input type="radio" name="earnwin" id="earnwin-reported" class="mkt-tab-in">
      <div class="mkt-tab-btns">
        <label for="earnwin-today">Today &nbsp;<span>${today.length}</span></label>
        <label for="earnwin-tomorrow">Tomorrow &nbsp;<span>${tomorrow.length}</span></label>
        <label for="earnwin-reported">Just reported &nbsp;<span>${reported.length}</span></label>
      </div>
      <div class="mkt-tab-panel" data-win="today">
        ${todayTable}
      </div>
      <div class="mkt-tab-panel" data-win="tomorrow">
        ${tomorrowTable}
      </div>
      <div class="mkt-tab-panel" data-win="reported">
        ${reportedTable}
      </div>
      <p class="mkt-tab-hint">Tap any column heading to sort. Tap a ticker to load it into the lookup at the top of the page.</p>
    </div>`
}

/* -------------------------------------------------------- sector returns --- */
/*
   Eleven sector ETFs and the S&P 500 at six horizons, from market-sectors.

   TOTAL returns, not price returns — Yahoo's adjusted closes fold dividends and
   splits back in. That distinction is load-bearing here: utilities, staples and
   real estate yield far more than technology, so a price-return table would
   understate them by enough to reverse the ranking between two sectors over ten
   years. The page says "total return" because it is one.

   The benchmark row is rendered last and highlighted. Without it a reader can
   see which sectors rose but not which ones actually beat owning the index,
   which is the only question the table can genuinely answer.

   A null cell is a fund that did not exist yet — XLRE launched in 2015, XLC in
   2018 — and renders as a dash rather than a number invented from a shorter
   window.
*/
function renderSectorReturns(payload) {
  const rows = payload?.sectors
  if (!Array.isArray(rows) || !rows.length) return ''
  const bench = payload.benchmark

  const cell = (v) => v === null || v === undefined
    ? '<td class="sec-na">&mdash;</td>'
    : `<td class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : ''}${v.toFixed(1)}%</td>`

  const line = (r, isBench) => `        <tr${isBench ? ' class="sec-bench"' : ''}>
          <th scope="row">${esc(r.name)}<span class="sec-etf">${esc(r.etf)}</span></th>
          ${cell(r.returns.m3)}${cell(r.returns.m6)}${cell(r.returns.y1)}
          ${cell(r.returns.y3)}${cell(r.returns.y5)}${cell(r.returns.y10)}
        </tr>`

  return `<table class="mkt-table sec-table">
      <colgroup><col class="sec-name"><col span="6"></colgroup>
      <thead><tr>
        <th scope="col">Sector</th>
        <th scope="col">3M</th><th scope="col">6M</th><th scope="col">1Y</th>
        <th scope="col">3Y</th><th scope="col">5Y</th><th scope="col">10Y</th>
      </tr></thead>
      <tbody>
${rows.map(r => line(r, false)).join('\n')}
${bench ? line(bench, true) : ''}
      </tbody>
    </table>
    <p class="sec-src">Total return including dividends, from ${esc(payload.source ?? 'monthly adjusted closes')}. Priced ${esc(bench?.asOf ?? '')}. A dash means the fund did not exist for that whole period &mdash; Real Estate launched in 2015 and Communication Services in 2018.</p>`
}

/* --------------------------------------------------------- earnings score ---
   THE SCOREBOARD, AND THE ONE THING IT IS NOT.

   Three numbers over the companies WE track: how many came in above the
   consensus EPS estimate, by how much in the typical case, and how their
   earnings compare with the same quarter a year ago.

   IT IS NOT THE S&P 500 FIGURE, and the page has to say so in the block
   itself, not in a footnote. The number FactSet and S&P Dow Jones publish is
   the change in AGGREGATE DOLLAR EARNINGS across the index — share-count
   weighted, divisor-adjusted, built from the constituent list. That needs data
   nobody sells on a free tier, and no rearrangement of per-company figures
   produces it. Our number is a median across a population we can name: every
   US company above $2 billion that reported inside the window. It lands in the
   same range as the published one often enough to be mistaken for it, which is
   exactly why the label is load-bearing. See standing rule 2: name what you
   have, do not imply an authority you do not hold.

   Every tile renders the sample size next to the figure. A beat rate is a
   fraction, and a fraction without its denominator is a rhetorical device.

   A tile whose figure is missing is OMITTED, not shown as a zero or a dash
   with a percent sign after it. The growth tile in particular depends on an
   endpoint whose free-tier status is not guaranteed; if it returns nothing the
   block quietly renders two tiles and reads perfectly well. */
function renderEarningsScore(s) {
  if (!s || !s.companies) return ''

  const pct1 = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + '%'
  const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '')

  const tiles = []

  tiles.push(`      <div class="mkt-score-tile">
        <p class="mkt-score-lab">Came in above estimates</p>
        <p class="mkt-score-fig">${Math.round(s.beatRate)}%</p>
        <p class="mkt-score-sub">${s.beats} of ${s.companies} companies &middot; ${s.misses} below, ${s.inLine} in line</p>
      </div>`)

  if (s.surpriseMedian !== null && s.surpriseSample) {
    tiles.push(`      <div class="mkt-score-tile">
        <p class="mkt-score-lab">Typical beat, against the estimate</p>
        <p class="mkt-score-fig ${cls(s.surpriseMedian)}">${esc(pct1(s.surpriseMedian))}</p>
        <p class="mkt-score-sub">Median of ${s.surpriseSample} &middot; estimates under 10&cent; excluded</p>
      </div>`)
  }

  if (s.growthMedian !== null && s.growthSample) {
    tiles.push(`      <div class="mkt-score-tile">
        <p class="mkt-score-lab">Earnings vs. a year ago</p>
        <p class="mkt-score-fig ${cls(s.growthMedian)}">${esc(pct1(s.growthMedian))}</p>
        <p class="mkt-score-sub">Median of ${s.growthSample} companies we track</p>
      </div>`)
  }

  return `<div class="mkt-score">
      <p class="mkt-score-hd">How this reporting season is going</p>
      <div class="mkt-score-grid">
${tiles.join('\n')}
      </div>
      <p class="mkt-score-note"><strong>This is our own tally, not the S&amp;P 500 figure.</strong>
        It covers every US company worth more than $${(s.minCapM / 1000).toFixed(0)} billion that we recorded reporting in the
        last ${s.days} days &mdash; ${s.companies} of them so far &mdash; and nothing else. The
        index-wide numbers you see quoted elsewhere are aggregate dollar earnings across the
        500 index members, weighted by share count. That is a different measurement built from
        data we do not have, and the two can disagree.</p>
      <p class="mkt-score-note">Both percentages are <strong>medians</strong>, not averages. A company expected to
        earn a penny that earns a nickel beat its estimate by 400%, which is arithmetic rather
        than news; one such company moves an average and cannot move a median. &ldquo;In line&rdquo;
        means within half a cent either way.</p>
    </div>`
}

/* ------------------------------------------------------ earnings headlines --- */
/*
   The reporting-season feed that sits under the calendar. Drawn from the same
   RSS pool as the main news block and filtered to earnings coverage, so it
   costs no extra request and inherits the same paywall filter — every link is
   one a reader can actually open.

   Keyword matching rather than a category endpoint because the free feeds do
   not publish a reliable earnings category. It over-matches slightly, which is
   the right way round: a stray macro story in an earnings list is a minor
   annoyance, an empty list looks broken.
*/
const EARNINGS_RE =
  /\b(earnings|quarterly results|q[1-4]\b|first quarter|second quarter|third quarter|fourth quarter|beats? estimates|misses? estimates|profit (?:rose|fell|jumped|slumped)|revenue (?:rose|fell|jumped|beat|missed)|guidance|outlook|reports? (?:results|profit|revenue))/i

function renderEarningsNews(items) {
  if (!items?.length) return ''
  const hits = items
    .filter(isReadable)
    .filter(n => EARNINGS_RE.test(String(n.headline ?? '') + ' ' + String(n.summary ?? '')))
  if (!hits.length) return ''
  return `<ul class="mkt-erel">
${mixSources(hits, 8).map(n => `      <li class="mkt-erel-item">
        <a href="${esc(n.url)}" target="_blank" rel="noopener nofollow">
          <span class="mkt-erel-hd">${esc(clip(n.headline, 120))}</span>
          <span class="mkt-erel-src">${esc(n.source ?? '')}</span>
        </a>
      </li>`).join('\n')}
</ul>`
}

/* -------------------------------------------------------------- signals ---- */

function renderSignals(s) {
  if (!s?.signals?.length) return ''
  const label = { calm: 'Not flashing', watch: 'Gray zone', alert: 'Flashing' }
  return `<p class="mkt-sig-summary">${esc(s.summary)}</p>
    <div class="mkt-sig-grid">
${s.signals.map(x => `      <article class="mkt-sig ${esc(x.state)}">
        <p class="mkt-sig-state">${esc(label[x.state] ?? x.state)}</p>
        <h3 class="mkt-sig-label">${esc(x.label)}</h3>
        <p class="mkt-sig-reading">${esc(x.reading)}</p>
        <p class="mkt-sig-what">${esc(x.what)}</p>
        <p class="mkt-sig-caveat"><strong>Where it fails:</strong> ${esc(x.caveat)}</p>
        <p class="mkt-stat-src">${esc(refDate(x.date, 'd'))} · <a href="${esc(x.source)}" target="_blank" rel="noopener">FRED ${esc(x.seriesId)}</a></p>
      </article>`).join('\n')}
    </div>`
}

/* ------------------------------------------------------------- sentiment --- */
/*
   The dollar-weighted mood read. Percentile is the headline, not the level:
   "VIX is 16" needs the reader to already know the distribution, "lower than
   88% of the past year" does not.

   Monthly series legitimately get no percentile — twelve observations is not a
   distribution — so the column shows an em dash rather than a fabricated rank.
*/
function renderMood(m) {
  if (!m?.rows?.length) return ''
  const STATE = {
    fear: 'Fearful', cautious: 'Cautious', ordinary: 'Ordinary',
    relaxed: 'Relaxed', complacent: 'Complacent', unknown: 'Unknown',
  }
  const gauge = m.score === null ? '' : `<div class="beh-gauge ${esc(m.state)}">
      <p class="beh-score">${esc(m.score)}<span>/100</span></p>
      <p class="beh-state">${esc(STATE[m.state] ?? m.state)}</p>
      <div class="beh-bar"><div class="beh-bar-fill" style="width:${Math.max(2, Math.min(100, m.score))}%"></div></div>
      <p class="beh-note">${esc(m.note ?? '')}</p>
    </div>`
  const cash = m.cashNote ? `<p class="beh-cash">${esc(m.cashNote)}</p>` : ''
  return `${gauge}
    <table class="mkt-table">
      <caption class="mkt-table-cap">Each reading with its rank against the past year of the same series. The rank is the useful part &mdash; a level only means something once you know what is normal for it.</caption>
      <thead><tr><th scope="col">Reading</th><th scope="col">Now</th><th scope="col">vs past year</th><th scope="col">As of</th></tr></thead>
      <tbody>
${m.rows.map(r => {
  const p = r.percentile === null || r.percentile === undefined
    ? '<span class="beh-na">not enough history</span>'
    : `${r.percentile}${r.percentile === 1 ? 'st' : r.percentile === 2 ? 'nd' : r.percentile === 3 ? 'rd' : 'th'} percentile`
  const cls = r.percentile === null || r.percentile === undefined ? ''
    : r.percentile >= 80 ? 'down' : r.percentile <= 20 ? 'up' : ''
  return `        <tr>
          <th scope="row"><a href="${esc(r.source)}" target="_blank" rel="noopener">${esc(r.label)}</a></th>
          <td><strong>${esc(r.display)}</strong></td>
          <td class="${cls}">${p}</td>
          <td>${esc(refDate(r.date, r.freq))}</td>
        </tr>`
}).join('\n')}
      </tbody>
    </table>
    ${cash}`
}

/* -------------------------------------------------------- what changed ----- */
/*
   The return-visit engine. Everything else on the page is true for weeks at a
   time; this block is the part that is different when someone comes back.

   It is deliberately labelled with the two dates it compared. "Since yesterday"
   would be a lie on any build that is not exactly a day apart, and a reader who
   catches one lie stops trusting the numbers too.
*/

/* `equity` is in this list but has no MKT marker anywhere, and that is the
   whole point. It exists purely to land in the snapshot, which is what
   tools/build-charts.mjs reads to put a live final point on the Dow chart in
   Stage 5. Nothing on a Markets page renders it. Remove it from here and the
   chart silently reverts to ending at the last completed year. */
function flatten(data) {
  const out = {}
  for (const set of ['macro', 'growth', 'inflation', 'rates', 'labor', 'consumer', 'equity']) {
    for (const r of data[set] ?? []) {
      out[r.key] = { label: r.label, display: r.display, value: r.value, date: r.date, freq: r.freq, better: r.better, fmt: r.fmt, deltaUnit: r.deltaUnit }
    }
  }
  return out
}

function renderChanged(diff) {
  // First ever build: there is no previous snapshot to compare against. Say so
  // rather than returning '' — an empty render leaves whatever placeholder was
  // hand-written in the page, which is the one piece of this block the injector
  // would then never own again.
  if (!diff) {
    return `<p class="mkt-chg-none">This is the first update since change tracking was switched on, so there is nothing to compare against yet. From the next update onward this block lists every figure that moved and names both dates.</p>`
  }
  if (!diff.rows.length) {
    return `<p class="mkt-chg-none">Nothing on this page has been revised since ${esc(diff.since)}. That is normal &mdash; most of these series report monthly, and a page that claimed something new every day would be making it up.</p>`
  }
  return `<p class="mkt-chg-since">Comparing this update (${esc(diff.now)}) against the previous one (${esc(diff.since)}).</p>
    <ul class="mkt-chg-list">
${diff.rows.map(r => `      <li class="mkt-chg-item ${esc(r.dir)}">
        <span class="mkt-chg-label">${esc(r.label)}</span>
        <span class="mkt-chg-move">${esc(r.was)} <span aria-hidden="true">→</span> <strong>${esc(r.now)}</strong></span>
        <span class="mkt-chg-note">${esc(r.note)}</span>
      </li>`).join('\n')}
    </ul>`
}

function buildDiff(flat, prev, todayISO) {
  if (!prev?.figures) return null
  const rows = []
  for (const [key, cur] of Object.entries(flat)) {
    const old = prev.figures[key]
    if (!old) continue
    // Only report when the underlying observation is genuinely new. A value
    // that merely re-renders identically is not news, and neither is the same
    // observation reprinted because the build ran twice in an afternoon.
    if (old.date === cur.date && old.display === cur.display) continue
    if (old.display === cur.display) continue
    const delta = (typeof cur.value === 'number' && typeof old.value === 'number')
      ? cur.value - old.value : null
    const rising = delta !== null && delta > 0
    const good = delta === null ? null : (rising && cur.better === 'up') || (!rising && cur.better === 'down')
    rows.push({
      key, label: cur.label, was: old.display, now: cur.display,
      dir: delta === null ? 'flat' : good ? 'good' : 'bad',
      note: old.date === cur.date
        ? 'revised for the same reference period'
        : `new reading for ${refDate(cur.date, cur.freq)}`,
    })
  }
  // Biggest movers first, but cap it. A wall of 30 rows is not a "what changed"
  // block, it is the same table again.
  rows.sort((a, b) => (a.dir === 'flat' ? 1 : 0) - (b.dir === 'flat' ? 1 : 0))
  return { rows: rows.slice(0, 12), since: prev.stamp ?? 'the previous update', now: todayISO }
}

/* -------------------------------------------------------------- drawdown ---
   How far the S&P 500 sits below its record high.

   Added 2026-08-10. This is the one number that tells a reader whether the
   long-run probability tables in Stage 4 Module 08 are being read in calm
   weather or in a storm, and it is the question people actually arrive with.

   COSTS ONE EXTRA CALL PER BUILD. Every other marker added since 2026-08-02
   reused a set that was already being fetched. `drawdown` does not — it is a
   new set, so it is a real request. Two markers share it (markets.html and
   markets-technical.html), which is why it is one request and not two.

   PRICE ONLY, and the high is the highest close in FRED's licensed ten-year
   window. Both facts are stated in the caption rather than left implied.

   NOT A TABLE ANY MORE (2026-08-12). It was three rows of two numbers plus a
   raw ISO date, laid out across a full-width grid: accurate, and unreadable.
   A table is for comparing rows against each other, and these three rows are
   not comparable — they are one fact (how far below the high) and the two
   numbers it was computed from. It is now a sentence, three labelled figures
   and a scale showing where that sits against the thresholds. Styles live in
   styles.css under `.mkt-dd` so both pages that carry this block get them from
   one place. */
function renderDrawdown(d) {
  if (!d || d.value === null || d.value === undefined) return ''

  const down = Math.abs(d.value)
  const at = d.atHigh || down < 0.05

  const lead = at
    ? `The S&amp;P 500 closed at a <strong>record high</strong> on ${esc(refDate(d.date, 'd'))}.`
    : `The S&amp;P 500 is <strong>${esc(d.display)}</strong> from its record high, ` +
      `set ${esc(refDate(d.peakDate, 'd'))} &mdash; ${esc(d.daysSincePeak)} days ago.`

  // Plain-language read. Thresholds match the Stage 4 table exactly, so a
  // reader moving between the two pages never sees them disagree.
  const meaning =
    d.bucket === 30 ? 'A fall of this size has happened seven times since 1928.'
  : d.bucket === 20 ? 'Falls past 20% are what people mean by a bear market. Twenty since 1928.'
  : d.bucket === 10 ? 'A correction. Twenty-six of these since 1928, most of them forgotten within a year.'
  : down < 5       ? 'Normal. The index spends most of its life within a few percent of a high.'
  :                  'A dip, not a correction. Corrections start at 10%.'

  /* THE SCALE. Linear, right edge = the record high, left edge = 30% below it.
     The band widths below are the REAL positions of the thresholds on that
     scale, not four equal quarters: 5% is a sixth of 30, 10% is a third, 20% is
     two thirds. An equal-quarters version would have been prettier and would
     have drawn a 4% drawdown and a 15% one as though they were comparable
     distances from the high, which is the exact misreading this block exists to
     prevent.

     Past 30% the pin clamps to the left edge. The sentence above it still
     carries the true figure, so the reader is never left with only the clamped
     picture — but if the S&P is ever 40% down, widen the scale rather than
     leaving a pinned marker to imply the bottom of the range. */
  const SCALE = 30
  const pos = Math.max(0.6, Math.min(99.4, (1 - down / SCALE) * 100))

  const band = down >= 20 ? 'a bear market'
    : down >= 10 ? 'a correction'
    : down >= 5 ? 'a dip'
    : 'the normal range'

  return `<figure class="mkt-dd">
      <p class="mkt-dd-lead">${lead} ${esc(meaning)}</p>
      <div class="mkt-dd-nums">
        <div class="mkt-dd-cell">
          <span class="mkt-dd-k">S&amp;P 500 close</span>
          <span class="mkt-dd-v"><a href="${esc(d.source)}" target="_blank" rel="noopener">${esc(d.levelDisplay)}</a></span>
          <span class="mkt-dd-d">${esc(refDate(d.date, 'd'))}</span>
        </div>
        <div class="mkt-dd-cell">
          <span class="mkt-dd-k">Record high</span>
          <span class="mkt-dd-v">${esc(d.peakDisplay)}</span>
          <span class="mkt-dd-d">${esc(refDate(d.peakDate, 'd'))}</span>
        </div>
        <div class="mkt-dd-cell">
          <span class="mkt-dd-k">Below that high</span>
          <span class="mkt-dd-v ${at ? 'up' : 'down'}">${esc(d.display)}</span>
          <span class="mkt-dd-d">${at ? 'at the high today' : esc(d.daysSincePeak) + ' days ago'}</span>
        </div>
      </div>
      <div class="mkt-dd-track" role="img" aria-label="Scale from the record high on the right to 30 percent below it on the left. The S&amp;P 500 sits ${esc(d.display)} from its high, inside ${esc(band)}.">
        <span class="mkt-dd-band" style="width:33.34%;background:#C4381F"></span>
        <span class="mkt-dd-band" style="width:33.33%;background:#E07B39"></span>
        <span class="mkt-dd-band" style="width:16.66%;background:#C9A227"></span>
        <span class="mkt-dd-band" style="width:16.67%;background:#2DA02D"></span>
        <span class="mkt-dd-pin${pos > 88 ? ' at-right' : pos < 12 ? ' at-left' : ''}" style="left:${pos.toFixed(2)}%"><b>${esc(d.display)}</b></span>
      </div>
      <ul class="mkt-dd-legend">
        <li><i style="background:#C4381F"></i>Bear market &middot; 20% or more</li>
        <li><i style="background:#E07B39"></i>Correction &middot; 10&ndash;20%</li>
        <li><i style="background:#C9A227"></i>Dip &middot; 5&ndash;10%</li>
        <li><i style="background:#2DA02D"></i>Normal &middot; under 5%</li>
      </ul>
      <figcaption class="mkt-dd-cap">Measured on price against the highest close in the past ten years &mdash; dividends excluded, which is how a drawdown is always quoted. Ten years is the full history the St. Louis Fed publishes for this series. The scale runs from the record high to 30% below it, drawn to scale.</figcaption>
    </figure>`
}

/* The Stage 4 version of the same reading. Different job, so different markup:
   the Markets pages are answering "what is the market doing", this one is
   answering "which row of the table below is mine". It therefore names the
   bucket in plain words and says nothing else.

   Dark card, because it sits directly under the existing dark probability
   chart in that module and the two read as a pair. Colours are explicit hex —
   never a CSS variable in course content. */
function renderDrawdownStage4(d) {
  if (!d || d.value === null || d.value === undefined) return ''

  const at = d.atHigh || Math.abs(d.value) < 0.05
  const row = d.bucket === 0 ? 'Any moment' : `Down ${d.bucket}%+`

  const line = at
    ? 'The market is at a record high today, so the <strong>&ldquo;Any moment&rdquo;</strong> column is yours.'
    : `That puts today in the <strong>&ldquo;${esc(row)}&rdquo;</strong> column below.`

  const headline = at ? 'At a record high' : esc(d.display)

  return `<div style="background:#0A0A0A;border:1px solid rgba(240,192,48,.28);border-radius:10px;padding:16px 20px;margin:0 0 18px">
      <div style="font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#F0C030;margin-bottom:6px">Where the market is right now</div>
      <div style="font-size:1.5rem;font-weight:800;color:#FBF7EC;letter-spacing:-.02em;line-height:1.15">${headline}</div>
      <div style="font-size:.85rem;color:rgba(251,247,236,.66);line-height:1.55;margin-top:4px">${at ? '' : 'below its record high. '}${line}</div>
      <div style="font-size:.72rem;color:rgba(251,247,236,.34);margin-top:8px">S&amp;P 500 ${esc(d.levelDisplay)} &middot; high ${esc(d.peakDisplay)} set ${esc(d.peakDate)} &middot; close of ${esc(d.date)} &middot; source: St. Louis Fed</div>
    </div>`
}

/* ----------------------------------------------------------------- pages --- */

const PAGES = [
  {
    file: 'markets.html',
    sections: {
      macro:   { set: 'macro',   render: renderMacro },
      yields:  { set: 'yields',  render: renderYields },
      sectors: { set: 'sectors', render: renderSectors },
      quotes:  { set: 'quotes',  render: renderQuotes },
      news:    { set: 'news',    render: renderNews },
      // The Markets page carries the earnings calendar as of 2026-08-02, after
      // the TradingView economic calendar moved to markets-economic.html. Same
      // renderer and same Finnhub set as markets-fundamental.html — two markers
      // sharing one set costs one request, not two.
      earnings: { set: 'earnings', render: renderEarnings },
      /* The season scoreboard, above the table. Its own set name so it gets
         its own marker and its own placement, but 'earningsScore' is a LOCAL
         set — it is computed by the earnings block from the watch list, not
         requested from anywhere, which is why it is in LOCAL_SETS. */
      earningsScore: { set: 'earningsScore', render: renderEarningsScore },
      // Reads the same 'news' set as the block above — two markers sharing one
      // set costs one request, not two.
      earningsNews: { set: 'news', render: renderEarningsNews },
      // New set as of 2026-08-10 — one extra request per build, shared with
      // markets-technical.html. See renderDrawdown.
      drawdown: { set: 'drawdown', render: renderDrawdown },
      changed: { set: null,      render: renderChanged, diff: true },
    },
  },
  {
    file: 'markets-economic.html',
    sections: {
      econSignals:   { set: 'signals',   render: renderSignals },
      econGrowth:    { set: 'growth',    render: renderGrowth },
      econInflation: { set: 'inflation', render: renderInflation },
      econRates:     { set: 'rates',     render: renderRates },
      econLabor:     { set: 'labor',     render: renderLabor },
      econConsumer:  { set: 'consumer',  render: renderConsumer },
      econSectors:   { set: 'sectors',   render: renderSectorsCycle },
      econChanged:   { set: null,        render: renderChanged, diff: true },
    },
  },
  {
    // Sector comparison. The only page whose data comes entirely from a
    // market-* function other than market-data — see LOCAL_SETS.
    file: 'Markets/compare.html',
    sections: {
      sectorReturns: { set: 'sectorReturns', render: renderSectorReturns },
    },
  },
  {
    file: 'markets-fundamental.html',
    sections: {
      fundEarnings: { set: 'earnings', render: renderEarnings },
      fundSectors:  { set: 'sectors',  render: renderSectors },
      fundRates:    { set: 'rates',    render: renderRates },
    },
  },
  {
    // Breadth (S5TW/S5FI/S5TH) and the Dow Theory overlay are TradingView
    // embeds — no free API publishes S&P 500 participation. So the crawlable
    // text on this page is quotes + sectors plus the prose around them, which
    // is why the prose has to carry it. See the AdSense note at the top.
    file: 'markets-technical.html',
    sections: {
      techQuotes:  { set: 'quotes',     render: renderQuotes },
      techSectors: { set: 'sectorPerf', render: renderSectorBreadth },
      // Shares the 'drawdown' set with markets.html — one request, two markers.
      techDrawdown: { set: 'drawdown', render: renderDrawdown },
    },
  },
  {
    /* Stage 4 Module 09 asks "what if the market is already down?" and answers
       it with a table of historical odds by drawdown depth. The table is fixed;
       the row that APPLIES today is not, so the page needs the live reading.

       THIS IS THE MASTER, NOT THE PUBLIC PAGE. build-public-stages.mjs
       regenerates stage-4-invest.html at the site root from this file. The
       workflow runs inject-market-data BEFORE build-public-stages for exactly
       this reason — reverse them and the public copy ships one build behind
       while --check still passes. Same trap the Dow chart hit. */
    file: 'Financial Literacy Course/stage-4-invest.html',
    sections: {
      // Third marker on the shared 'drawdown' set. Still one request.
      ddStage4: { set: 'drawdown', render: renderDrawdownStage4 },
    },
  },
  {
    file: 'markets-behavior.html',
    sections: {
      behavMood:   { set: 'mood',   render: renderMood },
      behavQuotes: { set: 'quotes', render: renderQuotes },
    },
  },

  // ---------------------------------------------------------------------
  //  The three viewer pages, added 2026-08-02.
  //
  //  These came off noindex the same day, having been rewritten from ~200
  //  words of chrome into 1,150-1,780 words each. Their widgets are live in
  //  the visitor's browser but live inside an iframe, so a crawler saw only
  //  the prose — permanently static text on pages that are supposed to be
  //  about current markets.
  //
  //  Every set below is ALREADY FETCHED for another page. Sets are requested
  //  once and shared across all markers that name them, so these three pages
  //  cost zero additional API calls. Adding a marker that names a NEW set
  //  would not be free; adding one that reuses an existing set is.
  // ---------------------------------------------------------------------
  {
    // Cross-asset tape under the chart: what moved, before you go chart it.
    // Same set as markets.html quotes and markets-technical techQuotes.
    file: 'Markets/chart.html',
    sections: {
      chartQuotes: { set: 'quotes', render: renderQuotes },
    },
  },
  {
    // Sector fundamentals. Sits directly beneath the section arguing that
    // ratio norms are industry-specific, because it is the evidence for it.
    file: 'Markets/screeners.html',
    sections: {
      screenSectors: { set: 'sectors', render: renderSectors },
    },
  },
  {
    // Upcoming earnings. Follows the year-over-year section, which is the
    // method this table is meant to be read with.
    file: 'Markets/spotlight.html',
    sections: {
      spotEarnings: { set: 'earnings', render: renderEarnings },
    },
  },
]

function replaceBlock(html, name, inner) {
  const re = new RegExp(`(<!--\\s*MKT:${name}:START\\s*-->)([\\s\\S]*?)(<!--\\s*MKT:${name}:END\\s*-->)`)
  if (!re.test(html)) return { html, found: false, changed: false }
  let changed = false
  const out = html.replace(re, (_m, a, old, b) => {
    const next = `${a}\n    ${inner}\n    ${b}`
    const cur = `${a}${old}${b}`
    changed = next.trim() !== cur.trim()
    return next
  })
  return { html: out, found: true, changed }
}

async function main() {
  /* The snapshot is read HERE, before any fetching, because the earnings
     carry-forward needs last run's watch list in order to know which symbols
     have since reported. It used to be read after the fetches, which was fine
     when its only job was the "what changed" diff. */
  let prevSnapshot = null
  try {
    if (existsSync(SNAPSHOT)) prevSnapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
  } catch { /* first run, or a corrupt file — either way, start clean */ }

  /* Populated by the earnings block and persisted at the end. Declared out
     here so a failed earnings fetch leaves it null and the existing watch list
     is carried over untouched rather than being wiped. */
  let earningsWatch = null

  /* Same contract as earningsWatch: null means "this run never got far enough
     to have an opinion", and the writer carries the previous value forward
     rather than wiping a cache that took days of builds to fill. Losing the
     cap cache to one failed fetch would put the $2B filter back to guessing
     for the next several hours, which is the exact failure this replaced. */
  let earningsCapCache = null
  let earningsGrowthCache = null

  // Which pages exist, and which markers are actually in them.
  const live = []
  for (const p of PAGES) {
    const path = join(ROOT, p.file)
    if (!existsSync(path)) { console.log(`  skip ${p.file}: not in the repo`); continue }
    const html = readFileSync(path, 'utf8')
    const present = Object.keys(p.sections)
      .filter(n => new RegExp(`<!--\\s*MKT:${n}:START\\s*-->`).test(html))
    const hasStamp = /<!--\s*MKT:stamp:START\s*-->/.test(html)
    if (present.length || hasStamp) live.push({ ...p, path, html, present, hasStamp })
  }

  if (!live.length) {
    console.log('  No MKT: markers found in any Markets page — nothing to inject.')
    console.log('  Add marker pairs where you want the data, e.g.:')
    console.log('    <!-- MKT:macro:START --><!-- MKT:macro:END -->')
    return 0
  }

  if (offline) { console.log('  --offline: keeping the baked numbers already in the pages.'); return 0 }

  // Union of the sets every live marker needs — one request, not one per page.
  const sets = [...new Set(live.flatMap(p =>
    p.present.map(n => p.sections[n].set).filter(Boolean)))]
    .filter(s => !LOCAL_SETS.has(s))
  // The diff needs the FRED groups even if only a summary block is rendered.
  const needsDiff = live.some(p => p.present.some(n => p.sections[n].diff))
  if (needsDiff) for (const s of ['macro', 'growth', 'inflation', 'rates', 'labor', 'consumer']) {
    if (!sets.includes(s)) sets.push(s)
  }

  /* `equity` (one series, DJIA) is requested unconditionally, because unlike
     every other set it is not driven by a marker. No Markets page renders it.
     It exists so the snapshot carries a current index level for the Stage 5
     Dow chart, which build-charts.mjs bakes on the next deploy.

     Cost is one extra FRED call per run, cached six hours server-side, so in
     practice ~4 upstream calls a day across ~125 runs a week.

     Harmless if the Edge Function has not been redeployed with the `equity`
     set yet: the request filter there drops unknown set names, so this comes
     back absent rather than erroring, `flatten` writes no djia key, and the
     chart keeps its year-end ending. */
  if (!sets.includes('equity')) sets.push('equity')

  let data
  try {
    const res = await fetch(`${ENDPOINT}?sets=${sets.join(',')}`, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    data = await res.json()
    if (data.errors) for (const [k, v] of Object.entries(data.errors)) console.log(`  upstream warning [${k}]: ${v}`)
  } catch (e) {
    // Deliberately non-fatal. See the failure policy in the header.
    console.log(`  WARN market-data unreachable (${e.message}) — keeping existing baked numbers.`)
    return 0
  }

  /* Override market-data's Finnhub headlines with the RSS aggregate. Kept
     deliberately non-fatal and deliberately AFTER the main fetch: if the news
     function is down, `data.news` still holds the Finnhub list and the page
     gets CNBC-heavy headlines rather than none. A degraded news block beats an
     empty one, and it beats failing a deploy over a headline feed. */
  if (sets.includes('news')) {
    try {
      const r = await fetch(`${NEWS_ENDPOINT}?limit=80`, { signal: AbortSignal.timeout(20000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const nd = await r.json()
      if (nd.errors) {
        for (const [k, v] of Object.entries(nd.errors)) console.log(`  feed warning [${k}]: ${v}`)
      }
      if (Array.isArray(nd.news) && nd.news.length) {
        data.news = nd.news
        const mix = Object.entries(nd.sources ?? {})
          .map(([k, v]) => `${k} ${v}`).join(', ')
        console.log(`  news: ${nd.news.length} items via market-news (${mix})`)
      } else {
        console.log('  WARN market-news returned nothing — keeping the Finnhub headlines.')
      }
    } catch (e) {
      console.log(`  WARN market-news unreachable (${e.message}) — keeping the Finnhub headlines.`)
    }
  }

  /* Same override pattern as news, same failure policy: if market-quotes cannot
     be reached, market-data's own quotes stay in `data` and the tape renders the
     old six symbols rather than nothing. A short tape is logged loudly because
     that is exactly the failure that went unnoticed before. */
  if (sets.includes('quotes')) {
    try {
      const r = await fetch(QUOTES_ENDPOINT, { signal: AbortSignal.timeout(20000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const qd = await r.json()
      if (qd.errors) {
        for (const [k, v] of Object.entries(qd.errors)) console.log(`  quote warning [${k}]: ${v}`)
      }
      if (Array.isArray(qd.quotes) && qd.quotes.length) {
        data.quotes = qd.quotes
        console.log(`  quotes: ${qd.returned}/${qd.requested} via market-quotes`)
        if (qd.returned < qd.requested) {
          console.log('  WARN the tape will be short — see the quote warnings above.')
        }
      } else {
        console.log('  WARN market-quotes returned nothing — keeping market-data quotes.')
      }
    } catch (e) {
      console.log(`  WARN market-quotes unreachable (${e.message}) — keeping market-data quotes.`)
    }
  }

  /* Same override pattern and same failure policy as news and quotes. The
     profile lookups make this the slowest of the three — allow it more time,
     and fall back to market-data's unfiltered calendar rather than failing the
     build over it. */
  if (sets.includes('earnings')) {
    /* ---- FINNHUB COOLDOWN — do not remove -----------------------------
       market-quotes and market-earnings both hit Finnhub, whose free tier
       allows 60 calls/minute. quotes can spend up to 24 (3 Finnhub symbols
       x 2 endpoints x 4 attempts, because it retries a 429 with backoff —
       the other eight cards are FRED and cost Finnhub nothing) and earnings wants
       37 more. Fired back to back that is ~73 in one minute, so whichever
       runs second gets 429s on most of its profile lookups and silently
       returns a short table. That is what produced a two-row earnings
       calendar, and the 13.7s market-quotes 502s in the edge logs are the
       same collision seen from the other side.
       Waiting is the correct fix rather than shrinking the tables: a daily
       cron does not care about 70 seconds, and a reader does care about a
       calendar with two rows in it. Set MARKET_NO_COOLDOWN=1 for local
       iteration when you do not need the earnings table to be complete. */
    if (!process.env.MARKET_NO_COOLDOWN) {
      const wait = 70000
      console.log(`  cooling down ${wait / 1000}s before earnings so Finnhub's rate window clears...`)
      await new Promise(r => setTimeout(r, wait))
    }
    try {
      /* ── STEP 1: THE WHOLE CALENDAR, UNFILTERED ──────────────────────────
         ONE Finnhub call, every symbol on it, no market caps attached. The
         size filter used to happen here, upstream, inside a budget that could
         only ever price 36 of them — see the CAP_TTL_DAYS note at the top of
         this file for why that made the filter a sample rather than a rule.

         days=3 forward, and market-earnings reaches four days back on its own,
         which is what covers a Saturday reporter from a Monday build. */
      const r = await fetch(`${EARNINGS_ENDPOINT}?raw=1&days=3`,
        { signal: AbortSignal.timeout(45000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const ed = await r.json()
      if (Array.isArray(ed.rows) && ed.rows.length) {
        const rawRows = ed.rows
        const todayET = ed.todayET ?? ET_TODAY
        const tomorrowET = etDayOffset(1)

        /* ── STEP 2: PRICE THE ONES NOBODY HAS EVER PRICED ────────────────
           Order matters more than the budget does. Unknown symbols come
           first, because an unknown symbol is a company that CANNOT appear on
           the page at all — we have no way to test it against the floor, so
           it is invisible rather than excluded. Only once every unknown has a
           price do stale entries get refreshed. Getting that order backwards
           is how you spend forty-five lookups re-pricing Apple. */
        const capCache = new Map(Object.entries(prevSnapshot?.capCache ?? {}))
        const capAge = (v) => {
          const t = Date.parse(v?.at ?? '')
          return Number.isFinite(t) ? (Date.now() - t) / 864e5 : Infinity
        }

        /* Today first, then tomorrow, then the days already reported, then
           anything further out — the same order the page reads in. Size
           breaks ties, so on a day with more unknowns than budget the ones a
           reader is most likely to be looking for get priced first. */
        const dayRank = (row) =>
          row.date === todayET ? 0 : row.date === tomorrowET ? 1 :
          String(row.date) < todayET ? 2 : 3
        const byPriority = (a, b) =>
          (dayRank(a) - dayRank(b)) ||
          ((b.revenueEstimate ?? 0) - (a.revenueEstimate ?? 0))

        const unpricedRows = rawRows.filter(x => !capCache.has(x.symbol)).sort(byPriority)
        const staleRows = rawRows
          .filter(x => capCache.has(x.symbol) && capAge(capCache.get(x.symbol)) > CAP_TTL_DAYS)
          .sort(byPriority)
        const wantCaps = [...unpricedRows, ...staleRows]
          .slice(0, CAP_LOOKUPS).map(x => x.symbol)

        let capsAdded = 0
        if (wantCaps.length) {
          /* Same 60/minute wall as everywhere else in this block. The raw call
             above cost one; this one costs up to 45. */
          if (!process.env.MARKET_NO_COOLDOWN) {
            console.log('  cooling down 70s before the market-cap lookups...')
            await new Promise(res => setTimeout(res, 70000))
          }
          try {
            const cr = await fetch(`${EARNINGS_ENDPOINT}?caps=${encodeURIComponent(wantCaps.join(','))}`,
              { signal: AbortSignal.timeout(60000) })
            if (cr.ok) {
              const cd = await cr.json()
              const stamp = new Date().toISOString()
              for (const [sym, v] of Object.entries(cd.caps ?? {})) {
                if (!Number.isFinite(v?.capM)) continue
                capCache.set(sym, { capM: v.capM, name: v.name ?? sym, exchange: v.exchange ?? '', at: stamp })
                capsAdded++
              }
              console.log(`  market caps: ${capsAdded} priced ` +
                          `(${unpricedRows.length} never seen, ${staleRows.length} over ${CAP_TTL_DAYS}d)`)
            } else {
              console.log(`  WARN caps lookup HTTP ${cr.status} — filtering on what the cache already holds.`)
            }
          } catch (e) {
            console.log(`  WARN caps lookup failed (${e.message}) — filtering on what the cache already holds.`)
          }
        }

        /* Prune symbols that have not been on a calendar in a long time, so
           the committed snapshot does not grow without bound. Anything the
           current window mentions is kept regardless of age. */
        const onCalendar = new Set(rawRows.map(x => x.symbol))
        for (const [sym, v] of capCache) {
          if (!onCalendar.has(sym) && capAge(v) > 180) capCache.delete(sym)
        }

        /* ── STEP 3: THE FILTER. ONE RULE, APPLIED HERE, TO EVERYTHING ────
           A symbol with no cached price is NOT excluded — it is unpriced, and
           it gets priced on a following build. The distinction matters enough
           to count and log, because "we checked and it is too small" and "we
           never checked" look identical on the page and are not the same
           thing. `unpriced` reaching zero is what "the list is complete"
           actually means. */
        const priced = rawRows.filter(x => capCache.has(x.symbol))
        const unpriced = rawRows.length - priced.length
        const big = priced
          .filter(x => capCache.get(x.symbol).capM >= EARNINGS_MIN_CAP_M)
          .map(x => ({
            ...x,
            name: capCache.get(x.symbol).name,
            marketCap: capCache.get(x.symbol).capM * 1e6,
          }))

        earningsCapCache = Object.fromEntries(capCache)

        /* From here down this is the pre-existing pipeline, unchanged in
           substance: `ed.kept`-shaped rows go into the watch list, past dates
           get their actuals chased, and the three buckets come out. The only
           difference is that `big` is now every company above the floor
           rather than the subset one invocation could afford to price. */
        const edKept = big.length
        const edChecked = priced.length
        const edConsidered = rawRows.length
        /* THE DAY BOUNDARY IS EASTERN, NOT UTC.
           `ed.today` was the function's UTC date, which between 19:00 and
           midnight Eastern is already TOMORROW. Bucketing on it meant that
           every evening the "today" tab emptied out and the after-close
           reporters — the ones a reader opens the page for — jumped straight
           to "just reported" hours before the day had actually ended.
           market-earnings v6 returns todayET; ET_TODAY is the local fallback
           for an older deployed function. */
        const today = todayET
        const tomorrow = tomorrowET
        const upcoming = big

        /* ---- THE REPORTED WEEK IS RECONSTRUCTED, NOT QUERIED --------------
           Finnhub's /calendar/earnings is forward-only on this plan. Asked for
           2026-07-26 it answered from 2026-08-03 and reported zero rows before
           today — proven by the diagnostics in market-earnings v4. There is no
           request that returns last week's calendar.
           So we remember instead. Every run appends the upcoming list to a
           watch list in the snapshot. Once a company's date has passed we ask
           market-earnings ?actuals= for that specific symbol, which DOES return
           the reported quarter. The past week is rebuilt from what we already
           saw coming.
           Consequence worth knowing: this starts empty and fills in over the
           following week. That is inherent to the approach, not a fault. */
        const watchPrev = (prevSnapshot?.earningsWatch ?? [])
        /* WATCH_DAYS, not 14. The watch list is now two jobs: it rebuilds the
           reported week, and it is the sample the scoreboard counts. A beat
           rate over 14 days is a fortnight's worth of companies, which in the
           thin weeks between seasons is a handful — enough to produce a
           headline percentage off six companies. Six weeks covers a reporting
           season, which is the period the number is actually about. The tabs
           are unaffected: "Just reported" cuts at REPORTED_DAYS below. */
        const horizon = etDayOffset(-WATCH_DAYS)

        const watch = new Map()
        for (const w of watchPrev) if (String(w.date) >= horizon) watch.set(w.symbol, w)
        for (const u of upcoming) {
          const prev = watch.get(u.symbol)
          watch.set(u.symbol, {
            symbol: u.symbol, name: u.name, date: u.date, hour: u.hour,
            epsEstimate: u.epsEstimate, revenueEstimate: u.revenueEstimate,
            marketCap: u.marketCap,

            /* ---- CAPTURE THE ACTUALS THE MOMENT THEY APPEAR --------------
               This is the only chance we get at actual REVENUE.

               market-earnings v6 passes through epsActual and revenueActual
               from the calendar row, which Finnhub fills in within the hour
               after a company reports. But the calendar is a moving window:
               once a date drops off the back of it, that row is gone, and the
               ?actuals= fallback returns EPS ONLY — Finnhub sells no revenue
               history on this plan. So a figure not saved on the day it
               appears is a figure we can never show again.

               Hence `??`, not plain assignment: a later run whose row has
               gone null must NOT wipe a value an earlier run already banked.
               That asymmetry is the whole point of these two lines. */
            epsActual: u.epsActual ?? prev?.epsActual ?? null,
            revenueActual: u.revenueActual ?? prev?.revenueActual ?? null,
            quarter: u.quarter ?? prev?.quarter ?? null,
            year: u.year ?? prev?.year ?? null,
          })
        }
        earningsWatch = [...watch.values()]

        /* Due = date has passed AND we still have no actual EPS for it. The
           second half is new and it is what makes hourly runs affordable:
           a company whose number we already banked from its calendar row
           needs no lookup at all, so the 20-symbol actuals budget is spent
           only on the genuine gaps. On a normal day that is a handful of
           symbols rather than twenty, and most runs skip the second Finnhub
           cooldown entirely.
           Largest first, because the budget is finite and a reader cares
           more about the big ones. */
        const chaseFloor = etDayOffset(-CHASE_DAYS)
        const due = earningsWatch
          .filter(w => String(w.date) < today && String(w.date) >= chaseFloor &&
                       typeof w.epsActual !== 'number')
          .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
          .slice(0, 20)

        /* Everything already resolved — banked from a calendar row on the day.
           These carry actual REVENUE, which the ?actuals= path cannot. */
        const alreadyResolved = earningsWatch
          .filter(w => String(w.date) < today && typeof w.epsActual === 'number')

        let reported = []
        if (due.length) {
          // Second cooldown, same reason: the calendar request above just spent
          // ~37 of the 60/minute allowance and the actuals lookup wants 20 more.
          if (!process.env.MARKET_NO_COOLDOWN) {
            console.log('  cooling down 70s before the actuals lookup...')
            await new Promise(r => setTimeout(r, 70000))
          }
          try {
            const ar = await fetch(
              `${EARNINGS_ENDPOINT}?actuals=${encodeURIComponent(due.map(d => d.symbol).join(','))}`,
              { signal: AbortSignal.timeout(45000) })
            if (ar.ok) {
              const ad = await ar.json()
              const bySym = new Map((ad.actuals ?? []).map(a => [a.symbol, a]))
              reported = due.map(w => {
                const a = bySym.get(w.symbol)
                if (!a) return null
                /* revenueActual stays whatever the watch list banked — which
                   is usually null on this path, because a symbol only reaches
                   here when no calendar row was ever caught for it. Never
                   overwrite it with null; see the watch-list note above. */
                return { ...w, epsActual: a.epsActual, epsEstimate: a.epsEstimate ?? w.epsEstimate,
                         revenueActual: w.revenueActual ?? null,
                         quarter: a.quarter ?? w.quarter, year: a.year ?? w.year }
              }).filter(Boolean)
              console.log(`  earnings actuals: ${reported.length} of ${due.length} unresolved symbols looked up`)
            } else {
              console.log(`  WARN actuals lookup HTTP ${ar.status} — reported tab left empty this run.`)
            }
          } catch (e) {
            console.log(`  WARN actuals lookup failed (${e.message}) — reported tab left empty this run.`)
          }
        }

        /* Rows banked from a calendar row need no lookup and are strictly
           better than a looked-up row, because they carry actual revenue.
           Merge them in, newest date first, and de-duplicate on symbol in
           case a symbol somehow landed in both lists. */
        const bySymReported = new Map()
        for (const r of [...alreadyResolved, ...reported]) {
          const prev = bySymReported.get(r.symbol)
          // Prefer whichever row actually has revenue.
          if (!prev || (prev.revenueActual == null && r.revenueActual != null)) {
            bySymReported.set(r.symbol, r)
          }
        }
        reported = [...bySymReported.values()]
          .sort((a, b) => String(b.date).localeCompare(String(a.date)) ||
                          ((b.marketCap || 0) - (a.marketCap || 0)))

        /* BANK THE LOOKED-UP ACTUALS. Added 2026-08-11, and it is the whole
           reason the "just reported" tab had a ceiling.

           earningsWatch is assembled above, BEFORE the ?actuals= lookup, and
           it was snapshotted in that state. So every EPS the lookup resolved
           rendered once and was then thrown away: the same symbols came back
           `due` on the next run, spent the 20-symbol budget again, and never
           accumulated. Measured on 2026-08-11, 43 of the 69 past-dated rows in
           a 96-row watch list had no actual — and the 26 that did were ALL
           banked from calendar rows (they carry revenue), not one from the
           lookup path. The budget was not the ceiling; the discard was.

           Merge in place, and never overwrite a value we already hold: a
           calendar-banked row carries actual REVENUE, which the ?actuals= path
           cannot return, so it is strictly the better row. */
        const banked = new Map(earningsWatch.map(w => [w.symbol, w]))
        for (const r of reported) {
          const w = banked.get(r.symbol)
          if (!w || typeof r.epsActual !== 'number' || typeof w.epsActual === 'number') continue
          banked.set(r.symbol, {
            ...w,
            epsActual: r.epsActual,
            epsEstimate: r.epsEstimate ?? w.epsEstimate,
            revenueActual: w.revenueActual ?? r.revenueActual ?? null,
            quarter: r.quarter ?? w.quarter,
            year: r.year ?? w.year,
          })
        }
        earningsWatch = [...banked.values()]

        /* ── YEAR-OVER-YEAR EPS GROWTH, ONE LOOKUP PER COMPANY PER QUARTER ──
           Cached on symbol AND reported quarter, so a company is looked up once
           after it reports and never again for that quarter. That is what keeps
           this affordable: the cost is proportional to companies reporting
           today, not to companies in the watch list.

           A miss is cached as a miss (`pct: null`) for the same reason a
           below-floor market cap is cached — re-asking a question we already
           got no answer to is the purest waste of the budget there is. It
           expires with the quarter like everything else here. */
        const growthCache = new Map(Object.entries(prevSnapshot?.growthCache ?? {}))
        const gKey = (w) => `${w.symbol}:${w.year ?? '?'}Q${w.quarter ?? '?'}`
        const reportedThisSeason = earningsWatch
          .filter(w => String(w.date) < today && typeof w.epsActual === 'number')

        const wantGrowth = reportedThisSeason
          .filter(w => !growthCache.has(gKey(w)))
          .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
          .slice(0, GROWTH_LOOKUPS)

        if (wantGrowth.length) {
          if (!process.env.MARKET_NO_COOLDOWN) {
            console.log('  cooling down 70s before the growth lookup...')
            await new Promise(res => setTimeout(res, 70000))
          }
          try {
            const gr = await fetch(
              `${EARNINGS_ENDPOINT}?growth=${encodeURIComponent(wantGrowth.map(w => w.symbol).join(','))}`,
              { signal: AbortSignal.timeout(60000) })
            if (gr.ok) {
              const gd = await gr.json()
              /* Printed every run on purpose. Finnhub's Basic Financials key
                 names are not stably documented, and if /stock/metric is
                 premium on this key this line is how you find out — it will
                 read `undefined` and the scoreboard's third tile will simply
                 not render. Nothing breaks; the number is absent, which is the
                 house rule for a figure we do not have. */
              console.log(`  growth fields Finnhub returned: ${JSON.stringify(gd.growthKeys)}`)
              const stamp = new Date().toISOString()
              let got = 0
              for (const w of wantGrowth) {
                const g = gd.growth?.[w.symbol]
                const pct = Number.isFinite(g?.epsGrowthQuarterlyYoy) ? g.epsGrowthQuarterlyYoy
                          : Number.isFinite(g?.epsGrowthTTMYoy) ? g.epsGrowthTTMYoy
                          : null
                if (pct !== null) got++
                growthCache.set(gKey(w), { pct, at: stamp })
              }
              console.log(`  eps growth: ${got} of ${wantGrowth.length} companies resolved`)
            } else {
              console.log(`  WARN growth lookup HTTP ${gr.status} — scoreboard uses what is cached.`)
            }
          } catch (e) {
            console.log(`  WARN growth lookup failed (${e.message}) — scoreboard uses what is cached.`)
          }
        }

        /* Drop cache entries for quarters nobody in the watch list is in any
           more, so this does not accumulate a year of dead keys. */
        const liveKeys = new Set(earningsWatch.map(gKey))
        for (const k of growthCache.keys()) if (!liveKeys.has(k)) growthCache.delete(k)
        earningsGrowthCache = Object.fromEntries(growthCache)

        /* ── THE SCOREBOARD ───────────────────────────────────────────────
           Three numbers computed from OUR OWN TALLY, which is what the page
           has to say next to them. This is not the S&P 500 figure FactSet
           publishes and it must never be labelled as one: index earnings
           growth is aggregate dollar earnings, share-count weighted and
           divisor-adjusted, and no arrangement of the data on this plan
           produces it. What we have is every company over $2B that reported
           in the last WATCH_DAYS days. That is a real, statable population,
           and stating it is the whole difference between a fact and a fake.

           MEDIAN, not mean, for both percentage figures. A surprise expressed
           as a percentage of the estimate goes to infinity as the estimate
           approaches zero — a company expected to earn $0.01 that earns $0.05
           is "+400%" — and one such company drags any average it touches.
           Rows with an estimate under 10c are excluded from the percentage
           entirely for the same reason, and the count that survives is shown
           so a reader can see how many companies the number rests on. */
        const scored = reportedThisSeason
          .filter(w => typeof w.epsEstimate === 'number')
        const IN_LINE = 0.005
        const beats = scored.filter(w => w.epsActual - w.epsEstimate > IN_LINE).length
        const misses = scored.filter(w => w.epsEstimate - w.epsActual > IN_LINE).length
        const inLine = scored.length - beats - misses

        const median = (xs) => {
          if (!xs.length) return null
          const s = [...xs].sort((a, b) => a - b)
          const m = s.length >> 1
          return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
        }
        const surprisePcts = scored
          .filter(w => Math.abs(w.epsEstimate) >= 0.10)
          .map(w => ((w.epsActual - w.epsEstimate) / Math.abs(w.epsEstimate)) * 100)
        const growthPcts = reportedThisSeason
          .map(w => growthCache.get(gKey(w))?.pct)
          .filter(v => Number.isFinite(v))

        data.earningsScore = scored.length ? {
          companies: scored.length,
          beats, misses, inLine,
          beatRate: (beats / scored.length) * 100,
          surpriseMedian: median(surprisePcts),
          surpriseSample: surprisePcts.length,
          growthMedian: median(growthPcts),
          growthSample: growthPcts.length,
          days: WATCH_DAYS,
          minCapM: EARNINGS_MIN_CAP_M,
        } : null

        /* THE THREE BUCKETS THE PAGE ACTUALLY RENDERS.
           Boundaries are Eastern dates (see `today` above). A company stays in
           `today` for the whole Eastern day even after it has reported — its
           actual EPS and revenue simply fill in beside the estimate — and only
           falls through to `reported` when the date itself has passed. That is
           the behaviour the page promises in its own copy: "everything drops
           into Just reported at the end of the day."

           TODAY AND TOMORROW COME FROM THE WATCH LIST, NOT FROM THIS RUN'S
           CALENDAR. That is the other half of the stability fix. `upcoming` is
           what this build happened to see and price; the watch list is
           everything we have EVER seen and priced inside the window, refreshed
           with this run's rows. Bucketing the watch list means a company does
           not vanish from Today because one build's lookups went elsewhere or
           one calendar response came back short. A moved date still propagates
           — the watch entry is overwritten with the newest row every run. */
        const reportedFloor = etDayOffset(-REPORTED_DAYS)
        data.earnings = {
          today: earningsWatch.filter(r => String(r.date) === today),
          tomorrow: earningsWatch.filter(r => String(r.date) === tomorrow),
          reported: reported.filter(r => String(r.date) >= reportedFloor),
        }
        const withRev = data.earnings.reported.filter(r => typeof r.revenueActual === 'number').length
        console.log(`  earnings: ${edKept} companies over $${EARNINGS_MIN_CAP_M}M ` +
                    `(ET ${today}: ${data.earnings.today.length} today, ` +
                    `${data.earnings.tomorrow.length} tomorrow, ` +
                    `${data.earnings.reported.length} reported of which ${withRev} with actual revenue, ` +
                    `watch list ${earningsWatch.length}, priced ${edChecked} of ${edConsidered}` +
                    `${unpriced ? `, ${unpriced} STILL UNPRICED` : ', full coverage'})`)
        if (data.earningsScore) {
          const s = data.earningsScore
          console.log(`  scoreboard: ${s.beatRate.toFixed(0)}% beat over ${s.companies} companies, ` +
                      `median surprise ${s.surpriseMedian === null ? 'n/a' : s.surpriseMedian.toFixed(1) + '%'} ` +
                      `(n=${s.surpriseSample}), median YoY growth ` +
                      `${s.growthMedian === null ? 'n/a' : s.growthMedian.toFixed(1) + '%'} (n=${s.growthSample})`)
        }
      } else {
        console.log('  WARN market-earnings returned nothing — keeping market-data earnings.')
      }
    } catch (e) {
      console.log(`  WARN market-earnings unreachable (${e.message}) — keeping market-data earnings.`)
    }
  }

  /* Sector returns live entirely in market-sectors — there is nothing in
     market-data to fall back to, so a failure here means the page keeps its
     previously baked table. Which is the right outcome: ten-year returns do not
     change meaningfully between builds. */
  if (live.some(p => p.present.includes('sectorReturns'))) {
    try {
      const r = await fetch(SECTORS_ENDPOINT, { signal: AbortSignal.timeout(30000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const sd = await r.json()
      if (sd.errors) {
        for (const [k, v] of Object.entries(sd.errors)) console.log(`  sector warning [${k}]: ${v}`)
      }
      if (Array.isArray(sd.sectors) && sd.sectors.length) {
        data.sectorReturns = sd
        console.log(`  sectors: ${sd.sectors.length} sectors + benchmark, ${sd.basis}`)
      } else {
        console.log('  WARN market-sectors returned nothing — keeping the baked table.')
      }
    } catch (e) {
      console.log(`  WARN market-sectors unreachable (${e.message}) — keeping the baked table.`)
    }
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const flat = flatten(data)

  // Already read at the top of main() — reusing it rather than re-reading,
  // which also guarantees the diff and the earnings carry-forward are looking
  // at the same snapshot.
  const prev = prevSnapshot
  const diff = buildDiff(flat, prev, stamp)

  let stale = false
  for (const p of live) {
    let html = p.html
    for (const n of p.present) {
      const sec = p.sections[n]
      const inner = sec.diff ? sec.render(diff) : sec.render(data[sec.set])
      if (!inner) { console.log(`  skip ${p.file} → ${n}: nothing usable returned`); continue }
      const r = replaceBlock(html, n, inner)
      html = r.html
      if (r.changed) { stale = true; console.log(`  ${checkOnly ? 'STALE' : 'updated'}: ${p.file} → ${n}`) }
    }
    if (p.hasStamp) {
      const s = replaceBlock(html, 'stamp', `<time datetime="${stamp}">${stamp}</time>`)
      if (s.found) html = s.html
    }
    if (!checkOnly && html !== p.html) writeFileSync(p.path, html, 'utf8')
  }

  if (checkOnly) {
    if (stale) { console.error('  market data is stale — run: node tools/inject-market-data.mjs'); return 1 }
    console.log('  market data current.')
    return 0
  }

  // Snapshot LAST, and only on a real write. Writing it in --check mode would
  // consume the diff and the next real build would report "nothing changed".
  /* earningsWatch is what makes the "just reported" tab possible at all — see
     the carry-forward note above. If this run's earnings fetch failed it stays
     null, and we keep the previous list rather than wiping a week of
     accumulated history over one bad request. */
  /* bakedAt is the deploy's age signal, added 2026-08-11. `stamp` is a DATE and
     is consumed by the what-changed diff, so it cannot double as a clock. The
     deploy used to age the snapshot by its file mtime instead, which is wrong
     on the authoring machine specifically: the working folder lives in OneDrive
     and OneDrive rewrites mtimes wholesale when it re-materialises a folder, so
     every file in the repo can carry this morning's timestamp over data that is
     days old. deploy-site.ps1 step 3b reads this field and re-bakes when it is
     older than -MarketMaxAgeHours. Keep it ISO 8601 and keep it UTC. */
  writeFileSync(SNAPSHOT, JSON.stringify({
    stamp,
    bakedAt: new Date().toISOString(),
    figures: flat,
    earningsWatch: earningsWatch ?? prev?.earningsWatch ?? [],
    /* The market-cap cache — the file's largest field, and the reason the $2B
       filter is a rule rather than a sample. See CAP_TTL_DAYS at the top of
       this file before trimming it: an empty cache means the next several
       builds show an incomplete calendar while it refills. */
    capCache: earningsCapCache ?? prev?.capCache ?? {},
    growthCache: earningsGrowthCache ?? prev?.growthCache ?? {},
  }, null, 2), 'utf8')
  console.log(`  ${live.length} page(s) baked, ${diff ? diff.rows.length : 0} change(s) reported since ${prev?.stamp ?? 'first run'}.`)
  return 0
}

// NOT process.exit(). That kills the process while undici's keep-alive sockets
// are still open, and libuv asserts on Windows:
//   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c:94
// The work was already finished when this fired - the crash was purely on
// teardown, but it still aborted the whole deploy. Set the code and let the
// event loop drain on its own.
process.exitCode = await main()
