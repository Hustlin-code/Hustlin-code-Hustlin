#!/usr/bin/env node
/**
 * check-sitemap-coverage.mjs — sitemap.xml vs what is actually indexable on disk.
 *
 * Why this exists: deploy-site.ps1 step 7 checks ROOT *.html only, and it Warns
 * rather than Fails. Nothing has ever checked learn-the-lingo/ or Markets/, so
 * nine glossary pages were live and missing from the sitemap for days, and
 * overdraft-fee + net-pay repeated it. build-blog-index.mjs already owns the
 * blog block, so blog/ is covered; this gate covers everything else and FAILS.
 *
 * A page counts as indexable when it has no robots noindex meta AND either has
 * no canonical or its canonical points at itself. That is the same rule step 7
 * uses, so a deliberate redirect stub (sinking-fund-calculator.html, the three
 * Markets/ stubs) is silent without an allowlist of filenames to maintain.
 *
 * Usage:  node tools/check-sitemap-coverage.mjs [--check]
 * Exit 1 on any mismatch. --check is accepted and means the same thing; this
 * gate never writes anything.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, posix } from 'node:path';

const ROOT = process.cwd();
const HOST = 'https://hustlin.org/';
const SKIP_DIRS = /^(_backup|_deploy|_to_delete|_refactor-backup|_seo-backup|node_modules|\.git|\.github|assets|tools)/;
/* Course masters never render their own <head> - learn.html injects the body
   only - and they are not copied into _deploy. They are not pages. */
const COURSE_DIR = /course/i;
const SKIP_FILES = new Set(['footer.template.html', 'nav.template.html']);

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.test(e.name) || COURSE_DIR.test(e.name)) continue;
      walk(full, out);
    } else if (e.name.endsWith('.html') && !SKIP_FILES.has(e.name)) {
      out.push(posix.normalize(relative(ROOT, full).split(/[\\/]/).join('/')));
    }
  }
  return out;
}

const smPath = join(ROOT, 'sitemap.xml');
if (!existsSync(smPath)) { console.error('FAIL  sitemap.xml not found'); process.exit(1); }
const sm = readFileSync(smPath, 'utf8');
const locs = [...sm.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]);
const inSitemap = new Set(locs.map(u => (u === HOST || u === HOST.slice(0, -1) ? 'index.html' : u.replace(HOST, ''))));

const missing = [], stale = [], wrong = [];
for (const f of walk(ROOT)) {
  const t = readFileSync(join(ROOT, f), 'utf8');
  const noindex = /name=["']robots["'][^>]*noindex/i.test(t);
  const canon = t.match(/rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1] ?? null;
  const self = HOST + (f === 'index.html' ? '' : f);
  const indexable = !noindex && (!canon || canon === self);
  if (indexable && !inSitemap.has(f)) missing.push(f);
  if (!indexable && inSitemap.has(f)) wrong.push(f);
}
for (const f of inSitemap) if (!existsSync(join(ROOT, f))) stale.push(f);

const report = (label, list) => list.forEach(f => console.error(`FAIL  ${label}: ${f}`));
report('indexable but not in sitemap', missing);
report('in sitemap but noindex or canonicalized away', wrong);
report('in sitemap but not on disk (404 on ship)', stale);

const bad = missing.length + wrong.length + stale.length;
if (bad) { console.error(`\n${bad} sitemap coverage problem(s).`); process.exit(1); }
console.log(`  sitemap coverage: clean - ${locs.length} URL(s), every indexable page present, none stale.`);
