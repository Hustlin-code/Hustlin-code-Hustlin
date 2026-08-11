/**
 * =============================================================================
 *  build-charts.mjs — bake our own charts into the pages, as inline SVG
 * =============================================================================
 *
 *  WHY THIS EXISTS
 *
 *  The Dow module in Stage 5 used a TradingView widget pointed at DJ:DJI. That
 *  symbol needs a TradingView subscription, so what actually rendered for a
 *  reader was an error card with a flying saucer on it — in the one module
 *  whose entire argument IS the chart.
 *
 *  Swapping in a different widget would have fixed the saucer and kept the
 *  real problem. inject-market-data.mjs already spells that problem out at the
 *  top of its own file: iframe content is attributed to the third party, not to
 *  hustlin.org, so a chart in an iframe is a chart Google credits to somebody
 *  else. It also cannot render with the network down, shifts layout while it
 *  loads, and hands a tracker to every reader.
 *
 *  So we draw it ourselves, at build time, as inline SVG. The file that ships
 *  already contains the chart. No fetch, no iframe, no layout shift, no
 *  third-party anything. It renders on a phone in a basement.
 *
 *  HOW IT WORKS — same marker discipline as inject-market-data.mjs
 *
 *      <!-- CHART:djia:START -->  ...generated...  <!-- CHART:djia:END -->
 *
 *  Everything between the markers is replaced. Everything outside is never
 *  touched, so the surrounding copy is safe.
 *
 *  WHERE THE DATA COMES FROM
 *
 *  Two halves, deliberately:
 *
 *    History   tools/series/<id>.json — committed, sourced, and stable. The
 *              Dow's 1932 close is not going to be revised. Fetching 130 years
 *              of history on every build would be slow, fragile and pointless.
 *
 *    Latest    tools/.market-snapshot.json — the same snapshot the Markets
 *              pages bake from, refreshed hourly by the GitHub Action. If it
 *              carries a figure for this series, the chart's final point is
 *              that live level and the caption says so.
 *
 *  If the snapshot has no figure for the series, the chart ends at the last
 *  completed year and says "year-end close" instead. That is a fallback, not a
 *  failure: a chart of 130 years is not wrong because today's tick is missing.
 *
 *  ADDING THE LIVE POINT FOR DJIA
 *  The snapshot carries 35 figures and no equity index level. Add `djia` to
 *  FRED_SERIES in supabase/functions/market-data/index.ts (series id DJIA,
 *  freq 'd', fmt 'idx2'), expose it in a group, and request that group from
 *  inject-market-data.mjs. This script picks it up automatically the moment
 *  the key exists — no change needed here.
 *
 *  USAGE
 *      node tools/build-charts.mjs           write
 *      node tools/build-charts.mjs --check   verify only, exit 1 if stale
 *
 *  Idempotent. Re-running changes nothing if nothing changed, which is what
 *  lets --check mean something in the deploy gate.
 *
 *  RUN IT BEFORE build-public-stages.mjs. This edits the masters in
 *  "Financial Literacy Course/"; that script regenerates the public copies at
 *  the site root from them. Run it the other way round and the public copy
 *  keeps yesterday's chart.
 * =============================================================================
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT  = join(dirname(fileURLToPath(import.meta.url)), '..')
const CHECK = process.argv.includes('--check')

const R = p => readFileSync(join(ROOT, p), 'utf8')
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/* ---------------------------------------------------------------- palette --
   Matches the site's gold. Written as literals, not CSS variables: this SVG
   is also served inside learn.html, where the course stylesheet is scoped
   differently, and a chart that renders black-on-black in one of the two
   places is worse than one that ignores theming in both. */
const C = {
  ink:   '#0B0D12',
  panel: '#131722',
  rule:  'rgba(255,255,255,.09)',
  mute:  'rgba(255,255,255,.42)',
  soft:  'rgba(255,255,255,.62)',
  gold:  '#F5C520',
  deep:  '#B8930F',
  warn:  '#E4574C'
}

const C_WARN = '#E4574C'
const C_GOLD = '#F5C520'

/* ------------------------------------------------------------- the charts --
   `events` are the moments the copy talks about. They are annotated on the
   line because "every crash looks small from far enough out" is an argument
   you have to be able to SEE, and an unlabelled line does not make it. */
