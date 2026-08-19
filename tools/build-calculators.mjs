/* ===================================================================
   build-calculators.mjs
   -------------------------------------------------------------------
   Generates the 14 standalone calculator pages and rewrites the hub
   page (calculate-your-hustle.html) to match.

   RUN:  node tools/build-calculators.mjs
         node tools/build-calculators.mjs --check   (writes nothing)

   WHY A GENERATOR AND NOT 14 HAND-WRITTEN FILES
   Every page carries the same sidebar, the same footer hooks, the
   same schema shape and the same disclaimer. Hand-maintaining that
   across 15 files is how one page ends up with a stale nav and a
   canonical pointing at the wrong URL. The prose lives in
   calc-content.mjs; nothing here needs editing to change wording.

   WHAT IT DOES NOT DO
   Footers. tools/stamp-footers.mjs owns those and must run after
   this. The template emits the FOOTER:START/END markers empty and
   the stamper fills them.
   =================================================================== */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CALCS, STAGES } from './calc-content.mjs';
import { BUSINESS } from './calc-widgets-business.mjs';
import { navFor } from './nav-template.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://hustlin.org';
const CHECK = process.argv.includes('--check');
const FRESH = process.argv.includes('--fresh');
const R = (p) => readFileSync(join(ROOT, p), 'utf8');

/* THE SHARED NAV, EMITTED ALREADY STAMPED. Added 2026-08-10.

   This template used to write its own two-line <nav> with just the logo in it,
   and no NAV:START / NAV:END markers around it. Every calculator rebuild
   therefore un-stamped all fifteen pages, and the next deploy stopped at stage
   2a00b with "a nav block is stale or missing". Nothing looked wrong in a
   browser — the nav rendered, it just was not owned by stamp-nav.mjs any more —
   so it was only ever caught by the gate, and the fix was a --migrate step
   nobody remembers until the deploy fails.

   Reading nav.template.html here, with the same markers stamp-nav.mjs uses,
   means the pages come out of the builder already correct and
   `stamp-nav.mjs --check` passes with no extra step. The two must stay
   byte-identical: stamp-nav compares the block against this same file, so if
   the marker strings below ever drift from the ones in stamp-nav.mjs, every
   calculator page fails the gate at once. */
const NAV_BLOCK = '<!-- NAV:START -->\n' + navFor(0) + '\n<!-- NAV:END -->';

/* `quickTable` on a CALCS entry emits an optional reference table straight
   after the worked example: { h, intro, body }. `body` is raw HTML and should
   use class="cyh-tbl", which calculators.css already styles.

   WHY IT EXISTS. Search Console showed people arriving at the utilization page
   on pure arithmetic — "what is 30 of 2000 credit limit", "30 of 400 credit
   limit", "30 of 1000 credit limit". A JavaScript widget cannot win those:
   Google needs the answer as text in the HTML. A static lookup table can.
   Use it for any calculator whose queries include the sum itself.

   Optional. Omit it and nothing renders. */

/* `extraScript` on a CALCS entry emits a second <script> after
   calculators.js. The Business group uses it for calculators-business.js,
   which is loaded only where it is needed rather than adding 10KB to every
   personal-finance page. It must load AFTER calculators.js, which is where
   window.CYH comes from. The root *.js glob in deploy-site.ps1 step 10 picks
   the file up automatically; no allowlist edit is needed. */

/* ---------- current rates, baked at build time ---------------------
   Same principle as the Markets pages: the number goes into static
   HTML so a crawler sees "6.69%" as text on first fetch, and the cost
   is paid per build rather than per visitor. The 30-year rate comes
   from the FRED series MORTGAGE30US already collected in the market
   snapshot; there is no second API call and no client-side fetch. */
let RATES = {
  mortgage30: { value: 6.69, date: '2026-08-06', src: 'FRED MORTGAGE30US (Freddie Mac PMMS)' },
  auto60:     { value: 6.98, date: '2026-08-05', src: 'Bankrate weekly national survey, 60-month new car' }
};
try {
  const snap = JSON.parse(R('tools/.market-snapshot.json'));
  const m = snap.figures && snap.figures.mortgage30;
  if (m && isFinite(m.value)) RATES.mortgage30 = { value: m.value, date: m.date, src: RATES.mortgage30.src };
} catch { /* fall back to the literals above */ }

const esc = (s) => String(s).replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const strip = (s) => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/* ---------- the three new calculator widgets ---------------------- */
const STATE_OPTIONS = ('Alabama Alaska Arizona Arkansas California Colorado Connecticut Delaware ' +
 'District of Columbia|Florida Georgia Hawaii Idaho Illinois Indiana Iowa Kansas Kentucky Louisiana Maine ' +
 'Maryland Massachusetts Michigan Minnesota Mississippi Missouri Montana Nebraska Nevada|New Hampshire|' +
 'New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio Oklahoma Oregon Pennsylvania ' +
 'Rhode Island|South Carolina|South Dakota|Tennessee Texas Utah Vermont Virginia Washington ' +
 'West Virginia|Wisconsin Wyoming').split(/[ |]/).filter(Boolean);
