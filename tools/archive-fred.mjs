/**
 * =============================================================================
 *  archive-fred.mjs — keep a permanent copy of FRED series that get withdrawn
 * =============================================================================
 *
 *  THE PROBLEM THIS SOLVES
 *
 *  In April 2026 FRED truncated the ICE BofA index family to a ROLLING THREE
 *  YEAR WINDOW. The series page says so plainly:
 *
 *      "Starting in April 2026, this series will only include 3 years of
 *       observations. For more data, go to the source."
 *
 *  BAMLH0A0HYM2 and BAMLC0A0CM now begin at 2023-08-15, and that start date
 *  moves forward every single day. An observation that falls off the back is
 *  gone from the free feed permanently — "the source" is ICE, and ICE licenses
 *  it commercially. There is no re-fetching it later.
 *
 *  So this is not a cache and it is not an optimisation. It is the only copy.
 *  Every day this does not run is a day of credit-spread history destroyed.
 *
 *  HOW IT WORKS
 *
 *  One file per series under tools/series/fred/<ID>.json, APPEND-ONLY. The
 *  merge never removes a date it already holds. It will overwrite a VALUE for
 *  a date it already holds, because FRED genuinely revises macro series, and
 *  it counts those revisions out loud so a silent rewrite of history is
 *  visible in the log rather than only in the diff.
 *
 *  ONE OBSERVATION PER LINE, deliberately. This file is committed on most
 *  runs, and git stores every version. Pretty-printed JSON with one row per
 *  line means a normal day's diff is a handful of ADDED LINES, which packs to
 *  almost nothing. The same data as a single long line would rewrite the whole
 *  blob daily and grow the repo without bound. Do not "tidy" this into
 *  JSON.stringify(x, null, 2) — that is the same shape, but do not reformat it
 *  to a single line either.
 *
 *  NO SECRETS. FRED needs a key; the key lives in the market-data Edge
 *  Function, and this talks to that function's ?series= route instead. Same
 *  reasoning as the rest of the refresh pipeline: the workflow holds no
 *  credentials, so a leaked Action log leaks nothing.
 *
 *  USAGE
 *      node tools/archive-fred.mjs           fetch and merge
 *      node tools/archive-fred.mjs --check   report gaps, write nothing
 *      node tools/archive-fred.mjs --only=BAMLH0A0HYM2,DGS10
 *      node tools/archive-fred.mjs --urgent  only the series being withdrawn
 *
 *  FAILURE POLICY
 *
 *  Exits 0 when an endpoint is unreachable, like inject-market-data.mjs does,
 *  and leaves the existing archive untouched. A missed day is recoverable
 *  while the three-year window still covers it; a build that fails and stops
 *  the whole refresh is not an improvement on that.
 *
 *  It exits 1 for exactly one thing: being asked to write a file that would
 *  END UP SHORTER than the one on disk. That should be impossible by
 *  construction, so if it happens the merge is broken and the right response
 *  is to stop before committing, not to carry on and overwrite the archive.
 * =============================================================================
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'tools', 'series', 'fred')

const ENDPOINT = process.env.MARKET_DATA_ENDPOINT
  || 'https://zddtobudaxyrndjgvhfd.supabase.co/functions/v1/market-data'

const checkOnly = process.argv.includes('--check')
const urgentOnly = process.argv.includes('--urgent')
const onlyArg = process.argv.find(a => a.startsWith('--only='))
const only = onlyArg ? onlyArg.slice(7).split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : null

/* WHAT WE ARCHIVE, AND WHY EACH ONE IS HERE.
 *
 * `urgent: true` means the free feed is actively withdrawing this series'
 * history. Those are not optional and --urgent exists so a fast job can cover
 * them without paying for the rest.
 *
 * Every ID here must ALSO be in SERIES_ALLOW in market-data/index.ts. The route
 * refuses anything else, deliberately — it is a public unauthenticated endpoint
 * and without the allowlist it is an open proxy to our FRED quota. */
