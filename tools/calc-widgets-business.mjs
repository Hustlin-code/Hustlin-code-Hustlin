/* ===================================================================
   calc-widgets-business.mjs
   -------------------------------------------------------------------
   Widget markup for the Business group. Kept out of calc-widgets.json
   and out of build-calculators.mjs' inline NEW_SECTIONS for one reason:
   the JSON file cannot carry a comment, and these widgets need them.

   Every id in here must match a CALCS id in calc-content.mjs, and every
   oninput handler must exist on window in calculators-business.js.

   HOUSE RULE, and it bites harder here than anywhere else on the site:
   a metric we do not have renders as an em dash, never as zero. A
   business calculator can legitimately produce "no answer" — a negative
   contribution margin has no breakeven, a payment below the interest
   never clears — and printing 0 for those is worse than printing
   nothing, because 0 reads as a real answer.
   =================================================================== */

export const BUSINESS = {

/* ---------- 16. Pricing & Breakeven ------------------------------- */
pricing: `<section class="cyh-tool" id="pricing">
  <span class="cyh-num">Calculator 16</span>
  <h2>Pricing &amp; Breakeven</h2>
  <p class="cyh-sub">What you have to charge, and how many you have to sell before you have made a single dollar. Card fees included, because they come out of every sale whether you count them or not.</p>

  <div class="cyh-grid">
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-bpFixed">Fixed costs per month</label>
        <input type="number" id="cyh-bpFixed" placeholder="3200" oninput="cyhPricing()" value="3200">
        <p class="cyh-hint">Rent, insurance, software, your own wage &mdash; everything you pay whether you sell one or none.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-bpVar">Variable cost per unit</label>
        <input type="number" id="cyh-bpVar" placeholder="14" step="0.01" oninput="cyhPricing()" value="14">
        <p class="cyh-hint">Materials, packaging, shipping, the hour of labor that only happens when you sell.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-bpPrice">Your price per unit</label>
        <input type="number" id="cyh-bpPrice" placeholder="35" step="0.01" oninput="cyhPricing()" value="35">
      </div>
      <div class="cyh-field">
        <label for="cyh-bpUnits">Units you expect to sell per month</label>
        <input type="number" id="cyh-bpUnits" placeholder="200" oninput="cyhPricing()" value="200">
      </div>
    </div>
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-bpPct">Payment processing (% of price)</label>
        <input type="number" id="cyh-bpPct" placeholder="2.9" step="0.01" oninput="cyhPricing()" value="2.9">
        <p class="cyh-hint">Whatever your card processor takes. Set it to 0 if you are paid another way.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-bpFix">Payment processing (fixed, per sale)</label>
        <input type="number" id="cyh-bpFix" placeholder="0.30" step="0.01" oninput="cyhPricing()" value="0.30">
      </div>
      <div class="cyh-field">
        <label for="cyh-bpTarget">Target gross margin (%)</label>
        <input type="number" id="cyh-bpTarget" placeholder="60" step="1" oninput="cyhPricing()" value="60">
        <p class="cyh-hint">What margin do you want? We work backwards to the price that gets you there.</p>
      </div>
    </div>
  </div>

  <div class="cyh-out">
    <div class="cyh-stat"><b id="cyh-bpBE">&mdash;</b><span>Breakeven Units / Month</span></div>
    <div class="cyh-stat"><b id="cyh-bpCM">&mdash;</b><span>Contribution Margin / Unit</span></div>
    <div class="cyh-stat gold"><b id="cyh-bpMargin">&mdash;</b><span>Gross Margin at Your Price</span></div>
    <div class="cyh-stat pos" id="cyh-bpProfitWrap"><b id="cyh-bpProfit">&mdash;</b><span>Profit at Your Volume</span></div>
  </div>
  <div class="cyh-msg" id="cyh-bpMsg" style="display:none"></div>

  <table class="cyh-tbl" id="cyh-bpTbl">
    <thead><tr><th>If your price were</th><th>Breakeven units</th><th>Profit at your volume</th><th>Margin</th></tr></thead>
    <tbody id="cyh-bpRows"></tbody>
  </table>
  <p class="cyh-note">Breakeven ignores tax and assumes your fixed costs hold. It is a floor, not a forecast &mdash; the number of units below which you are working for free.</p>
</section>`,

/* ---------- 17. Line of Credit Payoff ----------------------------- */
locpayoff: `<section class="cyh-tool" id="locpayoff">
  <span class="cyh-num">Calculator 17</span>
  <h2>Line of Credit Payoff</h2>
  <p class="cyh-sub">A revolving balance is not a loan with an end date &mdash; it only ends when you stop drawing on it. This runs the balance month by month, including what you keep charging.</p>

  <div class="cyh-grid">
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-locBal">Current balance</label>
        <input type="number" id="cyh-locBal" placeholder="18000" oninput="cyhLoc()" value="18000">
      </div>
      <div class="cyh-field">
        <label for="cyh-locApr">Interest rate (APR %)</label>
        <input type="number" id="cyh-locApr" placeholder="13.5" step="0.01" oninput="cyhLoc()" value="13.5">
        <p class="cyh-hint">Most business lines are variable and move with the prime rate.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-locPay">Monthly payment</label>
        <input type="number" id="cyh-locPay" placeholder="750" oninput="cyhLoc()" value="750">
      </div>
    </div>
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-locNew">New charges per month</label>
        <input type="number" id="cyh-locNew" placeholder="200" oninput="cyhLoc()" value="200">
        <p class="cyh-hint">The number most payoff calculators pretend is zero. It rarely is.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-locFee">Annual fee</label>
        <input type="number" id="cyh-locFee" placeholder="150" oninput="cyhLoc()" value="150">
      </div>
      <div class="cyh-field">
        <label for="cyh-locGoal">Clear it in how many months? (optional)</label>
        <input type="number" id="cyh-locGoal" placeholder="24" oninput="cyhLoc()" value="24">
        <p class="cyh-hint">We solve backwards for the payment that hits your date.</p>
      </div>
    </div>
  </div>

  <div class="cyh-out">
    <div class="cyh-stat"><b id="cyh-locTime">&mdash;</b><span>Time to Clear</span></div>
    <div class="cyh-stat neg"><b id="cyh-locInt">&mdash;</b><span>Interest &amp; Fees Paid</span></div>
    <div class="cyh-stat"><b id="cyh-locTotal">&mdash;</b><span>Total Paid</span></div>
    <div class="cyh-stat gold"><b id="cyh-locNeed">&mdash;</b><span>Payment to Hit Your Date</span></div>
  </div>
  <div class="cyh-msg" id="cyh-locMsg" style="display:none"></div>
  <p class="cyh-note">Interest is charged on the balance each month, so paying earlier in the month costs less than paying later. A variable rate can move while you are paying this down &mdash; re-run it when it does.</p>
</section>`
,

/* ---------- 18. Business Loan ------------------------------------- */
bizloan: `<section class="cyh-tool" id="bizloan">
  <span class="cyh-num">Calculator 18</span>
  <h2>Business Loan</h2>
  <p class="cyh-sub">The payment, the real APR once the fees are in, and whether the business actually covers the debt. Plus what a merchant cash advance costs in the same units, so you can compare the two honestly.</p>

  <div class="cyh-grid">
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-blAmt">Loan amount</label>
        <input type="number" id="cyh-blAmt" placeholder="75000" oninput="cyhBizLoan()" value="75000">
      </div>
      <div class="cyh-field">
        <label for="cyh-blRate">Quoted rate (APR %)</label>
        <input type="number" id="cyh-blRate" placeholder="9.5" step="0.01" oninput="cyhBizLoan()" value="9.5">
      </div>
      <div class="cyh-field">
        <label for="cyh-blTerm">Term (months)</label>
        <input type="number" id="cyh-blTerm" placeholder="60" oninput="cyhBizLoan()" value="60">
      </div>
    </div>
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-blOrig">Origination fee (% of loan)</label>
        <input type="number" id="cyh-blOrig" placeholder="3" step="0.01" oninput="cyhBizLoan()" value="3">
        <p class="cyh-hint">Usually taken off the top, so you receive less than you borrow but repay all of it.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-blFees">Other closing costs ($)</label>
        <input type="number" id="cyh-blFees" placeholder="500" oninput="cyhBizLoan()" value="500">
      </div>
      <div class="cyh-field">
        <label for="cyh-blNoi">Annual cash available for debt ($)</label>
        <input type="number" id="cyh-blNoi" placeholder="48000" oninput="cyhBizLoan()" value="48000">
        <p class="cyh-hint">Profit before this loan's payments, plus depreciation. Lenders call it net operating income.</p>
      </div>
    </div>
  </div>

  <div class="cyh-out">
    <div class="cyh-stat"><b id="cyh-blPay">&mdash;</b><span>Monthly Payment</span></div>
    <div class="cyh-stat neg"><b id="cyh-blCost">&mdash;</b><span>Interest &amp; Fees</span></div>
    <div class="cyh-stat gold"><b id="cyh-blApr">&mdash;</b><span>Effective APR</span></div>
    <div class="cyh-stat" id="cyh-blDscrWrap"><b id="cyh-blDscr">&mdash;</b><span>Debt Service Coverage</span></div>
  </div>
  <div class="cyh-msg" id="cyh-blMsg" style="display:none"></div>

  <h3 class="cyh-sub-h">Compare it against a merchant cash advance</h3>
  <p class="cyh-note">An advance is quoted as a factor rate, not a rate, and there is no APR on the paperwork. This converts it into the same units as the loan above. An advance is legally a purchase of future receivables rather than a loan in most states, so this is the equivalent APR <em>if it were</em> a loan &mdash; which is the comparison you need to make the decision.</p>
  <div class="cyh-grid">
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-blAdv">Advance amount</label>
        <input type="number" id="cyh-blAdv" placeholder="50000" oninput="cyhBizLoan()" value="50000">
      </div>
      <div class="cyh-field">
        <label for="cyh-blFactor">Factor rate</label>
        <input type="number" id="cyh-blFactor" placeholder="1.35" step="0.01" oninput="cyhBizLoan()" value="1.35">
        <p class="cyh-hint">1.35 means you repay $1.35 for every $1 advanced.</p>
      </div>
    </div>
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-blAdvTerm">Repayment period (months)</label>
        <input type="number" id="cyh-blAdvTerm" placeholder="12" oninput="cyhBizLoan()" value="12">
      </div>
      <div class="cyh-field">
        <label for="cyh-blAdvFee">Origination / underwriting fee ($)</label>
        <input type="number" id="cyh-blAdvFee" placeholder="1000" oninput="cyhBizLoan()" value="1000">
      </div>
    </div>
  </div>
  <div class="cyh-out">
    <div class="cyh-stat"><b id="cyh-blAdvPay">&mdash;</b><span>Monthly Remittance</span></div>
    <div class="cyh-stat neg"><b id="cyh-blAdvCost">&mdash;</b><span>Cost of the Advance</span></div>
    <div class="cyh-stat gold"><b id="cyh-blAdvApr">&mdash;</b><span>Equivalent APR</span></div>
    <div class="cyh-stat"><b id="cyh-blGap">&mdash;</b><span>Extra vs. the Loan</span></div>
  </div>
  <div class="cyh-msg" id="cyh-blAdvMsg" style="display:none"></div>
  <p class="cyh-note">Interest on a genuine trade-or-business loan is generally deductible as a business expense, but it is limited by the business interest expense limitation and there is a small-business exception. This calculator does not estimate any tax effect &mdash; see <a href="https://www.irs.gov/publications/p334" target="_blank" rel="noopener">IRS Publication 334</a> and talk to a CPA.</p>
</section>`,

/* ---------- 19. Business Cash Flow -------------------------------- */
bizcash: `<section class="cyh-tool" id="bizcash">
  <span class="cyh-num">Calculator 19</span>
  <h2>Business Cash Flow</h2>
  <p class="cyh-sub">Profit is an opinion; cash is a fact. This splits a month into operating, investing and financing, then tells you how long the cash lasts if nothing changes.</p>

  <div class="cyh-grid">
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-cfStart">Cash at the start of the month</label>
        <input type="number" id="cyh-cfStart" placeholder="42000" oninput="cyhBizCash()" value="42000">
      </div>
      <div class="cyh-field">
        <label for="cyh-cfIn">Collected from customers</label>
        <input type="number" id="cyh-cfIn" placeholder="61000" oninput="cyhBizCash()" value="61000">
        <p class="cyh-hint">Cash that actually arrived, not what you invoiced.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-cfOther">Other cash received</label>
        <input type="number" id="cyh-cfOther" placeholder="0" oninput="cyhBizCash()" value="0">
      </div>
      <div class="cyh-field">
        <label for="cyh-cfInv">Paid for inventory / materials</label>
        <input type="number" id="cyh-cfInv" placeholder="19000" oninput="cyhBizCash()" value="19000">
      </div>
      <div class="cyh-field">
        <label for="cyh-cfPay">Payroll, including yours</label>
        <input type="number" id="cyh-cfPay" placeholder="24000" oninput="cyhBizCash()" value="24000">
      </div>
    </div>
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-cfOps">Rent, insurance and other operating costs</label>
        <input type="number" id="cyh-cfOps" placeholder="11000" oninput="cyhBizCash()" value="11000">
      </div>
      <div class="cyh-field">
        <label for="cyh-cfInt">Interest paid</label>
        <input type="number" id="cyh-cfInt" placeholder="900" oninput="cyhBizCash()" value="900">
      </div>
      <div class="cyh-field">
        <label for="cyh-cfCapex">Equipment and other purchases (investing)</label>
        <input type="number" id="cyh-cfCapex" placeholder="4000" oninput="cyhBizCash()" value="4000">
        <p class="cyh-hint">Enter a negative number if you sold something instead.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-cfBorrow">New borrowing and owner money in</label>
        <input type="number" id="cyh-cfBorrow" placeholder="0" oninput="cyhBizCash()" value="0">
      </div>
      <div class="cyh-field">
        <label for="cyh-cfRepay">Loan repayments and owner draws</label>
        <input type="number" id="cyh-cfRepay" placeholder="3500" oninput="cyhBizCash()" value="3500">
      </div>
    </div>
  </div>

  <div class="cyh-out">
    <div class="cyh-stat" id="cyh-cfOpWrap"><b id="cyh-cfOp">&mdash;</b><span>Operating Cash Flow</span></div>
    <div class="cyh-stat" id="cyh-cfNetWrap"><b id="cyh-cfNet">&mdash;</b><span>Net Change in Cash</span></div>
    <div class="cyh-stat"><b id="cyh-cfEnd">&mdash;</b><span>Cash at Month End</span></div>
    <div class="cyh-stat gold"><b id="cyh-cfRun">&mdash;</b><span>Runway</span></div>
  </div>
  <div class="cyh-msg" id="cyh-cfMsg" style="display:none"></div>

  <table class="cyh-tbl" id="cyh-cfTbl">
    <thead><tr><th>Section</th><th>In</th><th>Out</th><th>Net</th></tr></thead>
    <tbody id="cyh-cfRows"></tbody>
  </table>
  <p class="cyh-note">Operating cash flow is the line that matters most. A business can show a profit and still run out of money, and it usually does so while operating cash flow is negative and financing is quietly covering the gap.</p>
</section>`
,

/* ---------- 20. Business Ratios & Working Capital ----------------- */
bizratios: `<section class="cyh-tool" id="bizratios">
  <span class="cyh-num">Calculator 20</span>
  <h2>Business Ratios &amp; Working Capital</h2>
  <p class="cyh-sub">Eleven numbers off your own books, turned into the ratios a lender will calculate about you anyway. Every figure comes from your balance sheet and your profit and loss &mdash; nothing here is compared against an industry average, because the honest ones are not published for free.</p>

  <div class="cyh-grid">
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-brSales">Annual sales</label>
        <input type="number" id="cyh-brSales" placeholder="480000" oninput="cyhBizRatios()" value="480000">
      </div>
      <div class="cyh-field">
        <label for="cyh-brCogs">Cost of goods sold</label>
        <input type="number" id="cyh-brCogs" placeholder="288000" oninput="cyhBizRatios()" value="288000">
        <p class="cyh-hint">What the things you sold cost you to make or buy. Not rent, not salaries that are not production.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-brOpex">Operating expenses</label>
        <input type="number" id="cyh-brOpex" placeholder="150000" oninput="cyhBizRatios()" value="150000">
      </div>
      <div class="cyh-field">
        <label for="cyh-brInt">Interest expense</label>
        <input type="number" id="cyh-brInt" placeholder="9000" oninput="cyhBizRatios()" value="9000">
      </div>
      <div class="cyh-field">
        <label for="cyh-brGrow">Expected sales growth next year (%)</label>
        <input type="number" id="cyh-brGrow" placeholder="20" step="1" oninput="cyhBizRatios()" value="20">
      </div>
      <div class="cyh-field">
        <label for="cyh-brCA">Current assets</label>
        <input type="number" id="cyh-brCA" placeholder="96000" oninput="cyhBizRatios()" value="96000">
        <p class="cyh-hint">Cash, receivables, inventory &mdash; anything you expect to turn into cash within a year.</p>
      </div>
    </div>
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-brInv">Inventory (part of current assets)</label>
        <input type="number" id="cyh-brInv" placeholder="42000" oninput="cyhBizRatios()" value="42000">
      </div>
      <div class="cyh-field">
        <label for="cyh-brAR">Accounts receivable (part of current assets)</label>
        <input type="number" id="cyh-brAR" placeholder="38000" oninput="cyhBizRatios()" value="38000">
      </div>
      <div class="cyh-field">
        <label for="cyh-brCL">Current liabilities</label>
        <input type="number" id="cyh-brCL" placeholder="61000" oninput="cyhBizRatios()" value="61000">
        <p class="cyh-hint">Everything due within a year, including the next twelve months of loan payments.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-brTA">Total assets</label>
        <input type="number" id="cyh-brTA" placeholder="210000" oninput="cyhBizRatios()" value="210000">
      </div>
      <div class="cyh-field">
        <label for="cyh-brTL">Total liabilities</label>
        <input type="number" id="cyh-brTL" placeholder="138000" oninput="cyhBizRatios()" value="138000">
      </div>
    </div>
  </div>

  <div class="cyh-out">
    <div class="cyh-stat" id="cyh-brWCWrap"><b id="cyh-brWC">&mdash;</b><span>Working Capital</span></div>
    <div class="cyh-stat"><b id="cyh-brCurrent">&mdash;</b><span>Current Ratio</span></div>
    <div class="cyh-stat gold"><b id="cyh-brNet">&mdash;</b><span>Net Margin</span></div>
    <div class="cyh-stat"><b id="cyh-brNeed">&mdash;</b><span>Extra Working Capital to Grow</span></div>
  </div>
  <div class="cyh-msg" id="cyh-brMsg" style="display:none"></div>

  <table class="cyh-tbl" id="cyh-brTbl">
    <thead><tr><th>Ratio</th><th>Yours</th><th>What it is measuring</th></tr></thead>
    <tbody id="cyh-brRows"></tbody>
  </table>
  <p class="cyh-note">There are no benchmark columns here on purpose. Useful industry comparisons come from paid datasets we cannot verify or link, and a made-up &ldquo;healthy range&rdquo; is worse than none. The comparison that costs nothing and tells you more is your own figures from three months ago. The Federal Reserve&rsquo;s <a href="https://www.fedsmallbusiness.org/" target="_blank" rel="noopener">Small Business Credit Survey</a> is the best free read on how firms like yours are actually financed.</p>
</section>`,

/* ---------- 21. Equipment Lease vs Buy ---------------------------- */
bizlease: `<section class="cyh-tool" id="bizlease">
  <span class="cyh-num">Calculator 21</span>
  <h2>Equipment: Lease vs. Buy</h2>
  <p class="cyh-sub">Both paths in today&rsquo;s money, so a monthly payment cannot flatter one of them. Then the resale value at which the answer flips.</p>

  <div class="cyh-grid">
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-elPrice">Purchase price</label>
        <input type="number" id="cyh-elPrice" placeholder="60000" oninput="cyhBizLease()" value="60000">
      </div>
      <div class="cyh-field">
        <label for="cyh-elTax">Sales tax (%)</label>
        <input type="number" id="cyh-elTax" placeholder="7" step="0.01" oninput="cyhBizLease()" value="7">
      </div>
      <div class="cyh-field">
        <label for="cyh-elDown">Down payment</label>
        <input type="number" id="cyh-elDown" placeholder="6000" oninput="cyhBizLease()" value="6000">
      </div>
      <div class="cyh-field">
        <label for="cyh-elFees">Other purchase fees</label>
        <input type="number" id="cyh-elFees" placeholder="500" oninput="cyhBizLease()" value="500">
      </div>
      <div class="cyh-field">
        <label for="cyh-elApr">Loan rate (APR %)</label>
        <input type="number" id="cyh-elApr" placeholder="8.5" step="0.01" oninput="cyhBizLease()" value="8.5">
      </div>
      <div class="cyh-field">
        <label for="cyh-elResale">What you expect it to be worth at the end</label>
        <input type="number" id="cyh-elResale" placeholder="18000" oninput="cyhBizLease()" value="18000">
        <p class="cyh-hint">The single most uncertain number here, and the one that decides it. Try a range.</p>
      </div>
    </div>
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-elTerm">Term, both paths (months)</label>
        <input type="number" id="cyh-elTerm" placeholder="60" oninput="cyhBizLease()" value="60">
        <p class="cyh-hint">Compare like for like. A 36-month lease against a 60-month loan is not a comparison.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-elLease">Monthly lease payment</label>
        <input type="number" id="cyh-elLease" placeholder="950" oninput="cyhBizLease()" value="950">
      </div>
      <div class="cyh-field">
        <label for="cyh-elUp">Lease: due at signing</label>
        <input type="number" id="cyh-elUp" placeholder="2500" oninput="cyhBizLease()" value="2500">
      </div>
      <div class="cyh-field">
        <label for="cyh-elDep">Lease: refundable security deposit</label>
        <input type="number" id="cyh-elDep" placeholder="1000" oninput="cyhBizLease()" value="1000">
      </div>
      <div class="cyh-field">
        <label for="cyh-elDisc">What your cash earns elsewhere (%)</label>
        <input type="number" id="cyh-elDisc" placeholder="5" step="0.01" oninput="cyhBizLease()" value="5">
        <p class="cyh-hint">The discount rate. Money paid later costs less than money paid now, and this is how much less.</p>
      </div>
    </div>
  </div>

  <div class="cyh-out">
    <div class="cyh-stat"><b id="cyh-elLoanPay">&mdash;</b><span>Loan Payment</span></div>
    <div class="cyh-stat"><b id="cyh-elBuyPV">&mdash;</b><span>Cost to Buy (today&rsquo;s money)</span></div>
    <div class="cyh-stat"><b id="cyh-elLeasePV">&mdash;</b><span>Cost to Lease (today&rsquo;s money)</span></div>
    <div class="cyh-stat gold" id="cyh-elWinWrap"><b id="cyh-elWin">&mdash;</b><span>Cheaper By</span></div>
  </div>
  <div class="cyh-msg" id="cyh-elMsg" style="display:none"></div>
  <p class="cyh-note"><b>Tax is not in this comparison.</b> Lease payments are generally deductible as paid, while a purchase is capitalized and depreciated, and Section 179 or bonus depreciation can pull that deduction forward. Those rules move, they depend on your profit, and getting them wrong is expensive &mdash; so they belong in a conversation with a CPA and in <a href="https://www.irs.gov/publications/p946" target="_blank" rel="noopener">IRS Publication 946</a>, not folded silently into a headline number. What is above is the cash comparison, which is the half you can calculate honestly.</p>
</section>`
,

/* ---------- 22. Rental Property ----------------------------------- */
rental: `<section class="cyh-tool" id="rental">
  <span class="cyh-num">Calculator 22</span>
  <h2>Rental Property Analyzer</h2>
  <p class="cyh-sub">Cash flow, cap rate, cash-on-cash and coverage on one screen &mdash; with vacancy, maintenance and capital reserves in the numbers, which is where most back-of-envelope rental math falls apart.</p>

  <div class="cyh-grid">
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-rpPrice">Purchase price</label>
        <input type="number" id="cyh-rpPrice" placeholder="240000" oninput="cyhRental()" value="240000">
      </div>
      <div class="cyh-field">
        <label for="cyh-rpDown">Down payment (%)</label>
        <input type="number" id="cyh-rpDown" placeholder="25" step="0.5" oninput="cyhRental()" value="25">
        <p class="cyh-hint">Investment property normally needs 20&ndash;25% down. Owner-occupied rules do not apply.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-rpRate">Mortgage rate (APR %)</label>
        <input type="number" id="cyh-rpRate" placeholder="6.69" step="0.01" oninput="cyhRental()" value="6.69">
      </div>
      <div class="cyh-field">
        <label for="cyh-rpYears">Loan term (years)</label>
        <input type="number" id="cyh-rpYears" placeholder="30" oninput="cyhRental()" value="30">
      </div>
      <div class="cyh-field">
        <label for="cyh-rpClose">Closing costs</label>
        <input type="number" id="cyh-rpClose" placeholder="6000" oninput="cyhRental()" value="6000">
      </div>
      <div class="cyh-field">
        <label for="cyh-rpRehab">Repairs before it can be rented</label>
        <input type="number" id="cyh-rpRehab" placeholder="4000" oninput="cyhRental()" value="4000">
      </div>
      <div class="cyh-field">
        <label for="cyh-rpRent">Monthly rent</label>
        <input type="number" id="cyh-rpRent" placeholder="2200" oninput="cyhRental()" value="2200">
      </div>
    </div>
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-rpVac">Vacancy allowance (% of rent)</label>
        <input type="number" id="cyh-rpVac" placeholder="5" step="0.5" oninput="cyhRental()" value="5">
        <p class="cyh-hint">One empty month a year is about 8%. Zero is not an assumption, it is a wish.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-rpTax">Property tax (per year)</label>
        <input type="number" id="cyh-rpTax" placeholder="3600" oninput="cyhRental()" value="3600">
      </div>
      <div class="cyh-field">
        <label for="cyh-rpIns">Insurance (per year)</label>
        <input type="number" id="cyh-rpIns" placeholder="1400" oninput="cyhRental()" value="1400">
      </div>
      <div class="cyh-field">
        <label for="cyh-rpMaint">Maintenance (% of rent)</label>
        <input type="number" id="cyh-rpMaint" placeholder="8" step="0.5" oninput="cyhRental()" value="8">
      </div>
      <div class="cyh-field">
        <label for="cyh-rpCapex">Capital reserve (% of rent)</label>
        <input type="number" id="cyh-rpCapex" placeholder="8" step="0.5" oninput="cyhRental()" value="8">
        <p class="cyh-hint">Roof, furnace, water heater. They do not fail monthly, but they fail.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-rpMgmt">Property management (% of rent)</label>
        <input type="number" id="cyh-rpMgmt" placeholder="8" step="0.5" oninput="cyhRental()" value="8">
        <p class="cyh-hint">Put a number here even if you self-manage. Your time is the cost.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-rpHoa">HOA (per month)</label>
        <input type="number" id="cyh-rpHoa" placeholder="0" oninput="cyhRental()" value="0">
      </div>
    </div>
  </div>

  <div class="cyh-out">
    <div class="cyh-stat" id="cyh-rpCFWrap"><b id="cyh-rpCF">&mdash;</b><span>Monthly Cash Flow</span></div>
    <div class="cyh-stat gold"><b id="cyh-rpCap">&mdash;</b><span>Cap Rate</span></div>
    <div class="cyh-stat" id="cyh-rpCoCWrap"><b id="cyh-rpCoC">&mdash;</b><span>Cash-on-Cash Return</span></div>
    <div class="cyh-stat" id="cyh-rpDscrWrap"><b id="cyh-rpDscr">&mdash;</b><span>Debt Coverage</span></div>
  </div>
  <div class="cyh-msg" id="cyh-rpMsg" style="display:none"></div>

  <table class="cyh-tbl" id="cyh-rpTbl">
    <thead><tr><th>Per year</th><th>Amount</th></tr></thead>
    <tbody id="cyh-rpRows"></tbody>
  </table>
  <p class="cyh-note">Cap rate is net operating income over purchase price, before financing &mdash; it describes the building, not your deal. Cash-on-cash includes the mortgage and describes your deal. There is no benchmark column here: what counts as a good cap rate is entirely local, and the datasets that would tell you honestly are not free.</p>
</section>`,

/* ---------- 23. Fix & Flip ---------------------------------------- */
flip: `<section class="cyh-tool" id="flip">
  <span class="cyh-num">Calculator 23</span>
  <h2>Fix &amp; Flip / 70% Rule</h2>
  <p class="cyh-sub">The maximum you can pay, what the project really costs once money and time are counted, and the resale price below which the whole thing loses money.</p>

  <div class="cyh-grid">
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-fpArv">After-repair value (ARV)</label>
        <input type="number" id="cyh-fpArv" placeholder="320000" oninput="cyhFlip()" value="320000">
        <p class="cyh-hint">What it sells for finished. Base it on closed comparable sales, not listings.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-fpRepair">Repair budget</label>
        <input type="number" id="cyh-fpRepair" placeholder="45000" oninput="cyhFlip()" value="45000">
      </div>
      <div class="cyh-field">
        <label for="cyh-fpBuy">Purchase price</label>
        <input type="number" id="cyh-fpBuy" placeholder="185000" oninput="cyhFlip()" value="185000">
      </div>
      <div class="cyh-field">
        <label for="cyh-fpClose">Closing costs to buy</label>
        <input type="number" id="cyh-fpClose" placeholder="4000" oninput="cyhFlip()" value="4000">
      </div>
      <div class="cyh-field">
        <label for="cyh-fpMonths">Months you will hold it</label>
        <input type="number" id="cyh-fpMonths" placeholder="6" oninput="cyhFlip()" value="6">
      </div>
    </div>
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-fpHold">Holding costs per month</label>
        <input type="number" id="cyh-fpHold" placeholder="1200" oninput="cyhFlip()" value="1200">
        <p class="cyh-hint">Taxes, insurance, utilities, security. Not the loan &mdash; that is below.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-fpLoan">Loan (% of purchase price)</label>
        <input type="number" id="cyh-fpLoan" placeholder="80" step="1" oninput="cyhFlip()" value="80">
      </div>
      <div class="cyh-field">
        <label for="cyh-fpPoints">Loan points (%)</label>
        <input type="number" id="cyh-fpPoints" placeholder="2" step="0.25" oninput="cyhFlip()" value="2">
      </div>
      <div class="cyh-field">
        <label for="cyh-fpRate">Loan rate (APR %)</label>
        <input type="number" id="cyh-fpRate" placeholder="11" step="0.01" oninput="cyhFlip()" value="11">
        <p class="cyh-hint">Hard money is priced well above a mortgage. Interest-only while you hold.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-fpSell">Selling costs (% of ARV)</label>
        <input type="number" id="cyh-fpSell" placeholder="8" step="0.5" oninput="cyhFlip()" value="8">
        <p class="cyh-hint">Agent commission, transfer taxes, concessions.</p>
      </div>
    </div>
  </div>

  <div class="cyh-out">
    <div class="cyh-stat gold"><b id="cyh-fpMao">&mdash;</b><span>Max Offer (70% Rule)</span></div>
    <div class="cyh-stat" id="cyh-fpProfitWrap"><b id="cyh-fpProfit">&mdash;</b><span>Profit</span></div>
    <div class="cyh-stat"><b id="cyh-fpRoi">&mdash;</b><span>Return on Your Cash</span></div>
    <div class="cyh-stat"><b id="cyh-fpBe">&mdash;</b><span>Breakeven Sale Price</span></div>
  </div>
  <div class="cyh-msg" id="cyh-fpMsg" style="display:none"></div>

  <table class="cyh-tbl" id="cyh-fpTbl">
    <thead><tr><th>Where the money goes</th><th>Amount</th></tr></thead>
    <tbody id="cyh-fpRows"></tbody>
  </table>
  <p class="cyh-note">The 70% rule is a screening convention, not a law &mdash; 70% of ARV minus repairs, which leaves room for costs and a margin. Investors in expensive markets often work above it and in cheap ones below it. Treat it as the number that decides whether a deal is worth a second hour, not whether it is worth buying.</p>
</section>`,

/* ---------- 24. BRRRR --------------------------------------------- */
brrrr: `<section class="cyh-tool" id="brrrr">
  <span class="cyh-num">Calculator 24</span>
  <h2>BRRRR Calculator</h2>
  <p class="cyh-sub">Buy, rehab, rent, refinance, repeat. The number that matters is how much of your own money is still stuck in the deal afterwards &mdash; and whether it still cash flows once the new loan is on it.</p>

  <div class="cyh-grid">
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-bxBuy">Purchase price</label>
        <input type="number" id="cyh-bxBuy" placeholder="120000" oninput="cyhBrrrr()" value="120000">
      </div>
      <div class="cyh-field">
        <label for="cyh-bxRehab">Rehab budget</label>
        <input type="number" id="cyh-bxRehab" placeholder="38000" oninput="cyhBrrrr()" value="38000">
      </div>
      <div class="cyh-field">
        <label for="cyh-bxClose">Closing and holding costs</label>
        <input type="number" id="cyh-bxClose" placeholder="4000" oninput="cyhBrrrr()" value="4000">
      </div>
      <div class="cyh-field">
        <label for="cyh-bxArv">Appraised value after rehab</label>
        <input type="number" id="cyh-bxArv" placeholder="235000" oninput="cyhBrrrr()" value="235000">
        <p class="cyh-hint">The whole strategy rests on this one number, and it is set by an appraiser, not by you.</p>
      </div>
      <div class="cyh-field">
        <label for="cyh-bxLtv">Refinance loan-to-value (%)</label>
        <input type="number" id="cyh-bxLtv" placeholder="75" step="1" oninput="cyhBrrrr()" value="75">
      </div>
    </div>
    <div class="cyh-col">
      <div class="cyh-field">
        <label for="cyh-bxRate">Refinance rate (APR %)</label>
        <input type="number" id="cyh-bxRate" placeholder="7.25" step="0.01" oninput="cyhBrrrr()" value="7.25">
      </div>
      <div class="cyh-field">
        <label for="cyh-bxYears">Refinance term (years)</label>
        <input type="number" id="cyh-bxYears" placeholder="30" oninput="cyhBrrrr()" value="30">
      </div>
      <div class="cyh-field">
        <label for="cyh-bxRent">Monthly rent</label>
        <input type="number" id="cyh-bxRent" placeholder="2400" oninput="cyhBrrrr()" value="2400">
      </div>
      <div class="cyh-field">
        <label for="cyh-bxTax">Property tax + insurance (per year)</label>
        <input type="number" id="cyh-bxTax" placeholder="4300" oninput="cyhBrrrr()" value="4300">
      </div>
      <div class="cyh-field">
        <label for="cyh-bxOpex">Vacancy, maintenance, capex, management (% of rent)</label>
        <input type="number" id="cyh-bxOpex" placeholder="29" step="1" oninput="cyhBrrrr()" value="29">
        <p class="cyh-hint">5% vacancy plus 8% each for maintenance, reserves and management is 29%.</p>
      </div>
    </div>
  </div>

  <div class="cyh-out">
    <div class="cyh-stat"><b id="cyh-bxAllIn">&mdash;</b><span>All-In Cost</span></div>
    <div class="cyh-stat"><b id="cyh-bxLoan">&mdash;</b><span>New Loan</span></div>
    <div class="cyh-stat gold" id="cyh-bxLeftWrap"><b id="cyh-bxLeft">&mdash;</b><span>Your Cash Left In</span></div>
    <div class="cyh-stat" id="cyh-bxCFWrap"><b id="cyh-bxCF">&mdash;</b><span>Monthly Cash Flow After Refi</span></div>
  </div>
  <div class="cyh-msg" id="cyh-bxMsg" style="display:none"></div>
  <p class="cyh-note">Pulling every dollar back out is what makes the strategy repeat, and it is also the point at which the loan is largest and the cash flow thinnest. A deal that returns all your capital and does not cash flow has not made you money &mdash; it has moved your money into something that now costs you every month. Both numbers have to work.</p>
</section>`

};
