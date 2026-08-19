/* ===================================================================
   calc-content.mjs — the words, separate from the machinery.
   -------------------------------------------------------------------
   build-calculators.mjs owns the HTML template and the file writing.
   This file owns everything a human would want to edit: titles, meta
   descriptions, the explanation of the math, the worked example and
   the FAQ entries that become FAQPage schema.

   Editing copy should never mean touching the builder.

   FIELDS
     id        the section id already used on the hub page
     slug      output filename, minus .html
     title     <title>. Aim 55-60 chars. Lead with the searched phrase.
     desc      meta description. 120-158 chars, per CLAUDE.md.
     h1        on-page H1. Must not be identical to <title>.
     lede      one sentence under the H1
     group     sidebar grouping
     formula   monospace block — the actual arithmetic
     how       ordered steps
     example   worked example, real numbers
     faq       [{q,a}] — rendered visibly AND as FAQPage JSON-LD.
               Never put a question here the page does not answer.
     stages    cross-links into the Financial Literacy resource
   =================================================================== */

export const STAGES = {
  s1: ['stage-1-survive.html',   'Stage 1: Survive'],
  s2: ['stage-2-stabilize.html', 'Stage 2: Stabilize'],
  s3: ['stage-3-rebuild.html',   'Stage 3: Rebuild'],
  s4: ['stage-4-invest.html',    'Stage 4: Invest'],
  s5: ['stage-5-wealth.html',    'Stage 5: Build Wealth'],
  fl: ['financial-literacy.html','the free Financial Literacy resource'],
  dw: ['disability-wealth-guide.html', 'Disability Wealth Guide'],
  av: ['blog/debt-avalanche-vs-snowball.html', 'Avalanche vs. Snowball'],
  cx: ['blog/chexsystems-explained.html', 'ChexSystems Explained']
};