const SERIES = [
  /* ── THE FOUR ICE BofA SPREADS WERE REMOVED 2026-08-19 ────────────────────
     BAMLH0A0HYM2, BAMLC0A0CM, BAMLH0A3HYC and BAMLC0A4CBBB were archived here
     precisely BECAUSE FRED cut them to a rolling three-year window in April
     2026 — the whole point was to keep history before it disappeared.

     A licensing audit then read their FRED tag: "Copyrighted: Pre-Approval
     Required", with the notice "Reproduction of this data in any form is
     prohibited except with the prior written permission of ICE Data Indices."

     Which recasts what this archive was. Keeping a private copy of data whose
     publisher is withdrawing it is one thing; keeping it in a PUBLIC GitHub
     repository, which this is, is republication. The committed JSON files were
     moved out on the same day.

     Not a judgement about whether the three-year window was a good decision by
     FRED. It is a judgement that we cannot hold the mirror in public.
     ──────────────────────────────────────────────────────────────────────── */

  // ── Public domain. Archived so our own charts have history deeper than
  //    whatever window a single API call happens to return. ──
  { id: 'DGS10',  label: '10-year Treasury' },
  { id: 'DGS2',   label: '2-year Treasury' },
  { id: 'DGS30',  label: '30-year Treasury' },
  { id: 'DGS3MO', label: '3-month Treasury' },
  { id: 'T10Y2Y', label: '10y minus 2y' },
  { id: 'T10Y3M', label: '10y minus 3m' },
  { id: 'NFCI',    label: 'Financial conditions' },
  { id: 'STLFSI4', label: 'Financial stress' },
  { id: 'WALCL',   label: 'Fed balance sheet' },
  { id: 'CCSA',    label: 'Continuing claims' },
  { id: 'ICSA',    label: 'Initial claims' },
  { id: 'CIVPART', label: 'Labor force participation' },
  { id: 'UNRATE',  label: 'Unemployment rate' },
  { id: 'PAYEMS',  label: 'Nonfarm payrolls' },
  { id: 'M2SL',    label: 'M2 money supply' },
  { id: 'TOTALSL', label: 'Consumer credit outstanding' },
  { id: 'REVOLSL', label: 'Revolving consumer credit' },
  { id: 'PSAVERT', label: 'Personal saving rate' },
  { id: 'HOUST',   label: 'Housing starts' },
  { id: 'RSAFS',   label: 'Retail sales' },
  { id: 'BUSLOANS', label: 'Commercial and industrial loans' },
  { id: 'CONSUMER', label: 'Consumer loans at commercial banks' },
  { id: 'BABATOTALSAUS', label: 'Business applications' },
  { id: 'RAILFRTCARLOADSD11', label: 'Rail freight carloads' },
  { id: 'CPIAUCSL', label: 'CPI' },
  { id: 'CPILFESL', label: 'Core CPI' },
  { id: 'PCEPI',    label: 'PCE price index' },
  { id: 'PCEPILFE', label: 'Core PCE' },
  { id: 'PPIFIS',   label: 'PPI final demand' },

  /* Cboe copyright, "citation required" tier on FRED. Republishable WITH the
     acknowledgement line, which the pages carry. Not the same as SP500, which
     is S&P Dow Jones Indices' PRE-APPROVAL tier and is deliberately absent
     from this list — do not add it. */
  { id: 'VIXCLS', label: 'VIX' },
  { id: 'VXNCLS', label: 'Nasdaq-100 volatility' },
]

/* How far back to re-ask on an incremental run.
 *
 * We only need new observations, but FRED revises: CPI, payrolls and retail
 * sales are routinely restated for two or three months after first print. Ask
 * from (last date - OVERLAP_DAYS) and the revisions land instead of being
 * frozen at whatever the first estimate happened to be. 400 days costs a
 * slightly larger response and covers every normal revision cycle including
 * the annual benchmark ones.
 *
 * On a file that does not exist yet this is ignored and the full window is
 * requested, which for the ICE series is everything FRED still has. */
const OVERLAP_DAYS = 400

const iso = (d) => d.toISOString().slice(0, 10)
const daysAgo = (from, n) => iso(new Date(Date.parse(from) - n * 864e5))

