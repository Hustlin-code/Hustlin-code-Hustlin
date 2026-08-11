/* ===================================================================
   calculators-business.js
   -------------------------------------------------------------------
   Math for the Business group. Loaded only on the business calculator
   pages and on the hub, via the `extraScript` field on a CALCS entry.

   It borrows its helpers from calculators.js through window.CYH rather
   than redefining them, so money(), months() and the em-dash rule mean
   exactly one thing across the whole site. If calculators.js has not
   loaded, every function here becomes a no-op rather than throwing —
   the pages ship static default values in the HTML, so a reader still
   sees real numbers.
   =================================================================== */
(function () {
  'use strict';

  var H = window.CYH;
  if (!H) return;

  var $ = H.$, num = H.num, money = H.money, months = H.months,
      show = H.show, solve = H.solve, EMDASH = H.EMDASH;

  var pct = function (n, dp) {
    if (!isFinite(n)) return EMDASH;
    return n.toFixed(dp === undefined ? 1 : dp) + '%';
  };
  /* money() rounds to whole dollars, which is right for a balance and wrong
     for a per-unit figure: a contribution margin of $19.685 printed as "$20"
     hides the 32 cents of card fee this calculator exists to surface. */
  var money2 = function (n) {
    if (!isFinite(n)) return EMDASH;
    return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
  };
  var units = function (n) {
    if (!isFinite(n) || n < 0) return EMDASH;
    return Math.ceil(n).toLocaleString('en-US');
  };
  var setAll = function (ids, v) { ids.forEach(function (k) { if ($(k)) $(k).textContent = v; }); };

  /* ---------- 16. Pricing & breakeven ------------------------------
     Contribution margin is price minus every cost that only exists
     because the sale happened — which includes the processor's cut.
     Leaving card fees out is the most common way a small seller
     believes they are at 60% margin and is actually at 52%. */
  window.cyhPricing = function () {
    var fixed = num($('cyh-bpFixed')), varUnit = num($('cyh-bpVar')),
        price = num($('cyh-bpPrice')), vol = num($('cyh-bpUnits')),
        pctFee = num($('cyh-bpPct')), fixFee = num($('cyh-bpFix')),
        target = num($('cyh-bpTarget'));

    var OUT = ['cyh-bpBE', 'cyh-bpCM', 'cyh-bpMargin', 'cyh-bpProfit'];
    var rows = $('cyh-bpRows');

    if (price <= 0) {
      setAll(OUT, EMDASH);
      if (rows) rows.innerHTML = '';
      show($('cyh-bpMsg'), '');
      return;
    }

    var trueVar = varUnit + fixFee + price * pctFee / 100;
    var cm = price - trueVar;

    $('cyh-bpCM').textContent = money2(cm);
    $('cyh-bpMargin').textContent = pct(cm / price * 100);

    /* No breakeven exists when every sale loses money. Printing 0, or
       a huge number, would both be lies — 0 reads as "you break even
       immediately". Say what is actually true instead. */
    if (cm <= 0) {
      $('cyh-bpBE').textContent = EMDASH;
      $('cyh-bpProfit').textContent = money(-fixed);
      if (rows) rows.innerHTML = '';
      show($('cyh-bpMsg'),
        '<b>At ' + money2(price) + ' you lose ' + money2(-cm) + ' on every unit you sell.</b> ' +
        'There is no number of units that gets you to breakeven &mdash; selling more makes it worse. ' +
        'The true cost of one unit is ' + money2(trueVar) + ' once ' + money2(fixFee) + ' plus ' +
        pct(pctFee) + ' of processing is counted. Either the price goes up or the unit cost comes down; ' +
        'volume cannot fix this one.');
      return;
    }

    var beUnits = fixed / cm;
    var profit = cm * vol - fixed;
    var mos = vol > 0 ? (vol - beUnits) / vol * 100 : NaN;

    $('cyh-bpBE').textContent = units(beUnits);
    $('cyh-bpProfit').textContent = money(profit);
    if ($('cyh-bpProfitWrap')) {
      $('cyh-bpProfitWrap').className = 'cyh-stat ' + (profit >= 0 ? 'pos' : 'neg');
    }

    /* Price that delivers the target margin, with the processor's
       percentage taken out of the same side of the equation as the
       margin. Undefined once target% + processing% reaches 100. */
    var denom = 1 - target / 100 - pctFee / 100;
    var needPrice = denom > 0 ? (varUnit + fixFee) / denom : NaN;

    var msg = '<b>You need ' + units(beUnits) + ' units a month before you have made a dollar' +
      (vol > 0 ? ', and you expect ' + units(vol) : '') + '.</b> ';
    if (vol > 0 && isFinite(mos)) {
      msg += mos >= 0
        ? 'Sales could fall ' + pct(mos, 0) + ' before you are working for free &mdash; that is your margin of safety. '
        : 'You are ' + units(beUnits - vol) + ' units short of breakeven at that volume. ';
    }
    msg += 'Processing takes ' + money2(trueVar - varUnit) + ' out of every sale, which is ' +
      pct((trueVar - varUnit) / price * 100) + ' of the price and is the part most people forget. ';
    if (isFinite(needPrice)) {
      msg += 'A ' + pct(target, 0) + ' gross margin needs a price of <b>' + money2(needPrice) + '</b>.';
    } else {
      msg += 'A ' + pct(target, 0) + ' margin is not reachable while processing takes ' + pct(pctFee) +
             ' &mdash; the two together leave nothing for the unit cost.';
    }
    show($('cyh-bpMsg'), msg);

    /* Sensitivity. One number is an answer; five is a decision. */
    if (rows) {
      var html = '';
      [-20, -10, 0, 10, 20].forEach(function (d) {
        var p2 = price * (1 + d / 100),
            tv2 = varUnit + fixFee + p2 * pctFee / 100,
            cm2 = p2 - tv2;
        var be2 = cm2 > 0 ? units(fixed / cm2) : EMDASH;
        var pr2 = cm2 > 0 || vol > 0 ? money(cm2 * vol - fixed) : EMDASH;
        var m2 = p2 > 0 ? pct(cm2 / p2 * 100) : EMDASH;
        html += '<tr' + (d === 0 ? ' class="cyh-hi"' : '') + '><td>' + money2(p2) +
                (d === 0 ? ' (your price)' : '') + '</td><td>' + be2 + '</td><td>' + pr2 +
                '</td><td>' + m2 + '</td></tr>';
      });
      rows.innerHTML = html;
    }
  };

  /* ---------- 17. Line of credit payoff ----------------------------
     A revolving line is simulated month by month rather than solved in
     closed form, because new charges and an annual fee break the
     amortization formula. Interest first, then the fee in month 12, 24
     and so on, then the new charges, then the payment. */
  function sim(bal, apr, pay, newCharges, annualFee, cap) {
    var m = 0, interest = 0, fees = 0, paid = 0;
    var r = apr / 100 / 12;
    cap = cap || 600;
    var start = bal;
    while (bal > 0 && m < cap) {
      var i = bal * r;
      bal += i;
      interest += i;
      m++;
      if (m % 12 === 0) { bal += annualFee; fees += annualFee; }
      bal += newCharges;
      var p = Math.min(pay, bal);
      bal -= p;
      paid += p;
      /* Not converging: after a year, is the balance above where it
         started? Then the payment never wins and there is no answer. */
      if (m === 12 && bal >= start) return null;
    }
    return bal <= 0 ? { m: m, interest: interest, fees: fees, paid: paid } : null;
  }

  window.cyhLoc = function () {
    var bal = num($('cyh-locBal')), apr = num($('cyh-locApr')),
        pay = num($('cyh-locPay')), nw = num($('cyh-locNew')),
        fee = num($('cyh-locFee')), goal = num($('cyh-locGoal'));

    var OUT = ['cyh-locTime', 'cyh-locInt', 'cyh-locTotal', 'cyh-locNeed'];

    if (bal <= 0 || pay <= 0) {
      setAll(OUT, EMDASH);
      show($('cyh-locMsg'), '');
      return;
    }

    var monthlyInterest = bal * apr / 100 / 12;
    var run = sim(bal, apr, pay, nw, fee);

    if (!run) {
      $('cyh-locTime').textContent = 'Never';
      setAll(['cyh-locInt', 'cyh-locTotal'], EMDASH);
      $('cyh-locNeed').textContent = EMDASH;
      show($('cyh-locMsg'),
        '<b>This payment never clears the line.</b> Interest alone is about ' + money(monthlyInterest) +
        ' a month' + (nw > 0 ? ' and you are adding ' + money(nw) + ' of new charges on top' : '') +
        ', against a payment of ' + money(pay) + '. The balance grows no matter how long you keep paying. ' +
        'Two things move it: stop drawing on the line, or raise the payment above ' +
        money(monthlyInterest + nw) + ' &mdash; that figure is the floor, not the target.');
      return;
    }

    $('cyh-locTime').textContent = months(run.m);
    $('cyh-locInt').textContent = money(run.interest + run.fees);
    $('cyh-locTotal').textContent = money(run.paid);

    /* Solve backwards for the payment that hits the reader's date.
       Bisection on "months at payment p, minus the goal" — there is no
       closed form once new charges and a fee are in the loop. */
    var need = NaN;
    if (goal > 0) {
      need = solve(function (p) {
        var s = sim(bal, apr, p, nw, fee, Math.max(goal * 2, 120));
        return s ? s.m - goal : goal;   // no payoff at all reads as "far too slow"
      }, monthlyInterest + nw + 1, Math.max(bal, pay) * 3 + 1000, 0.01, 120);
    }
    $('cyh-locNeed').textContent = isFinite(need) ? money(need) : EMDASH;

    var msg = '<b>' + months(run.m) + ' and ' + money(run.interest + run.fees) +
      ' in interest and fees at this payment.</b> ';
    if (nw > 0) {
      var clean = sim(bal, apr, pay, 0, fee);
      if (clean) {
        msg += 'Stop charging to the line and the same payment clears it in ' + months(clean.m) +
          ' instead &mdash; ' + months(run.m - clean.m) + ' sooner, and ' +
          money((run.interest + run.fees) - (clean.interest + clean.fees)) + ' cheaper. ' +
          'The new charges are doing more damage than the rate is. ';
      }
    }
    if (goal > 0 && isFinite(need)) {
      msg += 'To clear it in ' + Math.round(goal) + ' months you would need to pay <b>' + money(need) +
        '</b> a month.';
    }
    show($('cyh-locMsg'), msg);
  };


  /* ---------- 18. Business loan ------------------------------------
     The quoted rate is not what the money costs. An origination fee is
     normally taken off the top, so you receive less than you borrow and
     repay all of it — the effective APR is what you actually pay on the
     cash you actually got. There is no closed form for it, hence solve(). */
  function pmt(principal, monthlyRate, n) {
    if (n <= 0) return NaN;
    if (monthlyRate === 0) return principal / n;
    return principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -n));
  }

  window.cyhBizLoan = function () {
    var amt = num($('cyh-blAmt')), rate = num($('cyh-blRate')), term = num($('cyh-blTerm')),
        orig = num($('cyh-blOrig')), fees = num($('cyh-blFees')), noi = num($('cyh-blNoi'));

    var OUT = ['cyh-blPay', 'cyh-blCost', 'cyh-blApr', 'cyh-blDscr'];
    var loanPay = NaN;

    if (amt <= 0 || term <= 0) {
      setAll(OUT, EMDASH);
      show($('cyh-blMsg'), '');
    } else {
      var r = rate / 100 / 12;
      loanPay = pmt(amt, r, term);
      var totalPaid = loanPay * term;
      var feeTotal = amt * orig / 100 + fees;
      var net = amt - feeTotal;

      $('cyh-blPay').textContent = money(loanPay);
      $('cyh-blCost').textContent = money(totalPaid - amt + feeTotal);

      /* Effective APR: the rate at which the payments you actually make
         discount back to the cash you actually received. */
      var eff = net > 0
        ? solve(function (i) { return pmt(net, i, term) - loanPay; }, 0.0000001, 1, 1e-9, 200)
        : NaN;
      $('cyh-blApr').textContent = isFinite(eff) ? pct(eff * 12 * 100, 2) : EMDASH;

      var dscr = loanPay > 0 && noi > 0 ? noi / (loanPay * 12) : NaN;
      $('cyh-blDscr').textContent = isFinite(dscr) ? dscr.toFixed(2) + '×' : EMDASH;
      if ($('cyh-blDscrWrap')) {
        $('cyh-blDscrWrap').className = 'cyh-stat ' +
          (!isFinite(dscr) ? '' : dscr >= 1.25 ? 'pos' : dscr >= 1 ? 'gold' : 'neg');
      }

      var msg = '<b>' + money(loanPay) + ' a month for ' + Math.round(term) + ' months.</b> ';
      if (feeTotal > 0 && isFinite(eff)) {
        msg += 'You borrow ' + money(amt) + ' but receive ' + money(net) + ' after ' + money(feeTotal) +
          ' of fees, and you repay the full ' + money(amt) + '. That is why the real cost is <b>' +
          pct(eff * 12 * 100, 2) + '</b> and not the ' + pct(rate, 2) + ' on the quote. ';
      }
      if (isFinite(dscr)) {
        msg += dscr >= 1.25
          ? 'Coverage of ' + dscr.toFixed(2) + '× means the business generates ' + dscr.toFixed(2) +
            ' dollars for every dollar of payment. Most lenders look for at least 1.25×, and SBA lenders commonly want 1.15× or better — those are conventions, not rules.'
          : dscr >= 1
            ? 'Coverage of ' + dscr.toFixed(2) + '× clears the payment but leaves almost nothing for a bad month. Most lenders look for at least 1.25×.'
            : '<b>Coverage of ' + dscr.toFixed(2) + '× means the business does not generate enough to make the payment.</b> The gap has to come from somewhere else, every month.';
      }
      show($('cyh-blMsg'), msg);
    }

    /* --- merchant cash advance, in the same units --- */
    var adv = num($('cyh-blAdv')), factor = num($('cyh-blFactor')),
        advTerm = num($('cyh-blAdvTerm')), advFee = num($('cyh-blAdvFee'));
    var AOUT = ['cyh-blAdvPay', 'cyh-blAdvCost', 'cyh-blAdvApr', 'cyh-blGap'];

    if (adv <= 0 || factor <= 1 || advTerm <= 0) {
      setAll(AOUT, EMDASH);
      show($('cyh-blAdvMsg'), '');
      return;
    }

    var repay = adv * factor;
    var advPay = repay / advTerm;
    var advNet = adv - advFee;
    var advCost = repay - advNet;

    $('cyh-blAdvPay').textContent = money(advPay);
    $('cyh-blAdvCost').textContent = money(advCost);

    var ai = advNet > 0
      ? solve(function (i) { return pmt(advNet, i, advTerm) - advPay; }, 0.0000001, 3, 1e-9, 300)
      : NaN;
    var advApr = isFinite(ai) ? ai * 12 * 100 : NaN;
    $('cyh-blAdvApr').textContent = isFinite(advApr) ? pct(advApr, 1) : EMDASH;

    /* Cost of the advance against the cost of the same money on the loan
       terms above, over the advance's own term. */
    var gap = NaN;
    if (isFinite(loanPay) && amt > 0 && term > 0) {
      var lr = rate / 100 / 12;
      var samePay = pmt(advNet, lr, advTerm);
      if (isFinite(samePay)) gap = advCost - (samePay * advTerm - advNet);
    }
    $('cyh-blGap').textContent = isFinite(gap) ? money(gap) : EMDASH;

    var amsg = '<b>' + money(advPay) + ' a month, ' + money(repay) + ' repaid on ' + money(adv) +
      ' advanced.</b> ';
    if (isFinite(advApr)) {
      amsg += 'A factor rate of ' + factor.toFixed(2) + ' over ' + Math.round(advTerm) +
        ' months works out at roughly <b>' + pct(advApr, 0) + '</b> a year once you account for ' +
        'repaying it as you go rather than at the end. The factor rate never says that, and it is not required to. ';
    }
    if (isFinite(gap) && gap > 0) {
      amsg += 'Borrowing the same ' + money(advNet) + ' on the loan terms above would cost ' +
        money(gap) + ' less over the same period.';
    }
    show($('cyh-blAdvMsg'), amsg);
  };

  /* ---------- 19. Business cash flow -------------------------------
     Three sections, because that is how the money actually behaves and
     because a single "net cash" figure hides the thing worth knowing:
     whether operations pay for themselves or financing is covering. */
  window.cyhBizCash = function () {
    var start = num($('cyh-cfStart')),
        cin = num($('cyh-cfIn')), other = num($('cyh-cfOther')),
        inv = num($('cyh-cfInv')), pay = num($('cyh-cfPay')),
        ops = num($('cyh-cfOps')), interest = num($('cyh-cfInt')),
        capex = num($('cyh-cfCapex')),
        borrow = num($('cyh-cfBorrow')), repay = num($('cyh-cfRepay'));

    var opIn = cin + other;
    var opOut = inv + pay + ops + interest;
    var op = opIn - opOut;
    var investing = -capex;
    var financing = borrow - repay;
    var net = op + investing + financing;
    var end = start + net;

    $('cyh-cfOp').textContent = money(op);
    $('cyh-cfNet').textContent = money(net);
    $('cyh-cfEnd').textContent = money(end);
    if ($('cyh-cfOpWrap')) $('cyh-cfOpWrap').className = 'cyh-stat ' + (op >= 0 ? 'pos' : 'neg');
    if ($('cyh-cfNetWrap')) $('cyh-cfNetWrap').className = 'cyh-stat ' + (net >= 0 ? 'pos' : 'neg');

    /* Runway only means something while you are losing money. Printing 0
       for a profitable month would read as "you have no runway", which is
       the opposite of the truth. */
    if (net >= 0) {
      $('cyh-cfRun').textContent = EMDASH;
    } else {
      $('cyh-cfRun').textContent = end > 0 ? months(end / -net) : '0 mo';
    }

    var rows = $('cyh-cfRows');
    if (rows) {
      rows.innerHTML =
        '<tr><td>Operating</td><td>' + money(opIn) + '</td><td>' + money(opOut) + '</td><td>' + money(op) + '</td></tr>' +
        '<tr><td>Investing</td><td>' + money(capex < 0 ? -capex : 0) + '</td><td>' + money(capex > 0 ? capex : 0) + '</td><td>' + money(investing) + '</td></tr>' +
        '<tr><td>Financing</td><td>' + money(borrow) + '</td><td>' + money(repay) + '</td><td>' + money(financing) + '</td></tr>' +
        '<tr class="cyh-hi"><td>Net change</td><td></td><td></td><td>' + money(net) + '</td></tr>';
    }

    var msg;
    if (op < 0 && financing > 0) {
      msg = '<b>Operations lost ' + money(-op) + ' this month and financing put ' + money(financing) +
        ' back in.</b> That is the pattern worth watching: the cash balance can look stable for a long ' +
        'time while borrowing quietly covers an operating gap. The gap is the problem, not the balance.';
    } else if (op < 0) {
      msg = '<b>Operations lost ' + money(-op) + ' this month.</b> The business did not pay for itself. ' +
        (end > 0 && net < 0
          ? 'At this rate the cash lasts about ' + months(end / -net) + '. '
          : '') +
        'Collections and payroll are usually the two biggest levers, in that order.';
    } else if (net < 0) {
      msg = '<b>Operations made ' + money(op) + ', but the month still lost ' + money(-net) +
        ' overall.</b> That is investing and financing — equipment, loan repayments, owner draws. ' +
        'A month like this is fine occasionally and a problem if it repeats.';
    } else {
      msg = '<b>Operations made ' + money(op) + ' and the month ended ' + money(net) + ' up.</b> ' +
        'Runway does not apply while cash is growing. The number to watch now is whether operating ' +
        'cash flow stays above the loan repayments and draws in a slow month.';
    }
    show($('cyh-cfMsg'), msg);
  };


  /* ---------- 20. Business ratios & working capital -----------------
     Every output here is computed from the reader's own books. There are
     deliberately NO benchmark comparisons: the industry datasets that
     would make "a healthy current ratio is 2.0" meaningful are paid
     products we cannot verify or link, and inventing a range is exactly
     the kind of unsourced figure this site keeps having to clean up.

     Six of these ratios have a legitimate no-answer state. Every one of
     them renders an em dash rather than 0 or Infinity. */
  window.cyhBizRatios = function () {
    var S = num($('cyh-brSales')), C = num($('cyh-brCogs')), O = num($('cyh-brOpex')),
        I = num($('cyh-brInt')), grow = num($('cyh-brGrow')),
        CA = num($('cyh-brCA')), INV = num($('cyh-brInv')), AR = num($('cyh-brAR')),
        CL = num($('cyh-brCL')), TA = num($('cyh-brTA')), TL = num($('cyh-brTL'));

    var gp = S - C, opProfit = gp - O, netProfit = opProfit - I;
    var wc = CA - CL, nw = TA - TL;

    var ratio = function (n, d, dp) {
      return d > 0 && isFinite(n / d) ? (n / d).toFixed(dp === undefined ? 2 : dp) : EMDASH;
    };
    var margin = function (n) { return S > 0 ? pct(n / S * 100) : EMDASH; };

    $('cyh-brWC').textContent = (CA > 0 || CL > 0) ? money(wc) : EMDASH;
    if ($('cyh-brWCWrap')) $('cyh-brWCWrap').className = 'cyh-stat ' + (wc >= 0 ? 'pos' : 'neg');
    $('cyh-brCurrent').textContent = ratio(CA, CL) + (CL > 0 ? '×' : '');
    $('cyh-brNet').textContent = margin(netProfit);
    $('cyh-brNeed').textContent = (CA > 0 || CL > 0) && grow > 0 ? money(wc * grow / 100) : EMDASH;

    var invTurn = INV > 0 ? C / INV : NaN;
    var arTurn = AR > 0 ? S / AR : NaN;

    var rows = [
      ['Gross margin', margin(gp), 'What is left of every sales dollar after the cost of the thing you sold'],
      ['Operating margin', margin(opProfit), 'What is left after running the business, before interest'],
      ['Net margin', margin(netProfit), 'What is left after interest. Before tax'],
      ['Current ratio', ratio(CA, CL) + (CL > 0 ? '×' : ''), 'Short-term assets per dollar of short-term debt. Below 1.0 means you owe more within the year than you expect to have'],
      ['Quick ratio', ratio(CA - INV, CL) + (CL > 0 ? '×' : ''), 'The same test with inventory taken out, because inventory is not cash until somebody buys it'],
      ['Working capital', (CA > 0 || CL > 0) ? money(wc) : EMDASH, 'The cash cushion between what is coming in and what is due'],
      ['Inventory turnover', isFinite(invTurn) ? invTurn.toFixed(2) + '×' : EMDASH, 'How many times a year you sell through your stock'],
      ['Days of inventory', isFinite(invTurn) && invTurn > 0 ? Math.round(365 / invTurn) + ' days' : EMDASH, 'How long a dollar sits in stock before it sells'],
      ['Days sales outstanding', isFinite(arTurn) && arTurn > 0 ? Math.round(365 / arTurn) + ' days' : EMDASH, 'How long customers take to pay you. Compare it with your own payment terms'],
      ['Debt to net worth', nw > 0 ? ratio(TL, nw) + '×' : EMDASH, 'Borrowed dollars per dollar of your own equity'],
      ['Return on assets', TA > 0 ? pct(netProfit / TA * 100) : EMDASH, 'Profit per dollar of everything the business owns']
    ];
    var host = $('cyh-brRows');
    if (host) {
      host.innerHTML = rows.map(function (r) {
        return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>';
      }).join('');
    }

    if (S <= 0 && CA <= 0 && CL <= 0) { show($('cyh-brMsg'), ''); return; }

    var msg = '';
    /* Negative net worth is the one case where printing the ratio would
       actively mislead: a negative debt-to-worth looks smaller than a
       positive one and means the opposite. */
    if (nw <= 0 && (TA > 0 || TL > 0)) {
      msg += '<b>Liabilities are at or above total assets, so debt to net worth has no meaningful value and is left blank.</b> ' +
        'The business owes ' + money(TL - TA) + ' more than it owns. That is a solvency question rather than a ratio question, ' +
        'and it is worth taking to an accountant before a lender raises it. ';
    }
    if (CL > 0) {
      var cr = CA / CL;
      msg += cr < 1
        ? '<b>Current ratio is ' + cr.toFixed(2) + '×</b>, which means ' + money(CL - CA) +
          ' more falls due within the year than you expect to have available for it. '
        : '<b>Current ratio is ' + cr.toFixed(2) + '×</b>, so short-term assets cover short-term debts with ' +
          money(CA - CL) + ' to spare. ';
      if (INV > 0) {
        var qr = (CA - INV) / CL;
        msg += 'Take inventory out and it is ' + qr.toFixed(2) + '× — ' +
          (qr < 1 ? 'which means the cover depends on selling stock, not on cash you already have. '
                  : 'so the cover does not depend on selling stock first. ');
      }
    }
    if (grow > 0 && wc > 0) {
      msg += 'Growing sales ' + pct(grow, 0) + ' with the same shape of balance sheet needs roughly <b>' +
        money(wc * grow / 100) + '</b> more working capital, because receivables and inventory grow with the ' +
        'sales before the cash from them arrives. That is the number that catches profitable businesses out. ';
    }
    if (isFinite(arTurn) && arTurn > 0) {
      msg += 'Customers are taking about ' + Math.round(365 / arTurn) + ' days to pay.';
    }
    show($('cyh-brMsg'), msg);
  };

  /* ---------- 21. Equipment lease vs buy ---------------------------
     Both paths discounted to today, because comparing a monthly lease
     payment against a monthly loan payment ignores the deposit, the
     down payment and the fact that you own something at the end.

     Tax is deliberately absent. See the note on the page. */
  function pvOf(amount, monthlyRate, n) {
    return amount / Math.pow(1 + monthlyRate, n);
  }
  function pvStream(payment, monthlyRate, n) {
    if (n <= 0) return 0;
    if (monthlyRate === 0) return payment * n;
    return payment * (1 - Math.pow(1 + monthlyRate, -n)) / monthlyRate;
  }

  window.cyhBizLease = function () {
    var price = num($('cyh-elPrice')), tax = num($('cyh-elTax')), down = num($('cyh-elDown')),
        fees = num($('cyh-elFees')), apr = num($('cyh-elApr')), resale = num($('cyh-elResale')),
        term = num($('cyh-elTerm')), lease = num($('cyh-elLease')), up = num($('cyh-elUp')),
        dep = num($('cyh-elDep')), disc = num($('cyh-elDisc'));

    var OUT = ['cyh-elLoanPay', 'cyh-elBuyPV', 'cyh-elLeasePV', 'cyh-elWin'];
    if (price <= 0 || term <= 0) {
      setAll(OUT, EMDASH);
      show($('cyh-elMsg'), '');
      return;
    }

    var r = apr / 100 / 12, d = disc / 100 / 12;
    var financed = price * (1 + tax / 100) - down;
    var loanPay = financed > 0 ? pmt(financed, r, term) : 0;

    var buyNow = down + fees;
    var buyPV = buyNow + pvStream(loanPay, d, term) - pvOf(resale, d, term);
    var leasePV = up + dep + pvStream(lease, d, term) - pvOf(dep, d, term);

    $('cyh-elLoanPay').textContent = money(loanPay);
    $('cyh-elBuyPV').textContent = money(buyPV);
    $('cyh-elLeasePV').textContent = money(leasePV);

    var diff = Math.abs(buyPV - leasePV);
    var buyWins = buyPV < leasePV;
    $('cyh-elWin').textContent = money(diff);
    if ($('cyh-elWinWrap')) {
      $('cyh-elWinWrap').className = 'cyh-stat gold';
    }

    /* The resale value at which the two paths cost the same. Everything
       else on this page is arithmetic; this is the only number that
       turns the comparison into a decision. */
    var fixedBuy = buyNow + pvStream(loanPay, d, term);
    var breakeven = solve(function (R) { return (fixedBuy - pvOf(R, d, term)) - leasePV; },
                          0, Math.max(price * 3, 1000), 0.01, 200);

    var msg = '<b>' + (buyWins ? 'Buying' : 'Leasing') + ' is ' + money(diff) +
      ' cheaper in today’s money over ' + Math.round(term) + ' months.</b> ';
    if (isFinite(breakeven)) {
      msg += 'The answer turns entirely on resale: buying wins if the equipment is worth more than <b>' +
        money(breakeven) + '</b> at the end, and leasing wins if it is worth less. You have assumed ' +
        money(resale) + '. ';
      if (Math.abs(resale - breakeven) / Math.max(breakeven, 1) < 0.12) {
        msg += 'That is close enough to the breakeven that the two paths are effectively a tie, and the ' +
          'decision should come down to whether you want to own the thing at the end. ';
      }
    } else {
      msg += 'There is no resale value that makes buying cheaper on these terms. ';
    }
    msg += 'Leasing keeps ' + money(buyNow) + ' of cash in the business on day one that buying takes out; ' +
      'buying leaves you with an asset the lease does not.';
    show($('cyh-elMsg'), msg);
  };


  /* ================= REAL ESTATE =================================
     Everything here is computed from the reader's own inputs. There
     are deliberately no market comparisons — no "typical cap rate for
     your area", no rent estimates, no appreciation projection. That
     data is either commercial or a guess, and a guess printed as a
     number is the thing this site keeps having to correct.
     =============================================================== */

  /* ---------- 22. Rental property ----------------------------------
     Vacancy, maintenance, reserves and management are separate fields
     rather than one "expenses" number, because leaving them out is
     precisely how a deal that loses money looks like it makes money.
     A reserve you do not spend this year is not profit; it is a roof
     you have not replaced yet. */
  window.cyhRental = function () {
    var price = num($('cyh-rpPrice')), dp = num($('cyh-rpDown')), rate = num($('cyh-rpRate')),
        yrs = num($('cyh-rpYears')), closing = num($('cyh-rpClose')), rehab = num($('cyh-rpRehab')),
        rent = num($('cyh-rpRent')), vac = num($('cyh-rpVac')), tax = num($('cyh-rpTax')),
        ins = num($('cyh-rpIns')), maint = num($('cyh-rpMaint')), capex = num($('cyh-rpCapex')),
        mgmt = num($('cyh-rpMgmt')), hoa = num($('cyh-rpHoa'));

    var OUT = ['cyh-rpCF', 'cyh-rpCap', 'cyh-rpCoC', 'cyh-rpDscr'];
    var rows = $('cyh-rpRows');

    if (price <= 0 || rent <= 0) {
      setAll(OUT, EMDASH);
      if (rows) rows.innerHTML = '';
      show($('cyh-rpMsg'), '');
      return;
    }

    var loan = price * (1 - dp / 100);
    var r = rate / 100 / 12, n = yrs * 12;
    var payment = loan > 0 && n > 0 ? pmt(loan, r, n) : 0;

    var gross = rent * 12;
    var vacancy = gross * vac / 100;
    var effective = gross - vacancy;
    var variable = gross * (maint + capex + mgmt) / 100;
    var opex = tax + ins + variable + hoa * 12;
    var noi = effective - opex;
    var debt = payment * 12;
    var cash = price * dp / 100 + closing + rehab;
    var cf = noi - debt;

    $('cyh-rpCF').textContent = money(cf / 12);
    $('cyh-rpCap').textContent = pct(noi / price * 100, 2);
    $('cyh-rpCoC').textContent = cash > 0 ? pct(cf / cash * 100, 2) : EMDASH;
    $('cyh-rpDscr').textContent = debt > 0 ? (noi / debt).toFixed(2) + '×' : EMDASH;

    if ($('cyh-rpCFWrap')) $('cyh-rpCFWrap').className = 'cyh-stat ' + (cf >= 0 ? 'pos' : 'neg');
    if ($('cyh-rpCoCWrap')) $('cyh-rpCoCWrap').className = 'cyh-stat ' + (cf >= 0 ? 'pos' : 'neg');
    if ($('cyh-rpDscrWrap')) {
      $('cyh-rpDscrWrap').className = 'cyh-stat ' +
        (debt <= 0 ? '' : noi / debt >= 1.25 ? 'pos' : noi / debt >= 1 ? 'gold' : 'neg');
    }

    if (rows) {
      rows.innerHTML =
        '<tr><td>Gross rent</td><td>' + money(gross) + '</td></tr>' +
        '<tr><td>Less vacancy at ' + pct(vac, 1) + '</td><td>-' + money(vacancy) + '</td></tr>' +
        '<tr><td>Taxes and insurance</td><td>-' + money(tax + ins) + '</td></tr>' +
        '<tr><td>Maintenance, reserves and management</td><td>-' + money(variable) + '</td></tr>' +
        (hoa > 0 ? '<tr><td>HOA</td><td>-' + money(hoa * 12) + '</td></tr>' : '') +
        '<tr><td><b>Net operating income</b></td><td><b>' + money(noi) + '</b></td></tr>' +
        '<tr><td>Mortgage payments</td><td>-' + money(debt) + '</td></tr>' +
        '<tr class="cyh-hi"><td><b>Cash flow</b></td><td><b>' + money(cf) + '</b></td></tr>';
    }

    var onePct = rent / price * 100;
    var msg = '<b>' + money(cf / 12) + ' a month' + (cf < 0 ? ' — this deal costs you money every month' : '') +
      ', on ' + money(cash) + ' of your own cash in.</b> ';
    msg += 'Rent is ' + pct(onePct, 2) + ' of the price. The old "1% rule" is a screening habit rather than a ' +
      'standard, and it stopped clearing in most of the country years ago — it is useful for deciding what to ' +
      'look at, not what to buy. ';
    if (debt > 0) {
      var d = noi / debt;
      msg += d < 1
        ? '<b>Coverage is ' + d.toFixed(2) + '×</b>, so the building does not cover its own mortgage before you have paid for a single repair. '
        : 'Coverage is ' + d.toFixed(2) + '×. ';
    }
    msg += 'The ' + pct(maint + capex + mgmt, 0) + ' set aside for maintenance, reserves and management is ' +
      money(variable) + ' a year. Leaving it out would show ' + money((cf + variable) / 12) +
      ' a month instead, which is the number most listings are sold on.';
    show($('cyh-rpMsg'), msg);
  };

  /* ---------- 23. Fix and flip -------------------------------------
     Breakeven sale price is the output that matters. A profit figure
     answers "if everything goes right"; the breakeven answers "how
     wrong can the market be before this hurts", which is the question
     that actually decides whether to make the offer. */
  window.cyhFlip = function () {
    var arv = num($('cyh-fpArv')), repair = num($('cyh-fpRepair')), buy = num($('cyh-fpBuy')),
        close = num($('cyh-fpClose')), monthsHeld = num($('cyh-fpMonths')), hold = num($('cyh-fpHold')),
        loanPct = num($('cyh-fpLoan')), points = num($('cyh-fpPoints')), rate = num($('cyh-fpRate')),
        sellPct = num($('cyh-fpSell'));

    var OUT = ['cyh-fpMao', 'cyh-fpProfit', 'cyh-fpRoi', 'cyh-fpBe'];
    var rows = $('cyh-fpRows');

    if (arv <= 0 || buy <= 0) {
      setAll(OUT, EMDASH);
      if (rows) rows.innerHTML = '';
      show($('cyh-fpMsg'), '');
      return;
    }

    var loan = buy * loanPct / 100;
    var pointsCost = loan * points / 100;
    var loanInterest = loan * rate / 100 * monthsHeld / 12;
    var holding = hold * monthsHeld;
    var selling = arv * sellPct / 100;

    var totalCost = buy + repair + close + holding + pointsCost + loanInterest + selling;
    var profit = arv - totalCost;
    var cashIn = (buy - loan) + close + repair + holding + pointsCost + loanInterest;
    var mao = arv * 0.70 - repair;

    /* Breakeven has a closed form once selling costs are a percentage
       of the sale price: fixed / (1 - sell%). */
    var fixed = buy + repair + close + holding + pointsCost + loanInterest;
    var be = sellPct < 100 ? fixed / (1 - sellPct / 100) : NaN;

    $('cyh-fpMao').textContent = money(mao);
    $('cyh-fpProfit').textContent = money(profit);
    $('cyh-fpRoi').textContent = cashIn > 0 ? pct(profit / cashIn * 100, 1) : EMDASH;
    $('cyh-fpBe').textContent = isFinite(be) ? money(be) : EMDASH;
    if ($('cyh-fpProfitWrap')) $('cyh-fpProfitWrap').className = 'cyh-stat ' + (profit >= 0 ? 'pos' : 'neg');

    if (rows) {
      rows.innerHTML =
        '<tr><td>Purchase price</td><td>' + money(buy) + '</td></tr>' +
        '<tr><td>Repairs</td><td>' + money(repair) + '</td></tr>' +
        '<tr><td>Closing costs to buy</td><td>' + money(close) + '</td></tr>' +
        '<tr><td>Holding for ' + Math.round(monthsHeld) + ' months</td><td>' + money(holding) + '</td></tr>' +
        '<tr><td>Loan points and interest</td><td>' + money(pointsCost + loanInterest) + '</td></tr>' +
        '<tr><td>Selling costs at ' + pct(sellPct, 1) + '</td><td>' + money(selling) + '</td></tr>' +
        '<tr class="cyh-hi"><td><b>Total cost</b></td><td><b>' + money(totalCost) + '</b></td></tr>';
    }

    var msg = '<b>' + (profit >= 0 ? money(profit) + ' profit' : money(-profit) + ' loss') +
      ' on ' + money(cashIn) + ' of your own cash.</b> ';
    if (isFinite(be)) {
      var cushion = (arv - be) / arv * 100;
      msg += 'It breaks even at a sale price of <b>' + money(be) + '</b>, which is ' + pct(cushion, 1) +
        ' below the ' + money(arv) + ' you are expecting. ' +
        (cushion < 8
          ? 'That is a thin cushion for a market that can move while you are holding, and repair budgets that can move on their own. '
          : 'That is the cushion you actually have if the finished value comes in under. ');
    }
    msg += buy > mao
      ? 'At ' + money(buy) + ' you are paying ' + money(buy - mao) + ' above the 70% screen of ' + money(mao) + '.'
      : 'At ' + money(buy) + ' you are ' + money(mao - buy) + ' inside the 70% screen.';
    show($('cyh-fpMsg'), msg);
  };

  /* ---------- 24. BRRRR --------------------------------------------
     Two outputs decide it and they pull against each other: how much
     capital comes back out, and whether it still cash flows once the
     bigger loan is on it. A tool that shows only the first is how
     "infinite return" gets sold. */
  window.cyhBrrrr = function () {
    var buy = num($('cyh-bxBuy')), rehab = num($('cyh-bxRehab')), close = num($('cyh-bxClose')),
        arv = num($('cyh-bxArv')), ltv = num($('cyh-bxLtv')), rate = num($('cyh-bxRate')),
        yrs = num($('cyh-bxYears')), rent = num($('cyh-bxRent')), tax = num($('cyh-bxTax')),
        opexPct = num($('cyh-bxOpex'));

    var OUT = ['cyh-bxAllIn', 'cyh-bxLoan', 'cyh-bxLeft', 'cyh-bxCF'];
    if (buy <= 0 || arv <= 0) {
      setAll(OUT, EMDASH);
      show($('cyh-bxMsg'), '');
      return;
    }

    var allIn = buy + rehab + close;
    var newLoan = arv * ltv / 100;
    var left = allIn - newLoan;
    var payment = yrs > 0 ? pmt(newLoan, rate / 100 / 12, yrs * 12) : NaN;

    var gross = rent * 12;
    var noi = gross - gross * opexPct / 100 - tax;
    var cf = isFinite(payment) ? noi - payment * 12 : NaN;

    $('cyh-bxAllIn').textContent = money(allIn);
    $('cyh-bxLoan').textContent = money(newLoan);
    $('cyh-bxLeft').textContent = money(Math.max(left, 0));
    $('cyh-bxCF').textContent = isFinite(cf) ? money(cf / 12) : EMDASH;
    if ($('cyh-bxCFWrap')) $('cyh-bxCFWrap').className = 'cyh-stat ' + (cf >= 0 ? 'pos' : 'neg');
    if ($('cyh-bxLeftWrap')) $('cyh-bxLeftWrap').className = 'cyh-stat ' + (left <= 0 ? 'pos' : 'gold');

    var msg;
    if (left <= 0) {
      msg = '<b>The refinance returns all ' + money(allIn) + ' you put in, plus ' + money(-left) +
        '.</b> That is what makes the strategy repeat: the same capital buys the next one. ';
    } else {
      msg = '<b>' + money(left) + ' of your money stays in the deal.</b> The new loan of ' + money(newLoan) +
        ' does not cover the ' + money(allIn) + ' you spent, so this one does not fully recycle. ';
      if (isFinite(cf) && cf > 0) {
        msg += 'On the ' + money(left) + ' still in, the cash flow is a ' + pct(cf / left * 100, 1) +
          ' return. ';
      }
    }
    if (isFinite(cf)) {
      msg += cf >= 0
        ? 'After the refinance it clears ' + money(cf / 12) + ' a month. Both halves work, which is rarer than the strategy is usually made to sound.'
        : '<b>But it loses ' + money(-cf / 12) + ' a month after the refinance.</b> Getting your capital back out and owning something that costs you every month is not the same as making money. The bigger the loan you pull out, the harder this gets — that tension is the whole strategy.';
    }
    if (arv > 0 && allIn / arv > ltv / 100) {
      msg += ' You are all-in at ' + pct(allIn / arv * 100, 1) + ' of the appraised value, above the ' +
        pct(ltv, 0) + ' the lender will lend, which is exactly why cash is left behind.';
    }
    show($('cyh-bxMsg'), msg);
  };

  /* Standalone pages ship real default values, so kick each calculator
     once on load: the page has to show real numbers before anything is
     typed, for a reader and for a crawler. */
  document.addEventListener('DOMContentLoaded', function () {
    if ($('cyh-bpPrice')) window.cyhPricing();
    if ($('cyh-locBal')) window.cyhLoc();
    if ($('cyh-blAmt')) window.cyhBizLoan();
    if ($('cyh-cfStart')) window.cyhBizCash();
    if ($('cyh-brSales')) window.cyhBizRatios();
    if ($('cyh-elPrice')) window.cyhBizLease();
    if ($('cyh-rpPrice')) window.cyhRental();
    if ($('cyh-fpArv')) window.cyhFlip();
    if ($('cyh-bxBuy')) window.cyhBrrrr();
  });
})();