/* the split above mangles two-word states; rebuild explicitly */
const STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware',
 'District of Columbia','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky',
 'Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana',
 'Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota',
 'Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas',
 'Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'];

const NEW_SECTIONS = {
withhold: `<section class="cyh-tool" id="withhold">
  <span class="cyh-num">Calculator 02</span>
  <h2>Paycheck Calculator</h2>
  <p class="cyh-sub">What actually lands in your account. Real 2026 federal brackets, the real Social Security wage base, and your state's own rates.</p>
  <div class="cyh-grid">
    <div>
      <div class="cyh-field">
        <label for="cyh-whGross">Gross pay per period</label>
        <input type="number" id="cyh-whGross" value="2308" oninput="cyhWithhold()">
        <div class="cyh-hint">Before any deductions &mdash; not what hits your account.</div>
      </div>
      <div class="cyh-field">
        <label for="cyh-whFreq">Pay frequency</label>
        <select id="cyh-whFreq" onchange="cyhWithhold()">
          <option value="weekly">Weekly (52 per year)</option>
          <option value="biweekly" selected>Every two weeks (26)</option>
          <option value="semimonthly">Twice a month (24)</option>
          <option value="monthly">Monthly (12)</option>
          <option value="annual">Annual salary</option>
        </select>
      </div>
      <div class="cyh-field">
        <label for="cyh-whStatus">Filing status</label>
        <select id="cyh-whStatus" onchange="cyhWithhold()">
          <option value="single" selected>Single</option>
          <option value="joint">Married filing jointly</option>
          <option value="hoh">Head of household</option>
        </select>
      </div>
    </div>
    <div>
      <div class="cyh-field">
        <label for="cyh-whState">State</label>
        <select id="cyh-whState" onchange="cyhWithhold()">
${STATES.map(s => `          <option value="${s}"${s === 'Tennessee' ? ' selected' : ''}>${s}</option>`).join('\n')}
        </select>
        <div class="cyh-hint">Local income tax (NYC, Philadelphia, most of Ohio) is not included.</div>
      </div>
      <div class="cyh-field">
        <label for="cyh-wh401k">401(k) contribution (% of pay)</label>
        <input type="number" id="cyh-wh401k" value="0" step="1" oninput="cyhWithhold()">
        <div class="cyh-hint">Cuts income tax but not Social Security or Medicare.</div>
      </div>
      <div class="cyh-field">
        <label for="cyh-whHealth">Health premium per period ($)</label>
        <input type="number" id="cyh-whHealth" value="0" oninput="cyhWithhold()">
      </div>
      <div class="cyh-field">
        <label for="cyh-whExtra">Extra federal withholding per period ($)</label>
        <input type="number" id="cyh-whExtra" value="0" oninput="cyhWithhold()">
      </div>
    </div>
  </div>
  <div class="cyh-out">
    <div class="cyh-stat gold"><b id="cyh-whNet">$0</b><span>Take-Home Per Check</span></div>
    <div class="cyh-stat neg"><b id="cyh-whFed">$0</b><span>Federal Income Tax</span></div>
    <div class="cyh-stat neg"><b id="cyh-whFica">$0</b><span>Social Security + Medicare</span></div>
    <div class="cyh-stat neg"><b id="cyh-whStateTax">$0</b><span>State Income Tax</span></div>
    <div class="cyh-stat"><b id="cyh-whRate">&ndash;</b><span>Effective Tax Rate</span></div>
    <div class="cyh-stat pos"><b id="cyh-whAnnual">$0</b><span>Take-Home Per Year</span></div>
  </div>
  <div class="cyh-msg" id="cyh-whMsg" style="display:none"></div>
</section>`,

mortgage: `<section class="cyh-tool" id="mortgage">
  <span class="cyh-num">Calculator 13</span>
  <h2>Mortgage Calculator</h2>
  <p class="cyh-sub">The full monthly payment &mdash; principal, interest, tax, insurance, HOA and PMI. Not the principal-and-interest figure that makes a house look affordable.</p>
  <div class="cyh-ratebox">
    <span>Current 30-year fixed average</span>
    <b>${RATES.mortgage30.value.toFixed(2)}%</b>
    <span>as of ${RATES.mortgage30.date} &middot; ${RATES.mortgage30.src}</span>
  </div>
  <div class="cyh-grid">
    <div>
      <div class="cyh-field">
        <label for="cyh-mgPrice">Home price</label>
        <input type="number" id="cyh-mgPrice" value="400000" oninput="cyhMortgage()">
      </div>
      <div class="cyh-field">
        <label for="cyh-mgDownPct">Down payment (%)</label>
        <input type="number" id="cyh-mgDownPct" value="20" step="0.5" oninput="cyhMortgage()">
        <div class="cyh-hint">That is <b id="cyh-mgDownAmt">$80,000</b>. Below 20% adds PMI.</div>
      </div>
      <div class="cyh-field">
        <label for="cyh-mgRate">Interest rate (%)</label>
        <input type="number" id="cyh-mgRate" value="${RATES.mortgage30.value.toFixed(2)}" step="0.01" oninput="cyhMortgage()">
        <div class="cyh-hint">Your credit score moves this more than anything else you control.</div>
      </div>
      <div class="cyh-field">
        <label for="cyh-mgYears">Loan term (years)</label>
        <input type="number" id="cyh-mgYears" value="30" oninput="cyhMortgage()">
      </div>
    </div>
    <div>
      <div class="cyh-field">
        <label for="cyh-mgTax">Property tax (% of value per year)</label>
        <input type="number" id="cyh-mgTax" value="1.1" step="0.05" oninput="cyhMortgage()">
        <div class="cyh-hint">US average is about 1.1%; the range runs from 0.3% to over 2%.</div>
      </div>
      <div class="cyh-field">
        <label for="cyh-mgIns">Home insurance ($ per year)</label>
        <input type="number" id="cyh-mgIns" value="1800" oninput="cyhMortgage()">
      </div>
      <div class="cyh-field">
        <label for="cyh-mgHoa">HOA ($ per month)</label>
        <input type="number" id="cyh-mgHoa" value="0" oninput="cyhMortgage()">
      </div>
    </div>
  </div>
  <div class="cyh-out">
    <div class="cyh-stat gold"><b id="cyh-mgTotal">$0</b><span>Full Monthly Payment</span></div>
    <div class="cyh-stat"><b id="cyh-mgPI">$0</b><span>Principal &amp; Interest</span></div>
    <div class="cyh-stat neg"><b id="cyh-mgPmi">$0</b><span>PMI Per Month</span></div>
    <div class="cyh-stat neg"><b id="cyh-mgInterest">$0</b><span>Total Interest Over Term</span></div>
  </div>
  <div class="cyh-msg" id="cyh-mgMsg" style="display:none"></div>
</section>`,

auto: `<section class="cyh-tool" id="auto">
  <span class="cyh-num">Calculator 14</span>
  <h2>Auto Loan Calculator</h2>
  <p class="cyh-sub">What the car really costs, and whether the deal clears the 20/4/10 rule. Negotiate the price, never the monthly payment.</p>
  <div class="cyh-ratebox">
    <span>Current 60-month new car average</span>
    <b>${RATES.auto60.value.toFixed(2)}%</b>
    <span>as of ${RATES.auto60.date} &middot; ${RATES.auto60.src}</span>
  </div>
  <div class="cyh-grid">
    <div>
      <div class="cyh-field">
        <label for="cyh-auPrice">Vehicle price</label>
        <input type="number" id="cyh-auPrice" value="30000" oninput="cyhAuto()">
        <div class="cyh-hint">The negotiated out-the-door price, not the sticker.</div>
      </div>
      <div class="cyh-field">
        <label for="cyh-auDown">Down payment ($)</label>
        <input type="number" id="cyh-auDown" value="6000" oninput="cyhAuto()">
      </div>
      <div class="cyh-field">
        <label for="cyh-auTrade">Trade-in value ($)</label>
        <input type="number" id="cyh-auTrade" value="0" oninput="cyhAuto()">
      </div>
      <div class="cyh-field">
        <label for="cyh-auTax">Sales tax (%)</label>
        <input type="number" id="cyh-auTax" value="7" step="0.25" oninput="cyhAuto()">
      </div>
    </div>
    <div>
      <div class="cyh-field">
        <label for="cyh-auRate">Interest rate (APR %)</label>
        <input type="number" id="cyh-auRate" value="${RATES.auto60.value.toFixed(2)}" step="0.01" oninput="cyhAuto()">
        <div class="cyh-hint">Used-car rates typically run 1&ndash;3 points higher than new.</div>
      </div>
      <div class="cyh-field">
        <label for="cyh-auTerm">Loan term (months)</label>
        <select id="cyh-auTerm" onchange="cyhAuto()">
          <option value="36">36 months (3 years)</option>
          <option value="48">48 months (4 years)</option>
          <option value="60" selected>60 months (5 years)</option>
          <option value="72">72 months (6 years)</option>
          <option value="84">84 months (7 years)</option>
        </select>
      </div>
      <div class="cyh-field">
        <label for="cyh-auIncome">Gross monthly income ($)</label>
        <input type="number" id="cyh-auIncome" value="5000" oninput="cyhAuto()">
        <div class="cyh-hint">Optional &mdash; enables the third leg of the 20/4/10 check.</div>
      </div>
    </div>
  </div>
  <div class="cyh-out">
    <div class="cyh-stat gold"><b id="cyh-auPay">$0</b><span>Monthly Payment</span></div>
    <div class="cyh-stat neg"><b id="cyh-auInterest">$0</b><span>Total Interest</span></div>
    <div class="cyh-stat"><b id="cyh-auTotal">$0</b><span>Total Cost</span></div>
    <div class="cyh-stat"><b id="cyh-auRule">&ndash;</b><span>20/4/10 Rule Met</span></div>
  </div>
  <div class="cyh-msg" id="cyh-auMsg" style="display:none"></div>
</section>`,

/* Step-up in basis. The output nothing else on the site produces is
   "Tax Saved By Inheriting" - the identical asset priced twice, once
   with the section 1014 reset at death and once with the section 1015
   carryover of a lifetime gift. That comparison is the whole subject,
   and it is the one nobody runs before signing a deed over to a child.
   Taught in Stage 5, Module 11.

   Deliberately models a TAXABLE asset only. A traditional IRA or 401(k)
   gets no step-up at all and is taxed as ordinary income, so folding it
   in here would need a second and different engine - the message block
   says so rather than the tool quietly answering the wrong question. */
stepup: `<section class="cyh-tool" id="stepup">
  <span class="cyh-num">Calculator 15</span>
  <h2>Step-Up in Basis Calculator</h2>
  <p class="cyh-sub">Die owning an appreciated asset and the gain built up over your lifetime is never taxed &mdash; the heir&rsquo;s cost basis resets to the value on the date of death. Hand the same asset over while you are alive and your old basis goes with it. This prices both, side by side.</p>
  <div class="cyh-grid">
    <div>
      <div class="cyh-field">
        <label for="cyh-suCost">What the original owner paid ($)</label>
        <input type="number" id="cyh-suCost" value="30000" oninput="cyhStepUp()">
        <div class="cyh-hint">The cost basis, plus capital improvements on a property. The number nobody can find afterwards.</div>
      </div>
      <div class="cyh-field">
        <label for="cyh-suDod">Value on the date of death ($)</label>
        <input type="number" id="cyh-suDod" value="300000" oninput="cyhStepUp()">
        <div class="cyh-hint">For shares, the average of that day&rsquo;s high and low &mdash; not the close. For a house, a written date-of-death appraisal.</div>
      </div>
      <div class="cyh-field">
        <label for="cyh-suSale">Sale price ($)</label>
        <input type="number" id="cyh-suSale" value="300000" oninput="cyhStepUp()">
        <div class="cyh-hint">Leave it level with the date-of-death value to see the step-up on its own.</div>
      </div>
    </div>
    <div>
      <div class="cyh-field">
        <label for="cyh-suStatus">Heir&rsquo;s filing status</label>
        <select id="cyh-suStatus" onchange="cyhStepUp()">
          <option value="single" selected>Single</option>
          <option value="joint">Married filing jointly</option>
          <option value="hoh">Head of household</option>
        </select>
      </div>
      <div class="cyh-field">
        <label for="cyh-suIncome">Heir&rsquo;s other income this year ($)</label>
        <input type="number" id="cyh-suIncome" value="60000" oninput="cyhStepUp()">
        <div class="cyh-hint">Long-term gains stack on top of this, so the same inheritance costs two heirs two different amounts.</div>
      </div>
      <div class="cyh-field">
        <label for="cyh-suState">State tax on the gain (%)</label>
        <input type="number" id="cyh-suState" value="0" step="0.1" oninput="cyhStepUp()">
        <div class="cyh-hint">Many states tax capital gains as ordinary income and several do not tax them at all. Leave it at 0 if yours does not.</div>
      </div>
    </div>
  </div>
  <div class="cyh-out">
    <div class="cyh-stat pos"><b id="cyh-suInhTax">$0</b><span>Tax If Inherited</span></div>
    <div class="cyh-stat neg"><b id="cyh-suGiftTax">$0</b><span>Tax If Gifted Instead</span></div>
    <div class="cyh-stat gold"><b id="cyh-suSaved">$0</b><span>Tax Saved By Inheriting</span></div>
    <div class="cyh-stat"><b id="cyh-suErased">$0</b><span>Gain Erased At Death</span></div>
  </div>
  <div class="cyh-out">
    <div class="cyh-stat"><b id="cyh-suRate">0%</b><span>Effective Rate If Gifted</span></div>
    <div class="cyh-stat"><b id="cyh-suNetInh">$0</b><span>Net To Heir &mdash; Inherited</span></div>
    <div class="cyh-stat"><b id="cyh-suNetGift">$0</b><span>Net To Heir &mdash; Gifted</span></div>
  </div>
  <div class="cyh-msg" id="cyh-suMsg"></div>
</section>`,

/* Roth conversion. The two outputs that make this different from a generic
   future-value tool are "Room Left in Bracket" and the two payment-source
   scenarios — those are the levers Stage 5 Module 06 actually teaches, and
   neither shows up in the usual conversion calculators. */
roth: `<section class="cyh-tool" id="roth">
  <span class="cyh-num">Calculator 13</span>
  <h2>Roth Conversion Calculator</h2>
  <p class="cyh-sub">Moving pre-tax retirement money into a Roth means paying tax now to never pay it again. This sizes the bill, shows how much room is left in your bracket, and tells you whether the trade is worth making this year.</p>
  <div class="cyh-grid">
    <div>
      <div class="cyh-field">
        <label for="cyh-rcAmt">Amount to convert ($)</label>
        <input type="number" id="cyh-rcAmt" value="30000" oninput="cyhRoth()">
        <div class="cyh-hint">From a Traditional IRA or old 401(k).</div>
      </div>
      <div class="cyh-field">
        <label for="cyh-rcIncome">Your other income this year ($)</label>
        <input type="number" id="cyh-rcIncome" value="70000" oninput="cyhRoth()">
        <div class="cyh-hint">Everything else before the conversion. The conversion stacks on top.</div>
      </div>
      <div class="cyh-field">
        <label for="cyh-rcStatus">Filing status</label>
        <select id="cyh-rcStatus" onchange="cyhRoth()">
          <option value="single" selected>Single</option>
          <option value="joint">Married filing jointly</option>
          <option value="hoh">Head of household</option>
        </select>
      </div>
      <div class="cyh-field">
        <label for="cyh-rcPayFrom">Pay the tax from</label>
        <select id="cyh-rcPayFrom" onchange="cyhRoth()">
          <option value="outside" selected>Savings outside the account</option>
          <option value="inside">The converted money itself</option>
        </select>
        <div class="cyh-hint">Paying from inside shrinks the balance &mdash; and under 59&frac12; it is an early withdrawal.</div>
      </div>
    </div>
    <div>
      <div class="cyh-field">
        <label for="cyh-rcYrs">Years until you withdraw</label>
        <input type="number" id="cyh-rcYrs" value="20" oninput="cyhRoth()">
      </div>
      <div class="cyh-field">
        <label for="cyh-rcReturn">Expected annual return (%)</label>
        <input type="number" id="cyh-rcReturn" value="7" step="0.5" oninput="cyhRoth()">
      </div>
      <div class="cyh-field">
        <label for="cyh-rcLater">Your expected tax rate in retirement (%)</label>
        <input type="number" id="cyh-rcLater" value="24" step="1" oninput="cyhRoth()">
        <div class="cyh-hint">The whole decision turns on this against the rate you pay now.</div>
      </div>
    </div>
  </div>
  <div class="cyh-out">
    <div class="cyh-stat neg"><b id="cyh-rcTax">$0</b><span>Tax Due This Year</span></div>
    <div class="cyh-stat"><b id="cyh-rcEff">0%</b><span>Effective Rate on Conversion</span></div>
    <div class="cyh-stat gold"><b id="cyh-rcRoom">$0</b><span>Room Left in Bracket</span></div>
    <div class="cyh-stat pos"><b id="cyh-rcDiff">$0</b><span>Converting Wins By</span></div>
  </div>
  <div class="cyh-out">
    <div class="cyh-stat"><b id="cyh-rcRoth">$0</b><span>Roth Value, Tax-Free</span></div>
    <div class="cyh-stat"><b id="cyh-rcTrad">$0</b><span>If You Don't Convert, After Tax</span></div>
  </div>
  <div class="cyh-msg" id="cyh-rcMsg"></div>
</section>`,
retdraw: `<section class="cyh-tool" id="retdraw">
  <span class="cyh-num">Calculator 14</span>
  <h2>Retirement Withdrawal Calculator</h2>
  <p class="cyh-sub">Every other calculator here is about putting money in. This is the other half. It runs your savings forward year by year, applies the required minimum distributions the IRS forces on you from 73 or 75, and then reruns the identical plan with one bad year at the front &mdash; because the order of the returns matters more than the average, and nobody tells you that until it has already happened.</p>
  <div class="cyh-grid">
    <div>
      <div class="cyh-field">
        <label for="cyh-rwAge">Your age now</label>
        <input type="number" id="cyh-rwAge" value="65" min="30" max="100" oninput="cyhRetDraw()">
        <div class="cyh-hint">Sets your RMD start age &mdash; 73 or 75, depending on your birth year.</div>
      </div>
      <div class="cyh-field">
        <label for="cyh-rwBal">Retirement savings today ($)</label>
        <input type="number" id="cyh-rwBal" value="500000" oninput="cyhRetDraw()">
        <div class="cyh-hint">401(k), 403(b), IRA &mdash; everything invested. Not the house.</div>
      </div>
      <div class="cyh-field">
        <label for="cyh-rwSpend">What you want from savings, year one ($)</label>
        <input type="number" id="cyh-rwSpend" value="20000" oninput="cyhRetDraw()">
        <div class="cyh-hint">Not your whole budget &mdash; only the part the portfolio has to carry. Raised with inflation every year after.</div>
      </div>
      <div class="cyh-field">
        <label for="cyh-rwOther">Guaranteed income a year ($)</label>
        <input type="number" id="cyh-rwOther" value="24000" oninput="cyhRetDraw()">
        <div class="cyh-hint">Social Security, a pension, an annuity. Income you cannot outlive.</div>
      </div>
    </div>
    <div>
      <div class="cyh-field">
        <label for="cyh-rwReturn">Expected annual return (%)</label>
        <input type="number" id="cyh-rwReturn" value="5.5" step="0.25" oninput="cyhRetDraw()">
        <div class="cyh-hint">A retirement-stage mix is usually more conservative than the one that got you here.</div>
      </div>
      <div class="cyh-field">
        <label for="cyh-rwInfl">Inflation (%)</label>
        <input type="number" id="cyh-rwInfl" value="2.5" step="0.25" oninput="cyhRetDraw()">
      </div>
      <div class="cyh-field">
        <label for="cyh-rwTo">Plan to age</label>
        <input type="number" id="cyh-rwTo" value="95" min="70" max="115" oninput="cyhRetDraw()">
        <div class="cyh-hint">Not your life expectancy. About half of people beat that.</div>
      </div>
      <div class="cyh-field">
        <label for="cyh-rwStressPick">Stress test the first year with</label>
        <select id="cyh-rwStressPick" onchange="cyhRetDraw()">
          <option value="-37">2008 &mdash; the S&amp;P fell 37%</option>
          <option value="-25" selected>A hard year &mdash; down 25%</option>
          <option value="-15">A normal bear &mdash; down 15%</option>
        </select>
        <div class="cyh-hint">One bad year at the front, then two flat years, then your expected return. Nothing else changes.</div>
      </div>
    </div>
  </div>
  <div class="cyh-out">
    <div class="cyh-stat gold"><b id="cyh-rwLast">&mdash;</b><span>Savings Last Until</span></div>
    <div class="cyh-stat"><b id="cyh-rwRate">0%</b><span>Starting Withdrawal Rate</span></div>
    <div class="cyh-stat pos"><b id="cyh-rwIncome">$0</b><span>Year-One Income, Pre-Tax</span></div>
    <div class="cyh-stat"><b id="cyh-rwLeft">$0</b><span>Left At Your Plan-To Age</span></div>
  </div>
  <div class="cyh-out">
    <div class="cyh-stat neg"><b id="cyh-rwStress">&mdash;</b><span>With A Bad First Year</span></div>
    <div class="cyh-stat"><b id="cyh-rwSafe">$0</b><span>Withdrawal That Reaches Your Age</span></div>
    <div class="cyh-stat"><b id="cyh-rwRmdAge">&mdash;</b><span>Your RMDs Begin At</span></div>
    <div class="cyh-stat"><b id="cyh-rwRmd1">$0</b><span>First RMD, Estimated</span></div>
  </div>
  <div class="cyh-msg" id="cyh-rwMsg"></div>
</section>`
};

