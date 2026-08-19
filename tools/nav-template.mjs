/* ===================================================================
   nav-template.mjs
   -------------------------------------------------------------------
   The one place that resolves nav.template.html into a usable nav
   block, with the calculator count substituted in.

   WHY THIS EXISTS
   The number of calculators appears in prose in six hand-written
   places, and it has now drifted three times: the site said "Fourteen"
   in the hub hero, "14 Tools" on the badge, "All 14 calculators" in the
   rail and "Sixteen calculators" in the nav — all at once, for a set of
   fifteen. Each time it was fixed by hand and each time it broke again
   on the next calculator added.

   So the template now carries {{CALC_COUNT}} and {{CALC_COUNT_WORD}}
   tokens and this module fills them from CALCS.length. Three consumers
   import it — stamp-nav.mjs, build-calculators.mjs and build-lingo.mjs
   — and they MUST all get a byte-identical string, because stamp-nav
   compares every page's NAV block against it and fails the deploy on a
   mismatch. That is exactly why this is one module and not three
   copies of the same replace().

   The hub's own hero, badge, meta description and JSON-LD are the other
   places the count appears; sync-hub-sections.mjs owns those.
   =================================================================== */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CALCS } from './calc-content.mjs';
import { TERMS } from './lingo-content.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CALC_COUNT = CALCS.length;
export const TERM_COUNT = TERMS.length;

/* Written out rather than pulled from a library: the count is a small
   number in prose ("Twenty-four calculators, no sign-up") and a
   dependency for that would be silly. Falls back to digits above 99,
   which the site will never reach and which still reads correctly. */
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function inWords(n) {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  const o = n % 10;
  return o ? `${t}-${ONES[o]}` : t;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const CALC_COUNT_WORD = inWords(CALC_COUNT);
export const TERM_COUNT_WORD = inWords(TERM_COUNT);

/* The glossary panel's topic tiles, generated from TERMS.
   ---------------------------------------------------------------------------
   The nav had no Learn the Lingo entry at all until 2026-08-12, so the first
   version listed every term by name. That was right at 28 terms and wrong at
   53: the panel ran off the bottom of a laptop viewport, and because the nav
   is stamped into every page, the term rows alone were 4.3KB x 121 pages of
   duplicated markup. The backlog is 655 terms. A list cannot be the answer.

   So the panel shows eight topics instead, and its height is now independent
   of the term count forever. Each tile links to a section of the hub that
   build-lingo.mjs generates from the SAME group definitions below, so the nav
   and the hub cannot disagree.

   Every term carries a `group` key. An unknown or missing group THROWS here
   rather than quietly dropping the term out of the nav - the failure mode the
   A-Z index had before the '#' bucket was added, where a page built fine and
   simply never appeared in the index.

   The 10-space indent matches the hand-written rows in the Calculators panel
   above it. stamp-nav byte-compares this block, so the indentation is part of
   the contract, not cosmetics. */
export const GROUPS = [
  { key: 'credit-debt',     label: 'Credit &amp; Debt',      blurb: 'cards, scores, collections, mortgage costs' },
  { key: 'saving-interest', label: 'Saving &amp; Interest',  blurb: 'how money grows, and what a rate really is' },
  { key: 'taxes',           label: 'Taxes &amp; Inheritance', blurb: 'gains, basis, and what heirs actually owe' },
  { key: 'retirement',      label: 'Retirement',             blurb: 'accounts, limits, required withdrawals' },
  { key: 'investing',       label: 'Investing',              blurb: 'funds, valuation, reading a company' },
  { key: 'markets',         label: 'Markets &amp; Trading',  blurb: 'charts, indicators, risk, your own head' },
  { key: 'economy',         label: 'The Economy',            blurb: 'inflation, the Fed, recessions, curves' },
  { key: 'rights',          label: 'Benefits &amp; Rights',  blurb: 'what they can take, and what they cannot' },
];

/** Terms belonging to `key`, sorted the way they are displayed. */
export function termsInGroup(key) {
  return TERMS.filter((t) => t.group === key)
    .slice()
    .sort((a, b) => a.shortName.localeCompare(b.shortName));
}

/* Validated at import time, so a term with no group fails the build rather
   than vanishing from both the nav and the hub. */
{
  const known = new Set(GROUPS.map((g) => g.key));
  const orphans = TERMS.filter((t) => !known.has(t.group)).map((t) => `${t.slug} (group: ${t.group ?? 'none'})`);
  if (orphans.length) {
    throw new Error(
      `lingo-content.mjs: ${orphans.length} term(s) carry no known group, so they would ` +
      `appear in neither the nav nor the hub's topic sections: ${orphans.join(', ')}. ` +
      `Add a "group" key from: ${[...known].join(', ')}.`
    );
  }
}

export const LINGO_GROUPS = GROUPS
  .map((g) => {
    const n = termsInGroup(g.key).length;
    return `          <a href="learn-the-lingo.html#g-${g.key}"><b>${g.label}</b><span>${n} terms &middot; ${g.blurb}</span></a>`;
  })
  .join('\n');

/** Fill the count tokens in any string. */
export function fillCounts(s) {
  return s
    .replace(/\{\{CALC_COUNT_WORD_CAP\}\}/g, cap(CALC_COUNT_WORD))
    .replace(/\{\{CALC_COUNT_WORD\}\}/g, CALC_COUNT_WORD)
    .replace(/\{\{CALC_COUNT\}\}/g, String(CALC_COUNT))
    .replace(/\{\{TERM_COUNT_WORD_CAP\}\}/g, cap(TERM_COUNT_WORD))
    .replace(/\{\{TERM_COUNT_WORD\}\}/g, TERM_COUNT_WORD)
    .replace(/\{\{TERM_COUNT\}\}/g, String(TERM_COUNT))
    /* LINGO_GROUPS last: it is the only token whose value is itself markup, and
       it must not be re-scanned for tokens. A function replacement, not a string
       - a literal $ in the markup would otherwise be read as a capture group. */
    .replace(/^\{\{LINGO_GROUPS\}\}$/m, () => LINGO_GROUPS);
}

/** nav.template.html, resolved, written from the repo root. */
export const NAV_TEMPLATE = fillCounts(
  readFileSync(join(ROOT, 'nav.template.html'), 'utf8')
).trimEnd();

/**
 * The nav block for a page `depth` folders below the root.
 *
 * The template is written from the repo root, so href="index.html" is
 * right at the root and resolves to Markets/index.html one level down.
 * Root-absolute paths would be simpler on the live domain and break
 * file:// entirely, and opening a page straight off disk is how this
 * site actually gets previewed. Relative links work in both places.
 */
export function navFor(depth) {
  if (!depth) return NAV_TEMPLATE;
  return NAV_TEMPLATE.replace(
    /(\s(?:href|src)=")(?!https?:|\/\/|\/|#|mailto:|tel:|data:)/g,
    `$1${'../'.repeat(depth)}`
  );
}
