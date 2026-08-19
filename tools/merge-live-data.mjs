/**
 * =============================================================================
 *  merge-live-data.mjs — keep the Action's live figures out of a local deploy
 * =============================================================================
 *
 *  THE PROBLEM
 *
 *  Two things write the same HTML files, on different clocks:
 *
 *    - the hourly "Refresh market data" Action rewrites the blocks between
 *      <!-- MKT:name:START --> and <!-- CHART:name:START --> markers and
 *      commits them straight to the repo;
 *    - a local deploy stages the whole site into _deploy/ and
 *      push-to-github.ps1 mirrors that over the repo with robocopy /MIR.
 *
 *  The working folder never pulls the Action's commits, so every local push
 *  overwrote live figures with whatever was last baked here. Fixing that by
 *  "bake before you ship" costs 140 seconds of Finnhub cooldown on every stale
 *  deploy and still loses the race if the Action commits mid-push.
 *
 *  THE FIX, AND WHY IT IS NOT "SKIP THESE PAGES"
 *
 *  Excluding the pages from the mirror entirely would also freeze their
 *  hand-written copy, their nav, their footer and their ?v= cache-bust token
 *  at whatever the last edit left behind — so a stylesheet change would never
 *  reach markets.html. The data is not the page.
 *
 *  So this splices at the marker level: the page that ships is OURS in every
 *  respect except the generated blocks, which are taken from the repo. Local
 *  copy changes go out; live figures are never rolled back; nothing is fetched
 *  and nothing sleeps.
 *
 *  ONE EXCEPTION, ADDED 2026-08-19: a block whose only input is a committed
 *  file that ships in this same push is held from THIS folder instead of
 *  being taken from the repo. See HOLD_LOCAL below for why, and for the test
 *  a block has to pass before it goes in there.
 *
 *  USAGE
 *      node tools/merge-live-data.mjs --list [dir]
 *      node tools/merge-live-data.mjs --repo <cloneDir> [--dry-run]
 *
 *  --repo runs against a git clone that has ALREADY been mirrored over. It
 *  reads each file's pre-mirror content with `git show HEAD:<path>`, which is
 *  the version the Action last committed, and writes those marker blocks back
 *  into the mirrored file.
 *
 *  EXIT CODES
 *      0  merged (or nothing to do)
 *      1  a real error — bad arguments, git failure, unreadable file
 *
 *  It never fails the push for a missing marker or a new page. A page that is
 *  in _deploy but not yet in HEAD is genuinely new: there is no live data to
 *  preserve, so it ships as-is.
 * =============================================================================
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')

/* Directories that are never part of the shipped site. The course folders are
   in .gitignore — paid content that lives in Supabase Storage, not the repo —
   so their masters carry markers but are not a mirror concern. Listed by name
   rather than parsed out of .gitignore because this has to work when pointed
   at a clone, where .gitignore's course entries match nothing. */
const SKIP_DIRS = new Set([
  '.git', 'node_modules', '_deploy',
  'TA Course', 'Financial Literacy Course', 'EconomicsCourse',
  'Fundemental Course', 'TradingPsycologycourse',
])

const MARKER = /<!--\s*(MKT|CHART):([A-Za-z0-9_-]+):START\s*-->[\s\S]*?<!--\s*\1:\2:END\s*-->/g

/* ---------------------------------------------------------- HELD LOCALLY --
   Blocks that must NEVER be taken from the repo, because their entire input is
   a committed file that ships in this same push.

   MKT:owns is rendered from tools/series/marketcap.json and NOTHING fetches
   it. So the repo's copy of that block is not "the live figures" — it is
   whatever the last monthly Action run happened to bake from the version of
   marketcap.json that was committed at the time. Splicing it back ships a
   table built from a file that is no longer in the repo.

   That is not hypothetical. On 2026-08-16 the asset-class block was rebuilt
   from month-over-month to year-over-year, and marketcap.json and the baked
   block were both updated here. The 2026-08-18 21:44 ship pushed the new JSON
   and this tool spliced the OLD block straight back over it, so HEAD ended up
   carrying a year-over-year data file and a month-over-month table. Nothing
   would have reconciled the two until the monthly tier ran on 3 September.

   THE TEST FOR ADDING TO THIS SET: does the block have any input that is not
   in this push? If it is fetched at build time it must keep splicing, because
   the repo can hold a genuinely fresher copy — sectorReturns comes from the
   market-sectors function and earningsScore is derived from the Finnhub
   earnings set, so both stay out of here.

   LOCAL_SETS in inject-market-data.mjs is NOT this list. It means "not served
   by market-data", which is a different question with a different answer. */
const HOLD_LOCAL = new Set(['MKT:owns'])

/* The committed file behind each held block, named in the summary so the
   reason a block was held is legible without reading this file. */
const HOLD_SOURCE = { 'MKT:owns': 'tools/series/marketcap.json' }

function walk (dir, root = dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith('_backup-')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, root, out)
    else if (name.endsWith('.html')) out.push(relative(root, full).split(sep).join('/'))
  }
  return out
}

/* A page is "live-data owned" if it carries at least one generated block. This
   is discovered, never listed. A hardcoded list is how the tools/ allowlist in
   deploy-site.ps1 came to be missing build-charts.mjs for the entire life of
   the workflow — every scheduled run died on it and nobody could see why. */
function livePages (root) {
  return walk(root).filter(rel => {
    MARKER.lastIndex = 0
    return MARKER.test(readFileSync(join(root, rel), 'utf8'))
  }).sort()
}