const CHARTS = {
  djia: {
    series: 'djia-annual',
    title: 'Dow Jones Industrial Average — every year since 1896',
    live: 'djia',
    caption: 'Log scale. On a log scale equal vertical distances are equal ' +
             'percentage moves, which is the only honest way to draw 130 years ' +
             'of compounding on one screen.',
    events: [
      { year: 1929, label: '1929 crash',   lift: 96 },
      { year: 1932, label: '1932 bottom',  lift: 30, below: true },
      { year: 1987, label: 'Black Monday', lift: 78 },
      { year: 2000, label: 'Dot-com',      lift: 30 },
      { year: 2008, label: '2008',         lift: 64 },
      /* COVID sits below the line on purpose. It is the last event on the
         chart and the final value label always sits above the last point, so
         lifting this one collides with it — and the collision moves every
         time the live level changes. Below is the only stable side. */
      { year: 2020, label: 'COVID',        lift: 46, below: true }
    ]
  },

  /* ---------------------------------------------------------------- reverse
     No historical series behind this one — it is pure arithmetic, computed
     here so the figures in the chart and the figures in the prose can never
     drift apart.

     WHY THESE NUMBERS AND NOT BIGGER ONES. The temptation is $300 a month for
     thirty years, because at 22% that reaches eleven million dollars and looks
     devastating. It is also nonsense: no issuer lets a balance run untouched
     for thirty years, and a reader who senses they are being played stops
     trusting the rest of the page. $5,000 over ten years is a thing that
     genuinely happens to people, and $36,975 against $12,969 makes the point
     without needing to be exaggerated.

     The 22.15% is the Federal Reserve's Q2 2026 rate on accounts ASSESSED
     INTEREST — cards actually carrying a balance — not the headline average
     across all accounts, which is dragged down by people who pay in full and
     is the wrong number for a module about carrying debt. */
  reverse: {
    kind: 'growth',
    title: 'The same $5,000, ten years, in both directions',
    principal: 5000,
    years: 10,
    liveRate: 'cardApr',
    lines: [
      { key:'debt',  rate: 0.2215, color: C_WARN, label: 'Owed on a card at 22.15%' },
      { key:'asset', rate: 0.10,   color: C_GOLD, label: 'Owned in the market at 10%' }
    ],
    caption: 'Same formula, same starting amount, same ten years. The only ' +
             'difference is the rate and which side of it you are standing on. ' +
             'The card rate is the Federal Reserve figure for accounts actually ' +
             'carrying a balance; 10% is the long-run nominal return on the ' +
             'broad US market, before inflation.'
  },

  /* ---------------------------------------------------------------- chances
     One working life, drawn twice on the same axis.

     The top half is forty calendar-year returns as bars. The bottom half is
     the same forty years as a rail, carrying every 20%+ bear market and the
     gap in years between them.

     WHY BOTH HALVES ARE ON ONE CHART. The module makes two claims that only
     land together. The bars say returns are lumpy — the "average" year almost
     never happens, and a handful of years carry the whole result. The rail
     says the crashes people wait for are rare — five in forty years, with
     twelve-year gaps. Split across two figures a reader takes them as two
     facts. On one axis they are visibly the same fact: you cannot be present
     for the few years that matter if you are sitting out waiting for a rail
     marker that comes five times in a working life.

     DO NOT ADD A SIXTH BEAR. 1990 (-19.9%), 1998 (-19.3%), 2011 (-19.4%),
     2018 (-19.8%) and 2025 (-18.9%) all stopped short of 20% on a closing
     basis. Rounding any of them up would inflate the headline count the whole
     module rests on. They are listed as near misses in the series file and in
     the prose, which is where they belong. */
  chances: {
    kind: 'lifetime',
    series: 'sp500-chances',
    title: 'Forty years, one working life: every return and every bear market',
    caption: 'Bars are calendar-year total return on the S&P 500, dividends ' +
             'reinvested, 1986 to 2025. The rail below is the same forty years, ' +
             'marking every peak-to-trough fall of 20% or more on a closing ' +
             'basis, with the wait between them. Returns from NYU Stern ' +
             '(Damodaran, January 2026); bear market dates from S&P 500 closing ' +
             'prices. Nominal, before tax and fees. Past performance does not ' +
             'guarantee future results.'
  }
}

/* ------------------------------------------------------------------ live --- */
function liveFigure(key) {
  if (!key) return null
  const p = join(ROOT, 'tools/.market-snapshot.json')
  if (!existsSync(p)) return null
  try {
    const snap = JSON.parse(readFileSync(p, 'utf8'))
    const f = snap?.figures?.[key]
    if (!f || typeof f.value !== 'number' || !isFinite(f.value)) return null
    return { value: f.value, date: f.date || snap.stamp || null }
  } catch { return null }
}

/* ------------------------------------------------------------------- svg --- */
const W = 880, H = 400
const PAD = { t: 20, r: 18, b: 34, l: 58 }
const PW = W - PAD.l - PAD.r
const PH = H - PAD.t - PAD.b

const comma = n => Math.round(n).toLocaleString('en-US')

