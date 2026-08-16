#!/usr/bin/env node
/* =============================================================================
 *  check-series-freshness.mjs — is any series we publish actually DEAD?
 * =============================================================================
 *
 *  WHY THIS EXISTS
 *
 *  On 2026-08-16 the Market Sentiment page was found printing
 *
 *      Cash in Money Market Funds · $1.43T · 28th percentile · 1 Feb 2021
 *
 *  as a current reading. It was FRED series WRMFSL, and 2021-02-01 is not a
 *  stale cache — it is the series' FINAL observation. The Fed discontinued
 *  weekly seasonally-adjusted H.6 data after that week, in February 2021. The
 *  site had been serving a five-and-a-half-year-old number, with a percentile
 *  rank and an "as of" date beside it, for the life of that block.
 *
 *  Nothing caught it, and nothing could have. Every layer was working:
 *  the fetch returned HTTP 200, the payload was well formed, the shape check
 *  passed, the renderer rendered. A discontinued series is not an error. It is
 *  a successful request for a number that stopped moving.
 *
 *  THAT IS THE WHOLE PROBLEM WITH THIS CLASS OF BUG: a frozen figure looks
 *  exactly like a calm market. It has no symptom. The same invisibility let the
 *  scheduled refresh die for four days between 08-12 and 08-15, and for four
 *  days before that between 08-07 and 08-11. Three separate incidents in ten
 *  days, all of them "the numbers simply stopped moving", all of them found by
 *  a human eventually noticing rather than by anything automated.
 *
 *  So this checks the one thing none of the other gates look at: how old is the
 *  newest observation, and is that plausible for a series of this frequency.
 *
 *  ---------------------------------------------------------------------------
 *  THE THRESHOLDS ARE DELIBERATELY LOOSE, AND THAT IS THE DESIGN
 *  ---------------------------------------------------------------------------
 *
 *  This is a DEAD-SERIES detector, not a late-release detector. It is tuned to
 *  fire on WRMFSL — 2,000 days stale — and to stay silent on a monthly series
 *  that is a fortnight behind because the agency slipped a release.
 *
 *  That is on purpose. A freshness gate that fires on ordinary release lag gets
 *  muted within a week, and a muted gate is worse than no gate: it is a gate
 *  everyone has learned to scroll past. Every threshold below is set well
 *  beyond the worst NORMAL lag observed for that frequency on 2026-08-16, so a
 *  firing means something is genuinely wrong.
 *
 *  If you find yourself loosening a threshold to silence a false alarm, add a
 *  documented override instead. If you find yourself tightening one to catch
 *  something sooner, you are building a different tool.
 *
 *  ---------------------------------------------------------------------------
 *  USAGE
 *  ---------------------------------------------------------------------------
 *
 *      node tools/check-series-freshness.mjs              # report, exit 1 on a stale series
 *      node tools/check-series-freshness.mjs --warn       # report, always exit 0
 *      node tools/check-series-freshness.mjs --json       # machine-readable
 *      node tools/check-series-freshness.mjs --fixture=f  # run against a local JSON file
 *
 *  NEEDS NETWORK. It calls the market-data edge function, so it belongs in the
 *  GitHub Action (after the bake, where network exists) rather than in
 *  deploy-site.ps1, which has to work on a laptop with a flaky connection. Run
 *  it with --warn in CI: a dead series should be loud, but it should not block
 *  a copy fix from shipping. Same trade the archive gate makes at step 3d.
 * ========================================================================== */

const ENDPOINT = 'https://zddtobudaxyrndjgvhfd.supabase.co/functions/v1/market-data'
const SETS = ['macro', 'yields', 'growth', 'inflation', 'rates', 'labor', 'consumer', 'mood', 'equity']

/* Worst NORMAL age in days, by declared frequency. Measured against real FRED
   lags on 2026-08-16 and then given generous headroom.

   The monthly figure looks enormous until you work it through: a monthly series
   is dated the FIRST of its reference month, and the slowest ones here (PCE,
   industrial production, housing starts, the G.19 credit series) publish about
   two months later. On 2026-08-16 several sat legitimately at 2026-06-01, which
   is 76 days. 120 leaves room for a slipped release without crying wolf.

   Quarterly is worse for the same reason: DRCCLACBS was legitimately at
   2026-01-01 on 2026-08-16 — 227 days — because a quarterly series dated to the
   start of its quarter and published a quarter later is nearly eight months old
   at its oldest and perfectly healthy. */
const MAX_AGE_DAYS = { d: 8, w: 18, m: 120, q: 300 }

/* Series whose normal cadence does not match their declared frequency. Each one
   here is a documented exception, not a tolerance being nudged upward. */
