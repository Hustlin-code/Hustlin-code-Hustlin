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
   The list changed to nine cross-asset symbols (indexes, the 10-year, gold, oil,
   copper, bitcoin), and market-data's quotes builder drops a symbol silently
   when its upstream call fails — on 2026-08-02 that rendered a six-card tape as
   two cards with nothing anywhere saying why. market-quotes reports failures per
   symbol instead.
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

/* Sector total returns at six horizons, from Yahoo monthly adjusted closes.
   Not available from market-data at all — Finnhub's free tier dropped
   historical candles, so 3Y/5Y/10Y cannot be computed from it. */
const SECTORS_ENDPOINT = process.env.MARKET_SECTORS_ENDPOINT
  || ENDPOINT.replace(/\/market-data$/, '/market-sectors')

/* Sets served by a market-* function other than market-data. They must not be
   included in the market-data request — it does not know them and there is no
   sense asking. */
const LOCAL_SETS = new Set(['sectorReturns'])

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
    inflation, rates, labour and the household block are visually one system
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
    caption does the heavy lifting: this is a textbook generalisation about
    average behaviour across many cycles, and stating it without that caveat
    would be the single most misleading thing on the page. */
const CYCLE_LABEL = {
  early: 'Early expansion', mid: 'Mid cycle',
  late: 'Late cycle', recession: 'Defensive',
}

function renderSectorsCycle(rows) {
  if (!rows?.length) return ''
  return `<table class="mkt-table">
      <caption class="mkt-table-cap">Sector ETFs ranked by today's move, with the phase each has <em>historically tended</em> to lead in. That last column is a long-run generalisation across many cycles, not a claim about this one &mdash; sectors regularly lead out of turn, and one day's move tells you nothing about a phase.</caption>
      <thead><tr><th scope="col">Sector</th><th scope="col">ETF</th><th scope="col">Today</th><th scope="col">Historically leads</th></tr></thead>
      <tbody>
${rows.map(r => `        <tr><th scope="row">${esc(r.name)}</th><td>${esc(r.symbol)}</td><td class="${(r.changePct ?? 0) >= 0 ? 'up' : 'down'}" data-fill="sector-${esc(r.symbol)}">${esc(r.display)}</td><td>${esc(CYCLE_LABEL[r.cycle] ?? '—')}</td></tr>`).join('\n')}
      </tbody>
    </table>`
}

/* Index quotes. Baked rather than left to the TradingView ticker alone, because
   the ticker is an iframe — a crawler sees nothing there. These are ETFs, not the
   indexes themselves: SPY not ^GSPC. Finnhub's free tier does not carry index
   symbols, and an ETF is what a reader would actually buy anyway. */
function renderQuotes(rows) {
  if (!rows?.length) return ''
  return `<div class="mkt-quote-row">
${rows.map(r => {
  const up = (r.changePct ?? 0) >= 0
  return `      <article class="mkt-quote ${up ? 'up' : 'down'}">
        <h3 class="mkt-quote-name">${esc(r.name)}</h3>
        <p class="mkt-quote-px" data-fill="q-${esc(r.symbol)}">${esc(r.display)}</p>
        <p class="mkt-quote-chg">${esc(r.pctDisplay)}</p>
        <p class="mkt-quote-sym">${esc(r.symbol)} · day range ${esc((r.low ?? 0).toFixed(2))}–${esc((r.high ?? 0).toFixed(2))}</p>
      </article>`
}).join('\n')}
</div>`
}