function renderSvg(chart, points, live) {
  const data = points.slice()
  if (live) data.push([null, live.value])          // null year = "today"

  const vals = data.map(d => d[1])
  const lo = Math.min(...vals) * 0.82
  const hi = Math.max(...vals) * 1.30
  const l10 = Math.log10.bind(Math)

  const x = i => PAD.l + (i / (data.length - 1)) * PW
  const y = v => PAD.t + PH - ((l10(v) - l10(lo)) / (l10(hi) - l10(lo))) * PH

  const at = yr => data.findIndex(d => d[0] === yr)

  /* gridlines on powers of ten — the natural rungs of a log axis */
  let grid = ''
  for (let p = 1; p <= 5; p++) {
    const v = Math.pow(10, p)
    if (v < lo || v > hi) continue
    const gy = y(v).toFixed(1)
    grid += `<line x1="${PAD.l}" y1="${gy}" x2="${W - PAD.r}" y2="${gy}" stroke="${C.rule}" stroke-width="1"/>` +
            `<text x="${PAD.l - 9}" y="${(+gy + 3.5).toFixed(1)}" text-anchor="end" font-size="10.5" fill="${C.mute}" font-family="'Space Mono',monospace">${comma(v)}</text>`
  }

  /* decade ticks */
  let ticks = ''
  for (let yr = 1900; yr <= 2020; yr += 20) {
    const i = at(yr)
    if (i < 0) continue
    ticks += `<text x="${x(i).toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="10.5" fill="${C.mute}" font-family="'Space Mono',monospace">${yr}</text>`
  }

  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[1]).toFixed(1)}`).join('')
  const area = `${line}L${x(data.length - 1).toFixed(1)},${(PAD.t + PH).toFixed(1)}L${PAD.l},${(PAD.t + PH).toFixed(1)}Z`

  /* annotations
     The lift is a preference, not a promise. On a log axis the later events
     sit high, so an unclamped lift walks 2008 and COVID clean off the top of
     the viewBox — which is invisible in the generated HTML and only shows up
     as a missing label in the browser. Clamp to the plot band, and keep the
     floor above the year row so "1932 bottom" cannot land on top of "1940". */
  const TOP = PAD.t + 12
  const BOT = PAD.t + PH - 10
  let marks = ''
  for (const e of chart.events) {
    const i = at(e.year)
    if (i < 0) continue
    const px = x(i), py = y(data[i][1])
    const ly = Math.max(TOP, Math.min(BOT, e.below ? py + e.lift : py - e.lift))
    const anchor = px > W - 120 ? 'end' : px < 110 ? 'start' : 'middle'
    marks +=
      `<line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${px.toFixed(1)}" y2="${ly.toFixed(1)}" stroke="${C.warn}" stroke-width="1" stroke-dasharray="2 3" opacity=".65"/>` +
      `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3" fill="${C.warn}"/>` +
      `<text x="${px.toFixed(1)}" y="${(e.below ? ly + 11 : ly - 5).toFixed(1)}" text-anchor="${anchor}" font-size="10.5" fill="${C.soft}" font-family="'Space Mono',monospace">${esc(e.label)}</text>`
  }

  /* the last point gets a dot and a value, because it is the number the
     reader came for */
  const li = data.length - 1
  const lx = x(li), ly = y(data[li][1])
  const lastLabel = comma(data[li][1])
  marks +=
    `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4.5" fill="${C.gold}"/>` +
    `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="9" fill="none" stroke="${C.gold}" stroke-width="1" opacity=".4"/>` +
    `<text x="${(lx - 10).toFixed(1)}" y="${(ly - 12).toFixed(1)}" text-anchor="end" font-size="13" font-weight="700" fill="${C.gold}" font-family="'Space Mono',monospace">${lastLabel}</text>`

  const first = points[0], lastPt = data[li]
  const growth = Math.round((lastPt[1] / 40.94 - 1) / 1000) * 1000

  const desc = `The Dow Jones Industrial Average from ${first[0]} to ` +
    `${live ? 'today' : points[points.length - 1][0]}, on a logarithmic scale. ` +
    `It starts at ${first[1]} and reaches ${lastLabel}. The 1929 crash, the 1932 bottom, ` +
    `Black Monday in 1987, the dot-com bust, 2008 and the COVID crash are marked. ` +
    `Each is a visible interruption to a line that rises across the whole period.`

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-labelledby="djiaT djiaD" ` +
    `style="display:block;background:${C.ink};font-family:'Space Mono',ui-monospace,monospace">` +
    `<title id="djiaT">${esc(chart.title)}</title><desc id="djiaD">${esc(desc)}</desc>` +
    `<defs><linearGradient id="djiaFill" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="${C.gold}" stop-opacity=".30"/>` +
    `<stop offset="100%" stop-color="${C.gold}" stop-opacity="0"/></linearGradient></defs>` +
    grid + ticks +
    `<path d="${area}" fill="url(#djiaFill)"/>` +
    `<path d="${line}" fill="none" stroke="${C.gold}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
    marks +
    `</svg>`
}

/* --------------------------------------------------------- text fallback ---
   A chart is an image. Text is what a crawler indexes, what a screen reader
   reads, and what survives when the SVG does not paint. The decade table is
   the same story in words. */