const OVERRIDE = {
  /* A DAILY-frequency series on a WEEKLY release cadence (H.10, published
     Mondays). It is legitimately up to 9 days behind every other daily series
     from Tuesday to Sunday. Without this it false-alarms most of every week —
     which is exactly how a gate gets muted. */
  DTWEXBGS: 16,

  /* "At the request of the source, the data is delayed by 1 month." — FRED.
     A full month of embargo on top of the normal monthly lag.

     ⚠️ SEPARATE ISSUE, NOT ONE THIS SCRIPT CAN CATCH: because of that embargo
     the site displays a sentiment reading roughly two months behind the figure
     news coverage is quoting. That is a LABELLING problem, and the fix is on
     the page, not here. Do not "solve" it by swapping the series. */
  UMCSENT: 150,

  /* Case-Shiller is ~2 months behind by design. Also renamed upstream in 2026 —
     now "S&P Cotality Case-Shiller", same ID, same data. If any page hardcodes
     "CoreLogic" in a source line, that is the thing to fix. */
  CSUSHPINSA: 150,
}

const args = process.argv.slice(2)
const warnOnly = args.includes('--warn')
const asJson = args.includes('--json')
const fixture = args.find(a => a.startsWith('--fixture='))?.slice(10)

const DAY = 86400000

/* Walks whatever shape the payload has and pulls out every object that looks
   like a rendered metric — one carrying both a date and a series id. Written
   as a walk rather than against a fixed schema on purpose: the sets have
   diverged in shape over three API versions, and a freshness check that stops
   seeing half the series after a refactor is worse than useless, because its
   silence reads as "everything is fine". */
function collect (node, out = [], seen = new Set()) {
  if (!node || typeof node !== 'object') return out
  if (seen.has(node)) return out
  seen.add(node)
  if (Array.isArray(node)) { for (const v of node) collect(v, out, seen); return out }

  const id = node.seriesId ?? node.id
  const date = node.date ?? node.asOf ?? node.observationDate
  if (typeof id === 'string' && /^[A-Z0-9]{3,}$/.test(id) && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    out.push({ id, date: date.slice(0, 10), freq: node.freq ?? '?', label: node.label ?? node.name ?? '' })
  }
  for (const v of Object.values(node)) collect(v, out, seen)
  return out
}

async function load () {
  if (fixture) {
    const { readFileSync } = await import('node:fs')
    return JSON.parse(readFileSync(fixture, 'utf8'))
  }
  const res = await fetch(`${ENDPOINT}?sets=${SETS.join(',')}`, { signal: AbortSignal.timeout(45000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function main () {
  let payload
  try {
    payload = await load()
  } catch (e) {
    /* Unreachable is NOT stale. Same failure policy as inject-market-data.mjs:
       an outage upstream must not be reported as dead data, or the next real
       dead series gets lost in the noise of a bad afternoon. */
    console.log(`  WARN market-data unreachable (${e.message}) — freshness not checked.`)
    return 0
  }

  const now = Date.now()
  const metrics = collect(payload)
  const byId = new Map()
  for (const m of metrics) {
    const prev = byId.get(m.id)
    if (!prev || m.date > prev.date) byId.set(m.id, m)
  }

  const rows = [...byId.values()].map(m => {
    const ageDays = Math.floor((now - Date.parse(m.date + 'T00:00:00Z')) / DAY)
    const limit = OVERRIDE[m.id] ?? MAX_AGE_DAYS[m.freq] ?? MAX_AGE_DAYS.m
    return { ...m, ageDays, limit, stale: ageDays > limit }
  }).sort((a, b) => (b.ageDays - b.limit) - (a.ageDays - a.limit))

  const stale = rows.filter(r => r.stale)

  if (asJson) { console.log(JSON.stringify({ checked: rows.length, stale }, null, 2)); return stale.length && !warnOnly ? 1 : 0 }

  if (!rows.length) {
    console.log('  WARN no series found in the payload — the shape may have changed. NOT a pass.')
    return warnOnly ? 0 : 1
  }

  if (!stale.length) {
    const worst = rows[0]
    console.log(`  series freshness: clean — ${rows.length} series checked, none past its limit.`)
    console.log(`  closest to the line: ${worst.id} at ${worst.ageDays}d of ${worst.limit}d (${worst.date}).`)
    return 0
  }

  console.log(`  ${stale.length} STALE SERIES — a series this far behind is usually discontinued, not late:`)
  for (const r of stale) {
    console.log(`    ${r.id.padEnd(16)} last obs ${r.date}  ${String(r.ageDays).padStart(5)}d old  (limit ${r.limit}d, freq ${r.freq})  ${r.label}`)
  }
  console.log('')
  console.log('  Check the series page at https://fred.stlouisfed.org/series/<ID> — FRED puts')
  console.log('  "(DISCONTINUED)" in the title and names the replacement ID in the notes.')
  console.log('  If it is genuinely just a slow release, add a documented OVERRIDE entry;')
  console.log('  do not raise the shared threshold.')
  return warnOnly ? 0 : 1
}

process.exitCode = await main()