function fileFor(id) { return join(DIR, `${id}.json`) }

function readArchive(id) {
  const p = fileFor(id)
  if (!existsSync(p)) return null
  try {
    const j = JSON.parse(readFileSync(p, 'utf8'))
    if (!Array.isArray(j.obs)) return null
    return j
  } catch (e) {
    // A corrupt archive is the one case where carrying on would destroy data:
    // treating it as "no archive" would refetch the three-year window and
    // silently replace a decade of history with it.
    console.log(`  ERROR ${id}: archive is unreadable (${e.message}). Not touching it.`)
    return 'corrupt'
  }
}

/* Serialise with one observation per line. See the header for why this format
   is load-bearing rather than cosmetic. */
function serialise(a) {
  const rows = a.obs.map(([d, v]) => `["${d}",${v}]`).join(',\n')
  return [
    '{',
    `"seriesId": ${JSON.stringify(a.seriesId)},`,
    `"label": ${JSON.stringify(a.label)},`,
    `"source": ${JSON.stringify(a.source)},`,
    `"note": ${JSON.stringify(a.note)},`,
    `"firstArchived": ${JSON.stringify(a.firstArchived)},`,
    `"updated": ${JSON.stringify(a.updated)},`,
    `"count": ${a.obs.length},`,
    '"obs": [',
    rows,
    ']',
    '}',
    '',
  ].join('\n')
}

async function fetchSeries(id, start) {
  const u = new URL(ENDPOINT)
  u.searchParams.set('series', id)
  if (start) u.searchParams.set('start', start)
  const r = await fetch(u.toString(), { signal: AbortSignal.timeout(30000) })
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.ok) {
    throw new Error(j?.error ? `${j.error}${j.detail ? ' — ' + j.detail : ''}` : `HTTP ${r.status}`)
  }
  if (!Array.isArray(j.observations)) throw new Error('no observations in response')
  return j
}

/* THE FALLBACK, AND WHY IT IS SECOND AND NOT FIRST.
 *
 * FRED serves a keyless CSV at fredgraph.csv?id=<ID>. It works, it needs no
 * key, and it is UNDOCUMENTED — there is no published contract, no versioning
 * and no SLA. It is the right thing to fall back to and the wrong thing to
 * depend on.
 *
 * It earns its place for two reasons. The route above lives in an Edge
 * Function that has to be deployed before it answers, so on the day this
 * script is added the route does not exist yet and the fallback is what
 * actually seeds the archive. And an archive whose only job is "do not lose
 * the data" should not be stopped by our own infrastructure being down.
 *
 * observation_start is honoured by fredgraph as cosd=. If it ever stops being
 * honoured the result is a larger response and identical merged output, not a
 * wrong one — the merge is keyed on date. */
async function fetchSeriesCsv(id, start) {
  const u = new URL('https://fred.stlouisfed.org/graph/fredgraph.csv')
  u.searchParams.set('id', id)
  if (start) u.searchParams.set('cosd', start)
  const r = await fetch(u.toString(), { signal: AbortSignal.timeout(30000) })
  if (!r.ok) throw new Error(`fredgraph HTTP ${r.status}`)
  const text = await r.text()
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) throw new Error('fredgraph returned no rows')

  /* The header is "observation_date,<ID>" on the current endpoint and was
     "DATE,<ID>" historically. Neither is parsed — the columns are positional
     and the header is only checked for shape, so a rename upstream does not
     silently produce an off-by-one. */
  const head = lines[0].split(',')
  if (head.length < 2) throw new Error('fredgraph header is not two columns: ' + lines[0])

  const observations = []
  for (const line of lines.slice(1)) {
    const [d, raw] = line.split(',')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d ?? '')) continue
    const v = Number(raw)
    if (!Number.isFinite(v)) continue      // "." — a holiday or a non-publishing week
    observations.push({ d, v })
  }
  if (!observations.length) throw new Error('fredgraph returned no usable observations')
  return { observations, source: `https://fred.stlouisfed.org/series/${id}`, via: 'fredgraph' }
}

