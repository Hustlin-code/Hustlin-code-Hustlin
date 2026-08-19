#!/usr/bin/env node
/* =============================================================================
 *  check-edge-functions.mjs — is the Edge Function that is RUNNING the same as
 *  the one in the repo?
 * =============================================================================
 *
 *  WHY THIS EXISTS
 *
 *  On 2026-08-19 the deployed `market-quotes` was found to be a version behind
 *  `supabase/functions/market-quotes/index.ts`. It was missing a fix dated
 *  2026-08-13 in two places: `changeNum`/`changePct` initialised to 0 instead
 *  of null, so anything sorting on the numeric field ranked an UNKNOWN change
 *  as dead flat; and `low`/`high` returned as 0 instead of null, rendering as
 *  "$0.00 - $0.00" — a range that reads real and happens to be flat.
 *
 *  It had been wrong for six days and nothing could have caught it. `ship` does
 *  not touch supabase/functions/ — no gate reads that folder, the deploy script
 *  has no step for it, and the two copies can drift indefinitely in EITHER
 *  direction: an edit made in the dashboard is just as invisible as an edit
 *  made in the repo and never deployed.
 *
 *  That is the same shape as every other incident this month. A thing that is
 *  silently not happening, with no symptom, found by a human eventually
 *  noticing. This is the alarm.
 *
 *  ---------------------------------------------------------------------------
 *  WHY IT IS NOT A DEPLOY GATE
 *  ---------------------------------------------------------------------------
 *
 *  It needs a Supabase management token and a network round trip per function.
 *  deploy-site.ps1 has to work on a laptop with a flaky connection, and a gate
 *  that fails when the wifi drops is a gate people learn to bypass. Same trade
 *  check-series-freshness.mjs makes: it lives in a GitHub Action, where the
 *  network is a given and the secret already exists.
 *
 *  ---------------------------------------------------------------------------
 *  USAGE
 *  ---------------------------------------------------------------------------
 *
 *      node tools/check-edge-functions.mjs            # exit 1 on drift
 *      node tools/check-edge-functions.mjs --warn     # report, always exit 0
 *      node tools/check-edge-functions.mjs --json     # machine-readable
 *      node tools/check-edge-functions.mjs --only=market-quotes
 *      node tools/check-edge-functions.mjs --fixture=<dir>   # no network
 *
 *  ENV
 *      SUPABASE_ACCESS_TOKEN   a personal access token (sbp_...) from
 *                              supabase.com/dashboard/account/tokens
 *      SUPABASE_PROJECT_REF    defaults to the ref below
 *
 *  NO TOKEN IS NOT A FAILURE. It reports that it could not check and exits 0,
 *  for the same reason check-series-freshness.mjs treats "unreachable" as not
 *  stale: an environment problem reported as a content problem is how a real
 *  finding gets lost in noise.
 *
 *  ---------------------------------------------------------------------------
 *  THE RESPONSE SHAPE IS NOT GUARANTEED, AND THAT IS HANDLED DELIBERATELY
 *  ---------------------------------------------------------------------------
 *
 *  Supabase has served the function body in more than one shape over time:
 *  raw source for a single-file function, JSON carrying a files[] array, and an
 *  eszip BUNDLE for multi-file deployments. This tries the body endpoint and
 *  branches on what actually comes back rather than asserting one of them.
 *
 *  If it gets a bundle it cannot read, it does NOT guess and it does NOT pass.
 *  It falls back to reporting the deployed version and updated_at next to the
 *  local file's size, and says plainly that it could not compare the source —
 *  which is a weaker signal honestly labelled, not a green tick.
 *
 *  ⚠️ THE NETWORK PATH HAS NOT BEEN EXERCISED FROM A SESSION. Neither the
 *  device bridge nor the session container can reach api.supabase.com, so this
 *  was written and tested against fixtures only. Run it with --warn on its
 *  first outing and read what it actually says before trusting it.
 * ========================================================================== */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const warnOnly = args.includes('--warn')
const asJson = args.includes('--json')
const only = args.find(a => a.startsWith('--only='))?.slice(7)
const fixture = args.find(a => a.startsWith('--fixture='))?.slice(10)

const TOKEN = (process.env.SUPABASE_ACCESS_TOKEN ?? '').trim()
const REF = (process.env.SUPABASE_PROJECT_REF ?? 'zddtobudaxyrndjgvhfd').trim()
const API = 'https://api.supabase.com/v1'
const FN_DIR = 'supabase/functions'

/* _shared is a library directory, not a function. Anything else with an
   index.ts is one. Discovered rather than listed, for the same reason
   merge-live-data.mjs discovers its pages: a hardcoded list is how
   build-charts.mjs stayed missing from the deploy allowlist for the entire
   life of the workflow. */
function localFunctions () {
  if (!existsSync(FN_DIR)) return []
  return readdirSync(FN_DIR)
    .filter(n => n !== '_shared' && !n.startsWith('.'))
    .filter(n => statSync(join(FN_DIR, n)).isDirectory())
    .filter(n => existsSync(join(FN_DIR, n, 'index.ts')))
    .filter(n => !only || n === only)
    .sort()
}

/* Compare on CONTENT, not on bytes that carry no meaning. Line endings and a
   trailing newline differ between what was uploaded and what is stored, and
   reporting those as drift would make this the boy who cried wolf on day one.
   Nothing else is normalised — a changed space inside a string is real. */
const normalise = (s) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '')