function renderTable(points, live) {
  /* EVERY cell is styled inline, and that is not laziness — it is the only
     thing that works here.
     styles.css carries `.mod-body table td { border: 1px solid var(--border);
     color: var(--text-body) }` and `.mod-body table { width:100%;
     table-layout:fixed }`, written for the light course page. This table sits
     inside .mod-body but on a dark panel, so it inherited a full-width grid of
     hairlines and #493F2B text on #131722 — a table of numbers nobody could
     read, stretched across the whole column.
     A stylesheet rule cannot beat an inline style, so the styles live on the
     elements. Do not "clean this up" into a class: the class would lose. */
  const cell  = `padding:3px 18px 3px 0;border:0;background:none;color:rgba(255,255,255,.72);font-weight:400;white-space:nowrap`
  const value = `padding:3px 0;border:0;background:none;text-align:right;color:#fff;font-weight:700;white-space:nowrap`

  let rows = ''
  for (const [yr, v] of points) {
    if (yr % 10 !== 0 && yr !== points[0][0]) continue
    rows += `<tr><td style="${cell}">${yr}</td><td style="${value}">${comma(v)}</td></tr>`
  }
  if (live) {
    rows += `<tr><td style="${cell};color:${C.gold}">today</td>` +
            `<td style="${value};color:${C.gold}">${comma(live.value)}</td></tr>`
  }

  return `<details style="margin-top:10px">` +
    `<summary style="cursor:pointer;font-size:.76rem;color:rgba(255,255,255,.55)">Show the numbers behind this chart</summary>` +
    `<table style="width:auto;table-layout:auto;border-collapse:collapse;border:0;background:none;margin:8px 0 0;font-size:.76rem;font-family:'Space Mono',ui-monospace,monospace">` +
    `<caption style="text-align:left;font-size:.72rem;color:${C.mute};padding:0 0 6px">DJIA year-end close, by decade</caption>` +
    `<tbody>${rows}</tbody></table></details>`
}

/* ----------------------------------------------------------------- today --- */
/*  "Where we are right now" strip. The chart answers "what has the Dow done
    since 1896"; this answers "and what is it doing today", which is the
    question a reader actually arrives with.

    PRICE RETURN, NOT TOTAL RETURN, and the label says so in the markup below.
    FRED's DJIA series excludes dividends. Total return runs roughly 1.5-2
    points a year higher, so calling this "total return" would overstate it —
    on a financial-literacy site, in a module about compounding, next to a
    chart a reader can check. Do not relabel it without a dividend source.

    The baseline is the last COMPLETED year in the committed series, selected
    by year rather than by position: if djia-annual.json ever gains a partial
    current-year row, taking the last element would silently compare this year
    against itself and render roughly 0%. */
function renderToday(points, live) {
  if (!live) return ''

  const liveYear = live.date ? Number(String(live.date).slice(0, 4)) : null
  const base = [...points].reverse().find(([y]) => liveYear === null || y < liveYear)
  if (!base) return ''

  const [baseYear, baseClose] = base
  const pct = ((live.value / baseClose) - 1) * 100
  const up = pct >= 0
  const col = up ? '#4ADE80' : C.warn
  const sign = up ? '+' : ''

  const cell = (label, value, colour) => `
      <div style="min-width:0">
        <div style="font-family:var(--f-mono,monospace);font-size:1.15rem;font-weight:700;color:${colour};line-height:1.15">${value}</div>
        <div style="font-size:.66rem;letter-spacing:.06em;text-transform:uppercase;color:${C.mute};margin-top:3px">${label}</div>
      </div>`

  return `
    <div style="display:flex;gap:26px;flex-wrap:wrap;align-items:flex-start;padding:12px 16px;border-top:1px solid ${C.rule};background:#171b26">
${cell('Last close', comma(Math.round(live.value)), C.gold)}
${cell(`Price return since ${baseYear} close`, `${sign}${pct.toFixed(1)}%`, col)}
${cell('Basis', 'Price only', C.soft)}
      <p style="flex:1 1 240px;min-width:220px;font-size:.68rem;line-height:1.55;color:${C.mute};margin:0">
        Level from the St. Louis Fed (series DJIA), last observation
        ${esc(live.date || 'unknown')}. This is a DAILY CLOSING series &mdash; the
        Fed publishes one value per trading day, after the close, so the newest
        figure available on a Monday afternoon is Friday's close. Our job rechecks
        it hourly, but no amount of rechecking produces an intraday number,
        because the source does not publish one. If this date looks stale during
        market hours, that is the source being a daily series, not the job being
        stuck.
        <strong style="color:${C.soft}">This is a price return: it excludes
        dividends</strong>, which have historically added roughly one and a half
        to two points a year on top.
      </p>
    </div>`
}

/* ------------------------------------------------------ growth chart (svg) --
   Two compounding curves on one linear axis. Linear, not log, on purpose: the
   whole argument is that one curve pulls away from the other, and a log axis
   is designed to flatten exactly that. Log is right for 130 years of index
   history; it is wrong here. */