/* ---------- assemble every section, correctly numbered ------------- */
const existing = JSON.parse(R('tools/calc-widgets.json'));
const SECTIONS = {};
for (const c of CALCS) {
  /* Three sources now, checked in this order: the inline NEW_SECTIONS block
     above, the Business group's own module, then the legacy JSON. The JSON
     cannot carry a comment, which is why the business widgets do not live
     in it. */
  let html = NEW_SECTIONS[c.id] || BUSINESS[c.id] || existing[c.id];
  if (!html) throw new Error('No widget markup for calculator: ' + c.id);
  html = html.replace(/<span class="cyh-num">Calculator \d+<\/span>/,
                      `<span class="cyh-num">Calculator ${c.num}</span>`);
  /* Strip the hub's "Learn it" chip row — standalone pages carry a
     richer cross-link block generated below, and two link rows on one
     page is noise. */
  html = html.replace(/\n\s*<div class="cyh-link">[\s\S]*?<\/div>\s*(?=<\/section>)/, '\n');
  SECTIONS[c.id] = html;
}

/* ---------- sidebar (identical on every page) ---------------------- */
function sidebar(currentSlug) {
  let out = '', lastGroup = null;
  for (const c of CALCS) {
    if (c.group !== lastGroup) {
      out += `        <div class="cyh-side-group">${c.group}</div>\n`;
      lastGroup = c.group;
    }
    const cur = c.slug === currentSlug;
    const name = c.h1.replace(/ Calculator$/, '').replace(/ Number Calculator$/, ' Number');
    /* No NEW badge. Removed 2026-08-15 on Adam's call.
       Fifteen of twenty-six carried `isNew: true`, and nothing ever expired it
       - the flag was set when a calculator shipped and then stayed set, so by
       August the sidebar was more than half gold NEW tags advertising tools
       that were months old. A badge that never comes off is not information,
       and on a page whose whole job is "pick the right tool" it was noise
       pointing at the wrong ones. The `isNew` keys are gone from
       calc-content.mjs too; do not reintroduce one without an expiry rule. */
    out += `        <a href="${c.slug}.html"${cur ? ' aria-current="page"' : ''}>${name}</a>\n`;
  }
  return `<aside class="cyh-side">
  <details open>
    <summary class="cyh-side-mobile">All ${CALCS.length} calculators</summary>
    <div class="cyh-side-inner">
      <p class="cyh-side-title cyh-side-desktop-title">All ${CALCS.length} calculators</p>
${out}        <div class="cyh-side-group">More</div>
        <a href="calculate-your-hustle.html">All calculators on one page</a>
        <a href="financial-literacy.html">Financial Literacy resource</a>
    </div>
  </details>
</aside>`;
}