function firstDifference (a, b) {
  const la = a.split('\n'), lb = b.split('\n')
  const n = Math.max(la.length, lb.length)
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) {
      return { line: i + 1, repo: la[i] ?? '(end of file)', deployed: lb[i] ?? '(end of file)' }
    }
  }
  return null
}

async function api (path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  })
  return res
}

/* Returns { source } when the deployed code could be read, { opaque, meta }
   when it could not. Never throws for a shape it did not expect — an
   unreadable body is a reportable state, not a crash. */
async function deployedSource (slug) {
  if (fixture) {
    const f = join(fixture, `${slug}.deployed.ts`)
    if (!existsSync(f)) return { missing: true }
    return { source: readFileSync(f, 'utf8') }
  }

  const res = await api(`/projects/${REF}/functions/${slug}/body`)
  if (res.status === 404) return { missing: true }
  if (!res.ok) return { error: `HTTP ${res.status}` }

  const buf = Buffer.from(await res.arrayBuffer())

  /* eszip bundles start with the literal "ESZIP". Check the bytes rather than
     trusting content-type, which has been reported as octet-stream for plain
     source and as text for a bundle. */
  if (buf.slice(0, 5).toString('latin1') === 'ESZIP') {
    const meta = await api(`/projects/${REF}/functions/${slug}`).then(r => r.ok ? r.json() : null).catch(() => null)
    return { opaque: 'the deployed body is an eszip bundle, not readable source', meta }
  }

  const text = buf.toString('utf8')
  try {
    const j = JSON.parse(text)
    const entry = j?.files?.find(f => f.name === 'index.ts') ?? j?.files?.[0]
    if (entry?.content) return { source: entry.content }
    if (typeof j === 'string') return { source: j }
  } catch { /* not JSON — fall through to raw source */ }

  return { source: text }
}

async function main () {
  const fns = localFunctions()
  if (!fns.length) {
    console.log('  no edge functions found under supabase/functions — nothing to check.')
    return 0
  }

  if (!TOKEN && !fixture) {
    console.log(`  SKIPPED — SUPABASE_ACCESS_TOKEN is not set, so the ${fns.length} edge function(s)`)
    console.log('  in this repo were NOT compared against what is deployed. This is not a pass.')
    console.log('  Set the secret on the repo: Settings -> Secrets -> Actions.')
    return 0
  }

  const rows = []
  for (const slug of fns) {
    const local = normalise(readFileSync(join(FN_DIR, slug, 'index.ts'), 'utf8'))
    let d
    try {
      d = await deployedSource(slug)
    } catch (e) {
      d = { error: String(e?.message ?? e) }
    }

    if (d.missing) { rows.push({ slug, state: 'NOT DEPLOYED', detail: 'exists in the repo, not on the project' }); continue }
    if (d.error)   { rows.push({ slug, state: 'UNCHECKED', detail: d.error }); continue }
    if (d.opaque)  { rows.push({ slug, state: 'UNCHECKED', detail: d.opaque, version: d.meta?.version, updatedAt: d.meta?.updated_at }); continue }

    const remote = normalise(d.source)
    if (remote === local) { rows.push({ slug, state: 'IN SYNC', detail: `${local.split('\n').length} lines` }); continue }

    const diff = firstDifference(local, remote)
    rows.push({
      slug,
      state: 'DRIFTED',
      detail: `repo ${local.split('\n').length} lines vs deployed ${remote.split('\n').length}`,
      firstDiffLine: diff?.line ?? null,
      repoLine: diff?.repo?.trim().slice(0, 90) ?? null,
      deployedLine: diff?.deployed?.trim().slice(0, 90) ?? null,
    })
  }

  const drifted = rows.filter(r => r.state === 'DRIFTED')
  const unchecked = rows.filter(r => r.state === 'UNCHECKED' || r.state === 'NOT DEPLOYED')

  if (asJson) {
    console.log(JSON.stringify({ checked: rows.length, drifted, unchecked, rows }, null, 2))
    return drifted.length && !warnOnly ? 1 : 0
  }

  for (const r of rows) {
    console.log(`  ${r.state.padEnd(13)} ${r.slug.padEnd(24)} ${r.detail}`)
  }

  if (unchecked.length) {
    console.log('')
    console.log(`  ${unchecked.length} function(s) could not be compared. That is not the same as being in sync.`)
  }

  if (!drifted.length) {
    console.log('')
    console.log(`  edge functions: no drift across ${rows.length - unchecked.length} compared function(s).`)
    return 0
  }

  console.log('')
  console.log(`  ${drifted.length} FUNCTION(S) HAVE DRIFTED — what is running is not what is in the repo:`)
  for (const r of drifted) {
    console.log(`    ${r.slug}`)
    console.log(`      ${r.detail}, first difference at line ${r.firstDiffLine}`)
    console.log(`      repo:     ${r.repoLine}`)
    console.log(`      deployed: ${r.deployedLine}`)
  }
  console.log('')
  console.log('  Decide WHICH SIDE IS RIGHT before acting — this drifts both ways. A repo copy')
  console.log('  that was never deployed and a dashboard edit that was never committed produce')
  console.log('  an identical report. Read the diff, then either deploy the repo copy or pull')
  console.log('  the deployed one back into the repo.')
  console.log('')
  console.log('    npx supabase functions deploy <slug> --project-ref ' + REF + ' --no-verify-jwt')
  console.log('')
  console.log('  --no-verify-jwt matters for every market-* function. They are deliberately')
  console.log('  unauthenticated public-data endpoints; deploying one with JWT verification on')
  console.log('  takes the Markets pages down.')
  return warnOnly ? 0 : 1
}

process.exitCode = await main()