function blocks (html) {
  const map = new Map()
  for (const m of html.matchAll(MARKER)) map.set(`${m[1]}:${m[2]}`, m[0])
  return map
}

// ---------------------------------------------------------------------------
if (args.includes('--list')) {
  const root = args[args.indexOf('--list') + 1] ?? process.cwd()
  const pages = livePages(root)
  for (const p of pages) console.log('  ' + p)
  console.log(`\n  ${pages.length} page(s) carry generated market blocks.`)
  process.exit(0)
}

const repoIdx = args.indexOf('--repo')
if (repoIdx === -1) {
  console.error('usage: node tools/merge-live-data.mjs --repo <cloneDir> [--dry-run]')
  console.error('       node tools/merge-live-data.mjs --list [dir]')
  process.exit(1)
}
const REPO = args[repoIdx + 1]
if (!REPO) { console.error('  --repo needs a directory'); process.exit(1) }

/* WHICH SIDE IS NEWER — the one decision this whole tool turns on.
   Normally the repo holds the fresher figures and ours are whatever the last
   local bake left. But `-Market` exists precisely so you CAN bake fresher ones
   here, and blindly splicing HEAD back in would throw that away — the exact
   failure this tool was written to prevent, running backwards. So compare
   bakedAt and let the newer side win outright.
   No bakedAt on either side means a snapshot written before that field
   existed; there is no way to order them, so the repo wins. Preferring live
   data when you cannot tell is the safe direction: at worst you re-bake. */
const SNAP = 'tools/.market-snapshot.json'
function parseSnap (text) {
  try { return text ? JSON.parse(text) : null } catch { return null }
}
function headVersion (rel) {
  try {
    return execFileSync('git', ['-C', REPO, 'show', `HEAD:${rel}`],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch {
    return null   // not in HEAD yet: a genuinely new page
  }
}

let mineSnap = null
try { mineSnap = parseSnap(readFileSync(join(REPO, SNAP), 'utf8')) } catch {}
const theirSnap = parseSnap(headVersion(SNAP))
const mineAt = mineSnap?.bakedAt ?? null
const theirAt = theirSnap?.bakedAt ?? null

if (mineAt && (!theirAt || mineAt > theirAt)) {
  console.log(`  local bake ${mineAt} is newer than the repo's ${theirAt ?? '(none)'} —`)
  console.log('  keeping the figures we just baked. Nothing merged.')
  process.exit(0)
}
console.log(`  repo bake ${theirAt ?? '(unknown)'} vs local ${mineAt ?? '(unknown)'} — preserving the repo's figures.`)

let restored = 0, already = 0, newPages = 0, heldTotal = 0
const detail = []

for (const rel of livePages(REPO)) {
  const mine = readFileSync(join(REPO, rel), 'utf8')
  const theirs = headVersion(rel)
  if (theirs === null) { newPages++; detail.push(['NEW ', rel, 'not in HEAD — nothing to preserve']); continue }

  const live = blocks(theirs)
  let changed = 0, kept = 0, held = 0
  const merged = mine.replace(MARKER, m => {
    const key = m.match(/<!--\s*(MKT|CHART):([A-Za-z0-9_-]+):START/)
    const name = `${key[1]}:${key[2]}`
    const theirBlock = live.get(name)
    /* Built from a file that ships in this push — this folder wins outright
       and the repo's copy is never consulted. See HOLD_LOCAL. */
    if (HOLD_LOCAL.has(name)) {
      if (theirBlock && theirBlock !== m) held++
      return m
    }
    if (!theirBlock) { kept++; return m }          // marker we added locally
    if (theirBlock === m) return m                  // identical, nothing to do
    changed++
    return theirBlock
  })
  heldTotal += held
  if (held) detail.push(['HOLD', rel, `${held} block(s) kept from this folder, not the repo`])

  if (changed === 0) {
    already++
    if (!held) detail.push(['SAME', rel, kept ? `${kept} local-only marker(s)` : 'figures already identical'])
    continue
  }
  if (!DRY) writeFileSync(join(REPO, rel), merged, 'utf8')
  restored++
  detail.push(['KEEP', rel, `${changed} block(s) taken from the repo${kept ? `, ${kept} local-only` : ''}`])
}

/* The snapshot goes back too, or the next run diffs against figures that were
   never on the page and the "what changed" block reports nonsense. */
if (theirSnap && !DRY && restored > 0) {
  writeFileSync(join(REPO, SNAP), headVersion(SNAP), 'utf8')
  detail.push(['KEEP', SNAP, 'restored so the next diff has the right baseline'])
}

for (const [tag, rel, note] of detail) console.log(`  ${tag}  ${rel.padEnd(34)} ${note}`)

if (heldTotal) {
  const files = [...new Set(Object.keys(HOLD_SOURCE).map(k => HOLD_SOURCE[k]))].join(', ')
  console.log(`\n  ${heldTotal} block(s) HELD from this folder — the repo's copies were older`)
  console.log(`  renderings of ${files}, which ships in this push. This is correct.`)
  console.log('  If the page and that file disagree, re-bake before shipping:')
  console.log('    node tools/inject-market-data.mjs --cadence=monthly')
}

console.log(`\n  ${restored} page(s) had live figures preserved, ${already} already matched, ${newPages} new.`)
if (DRY) console.log('  --dry-run: nothing written.')
if (restored === 0 && already === 0 && newPages === 0) {
  console.log('  WARNING: no pages with market markers found in the clone. Check the path.')
}
process.exit(0)