/* ---------- page template ------------------------------------------ */
function page(c) {
  const url = `${SITE}/${c.slug}.html`;
  const links = c.stages.map(k => {
    const [href, label] = STAGES[k];
    return `      <a href="${href}">${label}</a>`;
  }).join('\n');

  const faqVisible = c.faq.map(f =>
    `      <details>
        <summary>${esc(f.q)}</summary>
        <p>${f.a}</p>
      </details>`).join('\n');

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['WebApplication', 'LearningResource'],
        'name': c.h1,
        /* alternateName carries the name people SEARCH for when it differs from
           the name we USE. Schema.org treats it as another label for the same
           entity, so Google can match the query without the word appearing in
           our copy. Added 2026-08-10 for the Life Just Happened Fund, which
           everyone else calls a sinking fund. Optional — omit `alsoKnownAs`
           in calc-content.mjs and the key is left out entirely. */
        ...(c.alsoKnownAs ? { 'alternateName': c.alsoKnownAs } : {}),
        'url': url,
        'applicationCategory': 'FinanceApplication',
        'operatingSystem': 'Any',
        'browserRequirements': 'Requires JavaScript',
        'description': strip(c.desc),
        'isAccessibleForFree': true,
        'learningResourceType': 'Interactive Resource',
        'educationalLevel': 'Beginner',
        'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'USD' },
        'isPartOf': { '@type': 'WebSite', 'name': "Hustlin' — Calculate Your Hustle", 'url': `${SITE}/calculate-your-hustle.html` },
        'publisher': { '@id': `${SITE}/#organization` }
      },
      {
        '@type': 'Organization', '@id': `${SITE}/#organization`, 'name': "Hustlin'", 'url': `${SITE}/`,
        'logo': { '@type': 'ImageObject', 'url': `${SITE}/assets/hustlin-logo.png` },
        'publishingPrinciples': `${SITE}/about.html`
      },
      {
        '@type': 'BreadcrumbList',
        'itemListElement': [
          { '@type': 'ListItem', 'position': 1, 'name': "Hustlin'", 'item': `${SITE}/` },
          { '@type': 'ListItem', 'position': 2, 'name': 'Calculate Your Hustle', 'item': `${SITE}/calculate-your-hustle.html` },
          { '@type': 'ListItem', 'position': 3, 'name': c.h1, 'item': url }
        ]
      },
      {
        '@type': 'FAQPage',
        'mainEntity': c.faq.map(f => ({
          '@type': 'Question', 'name': strip(f.q),
          'acceptedAnswer': { '@type': 'Answer', 'text': strip(f.a) }
        }))
      }
    ]
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<!-- =====================================================================
     GENERATED by tools/build-calculators.mjs — DO NOT EDIT BY HAND.
     Copy lives in tools/calc-content.mjs; layout lives in the builder.
     Any edit here is lost on the next build.
     ===================================================================== -->
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.desc)}">
<link rel="canonical" href="${url}">