function renderGrowth(chart) {
  const yrs = chart.years
  const series = chart.lines.map(l => ({
    ...l,
    pts: Array.from({ length: yrs + 1 }, (_, y) => chart.principal * Math.pow(1 + l.rate, y))
  }))

  const hi = Math.max(...series.flatMap(s => s.pts)) * 1.14
  const x = y => PAD.l + (y / yrs) * PW
  const yy = v => PAD.t + PH - (v / hi) * PH

  let grid = ''
  const step = Math.pow(10, Math.floor(Math.log10(hi))) / 2
  for (let v = 0; v <= hi; v += step) {
    const gy = yy(v).toFixed(1)
    grid += `<line x1="${PAD.l}" y1="${gy}" x2="${W - PAD.r}" y2="${gy}" stroke="${C.rule}" stroke-width="1"/>` +
            `<text x="${PAD.l - 9}" y="${(+gy + 3.5).toFixed(1)}" text-anchor="end" font-size="10.5" fill="${C.mute}" font-family="'Space Mono',monospace">$${comma(v)}</text>`
  }
  let ticks = ''
  for (let y = 0; y <= yrs; y += Math.max(1, Math.round(yrs / 5))) {
    ticks += `<text x="${x(y).toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="10.5" fill="${C.mute}" font-family="'Space Mono',monospace">${y ? 'yr ' + y : 'start'}</text>`
  }

  let paths = '', labels = ''
  series.forEach((s, i) => {
    const d = s.pts.map((v, y) => `${y ? 'L' : 'M'}${x(y).toFixed(1)},${yy(v).toFixed(1)}`).join('')
    paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round"/>`
    const ex = x(yrs), ey = yy(s.pts[yrs])
    paths += `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="4.5" fill="${s.color}"/>`
    labels += `<text x="${(ex - 9).toFixed(1)}" y="${(ey + (i ? 16 : -10)).toFixed(1)}" text-anchor="end" font-size="13" font-weight="700" fill="${s.color}" font-family="'Space Mono',monospace">$${comma(s.pts[yrs])}</text>`
    labels += `<text x="${PAD.l + 8}" y="${(PAD.t + 16 + i * 17).toFixed(1)}" font-size="11" fill="${s.color}" font-family="'Space Mono',monospace">${esc(s.label)}</text>`
  })

  const [a, b] = series
  const desc = `Two compounding curves starting from $${comma(chart.principal)} over ${yrs} years. ` +
    `At ${(a.rate * 100).toFixed(2)}% it reaches $${comma(a.pts[yrs])}; at ${(b.rate * 100).toFixed(0)}% it reaches ` +
    `$${comma(b.pts[yrs])}. The same arithmetic runs in both directions — the debt curve pulls away fastest.`

  let rows = ''
  for (let y = 0; y <= yrs; y++) {
    if (y % 2 && y !== yrs) continue
    rows += `<tr><td style="padding:3px 18px 3px 0;border:0;background:none;color:rgba(255,255,255,.72);white-space:nowrap">${y ? 'year ' + y : 'start'}</td>` +
      series.map(s => `<td style="padding:3px 18px 3px 0;border:0;background:none;text-align:right;color:${s.color};font-weight:700;white-space:nowrap">$${comma(s.pts[y])}</td>`).join('') + '</tr>'
  }
  const table = `<details style="margin-top:10px">` +
    `<summary style="cursor:pointer;font-size:.76rem;color:rgba(255,255,255,.55)">Show the numbers behind this chart</summary>` +
    `<table style="width:auto;table-layout:auto;border-collapse:collapse;border:0;background:none;margin:8px 0 0;font-size:.76rem;font-family:'Space Mono',ui-monospace,monospace">` +
    `<caption style="text-align:left;font-size:.72rem;color:${C.mute};padding:0 0 6px">${esc(chart.lines.map(l => l.label).join('  ·  '))}</caption>` +
    `<tbody>${rows}</tbody></table></details>`

  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-labelledby="revT revD" ` +
    `style="display:block;background:${C.ink};font-family:'Space Mono',ui-monospace,monospace">` +
    `<title id="revT">${esc(chart.title)}</title><desc id="revD">${esc(desc)}</desc>` +
    grid + ticks + paths + labels + `</svg>`

  return { svg, table }
}

/* --------------------------------------------------- lifetime chart (svg) --
   Bars above, a timeline rail below, sharing one x axis of forty years.

   Its own geometry, not the W/H/PAD constants above: those are tuned for a
   single line plot with a left value axis, and this figure needs a taller box
   and room under the bars for the rail. Reusing them produced a rail drawn on
   top of the year labels. */
function renderLifetime(chart) {
  const s      = JSON.parse(R(`tools/series/${chart.series}.json`))
  const pts    = s.points
  const bears  = s.bears
  const n      = pts.length
  const y0     = pts[0][0]

  const LW = 900, LH = 388
  const L = 46, Rt = 16, TOP = 28
  const PWID = LW - L - Rt
  const cw   = PWID / n                       // one cell per year
  const BARH = 232                            // bar band height
  const ZERO = TOP + BARH / 2                 // the zero line
  const DOM  = 40                             // +/- 40% fills the band
  const RAIL = TOP + BARH + 68                // y of the timeline rail

  const yv = v => ZERO - (v / DOM) * (BARH / 2)
  const xi = i => L + i * cw                  // left edge of year i's cell
  /* fractional-year x, for dates that land mid-year */
  const xd = iso => {
    const [Y, M, D] = iso.split('-').map(Number)
    return xi((Y - y0) + ((M - 1) + (D - 1) / 30) / 12)
  }

  /* ---- gridlines and the value axis ---- */
  let grid = ''
  for (const v of [40, 20, 0, -20, -40]) {
    const gy = yv(v).toFixed(1)
    const strong = v === 0
    grid += `<line x1="${L}" y1="${gy}" x2="${LW - Rt}" y2="${gy}" stroke="${strong ? 'rgba(255,255,255,.30)' : C.rule}" stroke-width="1"/>` +
            `<text x="${L - 8}" y="${(+gy + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="${C.mute}" font-family="'Space Mono',monospace">${v > 0 ? '+' : ''}${v}%</text>`
  }

  /* ---- the bars ---- */
  const BW = Math.min(14, cw - 5)
  let bars = '', best = null, worst = null
  pts.forEach(([yr, v], i) => {
    const bx = xi(i) + (cw - BW) / 2
    const top = v >= 0 ? yv(v) : ZERO
    const h = Math.max(1.2, Math.abs(yv(v) - ZERO))
    const col = v >= 0 ? C.gold : C.warn
    bars += `<rect x="${bx.toFixed(1)}" y="${top.toFixed(1)}" width="${BW.toFixed(1)}" height="${h.toFixed(1)}" fill="${col}" opacity="${v >= 0 ? .88 : .92}" rx="1.5"/>`
    if (!best  || v > best[1])  best  = [i, v]
    if (!worst || v < worst[1]) worst = [i, v]
  })

  /* Only the extremes get a number. Forty labels is not a chart, it is a
     table with extra steps — and the table is one <details> away below. */
  for (const [i, v] of [best, worst]) {
    const cx = xi(i) + cw / 2
    const ly = v >= 0 ? yv(v) - 7 : yv(v) + 15
    bars += `<text x="${cx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" ` +
            `fill="${v >= 0 ? C.gold : C.warn}" font-family="'Space Mono',monospace">${v > 0 ? '+' : ''}${v.toFixed(0)}%</text>`
  }

  /* ---- year ticks ---- */
  let ticks = ''
  pts.forEach(([yr], i) => {
    if (yr % 5) return
    ticks += `<text x="${(xi(i) + cw / 2).toFixed(1)}" y="${(TOP + BARH + 20).toFixed(1)}" text-anchor="middle" font-size="10" fill="${C.mute}" font-family="'Space Mono',monospace">${yr}</text>`
  })

  /* ---- the rail: every 20%+ fall, and the wait between them ---- */
  let rail =
    `<line x1="${L}" y1="${RAIL}" x2="${LW - Rt}" y2="${RAIL}" stroke="rgba(255,255,255,.22)" stroke-width="2"/>` +
    /* The heading sits two lines clear of the rail, not one. At one line it
       shared a row with the gap labels, and "12.6 yrs" landed inside the word
       "MORE". */
    `<text x="${L}" y="${(RAIL - 28).toFixed(1)}" font-size="10.5" fill="${C.soft}" font-family="'Space Mono',monospace">` +
    `EVERY FALL OF 20% OR MORE &mdash; ${bears.length} in ${n} years</text>`

  bears.forEach((b, k) => {
    const x1 = xd(b.peak), x2 = Math.max(xd(b.trough), x1 + 3)
    const cx = (x1 + x2) / 2
    /* Alternating rows. 2020 and 2022 sit 40px apart on this scale and their
       labels are wider than that, so a single row overlaps them illegibly. */
    const ly = RAIL + (k % 2 ? 40 : 20)
    const anchor = cx > LW - 90 ? 'end' : cx < 74 ? 'start' : 'middle'
    const tx = anchor === 'end' ? LW - Rt : anchor === 'start' ? L : cx
    rail +=
      `<rect x="${x1.toFixed(1)}" y="${(RAIL - 5).toFixed(1)}" width="${(x2 - x1).toFixed(1)}" height="10" fill="${C.warn}" rx="2"/>` +
      `<line x1="${cx.toFixed(1)}" y1="${(RAIL + 5).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${(ly - 8).toFixed(1)}" stroke="${C.warn}" stroke-width="1" opacity=".5"/>` +
      `<text x="${tx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-size="10" fill="${C.soft}" font-family="'Space Mono',monospace">${esc(b.label)} <tspan fill="${C.warn}">${b.depth.toFixed(1)}%</tspan></text>`

    /* the wait since the previous one, printed above the rail where it fits */
    if (k) {
      const prev = xd(bears[k - 1].peak)
      if (x1 - prev > 62) {
        const yrsGap = (Date.parse(b.peak) - Date.parse(bears[k - 1].peak)) / 31557600000
        rail += `<text x="${((prev + x1) / 2).toFixed(1)}" y="${(RAIL - 12).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="${C.mute}" font-family="'Space Mono',monospace">&larr; ${yrsGap.toFixed(1)} yrs &rarr;</text>`
      }
    }
  })

  const up = pts.filter(p => p[1] > 0).length
  const desc =
    `A bar chart of S&P 500 calendar-year total returns from ${y0} to ${pts[n - 1][0]}, forty years in all. ` +
    `${up} years were positive and ${n - up} were negative. The best was ${pts[best[0]][0]} at plus ${best[1].toFixed(1)} percent ` +
    `and the worst was ${pts[worst[0]][0]} at minus ${Math.abs(worst[1]).toFixed(1)} percent. Very few years land near the ` +
    `long-run average. Below the bars, a timeline marks the ${bears.length} occasions in those forty years when the index ` +
    `fell 20 percent or more from a peak: ${bears.map(b => `${b.label}, ${b.depth} percent`).join('; ')}. ` +
    `The gaps between them run as long as twelve years.`

  const svg =
    `<svg viewBox="0 0 ${LW} ${LH}" width="100%" role="img" aria-labelledby="chT chD" ` +
    `style="display:block;background:${C.ink};font-family:'Space Mono',ui-monospace,monospace">` +
    `<title id="chT">${esc(chart.title)}</title><desc id="chD">${esc(desc)}</desc>` +
    grid + bars + ticks + rail + `</svg>`

  /* ---- text fallback (see the note in renderTable: inline styles or lose) ---- */
  const cell = `padding:3px 14px 3px 0;border:0;background:none;color:rgba(255,255,255,.72);font-weight:400;white-space:nowrap`
  let rows = ''
  for (let i = 0; i < n; i += 2) {
    const a = pts[i], b = pts[i + 1]
    const c = ([yr, v]) =>
      `<td style="${cell}">${yr}</td><td style="${cell};text-align:right;color:${v >= 0 ? C.gold : C.warn};font-weight:700">${v > 0 ? '+' : ''}${v.toFixed(2)}%</td>`
    rows += `<tr>${c(a)}${b ? c(b) : '<td></td><td></td>'}</tr>`
  }
  const table = `<details style="margin-top:10px">` +
    `<summary style="cursor:pointer;font-size:.76rem;color:rgba(255,255,255,.55)">Show the numbers behind this chart</summary>` +
    `<table style="width:auto;table-layout:auto;border-collapse:collapse;border:0;background:none;margin:8px 0 0;font-size:.74rem;font-family:'Space Mono',ui-monospace,monospace">` +
    `<caption style="text-align:left;font-size:.72rem;color:${C.mute};padding:0 0 6px">S&amp;P 500 total return by calendar year, ${y0}&ndash;${pts[n - 1][0]}</caption>` +
    `<tbody>${rows}</tbody></table></details>`

  return { svg, table, bears: bears.length, years: n }
}