/* Headlines. Summaries are truncated hard: the point is to send the reader to
   the source, not to republish someone else's article on your domain. Reposting
   full summaries at scale is both a copyright question and a thin-content one. */
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
  const sum = clip(n.summary, 150)
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
function renderEarnings(rows) {
  if (!rows?.length) return ''

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
  const day = (iso) => {
    if (!iso) return '—'
    const [y, m, d] = iso.split('-')
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${Number(d)} ${names[Number(m) - 1] ?? ''}`
  }
  /* Two links per company, because they answer different questions.

     PRESS RELEASE (Yahoo Finance). The company's own announcement, in full, as
     it went out on the wire — the headline numbers, the quotes from management,
     the guidance. This is what a reader actually wants and it is free with no
     account.

     Not Seeking Alpha, which was the original request: SA now puts most symbol
     pages behind a registration wall, and shipping a link a reader cannot open
     is the exact thing that got Bloomberg dropped from the news feed. Not a
     newswire either — Business Wire, PR Newswire and GlobeNewswire each carry
     only their own clients, so no single wire covers every ticker. Verified
     while building this: GlobeNewswire has no Apple releases at all, because
     Apple uses Business Wire.

     SEC 8-K. The same release as filed with the regulator, where it is attached
     as Exhibit 99.1. Uglier to read and slower to appear, but it is the legal
     document rather than a portal's copy of it, it is never going to paywall,
     and it sits next to every other filing the company has made. Kept as the
     second link for anyone who wants the primary source. */
  const presser = (sym) =>
    'https://finance.yahoo.com/quote/' + encodeURIComponent(sym) + '/press-releases/'

  const edgar = (sym) =>
    'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=' +
    encodeURIComponent(sym) + '&type=8-K&dateb=&owner=include&count=40'

  /* The filter explanation is a <p> BEFORE the table, not a <caption>.
     A caption is sized against the table box rather than the page, and a long
     one collapses into a narrow column of clipped text — which is exactly what
     it did on 2026-08-02. Captions are for a line or two; this is a paragraph,
     so it lives outside the table where normal block layout applies. */
  return `<div class="mkt-filter-note">
      <p><strong>How this list is filtered, so you know what is missing.</strong> Around 1,500 US companies report in any given week. This shows only those worth more than $2 billion, soonest first and largest first within a day &mdash; because a company below that size can double or halve on its results without moving an index, a sector, or anything you are likely to hold.</p>
      <p>That is an editorial choice rather than a judgement about those businesses, and it does mean genuinely interesting small companies are missing from this table. The estimates are what analysts expect: a forecast, not a target the company agreed to. <strong>Release</strong> is the company's own press release in full; <strong>SEC</strong> is that same release as filed with the regulator.</p>
    </div>
    <table class="mkt-table">
      <thead><tr><th scope="col">Company</th><th scope="col">Date</th><th scope="col">When</th><th scope="col">Market cap</th><th scope="col">EPS est.</th><th scope="col">Revenue est.</th><th scope="col">Read it</th></tr></thead>
      <tbody>
${rows.slice(0, 25).map(r => `        <tr>
          <th scope="row">${esc(r.symbol)}${r.name && r.name !== r.symbol ? `<span class="mkt-co">${esc(r.name)}</span>` : ''}</th>
          <td>${esc(day(r.date))}</td>
          <td>${esc(when[r.hour] ?? '—')}</td>
          <td>${esc(cap(r.marketCap))}</td>
          <td>${typeof r.epsEstimate === 'number' ? esc('$' + r.epsEstimate.toFixed(2)) : '—'}</td>
          <td>${esc(money(r.revenueEstimate))}</td>
          <td class="mkt-rel"><a href="${esc(presser(r.symbol))}" target="_blank" rel="noopener nofollow">Release &rarr;</a><a class="sec" href="${esc(edgar(r.symbol))}" target="_blank" rel="noopener">SEC</a></td>
        </tr>`).join('\n')}
      </tbody>
    </table>`
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
  const label = { calm: 'Not flashing', watch: 'Grey zone', alert: 'Flashing' }
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

function flatten(data) {
  const out = {}
  for (const set of ['macro', 'growth', 'inflation', 'rates', 'labor', 'consumer']) {
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
      // Reads the same 'news' set as the block above — two markers sharing one
      // set costs one request, not two.
      earningsNews: { set: 'news', render: renderEarningsNews },
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
    },
  },
  {
    file: 'markets-behavior.html',
    sections: {
      behavMood:   { set: 'mood',   render: renderMood },
      behavQuotes: { set: 'quotes', render: renderQuotes },
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
    try {
      const r = await fetch(`${EARNINGS_ENDPOINT}?minCapM=${EARNINGS_MIN_CAP_M}`,
        { signal: AbortSignal.timeout(45000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const ed = await r.json()
      if (Array.isArray(ed.earnings) && ed.earnings.length) {
        data.earnings = ed.earnings
        console.log(`  earnings: ${ed.kept} companies over $${EARNINGS_MIN_CAP_M}M ` +
                    `(checked ${ed.checked} of ${ed.considered} reporting ${ed.from} → ${ed.to})`)
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

  let prev = null
  try { if (existsSync(SNAPSHOT)) prev = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) } catch { /* first run */ }
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
  writeFileSync(SNAPSHOT, JSON.stringify({ stamp, figures: flat }, null, 2), 'utf8')
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