<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(c.title)}">
<meta property="og:description" content="${esc(c.desc)}">
<meta property="og:image" content="${SITE}/assets/social-preview.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(c.title)}">
<meta name="twitter:description" content="${esc(c.desc)}">
<meta name="twitter:image" content="${SITE}/assets/social-preview.png">

<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css?v=DEPLOYSTAMP">
<link rel="stylesheet" href="calculators.css?v=DEPLOYSTAMP">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1249156793457835"
     crossorigin="anonymous"></script>
</head>
<body>

${NAV_BLOCK}

<div class="cyh-wrap">

<section class="cyh-hero cyh-hero-sm">
  <p class="cyh-crumb"><a href="index.html">Hustlin'</a> / <a href="calculate-your-hustle.html">Calculate Your Hustle</a> / ${esc(c.h1)}</p>
  <p class="cyh-eye">Free &middot; No Account &middot; Nothing Saved to a Server</p>
  <h1 class="cyh-h1">${esc(c.h1.replace(/ Calculator$/, ''))} <em>Calculator.</em></h1>
  <p class="cyh-lede">${c.lede}</p>
  <div class="cyh-badges">
    <span class="cyh-badge">$0 Forever</span>
    <span class="cyh-badge">No Signup</span>
    <span class="cyh-badge">Runs In Your Browser</span>
  </div>