export const CALCS = [
{
  id:'budget', slug:'budget-calculator', num:'01', group:'Start here',
  title:"Free Budget Calculator — Monthly Income & Expenses | Hustlin'",
  desc:"Free monthly budget calculator. Add every income source and expense, see your breathing room and savings rate update as you type. No account, nothing saved.",
  h1:'Budget Calculator',
  lede:'Add every income source and every monthly expense. Your breathing room updates as you type.',
  formula:`Breathing Room = Total Income − Total Expenses
Savings Rate  = Breathing Room ÷ Total Income × 100`,
  how:[
    'Pull two or three months of actual bank statements. Do not work from memory — people underestimate variable spending by 20–30% when they guess.',
    'Enter every income source separately, including irregular and cash income. If income varies, use your <em>lowest</em> recent month, not the average. A budget that only works in a good month is not a budget.',
    'List expenses by category. Include the ones that do not arrive monthly — divide the annual cost by twelve and enter that (the <a href="life-just-happened-fund-calculator.html">Life Just Happened Fund calculator</a> does this for you).',
    'Read the Breathing Room figure. Negative is information, not a verdict.'
  ],
  example:`Take-home of <b>$2,800</b> a month against <b>$3,050</b> of expenses gives breathing room of <b>−$250</b> and a savings rate of <b>−8.9%</b>. That is a $250 monthly gap, which is a specific, solvable number — very different from the vague sense that money is tight. Two levers close it and you usually need both: cut one category without misery, and raise income. Before either, call <b>211</b>, which connects you to local rent, utility and food assistance most people have never heard of.`,
  faq:[
    {q:'What is a good savings rate?',a:'Any positive number is a working budget when you are starting out. Around 10% is a solid early target and 20% is the common long-term guideline, but the first goal is simply getting the number above zero. A savings rate calculated on take-home pay is more useful than one calculated on gross, because take-home is the money that actually exists.'},
    {q:'Should I budget on gross or net income?',a:'Net — your actual take-home after tax and deductions. Budgeting on gross salary is one of the most common reasons people end up short, because it counts money that never reaches the account. If you only know your gross salary, run it through the paycheck calculator first.'},
    {q:'What if my income is different every month?',a:'Budget against your lowest recent month rather than the average. Treat anything above that as a surplus to assign deliberately — to the buffer, to debt, or to a tax set-aside if you are self-employed. Averaging irregular income guarantees that roughly half your months break the plan.'},
    {q:'Is this budget calculator really free?',a:'Yes. No account, no email, no signup. It runs entirely in your browser and nothing you type is sent to or stored on any server.'}
  ],
  stages:['s1','s2']
},
{
  id:'withhold', slug:'paycheck-calculator', num:'02', group:'Start here',
  title:"Paycheck Calculator 2026 — Take-Home Pay After Taxes | Hustlin'",
  desc:"Free 2026 paycheck calculator. Enter gross pay, filing status and state to estimate federal tax, FICA, state tax and your actual take-home pay per period.",
  h1:'Paycheck Calculator',
  lede:'What actually lands in your account after federal tax, FICA and state tax — using the real 2026 brackets.',
  formula:`Annual gross      = pay per period × periods per year

FICA wages        = gross − Section-125 health premiums
Social Security   = 6.2%  × min(FICA wages, $184,500)
Medicare          = 1.45% × FICA wages
                  + 0.9%  × amount over $200k single / $250k joint

Federal taxable   = gross − 401(k) − health − standard deduction
Federal tax       = 2026 brackets applied to that

Take-home         = gross − 401(k) − health − all tax`,
  how:[
    'Enter your <b>gross</b> pay for one pay period — the figure before any deductions, not what hits your account.',
    'Pick the pay frequency. Biweekly (26 checks) and semi-monthly (24) are not the same thing and produce different per-period numbers from the same salary.',
    'Choose your filing status and state. Nine states take no income tax from wages at all, which is often worth thousands a year.',
    'Add pre-tax deductions. 401(k) is entered as a percentage; health premiums as dollars per period.',
    'Read the take-home figure — then budget from <em>that</em> number, never from your salary.'
  ],
  example:`A <b>$60,000</b> salary in a state with no income tax, single, paid biweekly: federal income tax is about <b>$5,018</b> a year, FICA is <b>$4,590</b>, and the state takes nothing from wages. Take-home is roughly <b>$50,392</b> a year — <b>$1,938</b> per check. The gap between the $60,000 on the offer letter and the $50,392 that exists is <b>$9,608</b>. Budgeting against the salary rather than the take-home is a $9,608 planning error.`,
  faq:[
    {q:'How much of my paycheck goes to taxes?',a:'For most middle-income earners the combined bite is roughly 20–30% of gross once federal income tax, Social Security, Medicare and state tax are counted. The single largest variable is your state: nine states take nothing from wages, while California’s top rates run into double digits. The calculator shows the split so you can see which piece is which.'},
    {q:'Does contributing to a 401(k) reduce my taxes?',a:'It reduces your federal and state income tax, but not your FICA tax. Social Security and Medicare are calculated on your pay before 401(k) deferrals come out. This means $100 into a traditional 401(k) typically costs you around $78 of take-home rather than the full $100 — but it is not free, and this calculator shows the real difference.'},
    {q:'Which states have no income tax?',a:'Alaska, Florida, Nevada, New Hampshire, South Dakota, Tennessee, Texas, Washington and Wyoming take no tax from wage income. Washington taxes capital gains above a threshold; New Hampshire finished phasing out its tax on interest and dividends on 1 January 2025 and now takes nothing from any income. Every one of these states raises revenue somewhere else — usually through higher sales or property tax — so a no-income-tax state is not automatically a cheaper state to live in.'},
    {q:'Why is my actual paycheck different from this estimate?',a:'This estimates the tax you owe for the year, which is what a correctly completed W-4 converges on. Your employer withholds according to the specific W-4 you filed, including any dependents and credits you claimed, so a single check can differ. The estimate also excludes local income tax — which matters in New York City, Philadelphia and most of Ohio — and state tax credits.'}
  ],
  stages:['s1','s2']
},
{
  id:'paycheck', slug:'paycheck-split-calculator', num:'03', group:'Start here',
  title:"Paycheck Split Calculator — 50/30/20 and Tight Budgets | Hustlin'",
  desc:"Split take-home pay across needs, wants and savings. Four profiles including tight, crisis and gig income — 50/30/20 assumes comfort many lack.",
  h1:'Paycheck Split Calculator',
  lede:'Where should each dollar go? Pick the profile that matches your actual situation.',
  formula:`Comfortable  50% needs / 30% wants / 20% savings + debt
Tight        67% / 13% / 20%
Crisis       80% /  5% / 15%
Variable     52% / 23% / 25%  (the extra covers tax set-aside)

Each bucket = take-home pay × that percentage`,
  how:[
    'Enter your monthly <b>take-home</b> pay — net, not gross. If you only know your salary, get the net figure from the <a href="paycheck-calculator.html">paycheck calculator</a> first.',
    'Pick the profile that describes your situation honestly rather than aspirationally.',
    'Compare each bucket against what you actually spend. The gap is the plan.'
  ],
  example:`On <b>$3,200</b> a month, the standard 50/30/20 gives <b>$1,600</b> for needs, <b>$960</b> for wants and <b>$640</b> for savings and debt. If rent alone is $1,400, that split is fiction. The <b>Tight</b> profile (67/13/20) gives <b>$2,144</b> for needs, <b>$416</b> for wants and the same <b>$640</b> for savings — which is a plan you can actually follow.`,
  faq:[
    {q:'Is the 50/30/20 rule realistic?',a:'It assumes housing and other essentials fit inside half your take-home pay, which is not true for a large share of renters in high-cost areas. The rule is a useful default, not a law. Using a split that matches your real cost of living and keeps the savings percentage intact beats abandoning budgeting because the standard version does not fit.'},
    {q:'What counts as a need versus a want?',a:'A need is something whose absence causes a real problem: housing, utilities, food, transport to work, insurance, minimum debt payments, childcare, medication. Everything else is a want, including the pleasant things you would defend. The distinction only matters when money is tight — which is exactly when people blur it.'},
    {q:'Why does the gig profile set aside more?',a:'Self-employed and 1099 income has no tax withheld, and you owe both halves of Social Security and Medicare — 15.3% self-employment tax — on top of income tax. The 25% bucket covers that set-aside as well as savings. Treating gross gig income as spendable is the most common and most expensive mistake in variable-income work.'}
  ],
  stages:['s1']
},
{
  id:'emergency', slug:'emergency-fund-calculator', num:'04', group:'Safety net',
  title:"Emergency Fund Calculator — How Long to $1,000 | Hustlin'",
  desc:"Work out how long until you have a real cushion. Shows time to a $500 buffer, a $1,000 goal, and full three- and six-month emergency funds. Free, no account.",
  h1:'Emergency Fund Calculator',
  lede:'How long until you have a real cushion — starting at $1,000, not at six months.',
  formula:`Months to goal = (Goal − Saved now) ÷ Monthly saving

3-month fund = Monthly essential expenses × 3
6-month fund = Monthly essential expenses × 6`,
  how:[
    'Enter what you have set aside right now. Zero is a normal starting point.',
    'Enter what you can realistically save each month — the amount you would still manage in a bad month.',
    'Enter your <b>essential</b> monthly expenses only: housing, food, transport, utilities, minimum debt payments. Not your whole budget.',
    'Aim at the $500 and $1,000 columns first. The three- and six-month figures are the eventual destination, not the starting target.'
  ],
  example:`Starting from <b>$0</b> and saving <b>$100</b> a month, a $500 buffer takes <b>5 months</b> and $1,000 takes <b>10 months</b>. With essential expenses of $2,000 a month, a full three-month fund is $6,000 — <b>5 years</b> at that rate. That is precisely why leading with the three-month number is how people talk themselves out of starting. The $1,000 arrives in ten months and does most of the practical work.`,
  faq:[
    {q:'How much should I have in an emergency fund?',a:'The first target is $1,000. Its job is narrow and specific: stop a car repair or a copay from turning into new credit card debt or a payday loan. The three-to-six month fund is the eventual goal, and it comes after high-interest debt is cleared, not before. Starting with the larger number is the single most common reason people never start at all.'},
    {q:'Where should I keep my emergency fund?',a:'In a separate savings account you can reach within a day or two, not in checking where it gets spent by accident, and not invested where its value can fall exactly when you need it. A high-yield savings account at a different bank than your checking adds useful friction. If you have a ChexSystems history, second-chance accounts exist.'},
    {q:'Should I build an emergency fund or pay off debt first?',a:'Build the small buffer first, then attack the debt, then finish the fund. Without any buffer, the next unexpected expense goes straight back onto the card you are trying to clear, and the progress resets. A $1,000 cushion is what makes debt payoff stick rather than loop.'}
  ],
  stages:['s1','s2','cx']
},
{
  /* Renamed from "Sinking Fund" on 2026-08-08. The old name is accounting
     jargon: a sinking fund is a corporate bond-retirement provision, which is
     not a phrase anybody reaches for when the transmission goes. The URL moved
     with it and sinking-fund-calculator.html is now a redirect stub. One FAQ
     below still carries the old term on purpose — see the note there.

     FINDABLE AS "SINKING FUND", CALLED "LIFE JUST HAPPENED" ON THE PAGE.
     Those two goals only conflict if you try to solve them in the same place.
     The old term lives in the three surfaces a reader never sees — the meta
     description, schema alternateName, and the FAQ answer — while every
     visible surface (h1, lede, widget heading, sidebar, breadcrumb) says Life
     Just Happened Fund. Do NOT put "sinking fund" in the h1 or lede to chase
     the keyword; the redirect stub, the alternateName and the FAQ already
     claim the term, and the whole reason for the rename was that nobody
     reaches for accounting jargon when the transmission goes. */
  id:'sinking', slug:'life-just-happened-fund-calculator', num:'05', group:'Safety net',
  alsoKnownAs:['Sinking Fund Calculator', 'Sinking Fund', 'Irregular Expenses Fund'],
  title:"Life Just Happened Fund — Sinking Fund Calculator | Hustlin'",
  desc:"A sinking fund calculator in plain English. List the annual bills you know are coming, divide by twelve, and stop letting car registration become a crisis.",
  h1:'Life Just Happened Fund Calculator',
  lede:'Life is going to happen. Most of it is already on the calendar — list what you know is coming and divide by twelve.',
  formula:`Monthly set-aside = Sum of all known annual expenses ÷ 12`,
  how:[
    'List every expense that arrives once or twice a year: car registration, insurance premiums, holiday gifts, annual subscriptions, vehicle maintenance, school costs, pet vaccinations.',
    'Enter the full annual cost of each, not the monthly share — the calculator divides.',
    'Move the resulting monthly figure to a separate account on payday, automatically.'
  ],
  example:`Car registration <b>$180</b>, holiday gifts <b>$600</b>, car maintenance <b>$480</b>, subscriptions <b>$200</b> and an insurance premium <b>$240</b> total <b>$1,700</b> a year — <b>$142</b> a month. None of those five are surprises. They only feel like emergencies because nothing was set aside, and each one lands on a credit card at 22% APR instead.`,
  faq:[
    {q:'What is a Life Just Happened Fund?',a:'Money set aside every month for the things you know are coming but that do not arrive monthly. It is not an emergency fund — an emergency fund covers what you cannot predict, this covers what you can. Keeping them apart is what stops the registration renewal from eating the cushion you were saving for a real emergency.'},
    /* This question exists to keep the page findable. "Sinking fund" is the
       phrase with the search volume; the new name has none yet. Answering it
       honestly is better for the reader than pretending the old term does not
       exist, and better for us than losing the query. Delete it and the page
       stops matching what people actually type. */
    {q:'Is this the same as a sinking fund?',a:'Yes. "Sinking fund" is the textbook name, borrowed from corporate finance where it means money a company sets aside to retire a bond. It describes the mechanism accurately and tells you nothing about why you would want one. We call it a Life Just Happened Fund because that is when you reach for it — the tire, the vet, the school trip, the December that arrives every single year and surprises everybody anyway.'},
    {q:'Where should I keep the money?',a:'In its own account, labeled for the purpose, separate from both checking and your emergency fund. The label matters more than it sounds: money in an account called "Life Just Happened" gets spent on exactly that, and money sitting in checking gets spent on whatever happens next.'},
    {q:'How is this different from just budgeting?',a:'A monthly budget only sees monthly bills, so an annual $600 expense is invisible for eleven months and then breaks the budget in the twelfth. This converts it into a $50 monthly line your budget can actually see and plan around.'}
  ],
  stages:['s1']
},
{
  id:'debtlist', slug:'debt-overview-calculator', num:'06', group:'Debt',
  title:"Debt Calculator — See Every Debt and What to Attack | Hustlin'",
  desc:"Put every debt in one place: total balance, monthly minimums, yearly interest cost, and which one to attack first using the avalanche method.",
  h1:'Debt Overview Calculator',
  lede:'Every debt in one place. Seeing the whole picture is the first thing that changes anything.',
  formula:`Total debt       = sum of all balances
Interest / year  = Σ (balance × APR)
Attack first     = the debt with the HIGHEST APR
                   (avalanche — lowest total interest paid)`,
  how:[
    'List every debt: credit cards, car loans, student loans, medical bills, buy-now-pay-later, money owed to family.',
    'Enter the balance, the APR and the minimum payment for each. The APR is on your statement; if you cannot find it, call and ask.',
    'Read the "Attack This First" result — that is the avalanche target.',
    'Take that debt to the <a href="debt-payoff-calculator.html">debt payoff calculator</a> and see what an extra $25 a month does to it.'
  ],
  example:`A <b>$4,200</b> card at <b>24.9%</b>, a <b>$9,000</b> car loan at <b>9.5%</b> and a <b>$14,000</b> student loan at <b>5.5%</b> total <b>$27,200</b> — and cost about <b>$2,675 a year in interest alone</b>. The card is 15% of the balance but 39% of the annual interest. That is the entire argument for the avalanche method in one line.`,
  faq:[
    {q:'Which debt should I pay off first?',a:'Mathematically, the one with the highest interest rate — the avalanche method — because it minimizes total interest paid. The snowball method targets the smallest balance instead, which clears individual debts faster and some people stick with it better. Both work; the avalanche costs less and the snowball feels better sooner.'},
    {q:'Should I pay off debt or save first?',a:'Get a small $1,000 buffer in place first, then attack high-interest debt hard. Without any cushion the next unexpected expense goes straight back onto the card and undoes the progress. Once the high-interest debt is gone, finish the three-to-six month emergency fund.'},
    {q:'Do medical bills belong on this list?',a:'Yes, but treat them differently. Medical debt often carries no interest, is frequently negotiable, and unpaid medical collections under $500 no longer appear on consumer credit reports. Always ask for an itemized bill and a financial assistance application before paying — nonprofit hospitals are required to have one.'}
  ],
  stages:['s2','av']
},
{
  id:'payoff', slug:'debt-payoff-calculator', num:'07', group:'Debt',
  title:"Debt Payoff Calculator — Time, Interest & Extra Pay | Hustlin'",
  desc:"How long to clear a debt and what the interest really costs. See what one extra payment a month does to both numbers. Free debt payoff calculator, no account.",
  h1:'Debt Payoff Calculator',
  lede:'One debt, two questions: how long, and what does the interest actually cost you.',
  formula:`Monthly rate  r = APR ÷ 12 ÷ 100

First, the check that has to come before the loop:
  if payment ≤ balance × r  →  the balance never falls. No answer exists.

Each month:
  interest  = balance × r
  balance   = balance − min(payment − interest, balance)

Months to payoff = repeat until balance = 0
Interest paid    = the sum of every monthly interest charge

The last payment is capped at what is still owed, so it is usually
smaller than the others. Interest is summed as it is charged rather
than derived from payment × months, which would count that final
part-payment as a full one.`,
  how:[
    'Enter the balance and the APR from your statement.',
    'Enter your current monthly payment. If it is the minimum, keep it as the minimum for now — you want to see that number honestly.',
    'Now add <b>$25</b> in the extra field and watch both the time and the interest fall.',
    'Repeat for your highest-APR debt first.'
  ],
  example:`A <b>$5,000</b> balance at <b>22.9% APR</b> paying <b>$150</b> a month takes <b>4 years 6 months</b> and costs <b>$3,021.92</b> in interest. Add <b>$25</b> a month and it becomes <b>3 years 6 months</b> and <b>$2,295.12</b> — <b>12 months</b> and <b>$726.81</b> saved for $25. That is a better guaranteed return than any investment on offer, because avoiding 22.9% interest <i>is</i> a 22.9% return.`,
  faq:[
    {q:'How much faster will an extra $25 a month pay off my debt?',a:'On a typical $5,000 credit card balance at 22.9% APR, an extra $25 a month cuts a full year off the payoff and saves about $727 in interest — roughly $300 back for every $100 extra you put in. The effect is larger than most people expect because every extra dollar goes entirely to principal, and principal is what generates next month’s interest.'},
    {q:'Why does paying only the minimum take so long?',a:'Minimum payments are typically calculated as 1–3% of the balance, structured so that most of the payment covers interest and only a sliver touches the principal. As the balance falls the minimum falls with it, which stretches the timeline further. Paying a fixed amount rather than the shrinking minimum is a meaningful improvement by itself.'},
    {q:'Is it worth paying off debt instead of investing?',a:'When the debt carries a high interest rate, yes. Clearing a 22.9% APR balance is a guaranteed 22.9% return with no market risk, which no investment reliably offers. The calculation shifts for low-rate debt — a 4% student loan or a 3% mortgage is a different question from a credit card.'}
  ],
  stages:['s2','av']
},
{
  id:'util', slug:'credit-utilization-calculator', num:'08', group:'Credit',
  title:"Credit Utilization Calculator — Get Under 30% and 10% | Hustlin'",
  desc:"Credit utilization is about 30% of a FICO score and resets monthly. See your ratio and how much to pay down to reach 30% and 10%. Free, no account.",
  h1:'Credit Utilization Calculator',
  lede:'Roughly 30% of a FICO score, and the only major factor that resets every single month.',
  formula:`Utilization = Total balances ÷ Total credit limits × 100

To reach a target:
  Pay down = Total balances − (Total limits × target%)`,
  how:[
    'Add up the balances on every credit card — the figure on the statement, not what you have spent since.',
    'Add up the credit limits on every card, including cards you never use. Closing an unused card raises your utilization by shrinking the denominator.',
    'Read the two pay-down figures. Pay <em>before</em> the statement closing date, not the due date — the closing balance is what gets reported.'
  ],
  quickTable:{
    h:'What 30% and 10% of your credit limit actually is',
    intro:'The fastest way to use this page is to find your limit in the table. The 30% column is the balance most people are told to stay under; the 10% column is where scores generally respond best. Both are widely repeated conventions rather than a published cutoff &mdash; FICO documents no threshold where a score suddenly changes, and lower is better the whole way down. If you carry balances on more than one card, add every limit together and every balance together and use the calculator above: utilization is scored across all your cards, not one at a time. Why this number moves faster than anything else on your report is covered in <a href="blog/credit-utilization-explained.html">Credit Utilization, Explained</a>.',
    body:`    <table class="cyh-tbl">
      <thead><tr><th>Credit limit</th><th>30% of the limit</th><th>10% of the limit</th></tr></thead>
      <tbody>
      <tr><td>$200</td><td>$60</td><td>$20</td></tr>
      <tr><td>$300</td><td>$90</td><td>$30</td></tr>
      <tr><td>$400</td><td>$120</td><td>$40</td></tr>
      <tr><td>$500</td><td>$150</td><td>$50</td></tr>
      <tr><td>$1,000</td><td>$300</td><td>$100</td></tr>
      <tr><td>$1,500</td><td>$450</td><td>$150</td></tr>
      <tr><td>$2,000</td><td>$600</td><td>$200</td></tr>
      <tr><td>$2,500</td><td>$750</td><td>$250</td></tr>
      <tr><td>$3,000</td><td>$900</td><td>$300</td></tr>
      <tr><td>$5,000</td><td>$1,500</td><td>$500</td></tr>
      <tr><td>$10,000</td><td>$3,000</td><td>$1,000</td></tr>
      </tbody>
    </table>`
  },
  example:`<b>$1,800</b> in balances against <b>$6,000</b> in limits is <b>30%</b> utilization. Paying <b>$1,200</b> takes it to 10%. If you then close an unused card with a $2,000 limit, the same $600 balance against $4,000 of remaining limit jumps you back to 15% — without spending a penny. The denominator matters as much as the numerator.`,
  faq:[
    {q:'What is a good credit utilization ratio?',a:'Below 30% is the common guideline and below 10% is where scores generally respond best. Zero is not optimal either — scoring models like to see the account being used and paid. The practical target is a small reported balance on at least one card, paid in full each month.'},
    {q:'When should I pay my card to lower utilization?',a:'Before the statement closing date, not the payment due date. Your issuer reports the balance as of the closing date, so paying in full on the due date can still report high utilization if you spent heavily during the cycle. Paying mid-cycle is the single fastest way to move this number.'},
    {q:'Does closing a credit card hurt my score?',a:'Usually, yes — in two ways. It removes that card’s limit from your total available credit, which raises utilization on the same balances, and it can eventually shorten your average account age. Leaving an old no-fee card open and using it occasionally is generally better than closing it.'},
    {q:'How quickly does utilization affect my score?',a:'Faster than any other major factor. Utilization is recalculated from whatever balance your issuer reports each month, with no memory of previous months. A high balance paid down can improve the score within one or two reporting cycles — which is why this is the lever to pull if you need movement before a loan application.'}
  ],
  stages:['s1','s3']
},
{
  id:'compound', slug:'compound-interest-calculator', num:'09', group:'Growth',
  title:"Compound Interest Calculator — Monthly Contributions | Hustlin'",
  desc:"See what regular investing becomes over time. Enter a starting amount, a monthly contribution, years and a return rate. Free compound interest calculator.",
  h1:'Compound Interest Calculator',
  lede:'The whole argument for starting now instead of later, in one number.',
  formula:`Monthly rate  r = annual return ÷ 12 ÷ 100
Months        n = years × 12

Future value = P(1 + r)ⁿ  +  C × [((1 + r)ⁿ − 1) ÷ r]
               └ lump sum ┘   └ monthly contributions ┘

Growth = Future value − total contributed`,
  how:[
    'Enter what you already have invested. Zero is fine.',
    'Enter what you can add each month. $25 is a real starting number and does real work.',
    'Set the number of years, then <b>change only that field</b> and watch what happens.',
    'Leave the return at 7% unless you have a reason — it is a common long-run assumption for a broad stock index after inflation, and it is an assumption, not a promise.'
  ],
  example:`<b>$500</b> to start, <b>$100</b> a month, <b>7%</b>, over <b>30 years</b> becomes about <b>$125,000</b> — of which only <b>$36,500</b> came out of your pocket. Cut it to 20 years and it is roughly <b>$54,000</b>. Ten fewer years does not cost you a third of the outcome; it costs you well over half. That gap is the one advantage that cannot be bought back later.`,
  faq:[
    {q:'What return rate should I use?',a:'7% is a widely used long-run assumption for a diversified stock index after inflation; around 10% is the common figure before inflation. Both are averages over very long periods, and no individual year delivers them. Use 7% for planning and treat any single-figure projection as a model rather than a forecast.'},
    {q:'How does compound interest actually work?',a:'Your returns start generating returns of their own. In year one you earn on your contributions; in year twenty you are largely earning on previous years’ earnings. That is why the curve is nearly flat early and steep late, and why time in the market matters more than the amount you start with.'},
    {q:'Is $25 a month worth investing?',a:'Yes — and the habit is worth more than the amount. $25 a month at 7% over 30 years is roughly $30,000, of which about $21,000 is growth. More importantly, someone who starts at $25 raises it later; someone waiting until they can afford $250 usually never starts.'}
  ],
  stages:['s3','s4']
},
{
  id:'invest', slug:'investment-growth-calculator', num:'10', group:'Growth',
  title:"Investment Growth Calculator — Three Market Scenarios | Hustlin'",
  desc:"Project investment growth against conservative, moderate and optimistic returns at once, because real markets never deliver the average. Free, no account.",
  h1:'Investment Growth Calculator',
  lede:'The same math as compound interest, run against three market outcomes at once.',
  formula:`Same future-value formula, evaluated three times:

  Conservative   5%
  Moderate       7%
  Optimistic     10%

Plan against the conservative row.
Treat the optimistic one as upside, never as the plan.`,
  how:[
    'Enter your starting balance and monthly contribution.',
    'Set your time horizon. This field does more work than the contribution size — change it and watch.',
    'Read the <b>conservative</b> row first. A plan that only survives the optimistic row is not a plan.'
  ],
  example:`<b>$1,000</b> to start plus <b>$250</b> a month over <b>25 years</b> lands near <b>$152,000</b> at 5%, <b>$207,000</b> at 7% and <b>$332,000</b> at 10%. The spread between the low and high case is larger than the entire amount contributed. Anyone quoting you a single confident number for 25 years out is quoting the middle of that spread and calling it a fact.`,
  faq:[
    {q:'Why show three returns instead of one?',a:'A single figure implies a certainty that does not exist. Markets deliver their long-run average in almost no individual year — they overshoot, undershoot and occasionally fall hard. Seeing the spread is what lets you build a plan that survives the bad case rather than one that only works if everything goes right.'},
    {q:'What is a realistic long-term return?',a:'Broad US stock indexes have historically returned roughly 10% a year before inflation and around 7% after, measured over multi-decade periods. Shorter periods vary enormously, including decade-long stretches of very poor returns. Past performance does not guarantee future results.'},
    {q:'Does this account for taxes and fees?',a:'No. It is a clean model of contributions and compounding. Real returns are reduced by fund expense ratios, trading costs and tax on gains outside a retirement account. Low-cost index funds and tax-advantaged accounts like a Roth IRA exist specifically to keep more of the modeled return.'}
  ],
  stages:['s4','s5']
},
{
  id:'networth', slug:'net-worth-calculator', num:'11', group:'Growth',
  title:"Net Worth Calculator — Assets Minus Liabilities | Hustlin'",
  desc:"Everything you own minus everything you owe. It is allowed to be negative — most people's is early on. What matters is the direction it moves.",
  h1:'Net Worth Calculator',
  lede:'Everything you own minus everything you owe. What matters is the direction it moves.',
  formula:`Net worth = Total assets − Total liabilities`,
  how:[
    'List assets at what they would actually sell for today, not what you paid. Cash, savings, retirement accounts, vehicles, property, anything genuinely sellable.',
    'List every liability at its current balance: cards, loans, mortgage, medical debt, money owed to family.',
    'Record the number and the date. Recalculate quarterly. The trend is the point — a single reading tells you almost nothing.'
  ],
  example:`<b>$1,200</b> checking, <b>$800</b> savings, <b>$4,000</b> in a retirement account and a car worth <b>$7,000</b> is <b>$13,000</b> in assets. Against <b>$4,200</b> in cards, <b>$9,000</b> on the car and <b>$14,000</b> in student loans — <b>$27,200</b> — net worth is <b>−$14,200</b>. Negative is where a large share of people under 35 sit, and the number moving from −$14,200 to −$11,000 over a year is real progress that a bank balance alone would never show.`,
  faq:[
    {q:'Is negative net worth normal?',a:'Very. Anyone with student loans, a car loan or a recent mortgage frequently starts negative, and it is the standard position early in adult life. The figure is a measurement, not a grade. What matters is whether the trend across quarters is moving in the right direction.'},
    {q:'Should I include my house and car?',a:'Yes — the asset at its realistic current market value, and the loan against it as a liability. Including the house but not the mortgage is the most common way people accidentally overstate their net worth. Use conservative resale figures rather than optimistic ones.'},
    {q:'How often should I calculate net worth?',a:'Quarterly is enough. Monthly invites over-reaction to normal market movement, and annually is too infrequent to notice a problem forming. Four data points a year is plenty to see a trend.'}
  ],
  stages:['s5','dw']
},
{
  id:'freedom', slug:'financial-freedom-calculator', num:'12', group:'Growth',
  title:"Financial Freedom Calculator — Your FIRE Number | Hustlin'",
  desc:"The invested amount that could cover your life indefinitely. Driven by what you spend, not what you earn. Free financial independence calculator, no account.",
  h1:'Financial Freedom Number Calculator',
  lede:'The amount of invested money that could cover your life indefinitely.',
  formula:`Annual spending  = monthly spending × 12
Freedom number   = annual spending × 25
                   (the 4% rule, inverted)

Years to get there: grow current investments at the
assumed return, adding contributions, until the
balance reaches the freedom number.

Two things this holds fixed, so you can adjust for them:
  · The 25× multiplier is the 4% rule. Bengen himself
    has since revised it upward, to 4.7% in 2025 using
    a more diversified portfolio — which would put the
    multiplier nearer 21× and the target about 15%
    lower. 25× is the conservative end.
  · The target is in today's dollars, while the balance
    grows at a nominal return. If you enter a return
    that already has inflation taken out — 7% rather
    than 10% — both sides stay in today's money and
    the comparison holds.`,
  how:[
    'Enter what your life actually costs each month, all in. This is the number that drives everything else.',
    'Enter what you have invested and what you add monthly.',
    'Note the second-order effect: cutting spending lowers the target <em>and</em> raises what you can invest. It moves the date from both directions at once.'
  ],
  example:`Spending <b>$3,000</b> a month is <b>$36,000</b> a year, so the freedom number is <b>$900,000</b>. Cut spending to <b>$2,800</b> and the target falls to <b>$840,000</b> — <b>$60,000</b> lower — while the spare <b>$200</b> a month becomes new contributions. A $200 change does not move the goal by $200. It moves it by $60,000 and accelerates the approach.`,
  faq:[
    {q:'What is the 4% rule?',a:'A planning benchmark from research on historical US portfolio outcomes, suggesting that withdrawing about 4% of an invested balance in the first year — adjusted for inflation after that — had a high historical survival rate over 30 years. Multiplying annual spending by 25 is the same rule inverted. It is a starting estimate, not a guarantee, and it assumes a diversified portfolio and a specific time horizon. Bengen, whose 1994 study produced the rule, has since revised it upward to 4.7% using a more diversified portfolio — which would mean a multiplier nearer 21× and a target roughly 15% lower than this calculator shows. This tool stays at 25× because the conservative end is the safer place to plan from.'},
    {q:'Why is my spending more important than my income?',a:'Because spending sets the target. Every dollar of annual spending adds twenty-five dollars to the amount you need, and every dollar cut removes twenty-five and simultaneously becomes a dollar you can invest. Income raises how fast you approach the number; spending decides where the number sits.'},
    {q:'Does this account for Social Security or a pension?',a:'No. It models a portfolio covering your full spending on its own, which is deliberately conservative. Social Security, a pension or any other income stream reduces the amount the portfolio has to carry, and therefore lowers the target.'}
  ],
  stages:['s5']
},
{
  id:'roth', slug:'roth-conversion-calculator', num:'13', group:'Retirement',
  title:"Roth Conversion Calculator — Tax Cost and Break-Even | Hustlin'",
  desc:"Free Roth conversion calculator. See the marginal tax a conversion really costs, how much bracket room you have left, and whether converting beats waiting.",
  h1:'Roth Conversion Calculator',
  lede:'Pay tax now at a rate you know, or later at one you do not. This prices that trade.',
  formula:`Tax on the conversion (MARGINAL, not average):
  tax = fedTax(other income + conversion) − fedTax(other income)

Room left in your bracket:
  headroom = next bracket threshold − your taxable income

Convert:        conversion × (1 + return)^years          (tax-free)
Do not convert: conversion × (1 + return)^years × (1 − future rate)
                + any tax money you did not spend, still invested`,
  how:[
    'Enter the amount you are thinking of moving out of a Traditional IRA or an old 401(k).',
    'Enter every other dollar of income you expect this year. This matters more than it looks: a conversion stacks <em>on top</em> of your existing income, so the tax it costs depends entirely on what is already underneath it.',
    'Read <b>Room Left in Bracket</b> first. That is the largest conversion you can do without any of it being taxed at the next rate up — and it is the number most people should be sizing against rather than converting a whole account at once.',
    'Set your expected retirement tax rate honestly. If it is higher than the effective rate shown, converting wins. If it is lower, wait for a year when your income drops.',
    'Switch <b>Pay the tax from</b> to see the cost of paying it out of the conversion instead of from savings. It is worse than most people expect.'
  ],
  example:`On <b>$70,000</b> of other income filing single, the 22% bracket runs out at a taxable income of <b>$105,700</b> — so after the standard deduction there is roughly <b>$51,800</b> of headroom. Convert <b>$30,000</b> and it all sits inside 22%, costing about <b>$6,600</b> at an effective rate of <b>22%</b>. Convert <b>$80,000</b> instead and the last chunk crosses into 24%, so the effective rate climbs and the extra tax buys you nothing you could not have had by splitting the conversion across two years. That is the entire argument for converting in slices.`,
  faq:[
    {q:'Is there an income limit on a Roth conversion?',a:'No. The income limit people are thinking of applies to Roth IRA <em>contributions</em>, which phase out between $153,000 and $168,000 for single filers and $242,000 and $252,000 for married filing jointly in 2026. There has been no income limit on converting since 2010, when the old $100,000 cap was removed and never reinstated. That gap is what makes the backdoor Roth possible.'},
    {q:'How much tax will I pay on a Roth conversion?',a:'The converted amount is taxed as ordinary income in the year you convert, stacked on top of your other income. That means the cost is marginal, not average — it depends on which brackets the conversion fills, which is what this calculator works out. Converting an amount that fits inside your current bracket costs that bracket rate; converting more pushes the excess into the next rate up.'},
    {q:'Should I pay the conversion tax from the converted money?',a:'Almost never. Paying from the conversion shrinks the balance you were trying to grow tax-free, and if you are under 59½ the withheld amount is treated as an early withdrawal and gets hit with the 10% penalty on top. If you cannot pay the tax from savings outside the account, that is usually a signal to convert a smaller amount rather than to pay it from inside.'},
    {q:'When is the best time to do a Roth conversion?',a:'In a year when your income is unusually low, because the tax is charged at your rate that year. Common windows are a gap between jobs, a year of study or caregiving, a business loss year, and above all the years between retiring and the start of Social Security or required minimum distributions — when many people have several consecutive low-income years and a large pre-tax balance sitting there.'},
    {q:'Can I undo a Roth conversion if it turns out badly?',a:'No. Recharacterization of conversions was eliminated in 2018. Once you convert, the tax is owed for that year and the decision is permanent, which is why sizing it correctly before you execute matters more than it used to.'}
  ],
  stages:['s3','s5']
},
{
  id:'retdraw', slug:'retirement-withdrawal-calculator', num:'14', group:'Retirement',
  title:"Retirement Withdrawal Calculator — Will It Last? | Hustlin'",
  desc:"Free retirement withdrawal calculator. See what age your savings run out, what a bad first decade does to it, and what the IRS forces you to take at 73 or 75.",
  h1:'Retirement Withdrawal Calculator',
  lede:'Everything else on this site is about putting money in. This is the other half — taking it out without running out.',
  formula:`Each year, in this order:

  want     = year-one withdrawal x (1 + inflation)^years in
  RMD      = balance / IRS Uniform Lifetime divisor for your age
             (only from your RMD start age onward)
  taken    = the LARGER of want and RMD
  balance  = (balance - taken) x (1 + return)

Anything the RMD forces out above what you wanted is not
spent. It moves to a taxable account and keeps compounding
there, so the plan is not penalized for a rule it cannot
opt out of.

Starting withdrawal rate = year-one withdrawal / balance today`,
  how:[
    'Enter what you have across every retirement account — 401(k), 403(b), IRA, the lot. Leave out the house; you cannot eat it.',
    'Enter what you want the <em>savings</em> to hand you in the first year, not your whole budget. Social Security and any pension go in the guaranteed-income box, where they belong — they are inflation-adjusted income you cannot outlive, and they carry a share your portfolio then does not have to.',
    'Read the starting withdrawal rate before anything else. It is the single number the entire retirement-income literature argues about, and it tells you more about your plan than the balance does.',
    'Then read the stress line. It reruns the identical plan with one 2008-sized year at the start. The gap between those two ages is <b>sequence-of-returns risk</b>, and it is the risk that actually ends retirements.',
    'Move the plan-to age out to 95 or beyond before you decide anything. Half of 65-year-olds outlive their own life expectancy — that is what an average is — and a plan built to the average is a coin flip.'
  ],
  example:`<b>$500,000</b> saved at 65, taking <b>$20,000</b> a year from it and raising that with inflation, on a <b>5.5%</b> return and <b>2.5%</b> inflation. That is a starting rate of <b>4.0%</b>, and with <b>$24,000</b> of Social Security on top it is <b>$44,000</b> of first-year income. The balance holds past 95. Now run the stress: put a <b>-30%</b> year at the front and change nothing else, and the money is gone years earlier — same average return, same withdrawals, worse order. That is the whole argument for holding one to two years of spending in cash at the start of retirement, so that a bad first year is something you wait out rather than something you sell into.`,
  faq:[
    {q:'How much can I withdraw from my retirement savings each year?',a:'The common benchmark is about 4% of the balance in the first year, raised each year for inflation after that. It comes from William Bengen’s 1994 study in the Journal of Financial Planning, which tested rolling 30-year retirements against US market history from 1926 to 1992 and looked for the highest rate that survived even the worst starting year. So 4% is not a typical outcome — it is a worst-case survivor, and Bengen himself has since revised it upward, to 4.7% in 2025 using a more diversified portfolio. Treat it as a starting point you then adjust, not a speed limit.'},
    {q:'What is sequence-of-returns risk?',a:'It is the risk that the <em>order</em> of your returns, not their average, decides whether the money lasts. While you are saving, order barely matters — a bad year early is a discount on everything you buy afterwards. Once you are withdrawing, a bad year early means you sell more shares to raise the same income, and those shares are not there to recover. Two retirements with an identical average return can end decades apart purely on which years came first.'},
    {q:'At what age do required minimum distributions start?',a:'Age 73 if you were born between 1951 and 1959, and age 75 if you were born in 1960 or later, under the SECURE 2.0 Act. Your first one can be delayed to April 1 of the following year, though taking it that way puts two distributions into one tax year. Every one after that is due by 31 December. Roth IRAs have no RMDs during the original owner’s lifetime, and since 2024 designated Roth accounts inside a 401(k) or 403(b) do not either.'},
    {q:'What happens if I miss a required minimum distribution?',a:'There is a 25% excise tax on whatever you failed to take, cut to 10% if you correct it within the two-year correction window the IRS allows. It used to be 50%, which SECURE 2.0 reduced. The distribution itself is still owed on top of the penalty, so the cheapest version of this mistake is the one you fix quickly.'},
    {q:'Which accounts should I withdraw from first?',a:'The conventional order is taxable first, then tax-deferred, then Roth last, on the logic that money you are not taxed on again should compound longest. The refinement that matters more is filling low brackets deliberately: the years between retiring and the start of Social Security and RMDs are often the lowest-income years of an adult life, and leaving them empty means those same dollars come out later at a higher rate as a forced distribution. There is no single right order — it depends on the balance across your account types and what your income looks like each year.'},
    {q:'Does this calculator include taxes?',a:'No, and that is deliberate rather than a shortcut. Tax on a withdrawal depends on your state, your filing status, how much of your Social Security becomes taxable, and whether the total pushes you over an IRMAA threshold two years later — four things this calculator does not know. Every figure here is pre-tax. Withdrawals from a traditional 401(k) or IRA are taxed as ordinary income, so the amount that reaches your bank is smaller than the amount shown.'}
  ],
  stages:['s4','s5']
},
{
  id:'stepup', slug:'step-up-in-basis-calculator', num:'15', group:'Retirement',
  alsoKnownAs:'inherited stock cost basis calculator, capital gains on inherited property calculator, stepped up basis calculator, inheritance tax basis calculator',
  title:"Step-Up in Basis Calculator \u2014 Tax on Inherited Stock | Hustlin'",
  desc:"Free step-up in basis calculator. See the capital gains tax an heir avoids when an asset passes at death instead of being gifted during your lifetime.",
  h1:'Step-Up in Basis Calculator',
  lede:'A lifetime of capital gain is erased at death. This puts a dollar figure on what that is worth \u2014 and on what handing the asset over early costs instead.',
  formula:`Inherited:  basis = value on the date of death    (IRC \u00a7 1014)
Gifted:     basis = what the original owner paid   (IRC \u00a7 1015)

Gain        = Sale price \u2212 basis
Federal tax = the gain stacked on top of the heir's taxable income, across
              the 0% / 15% / 20% long-term bands
NIIT        = 3.8% \u00d7 the lesser of the gain and income over the \u00a7 1411 floor
State tax   = gain \u00d7 the rate you enter

Tax saved by inheriting = tax on the carried-over basis \u2212 tax on the stepped-up basis`,
  how:[
    'Enter what the original owner paid \u2014 the cost basis, plus capital improvements if it is a property. This is the number nobody can find afterwards. If both people are alive while you are reading this, go and write it down.',
    "Enter the value on the date of death. For listed shares that is the average of that day's high and low, not the closing price. For a house it is a written date-of-death appraisal, and getting one cheaply means getting one early.",
    'Leave the sale price equal to the date-of-death value to see the step-up on its own. Raise it to see the gain that builds up <em>after</em> the death, which is taxable on either route.',
    "Set the heir's filing status and other income. Long-term gains stack on top of everything else, so the same inheritance costs two different heirs two different amounts \u2014 and a modest gain can sit entirely inside the 0% band, where the step-up saves nothing at all.",
    'Read <b>Tax Saved By Inheriting</b>. That figure is the price of signing the asset over early instead of leaving it, and it is the entire argument for patience.'
  ],
  example:`A parent paid <b>$30,000</b> for shares now worth <b>$300,000</b>. The heir files single, has <b>$60,000</b> of other income, and sells at $300,000. <b>Inherited</b>, the basis resets to $300,000, the gain is $0 and the tax is <b>$0</b>. <b>Gifted during the parent's lifetime</b>, the basis stays $30,000, the gain is <b>$270,000</b>, and the bill is about <b>$44,600</b> \u2014 roughly $39,700 of long-term capital gains tax once the gain stacks into the 15% band, plus about $4,900 of net investment income tax that the gain itself pushes the heir over the threshold for. An effective <b>16.5%</b> on the gain. Same shares, same buyer, same family. The difference is which side of one day the transfer happened on.`,
  faq:[
    {q:'Do you pay capital gains tax on inherited stock?',a:'Only on what it gains after the date of death. Under IRC \u00a7 1014 your basis resets to the value on the day the previous owner died, so inheriting shares worth $180,000 and selling them for $181,000 produces a $1,000 gain, not decades of appreciation. The holding period is automatically long-term under \u00a7 1223(9) as well, so you get long-term rates even if you sell the following week.'},
    {q:'Is it better to inherit a house or be given it before death?',a:'Inheriting, almost always. A lifetime gift carries the giver\u2019s original basis with it under \u00a7 1015, so the whole built-up gain is still taxable when the recipient sells. Inheriting resets the basis to the date-of-death value, which usually erases the gain outright. Adult children also cannot use the \u00a7 121 home-sale exclusion unless they owned and lived in the home for two of the previous five years. Probate can be avoided with a revocable trust or a transfer-on-death deed without giving up the step-up.'},
    {q:'Do inherited IRAs and 401(k)s get a step-up in basis?',a:'No. Traditional IRAs, 401(k)s, 403(b)s and non-qualified deferred annuities are income in respect of a decedent, and \u00a7 1014(c) excludes them by name. The beneficiary pays ordinary income tax on every dollar withdrawn, at their own rates, and most non-spouse beneficiaries must empty the account within ten years. This calculator models a taxable asset \u2014 stock, a fund, or property \u2014 not a retirement account.'},
    {q:'What if the asset is worth less at death than the owner paid for it?',a:'Then the basis steps <em>down</em> to the lower date-of-death value, and the unrealized loss disappears. Nobody inherits a capital loss. A loss sold and realized while the owner is alive can offset capital gains and up to $3,000 of ordinary income a year; a loss held to the end is worth nothing to anyone. The same is true of an unused capital loss carryforward \u2014 it dies with the taxpayer.'},
    {q:'What value do I use for the date of death?',a:'For listed stocks, funds and ETFs, 26 CFR \u00a7 20.2031-2(b) sets it as the mean between the highest and lowest quoted selling prices on that date \u2014 not the closing price. If the date fell on a weekend or a holiday, the regulation works from the nearest trading days on either side, and mutual funds are valued at that day\u2019s net asset value instead. For real estate, a business or land, pay for a written date-of-death appraisal and do it early: reconstructing the value four years later is expensive and the answer is weaker.'}
  ],
  stages:['s5']
},
{
  id:'mortgage', slug:'mortgage-calculator', num:'16', group:'Big purchases',
  title:"Mortgage Calculator — Payment with PMI and Taxes | Hustlin'",
  desc:"Full PITI mortgage calculator: principal, interest, property tax, insurance, HOA and PMI. Uses current 30-year rates and explains the 20% down payment rule.",
  h1:'Mortgage Calculator',
  lede:'The full monthly payment — not just principal and interest, which is the number that fools people.',
  formula:`Monthly rate  r = APR ÷ 12 ÷ 100
Payments      n = years × 12

Principal & Interest = L × r ÷ (1 − (1 + r)⁻ⁿ)

Full payment (PITI) = P&I
                    + property tax ÷ 12
                    + home insurance ÷ 12
                    + HOA
                    + PMI  (if down payment < 20%)

PMI ≈ 0.75% of the loan per year, and stops
automatically at 78% loan-to-value.`,
  how:[
    'Enter the home price and your down payment percentage. Watch the PMI line appear the moment you drop below 20%.',
    'The rate defaults to the current national average 30-year fixed rate. Your actual rate depends heavily on your credit score — the difference between a 620 and a 760 score is frequently more than a full percentage point.',
    'Set property tax as a percentage of home value. The US average is around 1.1%, but it ranges from roughly 0.3% to over 2% depending on the state.',
    'Read the <b>full monthly payment</b>, not the principal and interest figure. Tax, insurance and PMI routinely add 25–40% on top.'
  ],
  example:`A <b>$400,000</b> home with <b>20% down</b> at <b>6.69%</b> over 30 years: principal and interest is <b>$2,063</b>, but with 1.1% property tax and $1,800 insurance the real payment is <b>$2,579</b>. Drop to <b>5% down</b> and you add <b>$238</b> a month in PMI on a larger loan — the payment becomes <b>$3,043</b>, and you pay PMI for years before it falls away automatically.`,
  faq:[
    {q:'Why do I need 20% down on a house?',a:'Twenty percent is where three things change at once: private mortgage insurance disappears, you begin with real equity instead of owing more than the house is worth after closing costs, and lenders price your rate lower because their risk has fallen. It is not a moral standard — it is the line where the economics change. If it is not realistic right now, FHA loans at 3.5% down, VA loans at 0% down for eligible service members, USDA rural loans and state down-payment assistance programs all exist, and waiting years to reach 20% while paying rent is sometimes the more expensive choice.'},
    {q:'What is PMI and when does it stop?',a:'Private mortgage insurance protects the lender if you default — it buys you nothing. It typically costs 0.5% to 1.5% of the loan each year. Under the Homeowners Protection Act, PMI on most conventional loans terminates automatically once the balance reaches 78% of the original value, and you can request cancellation at 80%. FHA mortgage insurance works differently and often lasts the life of the loan.'},
    {q:'How much house can I afford?',a:'The common guideline is housing at or under 28% of gross monthly income, with all debt payments together under 36%. Lenders will frequently approve more than that, because approval is a measure of what you can be made to pay rather than what leaves your life functional. The calculator shows the income the guideline implies for your payment.'},
    {q:'What is included in a mortgage payment?',a:'Four things, abbreviated PITI: principal, interest, taxes and insurance — plus HOA fees and PMI where they apply. Quoted mortgage payments often show only principal and interest, which is why buyers are frequently surprised by a payment 25–40% higher than the figure they planned around.'}
  ],
  stages:['s3','s5']
},
{
  id:'auto', slug:'auto-loan-calculator', num:'17', group:'Big purchases',
  title:"Auto Loan Calculator — Car Payment & 20/4/10 Rule | Hustlin'",
  desc:"Car payment calculator with sales tax and trade-in. Checks your deal against the 20/4/10 rule and shows what a long loan term really costs. Free, no account.",
  h1:'Auto Loan Calculator',
  lede:'What the car actually costs — and whether the deal passes the 20/4/10 rule.',
  formula:`Amount financed = price + sales tax − down − trade-in

Monthly rate r = APR ÷ 12 ÷ 100
Payment        = L × r ÷ (1 − (1 + r)⁻ⁿ)

The 20/4/10 rule
  20  — at least 20% down
   4  — 4-year term or shorter
  10  — payment under 10% of gross monthly income`,
  how:[
    'Enter the negotiated out-the-door price, not the sticker or the advertised monthly payment. Negotiating the payment instead of the price is how a longer term gets sold as a discount.',
    'Add your down payment and trade-in value separately.',
    'Set the term. Start at 48 months and only lengthen it if you genuinely have to — then look at what the interest figure did.',
    'Enter gross monthly income to get the third leg of the 20/4/10 check.'
  ],
  example:`A <b>$30,000</b> car with <b>$6,000</b> down at <b>6.98%</b> over <b>60 months</b>, with 7% sales tax, is <b>$517</b> a month and <b>$4,894</b> in interest. Stretch to <b>72 months</b> and the payment drops to <b>$444</b> — which feels better and costs <b>$5,921</b>, nearly a thousand dollars more, while leaving you underwater on the loan for longer. The lower payment is the more expensive car.`,
  faq:[
    {q:'What is the 20/4/10 rule for buying a car?',a:'Put at least 20% down, finance for no more than 4 years, and keep the payment under 10% of your gross monthly income. The 20% stops you being underwater in year one, since a new car typically loses around 20% of its value immediately. The 4 years caps total interest. The 10% keeps the car from crowding out everything else — and it excludes fuel, insurance and maintenance, which frequently add 50–100% on top of the payment.'},
    {q:'Is a 72 or 84 month car loan a bad idea?',a:'It is usually a signal that the car is too expensive rather than that the term is too short. Long terms cost substantially more interest and keep you owing more than the car is worth for years, which becomes a real problem if it is totalled or you need to sell. If a 48-month term on a given car is unaffordable, the honest conclusion is a cheaper car.'},
    {q:'What does being upside down on a car loan mean?',a:'Owing more than the car is worth — also called negative equity. It happens most often with small down payments and long terms, because a new car depreciates faster early on than the loan balance falls. It matters because insurance pays what the car is worth, not what you owe, so a total loss can leave you paying for a car you no longer have. Gap insurance covers exactly that difference and costs far less than the exposure.'},
    {q:'Should I buy new or used?',a:'A car’s steepest depreciation happens in its first two to three years, so a certified pre-owned vehicle lets someone else absorb that while you still get a warranty. Used loans carry higher interest rates, which offsets some of the saving, but the lower purchase price usually wins. The exception is when new-car manufacturer financing is genuinely subsidized.'}
  ],
  stages:['s3']
}
,
/* ---------- BUSINESS -------------------------------------------------
   The group must stay contiguous and last: sidebar() emits a group header
   whenever c.group changes, so a non-contiguous group prints its header
   twice. `extraScript` loads calculators-business.js, which supplies the
   math for everything in here.

   Scope note: the suite is SEVEN pages, not eight. "Borrowing to Invest"
   was declined on 2026-08-11 for the same reason as Asset Allocation - a
   leverage model on a site written for people starting over reads as a
   suggestion however the outputs are ordered. Tax is out entirely too:
   interest deductibility depends on a business-interest limitation, a
   gross-receipts exception and whether the debt is personal, and a
   calculator that flattens those three into one "tax savings" figure is
   wrong for most readers. Business Loan links to IRS Pub 334 instead. */
{
  id:'pricing', slug:'pricing-breakeven-calculator', num:'18', group:'Business',
  extraScript:'calculators-business.js',
  alsoKnownAs:'breakeven calculator, profit margin calculator',
  title:"Breakeven Calculator \u2014 Price, Margin & Units | Hustlin'",
  desc:"Free breakeven calculator. Enter fixed costs, unit cost and price to see the units you must sell, your true margin after card fees, and your safety cushion.",
  h1:'Pricing and Breakeven Calculator',
  lede:'What you have to charge, and how many you have to sell before you have made a dollar. Card fees included, because they come out of every sale.',
  formula:`True variable cost = Unit cost + Fixed fee + (Price \u00d7 Processing %)
Contribution margin = Price \u2212 True variable cost
Breakeven units     = Fixed costs \u00f7 Contribution margin
Price for target    = (Unit cost + Fixed fee) \u00f7 (1 \u2212 Target % \u2212 Processing %)
Margin of safety    = (Your volume \u2212 Breakeven units) \u00f7 Your volume \u00d7 100`,
  how:[
    'Put every cost that happens whether or not you sell anything into <b>fixed costs</b> \u2014 rent, insurance, software, and your own wage if you pay yourself one. Leaving your own wage out is the most common way a business looks profitable and cannot pay you.',
    'Put every cost that only happens <em>because</em> a sale happened into <b>variable cost per unit</b>: materials, packaging, shipping, the hour of labor.',
    'Set the processing fields to whatever your card processor actually charges. A percentage plus a fixed amount per sale is the normal shape. Set them to 0 if you are paid in cash or by transfer.',
    'Read the breakeven number first, then the margin of safety. The safety figure is how far sales can fall before you are working for free, and it is the number that tells you whether the business has any slack in it.'
  ],
  example:`Fixed costs of <b>$3,200</b> a month, a unit that costs <b>$14</b> to make, priced at <b>$35</b>, with processing at 2.9% + $0.30. The true variable cost is <b>$15.32</b>, not $14 \u2014 processing quietly takes $1.32 out of every sale. Contribution margin is <b>$19.68</b>, so breakeven is <b>163 units a month</b>. At 200 units the profit is <b>$737</b> and the margin of safety is <b>19%</b>. That 19% is the whole story: a fifth off a slow month and the business earns nothing. Raising the price to $38 moves breakeven to <b>142 units</b> and the safety margin to <b>29%</b>.`,
  faq:[
    {q:'What is a contribution margin?',a:'It is what one sale contributes toward your fixed costs, after every cost caused by that sale is taken out. Price minus true variable cost. Once contribution margins across all your sales add up to your fixed costs, you have broken even; everything after that is profit. It is a more useful number than gross margin when you are deciding whether to take on one more order.'},
    {q:'Should I include payment processing in the unit cost?',a:'Yes. It is a real cost of every sale and it scales with your price, which is exactly what a variable cost is. Leaving it out is why a seller can believe they are running a 60% margin and actually be nearer 52%. This calculator keeps it in a separate field so you can see how much of your price it is taking.'},
    {q:'What if my contribution margin is negative?',a:'Then there is no breakeven point and selling more units makes the loss bigger, not smaller. The calculator says so rather than printing a number, because a breakeven figure in that situation would be meaningless. Either the price has to rise or the unit cost has to fall; volume cannot fix a negative margin.'},
    {q:'Is gross margin the same as markup?',a:'No, and confusing them is expensive. Margin is measured against the price; markup is measured against the cost. A $14 item sold at $35 is a 150% markup and a 60% margin. If you set prices with a markup number believing it is a margin, you will systematically undercharge.'},
    {q:'Does this account for tax?',a:'No. Breakeven here is a pre-tax operating figure, which is the standard way it is quoted and the right basis for a pricing decision. Tax comes out of profit after this line, and how much depends on your business structure, your state and your other income.'}
  ],
  stages:['s2','s5']
},
{
  id:'locpayoff', slug:'line-of-credit-payoff-calculator', num:'19', group:'Business',
  extraScript:'calculators-business.js',
  alsoKnownAs:'revolving credit payoff, business line of credit calculator',
  title:"Line of Credit Payoff Calculator \u2014 Free | Hustlin'",
  desc:"How long a revolving line of credit really takes to clear once new charges and the annual fee are counted, and the payment that would hit your date.",
  h1:'Line of Credit Payoff Calculator',
  lede:'A revolving balance has no end date of its own. This runs it month by month, including what you keep charging to it.',
  formula:`Each month:  Interest = Balance \u00d7 APR \u00f7 12
             Balance  = Balance + Interest + New charges (+ Annual fee in month 12, 24 \u2026) \u2212 Payment

Never clears when:  Payment \u2264 Interest + New charges`,
  how:[
    'Enter the balance and the rate from your current statement. Most business lines are variable and move with the prime rate, so re-run this when the rate changes.',
    'Be honest about <b>new charges per month</b>. This is the field other payoff calculators leave out, and it is usually the reason a line that was supposed to clear in a year is still there in three.',
    'Add the annual fee if the line has one. It is charged once a year and the calculator applies it in month 12, 24 and so on rather than spreading it, which is what actually happens.',
    'If you have a date in mind, put the number of months in the last field and read the payment it would take. That number is solved backwards from the same month-by-month simulation, not estimated.'
  ],
  example:`An <b>$18,000</b> balance at <b>13.5%</b>, paying <b>$750</b> a month, still charging <b>$200</b> a month to the line, with a <b>$150</b> annual fee. It clears in <b>3 years 7 months</b> and costs <b>$5,128</b> in interest and fees. Stop drawing on the line and the same $750 clears it in <b>2 years 5 months</b> and costs <b>$3,439</b> \u2014 fourteen months and $1,689 of the total come from the $200 a month you keep charging, not from the rate. To clear it in 24 months instead, the payment has to rise to about <b>$1,097</b>.`,
  faq:[
    {q:'Why does a line of credit take so much longer than a loan?',a:'A term loan has a fixed end date built into it, because the payment is calculated to clear the balance by a certain month. A revolving line has no such date. It only ends when your payments beat the interest plus whatever you are still charging to it, and if you keep drawing on it that can be never.'},
    {q:'What payment is the minimum that actually works?',a:'Anything above the monthly interest plus your new charges. Below that the balance grows every month no matter how long you pay. That figure is a floor, not a target \u2014 paying the floor exactly means the balance never moves at all.'},
    {q:'Does paying earlier in the month help?',a:'On most revolving lines, yes. Interest is charged against the balance, so reducing the balance sooner reduces the interest that accrues on it. The effect is small on any one month and meaningful across a few years. Check your own agreement, because the exact method varies.'},
    {q:'My rate is variable. How do I plan for that?',a:'Run it at your current rate, then run it again two or three points higher and see what that does to the timeline. Business lines are commonly priced off the prime rate, so when prime moves, yours usually moves with it within a billing cycle or two.'},
    {q:'Should I clear the line or invest the money?',a:'This calculator shows you what the line costs, which is one side of that comparison. The interest you avoid is certain and untaxed; an investment return is neither. We do not tell you what to do with the answer \u2014 that depends on your situation and is worth a conversation with someone licensed.'}
  ],
  stages:['s2','s5']
}
,
{
  id:'bizloan', slug:'business-loan-calculator', num:'20', group:'Business',
  extraScript:'calculators-business.js',
  alsoKnownAs:'business loan payment calculator, DSCR calculator, merchant cash advance APR',
  title:"Business Loan Calculator \u2014 Real APR & DSCR | Hustlin'",
  desc:"Free business loan calculator. Payment, the effective APR once origination fees come off the top, debt service coverage, and what a cash advance really costs.",
  h1:'Business Loan Calculator',
  lede:'The payment, the real rate once fees are in, and whether the business actually covers the debt. Plus a cash advance in the same units.',
  formula:`Payment        = P \u00d7 i \u00f7 (1 \u2212 (1 + i)^\u2212n)      i = APR \u00f7 12,  n = months
Net proceeds   = Loan \u2212 Origination fee \u2212 Other closing costs
Effective APR  = the rate at which your payments discount back to the NET proceeds
DSCR           = Annual cash available for debt \u00f7 Annual payments
Advance APR    = the same solve, on the advance's remittance and net proceeds`,
  how:[
    'Enter the loan as quoted, then the fees separately. An origination fee is normally taken off the top, so you receive less than you borrow and repay all of it \u2014 that gap is the whole reason the effective APR is higher than the quote.',
    'For <b>annual cash available for debt</b>, use profit before this loan\u2019s payments, with depreciation added back. Lenders call it net operating income and it is what they divide by your payments.',
    'Read the effective APR, not the quoted rate. It is the only figure that lets you compare two offers whose fees are structured differently.',
    'If you have been offered a merchant cash advance, put it in the second block. It is quoted as a factor rate with no APR anywhere on the paperwork, and converting it is usually the moment the decision becomes obvious.'
  ],
  example:`<b>$75,000</b> at a quoted <b>9.5%</b> over <b>60 months</b>, with a 3% origination fee and $500 of closing costs. The payment is <b>$1,575</b> and the total interest and fees come to <b>$22,258</b>. But you receive <b>$72,250</b> and repay the full $75,000, so the effective rate is <b>11.12%</b>, not 9.5%. With $48,000 a year available for debt, coverage is <b>2.54\u00d7</b> \u2014 comfortable, since most lenders look for at least 1.25\u00d7.<br><br>The same business is offered <b>$50,000</b> at a <b>1.35</b> factor rate over 12 months with a $1,000 fee. That is $5,625 a month and <b>$18,500</b> of cost on $49,000 received \u2014 an equivalent <b>64% APR</b>. Borrowing the same money on the loan terms above would cost about <b>$15,942 less</b>.`,
  faq:[
    {q:'Why is the effective APR higher than the rate I was quoted?',a:'Because an origination fee is normally deducted from the money you receive, while the repayment is calculated on the full loan amount. You pay interest on cash you never got. The quoted rate describes the loan on paper; the effective APR describes what happened to your bank account. The larger the fee and the shorter the term, the wider the gap.'},
    {q:'What is a good DSCR?',a:'Most lenders look for at least 1.25\u00d7, and SBA lenders commonly want 1.15\u00d7 or better. Those are conventions rather than rules, and they vary by lender, industry and how stable your revenue looks. Below 1.0\u00d7 the business does not generate enough to make the payment, which is worth knowing before a lender tells you.'},
    {q:'Is a merchant cash advance a loan?',a:'Legally, usually not. In most states it is structured as a purchase of future receivables, which is why it comes with a factor rate rather than an interest rate and why lending disclosure rules often do not apply. The equivalent APR here is what it would cost if it were a loan, which is the comparison you need even though the paperwork will never show it.'},
    {q:'Is the interest tax deductible?',a:'Interest on a genuine trade-or-business loan is generally deductible as a business expense, but it is limited by the business interest expense limitation, there is a small-business gross-receipts exception, and interest on personal debt is not deductible at all. This calculator deliberately does not estimate a tax effect. See IRS Publication 334 and talk to a CPA.'},
    {q:'Should I take the shorter term or the lower payment?',a:'A longer term lowers the payment and raises the total interest, and it also raises your DSCR, which can be the difference between an approval and a decline. Run both. The right answer depends on whether the constraint is monthly cash or total cost, and only you know which it is this year.'}
  ],
  stages:['s5']
},
{
  id:'bizcash', slug:'business-cash-flow-calculator', num:'21', group:'Business',
  extraScript:'calculators-business.js',
  alsoKnownAs:'cash flow calculator, runway calculator',
  title:"Business Cash Flow Calculator \u2014 Free | Hustlin'",
  desc:"Free cash flow calculator. Split a month into operating, investing and financing, see the net change and ending cash, and how many months the cash lasts.",
  h1:'Business Cash Flow Calculator',
  lede:'Profit is an opinion; cash is a fact. Split the month three ways and see how long the money lasts if nothing changes.',
  formula:`Operating  = Cash collected \u2212 (inventory + payroll + operating costs + interest)
Investing  = Asset sales \u2212 Equipment and other purchases
Financing  = New borrowing and owner money in \u2212 Repayments and draws

Net change = Operating + Investing + Financing
Runway     = Ending cash \u00f7 Monthly net loss   (only while you are losing money)`,
  how:[
    'Use <b>cash that actually moved</b>, not invoices raised or bills received. That difference is the entire reason a profitable business can run out of money.',
    'Put your own pay in payroll. Leaving it out makes the month look better than it was and is the most common way an owner discovers the business cannot afford them.',
    'Read <b>operating cash flow</b> first. It answers the only question that matters long term: does the business pay for itself, or is financing covering the gap?',
    'Runway appears only when the month lost money. A profitable month has no runway to report, and printing a number there would be misleading rather than helpful.'
  ],
  example:`Starting cash <b>$42,000</b>. Collected <b>$61,000</b>; spent $19,000 on inventory, $24,000 on payroll, $11,000 on rent and operating costs and $900 on interest. That is operating cash flow of <b>$6,100</b> \u2014 the business paid for itself. Then $4,000 of equipment and $3,500 of loan repayments and draws take it to a net change of <b>\u2212$1,400</b> and ending cash of <b>$40,600</b>. Runway is about <b>2 years 5 months</b> at that rate. The business is fine; it is just spending slightly more than it makes, and it is investing and financing doing it, not operations.`,
  faq:[
    {q:'What is the difference between profit and cash flow?',a:'Profit counts a sale when you make it and an expense when you incur it. Cash flow counts money when it moves. A business that invoices $60,000 in a month and collects $30,000 of it has a good profit month and a bad cash month, and it is the cash month that decides whether payroll clears.'},
    {q:'Why separate operating, investing and financing?',a:'Because one net figure hides the thing worth knowing. Cash can look stable for a long time while borrowing quietly covers an operating loss. Splitting them shows you whether the business pays for itself, and that is the difference between a temporary dip and a structural problem.'},
    {q:'What counts as investing?',a:'Buying or selling things the business keeps and uses \u2014 equipment, vehicles, property. Enter a purchase as a positive number and a sale as a negative one. It is separated out because a big equipment month is not the same as a bad trading month, even though both reduce cash.'},
    {q:'How much runway should a business hold?',a:'There is no rule, and anyone quoting one is quoting a convention. What matters more is knowing the number and watching which direction it moves. Runway falling three months in a row is information; a single number in isolation is not.'},
    {q:'Does this include tax?',a:'Only if you enter tax payments as part of your operating costs, which is where they belong on a cash basis \u2014 they hit cash when you pay them, not when they are assessed. Set-asides you have not yet paid are still your cash, so they stay in the balance.'}
  ],
  stages:['s5']
}
,
{
  id:'bizratios', slug:'business-ratios-calculator', num:'22', group:'Business',
  extraScript:'calculators-business.js',
  alsoKnownAs:'financial ratios calculator, working capital calculator, current ratio calculator',
  title:"Business Ratios & Working Capital Calculator | Hustlin'",
  desc:"Free business ratio calculator. Current and quick ratio, margins, inventory turnover, days sales outstanding and the working capital your growth will need.",
  h1:'Business Ratios and Working Capital Calculator',
  lede:'Eleven numbers off your own books, turned into the ratios a lender calculates about you anyway.',
  formula:`Current ratio      = Current assets \u00f7 Current liabilities
Quick ratio        = (Current assets \u2212 Inventory) \u00f7 Current liabilities
Working capital    = Current assets \u2212 Current liabilities
Inventory turnover = Cost of goods sold \u00f7 Inventory      Days = 365 \u00f7 turnover
Days sales outstanding = 365 \u00f7 (Sales \u00f7 Receivables)
Debt to net worth  = Total liabilities \u00f7 (Total assets \u2212 Total liabilities)
Return on assets   = Net profit \u00f7 Total assets
Extra working capital to grow = Working capital \u00d7 Growth %`,
  how:[
    'Take the balance-sheet figures from one date and the profit-and-loss figures from the twelve months ending on that date. Mixing periods is the fastest way to get a ratio that means nothing.',
    'Remember that <b>current liabilities include the next twelve months of loan payments</b>, not just trade creditors. Leaving those out makes the current ratio look better than it is, which is the exact figure a lender will recompute.',
    'Read the working capital line before the ratios. It is a dollar amount you can act on; the ratios are the same information rescaled.',
    'Then read the growth line. Growing sales consumes cash before it produces any, and that is what catches profitable businesses out.'
  ],
  example:`Sales of <b>$480,000</b>, cost of goods <b>$288,000</b>, operating costs <b>$150,000</b> and <b>$9,000</b> of interest gives a <b>40.0%</b> gross margin and a <b>6.9%</b> net margin. Against $96,000 of current assets and $61,000 of current liabilities, the current ratio is <b>1.57\u00d7</b> and working capital is <b>$35,000</b>. Take the $42,000 of inventory out and the quick ratio is <b>0.89\u00d7</b> \u2014 the cover depends on selling stock, not on cash in hand. Stock sits about <b>53 days</b> and customers pay in about <b>29</b>. Growing sales 20% next year would need roughly <b>$7,000</b> more working capital before any of it turns into cash.`,
  faq:[
    {q:'Why are there no industry benchmarks on this page?',a:'Because the good ones are not free. Meaningful industry comparisons come from paid datasets like the RMA Annual Statement Studies, which we cannot verify or link for you, and a made-up "healthy range" is worse than none at all. The comparison that costs nothing and tells you more is your own figures from three and twelve months ago.'},
    {q:'What is the difference between the current and quick ratio?',a:'The quick ratio takes inventory out. Inventory is a current asset on paper, but it is not cash until somebody buys it, and in a bad month that is exactly when it stops selling. If your current ratio looks fine and your quick ratio does not, your short-term cover depends on shifting stock.'},
    {q:'Why is my debt-to-net-worth figure blank?',a:'Because liabilities are at or above total assets, so net worth is zero or negative and the ratio has no meaningful value \u2014 a negative one looks smaller than a positive one and means the opposite. The calculator says so rather than printing a number. That situation is a solvency question worth taking to an accountant.'},
    {q:'What is working capital actually for?',a:'It is the cushion between money coming in and money falling due. Payroll lands on a date whether or not a customer has paid. Working capital is what covers the gap, and it is why a business can be profitable on paper and still miss a payment.'},
    {q:'Why does growth need more working capital?',a:'Because you buy the stock, do the work and pay the wages before the customer pays you. More sales means more of all three tied up at once. This is why fast-growing businesses fail for lack of cash, and it is the least intuitive thing on this page.'}
  ],
  stages:['s5']
},
{
  id:'bizlease', slug:'equipment-lease-vs-buy-calculator', num:'23', group:'Business',
  extraScript:'calculators-business.js',
  alsoKnownAs:'lease vs buy calculator, equipment financing calculator',
  title:"Equipment Lease vs. Buy Calculator \u2014 Free | Hustlin'",
  desc:"Compare leasing and buying equipment in today's money, not by monthly payment, and see the resale value at which the answer flips.",
  h1:'Equipment Lease vs. Buy Calculator',
  lede:'Both paths in today\u2019s money, so a monthly payment cannot flatter one of them. Then the resale value where the answer flips.',
  formula:`Loan payment  = Financed amount \u00d7 i \u00f7 (1 \u2212 (1 + i)^\u2212n)
Cost to buy   = Down + fees + PV(loan payments) \u2212 PV(resale value)
Cost to lease = Due at signing + deposit + PV(lease payments) \u2212 PV(deposit returned)

Breakeven resale = the resale value at which the two costs are equal`,
  how:[
    'Use the <b>same term for both paths</b>. A 36-month lease against a 60-month loan is not a comparison, and quoting them that way is how a lease is made to look cheap.',
    'The discount rate is what your cash would otherwise earn. It is why a dollar paid in month 50 costs less than a dollar paid today, and leaving it out is what makes a raw sum of payments misleading.',
    'Be deliberate about the resale value. It is the most uncertain input and it decides the answer, so run it at a pessimistic figure as well as a hopeful one.',
    'Then read the breakeven resale line. It converts the whole thing into one question you can actually have an opinion about: will this be worth more or less than that number when the term ends?'
  ],
  example:`A <b>$60,000</b> machine with 7% sales tax, <b>$6,000</b> down, $500 of fees, financed over <b>60 months</b> at <b>8.5%</b>, expected to be worth <b>$18,000</b> at the end. Against a lease at <b>$950</b> a month with $2,500 due at signing and a $1,000 refundable deposit, over the same 60 months, with cash otherwise earning 5%.<br><br>The loan payment is <b>$1,194</b>. In today\u2019s money buying costs <b>$55,748</b> and leasing costs <b>$53,062</b>, so <b>leasing is $2,687 cheaper</b>. But the whole thing turns on resale: buying wins if the machine is worth more than <b>$21,448</b> at the end. You assumed $18,000. If you think it holds value better than that, buy.`,
  faq:[
    {q:'Why compare in today\u2019s money instead of total payments?',a:'Because a dollar you pay in year five is not the same as a dollar you pay today, and the two paths pay out on very different schedules. Buying takes a large amount on day one; leasing spreads it. Adding up raw payments ignores that entirely and systematically favors whichever option front-loads less.'},
    {q:'Why is tax not included?',a:'Because getting it wrong is expensive and the rules move. Lease payments are generally deductible as paid; a purchase is capitalized and depreciated, and Section 179 or bonus depreciation can pull that forward. How much any of it is worth depends on your profit that year. Purdy Powers folds a depreciation figure straight into its answer; we would rather show you the cash comparison and send you to IRS Publication 946 and a CPA for the rest.'},
    {q:'What is the breakeven resale value?',a:'The resale figure at which leasing and buying cost exactly the same. Above it, buying is cheaper; below it, leasing is. It is useful because you probably cannot say what a machine will be worth in five years, but you can usually say whether it will be worth more or less than a specific number.'},
    {q:'Does leasing preserve cash?',a:'Usually yes on day one, which is the real argument for it in a business that is short of working capital. Whether that is worth the extra cost depends on what else the cash would be doing \u2014 which is what the discount rate on this page is asking you.'},
    {q:'What about maintenance and end-of-lease charges?',a:'Not modeled here, and both can be significant. Leases commonly carry wear-and-tear or excess-use charges, and an owned machine carries its own maintenance once any warranty ends. If either is material for your equipment, add it into the payment fields as a monthly figure.'}
  ],
  stages:['s5']
}
,
/* ---------- REAL ESTATE ----------------------------------------------
   Contiguous and last, same reason as the Business group. Three tools,
   all computed from the reader's own inputs.

   Deliberately NOT built, on the same rule that declined Business
   Valuation: no market cap-rate or rent comparisons (that data is
   commercial and unreliable at zip-code level) and no appreciation
   projection (a guess wearing a number). Rent vs. buy is possible as a
   sensitivity grid but is decided by two assumptions nobody has, so it
   waits for a decision rather than shipping as a verdict. */
{
  id:'rental', slug:'rental-property-calculator', num:'24', group:'Real estate',
  extraScript:'calculators-business.js',
  alsoKnownAs:'rental property analyzer, cash flow calculator, cap rate calculator',
  title:"Rental Property Calculator \u2014 Cash Flow & Cap Rate | Hustlin'",
  desc:"Free rental property calculator. Monthly cash flow, cap rate, cash-on-cash return and debt coverage, with vacancy, maintenance and capital reserves counted.",
  h1:'Rental Property Calculator',
  lede:'Cash flow, cap rate, cash-on-cash and coverage on one screen \u2014 with the costs that get left out put back in.',
  formula:`Effective rent = Gross rent \u2212 Vacancy allowance
Operating costs = Taxes + Insurance + (Maintenance + Reserves + Management) + HOA
NOI            = Effective rent \u2212 Operating costs
Cap rate       = NOI \u00f7 Purchase price          (before financing)
Cash flow      = NOI \u2212 Mortgage payments
Cash-on-cash   = Cash flow \u00f7 (Down payment + Closing + Repairs)
Debt coverage  = NOI \u00f7 Mortgage payments`,
  how:[
    'Use a real rent, not an asking rent. What the unit next door <em>rented</em> for beats what this one is <em>listed</em> at.',
    'Do not set vacancy to zero. One empty month a year is about 8%, and every property has turnover eventually.',
    'Put a number in management even if you plan to self-manage. If the deal only works because you are working for free, that is worth knowing before you buy it, not after.',
    'The capital reserve is the one people delete to make a deal work. Roofs, furnaces and water heaters do not fail monthly, but they fail, and a reserve you did not spend this year is not profit.'
  ],
  example:`A <b>$240,000</b> house, 25% down at <b>6.69%</b> over 30 years, $6,000 closing and $4,000 of repairs, renting at <b>$2,200</b>. Gross rent is $26,400 and 5% vacancy takes it to $25,080. Taxes, insurance and 24% for maintenance, reserves and management come to $11,336, so NOI is <b>$13,744</b> and the cap rate is <b>5.73%</b>. The mortgage is $1,160 a month, which leaves cash flow of <b>\u2212$15 a month</b> on <b>$70,000</b> of cash in \u2014 coverage of <b>0.99\u00d7</b>.<br><br>That is the honest version. Delete the maintenance, reserve and management lines, as a lot of listing math does, and the same deal shows <b>$161 a month</b> instead.`,
  faq:[
    {q:'What is the difference between cap rate and cash-on-cash return?',a:'Cap rate is net operating income divided by price, before any financing. It describes the building, and it lets you compare two properties bought on different terms. Cash-on-cash is your cash flow after the mortgage, divided by the cash you actually put in. It describes your deal. The same building has one cap rate and as many cash-on-cash returns as there are ways to finance it.'},
    {q:'Does the 1% rule still work?',a:'As a screen, sometimes. As a standard, no \u2014 it stopped clearing in most of the country years ago, and it was always a habit rather than a rule. It is useful for deciding which listings deserve a second hour. It is not useful for deciding what to buy, and a property that clears it can still lose money once taxes and reserves are in.'},
    {q:'Why is there no benchmark for a good cap rate?',a:'Because it is entirely local and the datasets that would tell you honestly are commercial. A 5% cap can be excellent in one metro and poor in another, and anyone publishing a single national "good" number is guessing. Compare against other properties you can actually see, in the same market, on the same day.'},
    {q:'How much should I set aside for maintenance and capital reserves?',a:'The figures people use are conventions, not measurements \u2014 commonly around 5\u201310% of rent for each. What matters more than the exact percentage is that both are in the calculation at all. An older property with original systems needs more; a new build needs less at first and more later.'},
    {q:'Should I include my own labor if I self-manage?',a:'Put the management percentage in anyway. You can choose to keep the money, but you should see what the job is worth before you decide to do it for nothing. A deal that only works while you are the unpaid property manager is a job you bought, not an investment.'}
  ],
  stages:['s5']
},
{
  id:'flip', slug:'fix-and-flip-calculator', num:'25', group:'Real estate',
  extraScript:'calculators-business.js',
  alsoKnownAs:'70 percent rule calculator, house flipping calculator, ARV calculator',
  title:"Fix and Flip Calculator \u2014 70% Rule & Profit | Hustlin'",
  desc:"Free fix and flip calculator. Maximum allowable offer on the 70% rule, full project cost including hard money and holding, profit, and breakeven sale price.",
  h1:'Fix and Flip Calculator',
  lede:'The most you can pay, what the project really costs once money and time are counted, and the sale price below which it loses.',
  formula:`Max offer (70% rule) = ARV \u00d7 0.70 \u2212 Repairs
Loan costs   = Points + (Loan \u00d7 Rate \u00d7 Months \u00f7 12)
Total cost   = Purchase + Repairs + Closing + Holding + Loan costs + Selling costs
Profit       = ARV \u2212 Total cost
Breakeven    = (All costs except selling) \u00f7 (1 \u2212 Selling cost %)`,
  how:[
    'Set the ARV from <b>closed comparable sales</b>, not listings. A listing is an asking price; a closed sale is a fact, and the gap between them is where flip budgets die.',
    'Add time to the holding period, not the best case. Every month costs you taxes, insurance, utilities and loan interest whether or not any work happened that week.',
    'Hard money is priced well above a mortgage and usually charges points up front. Both are in the calculation because both come out of your profit.',
    'Read the breakeven sale price last. It is the number that tells you how wrong the market can be before this deal hurts.'
  ],
  example:`ARV <b>$320,000</b>, repairs <b>$45,000</b>, bought at <b>$185,000</b> with $4,000 of closing costs, held six months at $1,200 a month, financed 80% at 11% with 2 points, selling costs 8%. The 70% screen says the most you should pay is <b>$179,000</b> \u2014 you are $6,000 over it. Total cost lands at <b>$277,900</b> for a profit of <b>$42,100</b>, which is a <b>40.4%</b> return on the <b>$104,300</b> of your own cash. It breaks even at a sale price of <b>$274,239</b>, so there is about 14% of room between what you expect and what hurts.`,
  faq:[
    {q:'What is the 70% rule?',a:'A screening convention: pay no more than 70% of the after-repair value minus the repair budget. The 30% is meant to absorb closing, holding, financing and selling costs and still leave a margin. It is a habit rather than a law \u2014 investors in expensive markets often work above it and in cheap ones below it. Treat it as the test for whether a deal deserves a second hour.'},
    {q:'Why does the breakeven matter more than the profit?',a:'Because the profit figure assumes everything goes right: the ARV holds, the repairs come in on budget, and it sells on schedule. The breakeven tells you how far the sale price can fall before the whole thing loses money, which is the risk you are actually taking. A thin cushion on a big number is worse than a fat cushion on a small one.'},
    {q:'What do people underestimate most?',a:'Two things, consistently: the repair budget and how long it takes to sell. Both compound, because a longer hold means more months of interest, taxes and insurance on top of whatever the overrun cost. Running this at your realistic timeline and again at two months longer is the cheapest stress test there is.'},
    {q:'Is hard money worth it?',a:'It buys speed, and speed is often what wins the deal. It also costs points up front and a rate well above a mortgage, and this calculator puts both into the total. Whether that trade works depends on the margin in the specific deal, which is what the breakeven line is telling you.'},
    {q:'Are there taxes on the profit?',a:'Almost certainly, and this calculator does not estimate them. A flip is usually treated as ordinary income rather than a capital gain, and if you do it repeatedly the IRS may treat you as a dealer, which changes things further. That is a conversation for a CPA before the second flip, not after.'}
  ],
  stages:['s5']
},
{
  id:'brrrr', slug:'brrrr-calculator', num:'26', group:'Real estate',
  extraScript:'calculators-business.js',
  alsoKnownAs:'buy rehab rent refinance repeat calculator, cash out refinance calculator',
  title:"BRRRR Calculator \u2014 Cash Left In & Cash Flow | Hustlin'",
  desc:"Free BRRRR calculator. All-in cost, refinance loan amount, how much of your own cash stays in the deal, and whether it still cash flows after the refinance.",
  h1:'BRRRR Calculator',
  lede:'Buy, rehab, rent, refinance, repeat. How much of your money comes back out \u2014 and whether it still pays you afterwards.',
  formula:`All-in cost   = Purchase + Rehab + Closing and holding
New loan      = Appraised value after rehab \u00d7 Loan-to-value %
Cash left in  = All-in cost \u2212 New loan        (zero or less means it fully recycles)
NOI           = Rent \u2212 Operating % \u2212 Taxes and insurance
Cash flow     = NOI \u2212 New mortgage payments`,
  how:[
    'The appraised value after rehab is the number the whole strategy rests on, and an appraiser sets it, not you. Run the deal at a value 10% below your estimate and see whether it still works.',
    'Include everything in the all-in cost, including the months you held it while the work was done. Money spent before the tenant moves in is still your money in the deal.',
    'Set the loan-to-value your lender actually offers on a cash-out refinance on an investment property. It is usually lower than a purchase loan.',
    'Read both headline numbers together. Cash left in and cash flow pull against each other \u2014 the bigger the loan you pull out, the less it cash flows.'
  ],
  example:`Bought at <b>$120,000</b> with <b>$38,000</b> of rehab and $4,000 of closing and holding, so <b>$162,000</b> all in. It appraises at <b>$235,000</b> and the lender refinances at <b>75%</b>, which is a new loan of <b>$176,250</b> \u2014 more than you spent, so all of your money comes back out plus <b>$14,250</b>. At $2,400 rent with 29% for vacancy, maintenance, reserves and management and $4,300 of taxes and insurance, NOI is <b>$16,148</b> against a $1,202 payment, leaving <b>$143 a month</b>. Both halves work, which is rarer than the strategy usually sounds.`,
  faq:[
    {q:'What does BRRRR stand for?',a:'Buy, rehab, rent, refinance, repeat. You buy something that needs work, fix it, put a tenant in, refinance against the higher value, and use the returned capital to do it again. The appeal is that one pot of money can buy several properties over time instead of one.'},
    {q:'What is an "infinite return"?',a:'It is what people call it when the refinance returns every dollar you put in, so the return is being divided by zero. It is a real and useful outcome, but it says nothing about whether the property makes money. A deal that returns all your capital and loses $200 a month has moved your money into something that now costs you. Both numbers have to work.'},
    {q:'What is the biggest risk in BRRRR?',a:'The appraisal. Everything downstream depends on the after-rehab value coming in where you expect, and you do not control it. If it appraises low, the new loan is smaller, your cash stays trapped, and the next deal does not happen. Running the numbers at a lower value is the single most useful thing you can do before committing.'},
    {q:'Why is the cash flow worse after the refinance?',a:'Because the point of the refinance is a bigger loan. Pulling capital out means borrowing more against the same rent, so the payment rises and what is left over falls. That tension is the strategy \u2014 it is not a flaw in the calculation.'},
    {q:'Do lenders have a waiting period?',a:'Many do, and it varies by lender and loan type. A cash-out refinance on an investment property commonly has a seasoning requirement measured in months, and the terms are usually less generous than a purchase loan. Ask your lender what theirs is before you plan the timeline around it.'}
  ],
  stages:['s5']
}
];