async function main() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true })

  let list = SERIES
  if (urgentOnly) list = list.filter(s => s.urgent)
  if (only) list = list.filter(s => only.includes(s.id))
  if (!list.length) { console.log('  nothing selected'); return 0 }

  const today = iso(new Date())
  let written = 0, added = 0, revised = 0, failed = 0, gaps = 0

  for (const s of list) {
    const existing = readArchive(s.id)
    if (existing === 'corrupt') { failed++; continue }

    if (checkOnly) {
      if (!existing) {
        console.log(`  MISSING ${s.id} — ${s.label}: no archive on disk yet`)
        gaps++
      } else {
        const last = existing.obs[existing.obs.length - 1]?.[0] ?? '?'
        const staleDays = Math.round((Date.parse(today) - Date.parse(last)) / 864e5)
        const flag = s.urgent && staleDays > 14 ? '  STALE' : ''
        console.log(`  ${s.id.padEnd(20)} ${String(existing.obs.length).padStart(6)} obs  ${existing.obs[0][0]} -> ${last}${flag}`)
        if (s.urgent && staleDays > 14) gaps++
      }
      continue
    }

    const lastHeld = existing?.obs?.length ? existing.obs[existing.obs.length - 1][0] : null
    const start = lastHeld ? daysAgo(lastHeld, OVERLAP_DAYS) : null

    let res
    try {
      res = await fetchSeries(s.id, start)
    } catch (e) {
      /* The Edge Function route did not answer. Try FRED direct before giving
         up — see fetchSeriesCsv for why that is a fallback and not the plan. */
      try {
        res = await fetchSeriesCsv(s.id, start)
        console.log(`  note ${s.id}: market-data route unavailable (${e.message}) — used fredgraph.csv`)
      } catch (e2) {
        // Non-fatal by design — see the failure policy in the header.
        console.log(`  WARN ${s.id}: ${e.message}; fallback also failed (${e2.message}) — archive left as-is.`)
        failed++
        continue
      }
    }

    const map = new Map(existing?.obs ?? [])
    const before = map.size
    let localRevised = 0
    for (const o of res.observations) {
      if (map.has(o.d) && map.get(o.d) !== o.v) localRevised++
      map.set(o.d, o.v)
    }
    const obs = [...map.entries()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)

    /* The one hard failure. An archive is append-only by construction, so a
       shorter result means the merge logic is wrong, and writing it would
       destroy the thing this script exists to protect. Stop instead. */
    if (obs.length < before) {
      console.log(`  FATAL ${s.id}: merge produced ${obs.length} rows from ${before}. Refusing to write.`)
      return 1
    }

    const out = {
      seriesId: s.id,
      label: s.label,
      source: res.source ?? `https://fred.stlouisfed.org/series/${s.id}`,
      note: s.urgent
        ? 'FRED serves only a rolling three-year window for this series as of April 2026. This archive is the only copy of anything older. Append-only: never delete rows.'
        : 'Append-only archive of the FRED series. Values may be revised by the source; dates are never removed.',
      firstArchived: existing?.firstArchived ?? today,
      updated: today,
      obs,
    }

    const text = serialise(out)
    const prior = existsSync(fileFor(s.id)) ? readFileSync(fileFor(s.id), 'utf8') : ''
    if (text !== prior) {
      writeFileSync(fileFor(s.id), text)
      written++
      const gained = obs.length - before
      added += gained
      revised += localRevised
      const bits = []
      if (gained) bits.push(`+${gained} obs`)
      if (localRevised) bits.push(`${localRevised} revised`)
      if (!before) bits.push(`seeded ${obs.length} from ${obs[0][0]}`)
      console.log(`  ${s.id.padEnd(20)} ${bits.join(', ') || 'rewritten'}`)
    }
  }

  if (checkOnly) {
    console.log(`  ${list.length} series checked, ${gaps} needing attention`)
    return gaps ? 1 : 0
  }

  console.log(`  ${written} file(s) written, ${added} observation(s) added, ${revised} revised, ${failed} unreachable`)
  return 0
}

process.exit(await main())