</section>

<div class="cyh-body">
<div class="cyh-shell">

${sidebar(c.slug)}

<!-- id="calc" is the mobile deep-link target. Under 940px the sidebar
     stacks above <main>, so calculators.js rewrites rail links to
     "<slug>.html#calc" and the reader lands on the tool instead of the
     top of the hero. Do not rename without updating cyhMobileDeepLinks
     in calculators.js and the #calc scroll-margin rule in
     calculators.css. -->
<main id="calc">

${SECTIONS[c.id]}

<article class="cyh-art">
  <h2>How the math works</h2>
  <div class="cyh-formula">${esc(c.formula)}</div>

  <h3>How to use it</h3>
  <ol>
${c.how.map(s => `    <li>${s}</li>`).join('\n')}
  </ol>

  <h3>A worked example</h3>
  <div class="cyh-example"><p>${c.example}</p></div>
${c.quickTable ? `
  <h3>${c.quickTable.h}</h3>
  <p>${c.quickTable.intro}</p>
${c.quickTable.body}
` : ''}
  <h3>Where this sits in the Financial Literacy resource</h3>
  <p>A calculator tells you where you are. It does not tell you what to do next, and a number without a plan behind it tends to produce anxiety rather than progress. These stages are free, need no account, and cover the decision this calculator is measuring.</p>
  <div class="cyh-link">
    <span>Learn it</span>