/* ------------------------------------------------------------------ block -- */
function renderBlock(name) {
  const chart  = CHARTS[name]

  /* Computed charts carry no historical series — the curves come from the
     rates in the chart definition. Everything below this branch assumes
     tools/series/<id>.json exists and would throw on them. */
  if (chart.kind === 'growth') {
    const g = renderGrowth(chart)
    return `
<figure style="margin:20px 0;border-radius:var(--r-md);overflow:hidden;background:${C.panel}">
  <figcaption style="padding:12px 16px;background:#1e222d;border-bottom:1px solid ${C.rule};display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
    <span style="font-size:.78rem;font-weight:700;color:#fff">${esc(chart.title)}</span>
    <span style="font-size:.69rem;color:${C.mute}">Compounding &middot; computed at build</span>
  </figcaption>
  ${g.svg}
  <div style="padding:10px 16px 14px">
    <p style="font-size:.72rem;color:${C.mute};margin:0">${esc(chart.caption)}</p>
    ${g.table}
  </div>
</figure>
`
  }

  /* Also has a committed series, but not a [year, level] line — it carries
     returns plus an events list and draws its own two-part figure. */
  if (chart.kind === 'lifetime') {
    const g = renderLifetime(chart)
    return `
<figure style="margin:20px 0;border-radius:var(--r-md);overflow:hidden;background:${C.panel}">
  <figcaption style="padding:12px 16px;background:#1e222d;border-bottom:1px solid ${C.rule};display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
    <span style="font-size:.78rem;font-weight:700;color:#fff">${esc(chart.title)}</span>
    <span style="font-size:.69rem;color:${C.mute}">${g.years} years &middot; ${g.bears} bear markets</span>
  </figcaption>
  ${g.svg}
  <div style="padding:10px 16px 14px">
    <p style="font-size:.72rem;color:${C.mute};margin:0">${esc(chart.caption)}</p>
    ${g.table}
  </div>
</figure>
`
  }

  const series = JSON.parse(R(`tools/series/${chart.series}.json`))
  const points = series.points
  const live   = liveFigure(chart.live)

  const stamp = live
    ? `Last close &middot; ${live.date || 'today'}`
    : `Year-end close &middot; through ${points[points.length - 1][0]}`

  return `
<figure style="margin:20px 0;border-radius:var(--r-md);overflow:hidden;background:${C.panel}">
  <figcaption style="padding:12px 16px;background:#1e222d;border-bottom:1px solid ${C.rule};display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
    <span style="font-size:.78rem;font-weight:700;color:#fff">${esc(chart.title)}</span>
    <span style="font-size:.69rem;color:${C.mute}">${stamp}</span>
  </figcaption>
  ${renderSvg(chart, points, live)}
  ${renderToday(points, live)}
  <div style="padding:10px 16px 14px">
    <p style="font-size:.72rem;color:${C.mute};margin:0">${esc(chart.caption)}</p>
    ${renderTable(points, live)}
  </div>
</figure>
`
}

