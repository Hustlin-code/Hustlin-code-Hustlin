/* ---------------------------------------------------------------------------
   tools/indexnow-submit.mjs — push URLs to Bing / Yandex / Naver via IndexNow.

   WHY THIS EXISTS
   Bing Webmaster Tools flags "IndexNow not configured" as a HIGH-severity
   recommendation. IndexNow is a push protocol: instead of waiting for Bingbot
   to re-crawl, you POST a list of URLs and the engines fetch them within
   minutes. It costs nothing and it is the only lever that moves Bing/Copilot
   indexing on a static site.

   HOW IT AUTHENTICATES
   Ownership is proved by a key file served from the site root:
       https://hustlin.org/<key>.txt          (contents = the key, nothing else)
   The key file lives in the repo root and is named in the deploy allowlist in
   deploy-site.ps1 (both the presence check ~line 768 and the copy globs ~787).
   If you rotate the key, change KEY here, rename the .txt, and update BOTH
   lines in deploy-site.ps1 — a key file that never reaches _deploy/ makes every
   submission fail with 403 and nothing else looks wrong.

   ORDER OF OPERATIONS MATTERS
   The key file must be LIVE before you submit. So: `ship` first, confirm
   https://hustlin.org/<key>.txt returns the key in a browser, then run this.

   USAGE
     node tools/indexnow-submit.mjs --check          validate setup, no network
     node tools/indexnow-submit.mjs --dry-run        print the payload only
     node tools/indexnow-submit.mjs                  submit every sitemap URL
     node tools/indexnow-submit.mjs --url=https://hustlin.org/stage-1-survive.html
     node tools/indexnow-submit.mjs --url=a.html --url=b.html

   Submit changed pages, not the whole sitemap, on routine deploys. A full
   resubmission is for a first run or a sitewide change; spamming the endpoint
   with 125 unchanged URLs every deploy is how a host earns a rate limit.

   RESPONSES
     200 / 202  accepted (202 = key validation pending, normal on first use)
     400        malformed payload
     403        key file not found or does not match — check it is live
     422        a URL is not on this host, or the host does not match the key
     429        too many requests; back off
--------------------------------------------------------------------------- */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HOST     = 'hustlin.org';
const KEY      = '7de6f7c8baf8ff5f673181c494003ade';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const keyFile = join(root, `${KEY}.txt`);
const sitemap = join(root, 'sitemap.xml');

const argv    = process.argv.slice(2);
const check   = argv.includes('--check');
const dryRun  = argv.includes('--dry-run');
const only    = argv.filter(a => a.startsWith('--url=')).map(a => a.slice(6));

function fail(msg) { console.error(`FAIL  ${msg}`); process.exit(1); }
function ok(msg)   { console.log(`ok    ${msg}`); }

/* --- setup validation: runs on every invocation, not just --check ---------- */
if (!existsSync(keyFile)) fail(`key file missing: ${KEY}.txt in the repo root`);
const keyBody = readFileSync(keyFile, 'utf8').trim();
if (keyBody !== KEY) fail(`${KEY}.txt does not contain the key (found "${keyBody}")`);
ok(`key file present and matches (${KEY}.txt)`);

const deployScript = join(root, 'deploy-site.ps1');
if (existsSync(deployScript)) {
  const ps = readFileSync(deployScript, 'utf8');
  if (!ps.includes(`${KEY}.txt`)) {
    fail('deploy-site.ps1 does not name the key file — it will never reach _deploy/');
  }
  ok('key file is in the deploy allowlist');
}

/* --- URL list ------------------------------------------------------------- */
let urls;
if (only.length) {
  urls = only.map(u => (u.startsWith('http') ? u : `https://${HOST}/${u.replace(/^\//, '')}`));
} else {
  if (!existsSync(sitemap)) fail('sitemap.xml not found');
  urls = [...readFileSync(sitemap, 'utf8').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]);
}

const offHost = urls.filter(u => !u.startsWith(`https://${HOST}/`));
if (offHost.length) fail(`URL not on ${HOST}: ${offHost[0]}`);
if (!urls.length)   fail('no URLs to submit');
ok(`${urls.length} URL${urls.length === 1 ? '' : 's'} ready`);

const payload = {
  host: HOST,
  key: KEY,
  keyLocation: `https://${HOST}/${KEY}.txt`,
  urlList: urls,
};

if (check) { console.log('check mode - nothing submitted'); process.exit(0); }
if (dryRun) { console.log(JSON.stringify(payload, null, 2)); process.exit(0); }

/* --- submit --------------------------------------------------------------- */
const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(payload),
});

const body = await res.text().catch(() => '');
console.log(`\nHTTP ${res.status} ${res.statusText}`);
if (body.trim()) console.log(body.trim());

if (res.status === 200 || res.status === 202) {
  console.log(`\nSubmitted ${urls.length} URLs. 202 means Bing is still validating the key file - that is normal on a first run.`);
  process.exit(0);
}
if (res.status === 403) {
  console.error('\n403 - the key file is not reachable. Open https://' + HOST + '/' + KEY + '.txt in a browser; it must return the key as plain text. Ship first, then retry.');
}
process.exit(1);