${links}
  </div>

  <!-- The follow ask. Added 2026-08-10. This is a free surface, so the small ask
       belongs here and the buy ask does not — a follow costs the reader nothing,
       which is what makes it the honest first rung. Reuses .cyh-msg from
       calculators.css rather than introducing a class; a new one used across
       fifteen pages would have to live in styles.css to clear stage 2a00.
       Full reasoning: PLAN-2026-08-10-RECIPROCITY-PITCH.md. Never put a price
       in this block. -->
  <div class="cyh-msg" style="margin-top:18px">
    <b>This one is free, and so is most of the rest.</b> ${CALCS.length} calculators, two complete courses and
    every article &mdash; no account, no email wall, nothing that stops halfway and asks for a card.
    If this was useful, the only thing we would ask is that you
    <a href="https://x.com/hustlin_org" target="_blank" rel="noopener">follow along</a>
    or send it to the one person you know who needs it. That costs nothing, and it is how a small
    operation keeps going. <a href="about.html#support">Why we ask, and when &rarr;</a>
  </div>

  <div class="cyh-faq">
    <h3>Common questions</h3>
${faqVisible}
  </div>

  <h3>What this calculator is not</h3>
  <p>It is an educational model, not a projection and certainly not advice. It knows nothing about your income, your state, your debts or your benefits status, and it ignores taxes and fees unless the page says otherwise. If you receive SSI or SSDI some of this math works differently and getting it wrong can cost you eligibility &mdash; start with the <a href="disability-wealth-guide.html">Disability Wealth Guide</a> instead. Our sourcing and correction policy is on the <a href="about.html">editorial standards page</a>.</p>
  <p><b>Nothing here is stored.</b> Every calculation runs in your browser. No numbers are transmitted, logged or saved to any server, and no account is required. Close the tab and it is gone.</p>