/* ---------------------------------------------------------------- inline --- */
/*  Figures quoted in PROSE, stamped from the same source as the chart.
 *
 *  This exists because the copy said "today it trades above 54,000" as a
 *  hardcoded number while the chart immediately below it ended at 48,062.
 *  Both were defensible on their own and together they were incoherent: the
 *  reader sees a 12% contradiction on one screen, on a page about compounding,
 *  and reasonably concludes we do not check our own numbers.
 *
 *  A hand-typed market level is wrong the day after you type it. Anything the
 *  prose asserts about the level now derives from the same figure the chart
 *  plots, so the two cannot drift apart again.
 *
 *  Usage in the HTML — the inner text is a fallback and gets overwritten:
 *      <span data-djia="level">48,062</span>
 *
 *  Keys: level, asof, hundred, years.
 */
function djiaInline() {
  const points = JSON.parse(R('tools/series/djia-annual.json')).points
  const live = liveFigure('djia')
  const [lastYear, lastClose] = points[points.length - 1]

  const level = live ? live.value : lastClose
  const first = points[0][1]                       // 40.94, the 1896 open
  const span = (live ? new Date(live.date || Date.now()).getFullYear() : lastYear) - points[0][0]
  const mult = level / first

  // Rounded to the nearest thousand. Quoting "$117,397" implies a precision
  // that a 130-year price-only index simply does not have, and invites a
  // reader to check a figure that was never meant to be exact.
  const hundred = Math.round((mult * 100) / 1000) * 1000

  return {
    // The series baseline is the 1896 YEAR-END CLOSE (40.45), not the 40.94
    // first print from May 1896. Both are real and they are not the same
    // number. Every derived figure below divides by this one, so the prose
    // has to quote this one too or the dollar figure will not reconcile
    // against a sentence sitting three words away from it.
    first: first.toFixed(2),
    level: comma(Math.round(level)),
    asof: live
      ? 'today'
      : `at the close of ${lastYear}`,
    hundred: '$' + comma(hundred),
    years: (span / Math.log2(mult)).toFixed(0),
  }
}