</article>

</main>
</div>
</div>
</div>

<!-- The marker text below must match tools/stamp-footers.mjs byte for byte.
     It looks for this exact comment. An abbreviated marker does not
     match, and the stamper then silently falls through to its "no footer
     found" branch and appends a SECOND footer before the closing body
     tag - which is how these pages briefly ended up with two. -->
<!-- FOOTER:START — generated by tools/stamp-footers.mjs from footer.template.html. DO NOT EDIT BY HAND. -->
<!-- FOOTER:END -->

<script src="calculators.js?v=DEPLOYSTAMP"></script>${c.extraScript ? `\n<script src="${c.extraScript}?v=DEPLOYSTAMP"></script>` : ''}
</body>
</html>
`;
}

/* ---------- write ---------------------------------------------------- */
/* Preserve a footer that stamp-footers.mjs has already written.
   The template emits the FOOTER markers empty, so without this the two
   scripts fight: every build blanks the footer, every stamp refills it,
   and neither ever reports "unchanged". Carrying the existing footer
   forward makes the pair converge after one pass — which is what lets
   `--check` mean anything. */
const FOOTER_RE = /<!-- FOOTER:START[\s\S]*?<!-- FOOTER:END -->/;
function keepFooter(out, prev) {
  if (!prev || FRESH) return out;
  const existing = prev.match(FOOTER_RE);
  if (!existing) return out;
  return out.replace(FOOTER_RE, existing[0]);
}

let written = 0, same = 0;
const results = [];
for (const c of CALCS) {
  const path = join(ROOT, c.slug + '.html');
  const prev = existsSync(path) ? readFileSync(path, 'utf8') : null;
  const out = keepFooter(page(c), prev);
  if (prev === out) { same++; results.push(['=', c.slug]); continue; }
  if (!CHECK) writeFileSync(path, out, 'utf8');
  written++; results.push([prev === null ? '+' : '~', c.slug]);
}
for (const [m, s] of results) console.log(`  ${m} ${s}.html`);
console.log(`\n  ${written} written, ${same} unchanged${CHECK ? '  (--check: nothing written)' : ''}`);
console.log(`  Rates baked: 30yr ${RATES.mortgage30.value}% (${RATES.mortgage30.date}), auto ${RATES.auto60.value}% (${RATES.auto60.date})`);
console.log(`\n  NEXT: node tools/stamp-footers.mjs`);

export { CALCS, SECTIONS, sidebar, RATES };