function stampInline(html) {
  if (!/data-djia="/.test(html)) return html
  const v = djiaInline()
  return html.replace(
    /(<span data-djia="([a-z]+)"[^>]*>)([\s\S]*?)(<\/span>)/g,
    (m, open, key, _body, close) =>
      Object.prototype.hasOwnProperty.call(v, key) ? open + v[key] + close : m
  )
}

/* ------------------------------------------------------------------ walk --- */
const SKIP = /^(node_modules|\.git|_deploy|_gitwork|_backup-|_refactor-|_seo-)/
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (SKIP.test(e)) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (e.endsWith('.html')) out.push(p)
  }
  return out
}

let written = 0, same = 0, missing = []
const names = Object.keys(CHARTS)

for (const file of walk(ROOT)) {
  let html = readFileSync(file, 'utf8')
  let out = html
  for (const n of names) {
    const re = new RegExp(`(<!--\\s*CHART:${n}:START\\s*-->)([\\s\\S]*?)(<!--\\s*CHART:${n}:END\\s*-->)`)
    if (!re.test(out)) continue
    out = out.replace(re, (_m, a, _body, b) => a + renderBlock(n) + b)
  }
  // Runs on every file, not only ones carrying a CHART marker: a page can
  // quote the level in prose without drawing the chart.
  out = stampInline(out)
  if (out === html) continue
  const rel = relative(ROOT, file)
  if (out === html) { same++; continue }
  if (!CHECK) writeFileSync(file, out, 'utf8')
  written++
  console.log(`  ~ ${rel}`)
}

for (const n of names) {
  const found = walk(ROOT).some(f => new RegExp(`<!--\\s*CHART:${n}:START\\s*-->`).test(readFileSync(f, 'utf8')))
  if (!found) missing.push(n)
}

console.log(`\n  ${written} file(s) updated${CHECK ? '  (--check: nothing written)' : ''}`)
if (missing.length) {
  console.log(`  No markers found for: ${missing.join(', ')}`)
  console.log(`  Add them where the chart should go:`)
  console.log(`    <!-- CHART:${missing[0]}:START --><!-- CHART:${missing[0]}:END -->`)
}
for (const n of names) {
  const live = liveFigure(CHARTS[n].live)
  console.log(`  ${n}: ${live ? `live point ${comma(live.value)} (${live.date})` : 'no live figure in snapshot — ending at last year-end close'}`)
}
if (CHECK && written) process.exit(1)

console.log(`\n  NEXT: node tools/build-public-stages.mjs`)
