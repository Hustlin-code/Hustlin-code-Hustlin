/* ===================================================================
   calculators.js - Calculate Your Hustle
   -------------------------------------------------------------------
   ONE engine, loaded by the hub page (calculate-your-hustle.html) and
   by all 14 standalone /<name>-calculator.html pages.

   WHY ONE FILE INSTEAD OF A COPY PER PAGE
   Fifteen pages ship the same maths. Inlining it fifteen times means a
   bug gets fixed fourteen times and missed once, and every page pays
   the bytes again instead of hitting cache.

   HOW A PAGE ONLY RUNS ITS OWN CALCULATOR
   Every calculator addresses its inputs through $(id). On a standalone
   page thirteen of the fourteen id sets do not exist, so a plain
   getElementById would return null and the first `.textContent =`
   would throw and kill every later calculator on the page.

   $() therefore returns VOID - a callable Proxy - instead of null.
   VOID absorbs any property set, returns itself on any property get,
   and returns itself when called. So `$('nope').parentElement.className
   = 'x'` is a silent no-op, `parseFloat($('nope').value)` is NaN which
   num() already floors to 0, and `$('nope').querySelectorAll('i')
   .forEach(f)` iterates nothing. Absent calculators cost one wasted
   function call and cannot break a present one.

   Do not "simplify" $() back to getElementById. That reintroduces the
   exact coupling this file exists to remove.
   =================================================================== */
(function () {
  'use strict';

  /* Callable no-op proxy - see the note at the top of this file. */
  var VOID = new Proxy(function () {}, {
    get: function (t, k) {
      if (k === Symbol.toPrimitive || k === 'valueOf' || k === 'toString') return function () { return ''; };
      if (k === 'value' || k === 'textContent' || k === 'innerHTML' || k === 'className') return '';
      if (k === 'length') return 0;
      return VOID;
    },
    set: function () { return true; },
    apply: function () { return VOID; }
  });
  var $ = function (id) { return document.getElementById(id) || VOID; };
  var has = function (id) { return !!document.getElementById(id); };
  var num = function (el) { var v = parseFloat(el && el.value); return isFinite(v) ? v : 0; };
  var money = function (n) {
    if (!isFinite(n)) return '$0';
    return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
  };
  var months = function (m) {
    if (!isFinite(m) || m <= 0) return '–';
    if (m >= 1200) return '40+ yrs';
    var y = Math.floor(m / 12), r = Math.round(m % 12);
    if (y === 0) return r + ' mo';
    if (r === 0) return y + (y === 1 ? ' yr' : ' yrs');
    return y + 'y ' + r + 'm';
  };
  var show = function (el, html) {
    if (!el) return;
    if (html) { el.innerHTML = html; el.style.display = ''; } else { el.style.display = 'none'; }
  };

  /* ---------- generic label/amount rows ---------- */
  window.cyhAdd = function (host, ph, label, amt) {
    var d = document.createElement('div');
    d.className = 'cyh-row';
    d.innerHTML = '<input type="text" placeholder="' + ph + '" value="' + (label || '') + '">' +
                  '<input type="number" placeholder="0" value="' + (amt === undefined ? '' : amt) + '">' +
                  '<button class="cyh-x" title="Remove">×</button>';
    d.querySelector('.cyh-x').onclick = function () { d.remove(); cyhAll(); };
    d.querySelectorAll('input').forEach(function (i) { i.addEventListener('input', cyhAll); });
    $(host).appendChild(d);
    cyhAll();
  };
  var sumRows = function (host) {
    var t = 0;
    $(host).querySelectorAll('.cyh-row input[type=number]').forEach(function (i) {
      var v = parseFloat(i.value); if (isFinite(v)) t += v;
    });
    return t;
  };

  /* ---------- 01 budget ---------- */
  function cyhBudget() {
    var inc = sumRows('cyh-inc'), exp = sumRows('cyh-exp'), br = inc - exp;
    $('cyh-ti').textContent = money(inc);
    $('cyh-te').textContent = money(exp);
    $('cyh-br').textContent = money(br);
    $('cyh-br').parentElement.className = 'cyh-stat ' + (br >= 0 ? 'pos' : 'neg');
    var rate = inc > 0 ? (br / inc) * 100 : 0;
    $('cyh-sr').textContent = (inc > 0 ? Math.round(rate) : 0) + '%';

    var m = '';
    if (inc > 0 && br < 0) {
      m = '<b>You are short ' + money(Math.abs(br)) + ' a month.</b> This is a gap, not a verdict. ' +
          'Two levers exist and you usually need both: cut one category without misery, and raise income. ' +
          'Before anything else call <b>211</b> — it connects you to local emergency assistance for rent, ' +
          'utilities and food that most people have never heard of.';
    } else if (inc > 0 && rate < 10) {
      m = '<b>' + Math.round(rate) + '% breathing room.</b> Thin, but positive — and positive is the whole ' +
          'game right now. Send it to a $1,000 buffer first. Once that exists, everything else gets easier.';
    } else if (inc > 0 && rate < 20) {
      m = '<b>' + Math.round(rate) + '% breathing room.</b> That is a working budget. Fund the buffer, then ' +
          'point the rest at your highest-interest debt — run it through Calculator 06 below.';
    } else if (inc > 0) {
      m = '<b>' + Math.round(rate) + '% breathing room.</b> Strong. At this rate the constraint is no longer ' +
          'cash flow, it is where you put it. Stage 4 covers index funds; Calculator 11 shows what this becomes.';
    }
    show($('cyh-budmsg'), m);
  }

  /* ---------- 02 paycheck ---------- */
  window.cyhPaycheck = function () {
    var amt = num($('cyh-pcAmt')), p = $('cyh-pcMode').value.split(',').map(Number);
    var n = amt * p[0] / 100, w = amt * p[1] / 100, s = amt * p[2] / 100;
    $('cyh-pcN').textContent = money(n);
    $('cyh-pcW').textContent = money(w);
    $('cyh-pcS').textContent = money(s);
    $('cyh-pcY').textContent = money(s * 12);
    show($('cyh-pcMsg'), amt > 0
      ? '<b>' + money(s) + ' a month is ' + money(s * 12) + ' a year.</b> These percentages are a ' +
        'starting shape, not a rule. If your housing alone takes 40%, that is your reality to work from, ' +
        'not a failure to correct today. Adjust until the split is one you will actually follow — a ' +
        'budget you resent is a budget you abandon.'
      : '');
  };

  /* ---------- 03 emergency fund ---------- */
  window.cyhEF = function () {
    var now = num($('cyh-efNow')), mo = num($('cyh-efMo')), exp = num($('cyh-efExp'));
    var to = function (goal) {
      if (now >= goal) return 'Done ✓';
      if (mo <= 0) return '–';
      return months(Math.ceil((goal - now) / mo));
    };
    $('cyh-ef500').textContent = to(500);
    $('cyh-ef1k').textContent = to(1000);
    $('cyh-ef3').textContent = exp > 0 ? to(exp * 3) : '–';
    $('cyh-ef6').textContent = exp > 0 ? to(exp * 6) : '–';
    show($('cyh-efMsg'), mo > 0
      ? '<b>Why $1,000 before three months.</b> A thousand dollars covers most real emergencies — a car ' +
        'repair, an ER copay, a broken appliance. That one buffer is the difference between a bad week and a ' +
        'payday loan at 400% APR. Build it first, then keep going.'
      : '');
  };

  /* ---------- 04 Life Just Happened Fund ---------- */
  window.cyhAddSF = function (label, amt) {
    var host = $('cyh-sf'), d = document.createElement('div');
    d.className = 'cyh-row';
    d.innerHTML = '<input type="text" placeholder="Annual expense" value="' + (label || '') + '">' +
                  '<input type="number" placeholder="0" value="' + (amt === undefined ? '' : amt) + '">' +
                  '<button class="cyh-x" title="Remove">×</button>';
    d.querySelector('.cyh-x').onclick = function () { d.remove(); cyhAll(); };
    d.querySelectorAll('input').forEach(function (i) { i.addEventListener('input', cyhAll); });
    host.appendChild(d);
    cyhAll();
  };
  function cyhSF() {
    var yr = sumRows('cyh-sf');
    var n = $('cyh-sf').querySelectorAll('.cyh-row').length;
    $('cyh-sfYr').textContent = money(yr);
    $('cyh-sfMo').textContent = money(yr / 12);
    $('cyh-sfN').textContent = n;
  }

  /* ---------- 05 debt overview ---------- */
  window.cyhAddDebt = function (name, bal, apr, min) {
    var host = $('cyh-debt'), d = document.createElement('div');
    d.className = 'cyh-row';
    d.style.gridTemplateColumns = '1fr 100px 76px 88px 34px';
    d.innerHTML = '<input type="text" placeholder="Debt name" value="' + (name || '') + '">' +
                  '<input type="number" placeholder="Balance" value="' + (bal === undefined ? '' : bal) + '">' +
                  '<input type="number" placeholder="APR%" step="0.1" value="' + (apr === undefined ? '' : apr) + '">' +
                  '<input type="number" placeholder="Min pay" value="' + (min === undefined ? '' : min) + '">' +
                  '<button class="cyh-x" title="Remove">×</button>';
    d.querySelector('.cyh-x').onclick = function () { d.remove(); cyhAll(); };
    d.querySelectorAll('input').forEach(function (i) { i.addEventListener('input', cyhAll); });
    host.appendChild(d);
    cyhAll();
  };
  function cyhDebt() {
    var tot = 0, min = 0, interest = 0, hiRate = -1, hiName = '';
    $('cyh-debt').querySelectorAll('.cyh-row').forEach(function (r) {
      var i = r.querySelectorAll('input');
      var name = i[0].value || 'Unnamed';
      var bal = parseFloat(i[1].value) || 0;
      var apr = parseFloat(i[2].value) || 0;
      var mp = parseFloat(i[3].value) || 0;
      tot += bal; min += mp; interest += bal * apr / 100;
      if (bal > 0 && apr > hiRate) { hiRate = apr; hiName = name; }
    });
    $('cyh-dTot').textContent = money(tot);
    $('cyh-dMin').textContent = money(min);
    $('cyh-dInt').textContent = money(interest);
    $('cyh-dHi').textContent = hiName ? (hiName.length > 13 ? hiName.slice(0, 12) + '…' : hiName) : '–';
    show($('cyh-dMsg'), tot > 0 && hiName
      ? '<b>Attack ' + hiName + ' first — it is costing you ' + hiRate + '% a year.</b> ' +
        'Pay the minimum on everything else, then put every spare dollar here. When it clears, roll that ' +
        'entire payment onto the next-highest rate rather than absorbing it back into spending. At current ' +
        'balances your debt costs about <b>' + money(interest) + ' a year in interest alone</b>.'
      : '');
  }

  /* ---------- 06 payoff ---------- */
  function sim(bal, apr, pay) {
    var r = apr / 100 / 12, m = 0, paid = 0;
    if (pay <= bal * r) return null;           // payment never covers interest
    while (bal > 0 && m < 1200) {
      var i = bal * r; bal += i - pay; paid += i; m++;
      if (bal < 0) { paid += bal; bal = 0; }
    }
    return { m: m, interest: paid };
  }
  window.cyhPayoff = function () {
    var bal = num($('cyh-poBal')), apr = num($('cyh-poApr')),
        pay = num($('cyh-poPay')), ex = num($('cyh-poEx'));
    if (bal <= 0 || pay <= 0) {
      ['cyh-poTime','cyh-poSaveT'].forEach(function(k){ $(k).textContent = '–'; });
      ['cyh-poInt','cyh-poSave'].forEach(function(k){ $(k).textContent = '$0'; });
      show($('cyh-poMsg'), ''); return;
    }
    var base = sim(bal, apr, pay);
    if (!base) {
      $('cyh-poTime').textContent = 'Never';
      $('cyh-poInt').textContent = '–';
      $('cyh-poSaveT').textContent = '–';
      $('cyh-poSave').textContent = '$0';
      show($('cyh-poMsg'),
        '<b>This payment never clears the balance.</b> At ' + apr + '% APR the monthly interest alone is ' +
        'about ' + money(bal * apr / 100 / 12) + ', which is more than you are paying. The balance grows ' +
        'every month no matter how long you keep paying. This is the situation predatory lending is built ' +
        'to create. Raise the payment, or call a non-profit credit counsellor through the NFCC — it is free.');
      return;
    }
    $('cyh-poTime').textContent = months(base.m);
    $('cyh-poInt').textContent = money(base.interest);

    if (ex > 0) {
      var fast = sim(bal, apr, pay + ex);
      if (fast) {
        $('cyh-poSaveT').textContent = months(base.m - fast.m);
        $('cyh-poSave').textContent = money(base.interest - fast.interest);
        show($('cyh-poMsg'),
          '<b>' + money(ex) + ' extra a month clears this ' + months(base.m - fast.m) + ' sooner and saves ' +
          money(base.interest - fast.interest) + ' in interest.</b> That saving is guaranteed and untaxed — ' +
          'no investment offers the same certainty. It is why high-interest debt gets paid before investing.');
        return;
      }
    }
    $('cyh-poSaveT').textContent = '–';
    $('cyh-poSave').textContent = '$0';
    show($('cyh-poMsg'),
      '<b>You will pay ' + money(base.interest) + ' in interest at this rate.</b> Add even $25 to the extra ' +
      'field above and watch both numbers move — the effect is almost always bigger than it looks.');
  };

  /* ---------- 07 utilization ---------- */
  window.cyhUtil = function () {
    var bal = num($('cyh-utBal')), lim = num($('cyh-utLim'));
    if (lim <= 0) {
      $('cyh-utPct').textContent = '–';
      $('cyh-ut30').textContent = '–';
      $('cyh-ut10').textContent = '–';
      show($('cyh-utMsg'), ''); return;
    }
    var pct = bal / lim * 100;
    $('cyh-utPct').textContent = pct.toFixed(1) + '%';
    $('cyh-utPct').parentElement.className = 'cyh-stat ' + (pct <= 10 ? 'pos' : pct <= 30 ? '' : 'neg');
    $('cyh-ut30').textContent = bal <= lim * 0.3 ? 'At target ✓' : money(bal - lim * 0.3);
    $('cyh-ut10').textContent = bal <= lim * 0.1 ? 'At target ✓' : money(bal - lim * 0.1);

    var m;
    if (pct <= 10) m = '<b>' + pct.toFixed(1) + '% — this is the range scores respond to best.</b> ' +
      'Keep it here. Do not close old cards to tidy up: closing a card removes its limit from the ' +
      'denominator and pushes this number back up overnight.';
    else if (pct <= 30) m = '<b>' + pct.toFixed(1) + '% — inside the common guideline.</b> ' +
      'Paying down ' + money(bal - lim * 0.1) + ' would put you under 10%, which is where the ' +
      'remaining gain is. Utilization recalculates monthly, so this moves faster than any other factor.';
    else m = '<b>' + pct.toFixed(1) + '% — high enough to be holding your score down.</b> ' +
      'Utilization is roughly 30% of a FICO score and it resets every month, so this is the fastest ' +
      'thing you can fix. Paying down ' + money(bal - lim * 0.3) + ' gets you under 30%. Also worth ' +
      'asking for a limit increase without a hard pull — it lowers the ratio without paying a cent.';
    show($('cyh-utMsg'), m);
  };

  /* ---------- 08 compound ---------- */
  function grow(start, monthly, years, rate) {
    var r = rate / 100 / 12, n = Math.round(years * 12), b = start;
    for (var i = 0; i < n; i++) b = b * (1 + r) + monthly;
    return b;
  }
  window.cyhCompound = function () {
    var s = num($('cyh-ciStart')), mo = num($('cyh-ciMo')),
        y = num($('cyh-ciYrs')), r = num($('cyh-ciRate'));
    if (y <= 0) {
      ['cyh-ciEnd','cyh-ciIn','cyh-ciGain'].forEach(function(k){ $(k).textContent = '$0'; });
      $('cyh-ciMult').textContent = '–'; show($('cyh-ciMsg'), ''); return;
    }
    var end = grow(s, mo, y, r), inp = s + mo * y * 12, gain = end - inp;
    $('cyh-ciEnd').textContent = money(end);
    $('cyh-ciIn').textContent = money(inp);
    $('cyh-ciGain').textContent = money(gain);
    $('cyh-ciMult').textContent = inp > 0 ? (end / inp).toFixed(1) + '×' : '–';
    if (inp > 0 && gain > 0) {
      var half = grow(s, mo, y / 2, r), halfIn = s + mo * (y / 2) * 12;
      show($('cyh-ciMsg'),
        '<b>' + money(gain) + ' of that was growth, not money you put in.</b> ' +
        'Half the time (' + Math.round(y / 2) + ' years) produces only ' + money(half) + ' — ' +
        'not half of ' + money(end) + '. That gap is the entire argument for starting now with a small ' +
        'amount rather than later with a large one. Time is the input you cannot buy back.');
    } else { show($('cyh-ciMsg'), ''); }
  };

  /* ---------- 09 investment scenarios ---------- */
  window.cyhInvest = function () {
    var s = num($('cyh-igStart')), mo = num($('cyh-igMo')), y = num($('cyh-igYrs'));
    var body = $('cyh-igBody');
    if (y <= 0 || (s <= 0 && mo <= 0)) {
      body.innerHTML = '<tr><td colspan="4" style="color:#6F6A5E">Enter your numbers above.</td></tr>';
      return;
    }
    var rows = [['Conservative', 5], ['Historical average', 7], ['Optimistic', 10]];
    var inp = s + mo * y * 12;
    body.innerHTML = rows.map(function (r) {
      var end = grow(s, mo, y, r[1]);
      return '<tr' + (r[1] === 7 ? ' class="cyh-hi"' : '') + '>' +
             '<td>' + r[0] + '</td><td>' + r[1] + '%</td>' +
             '<td>' + money(end) + '</td><td>' + money(end - inp) + '</td></tr>';
    }).join('') +
    '<tr><td colspan="2" style="font-weight:700">You contributed</td>' +
    '<td colspan="2" style="font-weight:700">' + money(inp) + '</td></tr>';
  };

  /* ---------- 10 net worth ---------- */
  function cyhNW() {
    var a = sumRows('cyh-asset'), l = sumRows('cyh-liab'), n = a - l;
    $('cyh-nwA').textContent = money(a);
    $('cyh-nwL').textContent = money(l);
    $('cyh-nwT').textContent = money(n);
    $('cyh-nwT').parentElement.className = 'cyh-stat ' + (n >= 0 ? 'gold' : 'neg');
    var m = '';
    if (a > 0 || l > 0) {
      m = n < 0
        ? '<b>Negative net worth is normal early on</b> — student loans, a car loan and no assets yet ' +
          'produce it almost by definition. The number that matters is not this month’s figure, it is ' +
          'whether it is less negative than last month. Track it quarterly, not daily.'
        : '<b>' + money(n) + '.</b> Recalculate this every quarter and write it down. The single figure ' +
          'tells you more than any individual account balance, because it nets out the debt that account ' +
          'balances quietly ignore.';
    }
    show($('cyh-nwMsg'), m);
  }

  /* ---------- 11 freedom number ---------- */
  window.cyhFreedom = function () {
    var sp = num($('cyh-ffSpend')), have = num($('cyh-ffHave')),
        save = num($('cyh-ffSave')), r = num($('cyh-ffRate')) || 7;
    var target = sp * 12 * 25;
    $('cyh-ffNum').textContent = money(target);
    $('cyh-ffMo').textContent = money(target * 0.04 / 12);
    $('cyh-ffPct').textContent = target > 0 ? Math.min(100, (have / target * 100)).toFixed(1) + '%' : '0%';

    if (target <= 0 || (save <= 0 && have <= 0)) {
      $('cyh-ffYrs').textContent = '–'; show($('cyh-ffMsg'), ''); return;
    }
    var b = have, mr = r / 100 / 12, m = 0;
    while (b < target && m < 1200) { b = b * (1 + mr) + save; m++; }
    $('cyh-ffYrs').textContent = m >= 1200 ? '40+ yrs' : months(m);

    show($('cyh-ffMsg'),
      '<b>' + money(target) + ' is 25× your annual spending</b> — the amount that could support ' +
      'you at roughly a 4% withdrawal rate. It is a planning benchmark, not a guarantee, and it moves with ' +
      'what you spend rather than what you earn. Cutting ' + money(200) + ' a month from your spending ' +
      'lowers this target by ' + money(200 * 12 * 25) + ' <em>and</em> gives you ' + money(200) +
      ' more to invest. That is why expenses matter more than income here.');
  };


  /* ================================================================
     12 PAYCHECK / TAKE-HOME  (cyhWithhold)
     ----------------------------------------------------------------
     Estimates net pay from gross, the way a payroll system does:
     federal income tax on brackets, FICA, then state.

     ACCURACY BOUNDARY - stated on the page too, not just here:
       · Federal brackets, standard deduction, Social Security wage
         base and Medicare thresholds are the real 2026 figures.
       · State tax uses each state's own brackets and standard
         deduction. It does NOT model state credits, exemptions
         taken as credits, or LOCAL income tax (NYC, Philadelphia,
         most of Ohio). Those states will read low.
       · W-4 dependents/credits, itemising and multi-job withholding
         are not modelled. This estimates TAX OWED, which is what a
         correctly-filled W-4 converges on - not the exact number
         your employer withholds this Friday.
     ================================================================ */

  /* 2026 federal ordinary-income brackets. IRS Rev. Proc. 2025-32.
     Stored as [rate, threshold] - threshold is where the rate STARTS. */
  var FED_2026 = {
    single: [[0.10,0],[0.12,12400],[0.22,50400],[0.24,105700],[0.32,201775],[0.35,256225],[0.37,640600]],
    joint:  [[0.10,0],[0.12,24800],[0.22,100800],[0.24,211400],[0.32,403550],[0.35,512450],[0.37,768700]],
    hoh:    [[0.10,0],[0.12,17700],[0.22,67450],[0.24,105700],[0.32,201775],[0.35,256200],[0.37,640600]]
  };
  var STD_2026  = { single: 16100, joint: 32200, hoh: 24150 };
  var SS_WAGE_BASE_2026 = 184500;   // 6.2% stops above this
  var SS_RATE = 0.062, MED_RATE = 0.0145, ADDL_MED_RATE = 0.009;
  var ADDL_MED_FLOOR = { single: 200000, joint: 250000, hoh: 200000 };

  /* State wage-tax table. brackets = null means wages are not taxed.
     [rate, singleThreshold, jointThreshold]; sd = [single, joint]. */
  var STATE_TAX = {"Alabama":{"brackets":[[0.02,0,0],[0.04,500.0,1000.0],[0.05,3000.0,6000.0]],"sd":[3000.0,8500.0]},"Alaska":{"brackets":null,"sd":[0,0]},"Arizona":{"brackets":[[0.025,0,0]],"sd":[15000.0,30000.0]},"Arkansas":{"brackets":[[0.02,0,0],[0.039,4500.0,4500.0]],"sd":[2410.0,4820.0]},"California":{"brackets":[[0.01,0,0],[0.02,10756.0,21512.0],[0.04,25499.0,50998.0],[0.06,40245.0,80490.0],[0.08,55866.0,111732.0],[0.093,70606.0,141732.0],[0.103,360659.0,721318.0],[0.113,432787.0,865574.0],[0.123,721314.0,1000000.0],[0.133,1000000.0,1442628.0]],"sd":[5540.0,11080.0]},"Colorado":{"brackets":[[0.044,0,0]],"sd":[15000.0,30000.0]},"Connecticut":{"brackets":[[0.02,0,0],[0.045,10000.0,20000.0],[0.055,50000.0,100000.0],[0.06,100000.0,200000.0],[0.065,200000.0,400000.0],[0.069,250000.0,500000.0],[0.0699,500000.0,1000000.0]],"sd":[0,0]},"Delaware":{"brackets":[[0.022,2000.0,2000.0],[0.039,5000.0,5000.0],[0.048,10000.0,10000.0],[0.052,20000.0,20000.0],[0.0555,25000.0,25000.0],[0.066,60000.0,60000.0]],"sd":[3250.0,6500.0]},"Florida":{"brackets":null,"sd":[0,0]},"Georgia":{"brackets":[[0.0539,0,0]],"sd":[12000.0,24000.0]},"Hawaii":{"brackets":[[0.014,0,0],[0.032,9600.0,19200.0],[0.055,14400.0,28800.0],[0.064,19200.0,38400.0],[0.068,24000.0,48000.0],[0.072,36000.0,72000.0],[0.076,48000.0,96000.0],[0.079,125000.0,250000.0],[0.0825,175000.0,350000.0],[0.09,225000.0,450000.0],[0.1,275000.0,550000.0],[0.11,325000.0,650000.0]],"sd":[4400.0,8800.0]},"Idaho":{"brackets":[[0.05695,4673.0,9346.0]],"sd":[15000.0,30000.0]},"Illinois":{"brackets":[[0.0495,0,0]],"sd":[0,0]},"Indiana":{"brackets":[[0.03,0,0]],"sd":[0,0]},"Iowa":{"brackets":[[0.038,0,0]],"sd":[0,0]},"Kansas":{"brackets":[[0.052,0,0],[0.0558,23000.0,46000.0]],"sd":[3605.0,8240.0]},"Kentucky":{"brackets":[[0.04,0,0]],"sd":[3270.0,6540.0]},"Louisiana":{"brackets":[[0.03,0,0]],"sd":[12500.0,25000.0]},"Maine":{"brackets":[[0.058,0,0],[0.0675,26800.0,53600.0],[0.0715,63450.0,126900.0]],"sd":[15000.0,30000.0]},"Maryland":{"brackets":[[0.02,0,0],[0.03,1000.0,1000.0],[0.04,2000.0,2000.0],[0.0475,3000.0,3000.0],[0.05,100000.0,150000.0],[0.0525,125000.0,175000.0],[0.055,150000.0,225000.0],[0.0575,250000.0,300000.0]],"sd":[2700.0,5450.0]},"Massachusetts":{"brackets":[[0.05,0,0],[0.09,1083150.0,1083150.0]],"sd":[0,0]},"Michigan":{"brackets":[[0.0425,0,0]],"sd":[0,0]},"Minnesota":{"brackets":[[0.0535,0,0],[0.068,32570.0,47620.0],[0.0785,106990.0,189180.0],[0.0985,198630.0,330410.0]],"sd":[14950.0,29900.0]},"Mississippi":{"brackets":[[0.044,10000.0,10000.0]],"sd":[2300.0,4600.0]},"Missouri":{"brackets":[[0.02,1313.0,1313.0],[0.025,2626.0,2626.0],[0.03,3939.0,3939.0],[0.035,5252.0,5252.0],[0.04,6565.0,6565.0],[0.045,7878.0,7878.0],[0.047,9191.0,9191.0]],"sd":[15000.0,30000.0]},"Montana":{"brackets":[[0.047,0,0],[0.059,21100.0,42200.0]],"sd":[15000.0,30000.0]},"Nebraska":{"brackets":[[0.0246,0,0],[0.0351,4030.0,8040.0],[0.0501,24120.0,48250.0],[0.052,38870.0,77730.0]],"sd":[8600.0,17200.0]},"Nevada":{"brackets":null,"sd":[0,0]},"New Hampshire":{"brackets":null,"sd":[0,0]},"New Jersey":{"brackets":[[0.014,0,0],[0.0175,20000.0,20000.0],[0.035,35000.0,50000.0],[0.05525,40000.0,70000.0],[0.0637,75000.0,80000.0],[0.0897,500000.0,150000.0],[0.1075,1000000.0,500000.0]],"sd":[0,0]},"New Mexico":{"brackets":[[0.015,0,0],[0.032,5500.0,8000.0],[0.043,16500.0,25000.0],[0.047,33500.0,50000.0],[0.049,66500.0,100000.0],[0.059,210000.0,315000.0]],"sd":[15000.0,30000.0]},"New York":{"brackets":[[0.04,0,0],[0.045,8500.0,17150.0],[0.0525,11700.0,23600.0],[0.055,13900.0,27900.0],[0.06,80650.0,161550.0],[0.0685,215400.0,323200.0],[0.0965,1077550.0,2155350.0],[0.103,5000000.0,5000000.0],[0.109,25000000.0,25000000.0]],"sd":[8000.0,16050.0]},"North Carolina":{"brackets":[[0.0425,0,0]],"sd":[12750.0,25500.0]},"North Dakota":{"brackets":[[0.0195,48475.0,80975.0],[0.025,244825.0,298075.0]],"sd":[15000.0,30000.0]},"Ohio":{"brackets":[[0.0275,26050.0,26050.0],[0.035,100000.0,100000.0]],"sd":[0,0]},"Oklahoma":{"brackets":[[0.0025,0,0],[0.0075,1000.0,2000.0],[0.0175,2500.0,5000.0],[0.0275,3750.0,7500.0],[0.0375,4900.0,9800.0],[0.0475,7200.0,14400.0]],"sd":[6350.0,12700.0]},"Oregon":{"brackets":[[0.0475,0,0],[0.0675,4400.0,8800.0],[0.0875,11050.0,22100.0],[0.099,125000.0,250000.0]],"sd":[2800.0,5600.0]},"Pennsylvania":{"brackets":[[0.0307,0,0]],"sd":[0,0]},"Rhode Island":{"brackets":[[0.0375,0,0],[0.0475,79900.0,79900.0],[0.0599,181650.0,181650.0]],"sd":[10900.0,21800.0]},"South Carolina":{"brackets":[[0.0,0,0],[0.03,3560.0,3560.0],[0.062,17830.0,17830.0]],"sd":[15000.0,30000.0]},"South Dakota":{"brackets":null,"sd":[0,0]},"Tennessee":{"brackets":null,"sd":[0,0]},"Texas":{"brackets":null,"sd":[0,0]},"Utah":{"brackets":[[0.0455,0,0]],"sd":[0,0]},"Vermont":{"brackets":[[0.0335,0,0],[0.066,47900.0,79950.0],[0.076,116000.0,193300.0],[0.0875,242000.0,294600.0]],"sd":[7400.0,14850.0]},"Virginia":{"brackets":[[0.02,0,0],[0.03,3000.0,3000.0],[0.05,5000.0,5000.0],[0.0575,17000.0,17000.0]],"sd":[8500.0,17000.0]},"Washington":{"brackets":null,"sd":[0,0]},"West Virginia":{"brackets":[[0.0222,0,0],[0.0296,10000.0,10000.0],[0.0333,25000.0,25000.0],[0.0444,40000.0,40000.0],[0.0482,60000.0,60000.0]],"sd":[0,0]},"Wisconsin":{"brackets":[[0.035,0,0],[0.044,14680.0,19580.0],[0.053,29370.0,39150.0],[0.0765,323290.0,431060.0]],"sd":[13560.0,25110.0]},"Wyoming":{"brackets":null,"sd":[0,0]},"Washington DC":{"brackets":[[0.04,0,0],[0.06,10000.0,10000.0],[0.065,40000.0,40000.0],[0.085,60000.0,60000.0],[0.0925,250000.0,250000.0],[0.0975,500000.0,500000.0],[0.1075,1000000.0,1000000.0]],"sd":[15000.0,30000.0]}};

  function progressive(taxable, brackets, jointIdx) {
    if (taxable <= 0) return 0;
    var tax = 0;
    for (var i = 0; i < brackets.length; i++) {
      var lo = brackets[i][jointIdx];
      if (taxable <= lo) break;
      var hi = (i + 1 < brackets.length) ? brackets[i + 1][jointIdx] : Infinity;
      tax += (Math.min(taxable, hi) - lo) * brackets[i][0];
    }
    return tax;
  }
  function fedTax(taxable, status) {
    if (taxable <= 0) return 0;
    var b = FED_2026[status], tax = 0;
    for (var i = 0; i < b.length; i++) {
      var lo = b[i][1];
      if (taxable <= lo) break;
      var hi = (i + 1 < b.length) ? b[i + 1][1] : Infinity;
      tax += (Math.min(taxable, hi) - lo) * b[i][0];
    }
    return tax;
  }


  /* ================================================================
     ROTH CONVERSION  -  cyhRoth()
     ----------------------------------------------------------------
     Answers the only question a conversion actually turns on: is the
     rate you pay now lower than the rate you would pay later?

     Three things this models that a generic "future value" calculator
     does not, and that are the whole point:

       1. The tax is MARGINAL, not average. Converting stacks on top of
          the income you already have, so the cost is
          fedTax(income + conversion) - fedTax(income). Applying a flat
          "your bracket" rate overstates it for most people and
          understates it for anyone who crosses a threshold.

       2. BRACKET HEADROOM. The single most useful output here is how
          much room is left before the next rate starts, because that
          is the number people size a conversion against - see Stage 5,
          Module 06.

       3. WHERE THE TAX COMES FROM. Paying it out of the converted
          money is a materially worse deal and is the most common
          avoidable mistake. Modelled as two separate scenarios rather
          than a footnote.

     ACCURACY BOUNDARY, stated on the page too:
       federal ordinary income only. No state tax, no NIIT, no IRMAA
       surcharge, no capital-gains drag on the side account, and it
       assumes the standard deduction. It is a sizing tool, not a
       filing. Anything large goes past a CPA.
     ================================================================ */
  window.cyhRoth = function () {
    var amt    = num($("cyh-rcAmt"));
    var income = num($("cyh-rcIncome"));
    var status = ($("cyh-rcStatus").value) || "single";
    var yrs    = num($("cyh-rcYrs"));
    var ret    = num($("cyh-rcReturn")) / 100;
    var later  = num($("cyh-rcLater")) / 100;
    var payFrom= ($("cyh-rcPayFrom").value) || "outside";

    var std     = STD_2026[status] || STD_2026.single;
    var taxable = Math.max(0, income - std);

    /* marginal cost of the conversion */
    var taxBefore = fedTax(taxable, status);
    var taxAfter  = fedTax(taxable + amt, status);
    var convTax   = Math.max(0, taxAfter - taxBefore);
    var effRate   = amt > 0 ? convTax / amt : 0;

    /* bracket headroom before the NEXT rate starts */
    var b = FED_2026[status], curRate = b[0][0], nextAt = Infinity, endRate = b[0][0];
    for (var i = 0; i < b.length; i++) {
      if (taxable >= b[i][1]) { curRate = b[i][0]; nextAt = (i + 1 < b.length) ? b[i + 1][1] : Infinity; }
      if (taxable + amt >= b[i][1]) endRate = b[i][0];
    }
    var headroom = (nextAt === Infinity) ? Infinity : Math.max(0, nextAt - taxable);

    var g = Math.pow(1 + ret, Math.max(0, yrs));

    /* Convert: what ends up in the Roth, tax-free at the end. */
    var rothBase = (payFrom === "inside") ? Math.max(0, amt - convTax) : amt;
    var rothEnd  = rothBase * g;

    /* Do not convert: the pre-tax balance grows and is taxed on the way
       out. If the tax would have been paid from outside money, that cash
       stays invested in this scenario - otherwise the comparison quietly
       credits the conversion with money it actually spent. */
    var tradEnd = amt * g * (1 - later);
    var sideEnd = (payFrom === "outside") ? convTax * g : 0;
    var noConvertEnd = tradEnd + sideEnd;

    var diff = rothEnd - noConvertEnd;

    $("cyh-rcTax").textContent  = money(convTax);
    $("cyh-rcEff").textContent  = (effRate * 100).toFixed(1) + "%";
    $("cyh-rcRoom").textContent = (headroom === Infinity) ? "No limit" : money(headroom);
    $("cyh-rcRoth").textContent = money(rothEnd);
    $("cyh-rcTrad").textContent = money(noConvertEnd);
    $("cyh-rcDiff").textContent = (diff >= 0 ? "+" : "") + money(diff);

    var msg = $("cyh-rcMsg");
    if (amt <= 0) {
      msg.innerHTML = "Enter an amount to convert.";
      return;
    }
    var parts = [];
    if (headroom !== Infinity && amt > headroom) {
      parts.push("<b>This conversion spills into the next bracket.</b> You have " +
        money(headroom) + " of room at " + Math.round(curRate * 100) + "% before the rate steps up to " +
        Math.round(endRate * 100) + "%. Converting " + money(headroom) +
        " instead keeps every converted dollar at the lower rate.");
    } else if (headroom !== Infinity) {
      parts.push("This fits inside your current " + Math.round(curRate * 100) +
        "% bracket, with " + money(headroom - amt) + " of room still spare.");
    }
    if (Math.abs(diff) < amt * 0.005) {
      parts.push("At " + (effRate * 100).toFixed(1) + "% now against " + (later * 100).toFixed(0) +
        "% later, this is <b>a wash</b> - the two come out within a rounding error of each other. " +
        "That is not a bug in the arithmetic, it is the whole decision: a conversion only wins when " +
        "the rate you pay now is genuinely lower than the rate you would pay later. Change one of " +
        "those two rates and the answer moves.");
    } else parts.push(diff >= 0
      ? "Converting comes out <b>" + money(Math.abs(diff)) + " ahead</b> after " + yrs +
        " years, because you are paying " + (effRate * 100).toFixed(1) +
        "% now instead of " + (later * 100).toFixed(0) + "% later."
      : "Converting comes out <b>" + money(Math.abs(diff)) + " behind</b> after " + yrs +
        " years. Paying " + (effRate * 100).toFixed(1) + "% now to avoid " +
        (later * 100).toFixed(0) + "% later is the wrong direction - wait for a lower-income year.");
    if (payFrom === "inside") {
      parts.push("<b>You are paying the tax out of the conversion.</b> That is why the Roth column starts at " +
        money(rothBase) + " rather than " + money(amt) +
        " - and under 59.5 the withheld amount is itself an early withdrawal and gets penalised.");
    }
    msg.innerHTML = parts.join(" ");
  };

  var PERIODS = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12, annual: 1 };

  window.cyhWithhold = function () {
    var gross   = num($('cyh-whGross'));
    var freq    = ($('cyh-whFreq').value) || 'biweekly';
    var per     = PERIODS[freq] || 26;
    var status  = ($('cyh-whStatus').value) || 'single';
    var stateNm = ($('cyh-whState').value) || 'Tennessee';
    var pretaxPct = num($('cyh-wh401k'));           // % of gross to 401(k)
    var healthPP  = num($('cyh-whHealth'));         // $ per PERIOD, Sec-125
    var extraPP   = num($('cyh-whExtra'));          // extra federal per PERIOD

    var annualGross = gross * per;
    if (annualGross <= 0) {
      ['cyh-whNet','cyh-whFed','cyh-whFica','cyh-whStateTax','cyh-whRate','cyh-whAnnual']
        .forEach(function (id) { $(id).textContent = id === 'cyh-whRate' ? '–' : '$0'; });
      show($('cyh-whMsg'), ''); return;
    }

    var annual401k  = annualGross * (pretaxPct / 100);
    var annualHealth = healthPP * per;

    /* Section 125 health premiums come out before FICA. 401(k) deferrals do
       NOT - they dodge income tax only. Getting this backwards is the single
       most common error in a homemade paycheck calculator. */
    var ficaWages = Math.max(0, annualGross - annualHealth);
    var ss  = Math.min(ficaWages, SS_WAGE_BASE_2026) * SS_RATE;
    var med = ficaWages * MED_RATE;
    var addl = Math.max(0, ficaWages - ADDL_MED_FLOOR[status]) * ADDL_MED_RATE;
    var fica = ss + med + addl;

    var fedTaxable = Math.max(0, annualGross - annual401k - annualHealth - STD_2026[status]);
    var fed = fedTax(fedTaxable, status) + (extraPP * per);

    var st = STATE_TAX[stateNm];
    var stateTax = 0, stateNote = '';
    if (!st || st.brackets === null) {
      stateTax = 0;
      stateNote = stateNm + ' does not tax wage income.';
    } else {
      var jIdx = (status === 'joint') ? 2 : 1;
      var sdIdx = (status === 'joint') ? 1 : 0;
      var stTaxable = Math.max(0, annualGross - annual401k - annualHealth - (st.sd[sdIdx] || 0));
      stateTax = progressive(stTaxable, st.brackets, jIdx);
    }

    var totalTax = fed + fica + stateTax;
    var netAnnual = annualGross - annual401k - annualHealth - totalTax;
    var netPer = netAnnual / per;

    $('cyh-whNet').textContent    = money(netPer);
    $('cyh-whFed').textContent    = money(fed / per);
    $('cyh-whFica').textContent   = money(fica / per);
    /* NOTE: cyh-whStateTax, not cyh-whState. The <select> owns cyh-whState.
       These were briefly the same id, and because $() returns the first
       match, writing the result set .textContent on the SELECT and wiped
       all 51 <option> elements out of it - the dropdown rendered blank. */
    $('cyh-whStateTax').textContent = money(stateTax / per);
    $('cyh-whRate').textContent   = (totalTax / annualGross * 100).toFixed(1) + '%';
    $('cyh-whAnnual').textContent = money(netAnnual);

    var takeHomePct = netAnnual / annualGross * 100;
    var m = '<b>' + money(netPer) + ' lands in your account each ' +
            ({weekly:'week',biweekly:'two weeks',semimonthly:'half-month',monthly:'month',annual:'year'}[freq]) +
            '.</b> That is ' + takeHomePct.toFixed(0) + '% of what you earn. ';
    if (stateNote) m += stateNote + ' ';
    if (pretaxPct > 0) {
      var costOfSaving = annual401k - (annual401k * (fedTax(fedTaxable + annual401k, status) - fedTax(fedTaxable, status)) / Math.max(annual401k, 1));
      m += 'Your ' + money(annual401k) + ' a year into the 401(k) only reduced your take-home by about ' +
           money(costOfSaving) + ', because the contribution comes out before income tax. ';
    }
    m += 'Budget from this number, never from your salary — planning around gross pay is how people end up ' +
         Math.round(annualGross - netAnnual).toLocaleString('en-US') + ' dollars short over a year.';
    show($('cyh-whMsg'), m);
  };

  /* ================================================================
     13 MORTGAGE  (cyhMortgage)
     Full PITI: principal, interest, property tax, insurance, HOA, PMI.
     ================================================================ */
  window.cyhMortgage = function () {
    var price = num($('cyh-mgPrice'));
    var downPct = num($('cyh-mgDownPct'));
    var rate = num($('cyh-mgRate'));
    var years = num($('cyh-mgYears')) || 30;
    var taxPct = num($('cyh-mgTax'));
    var insYr = num($('cyh-mgIns'));
    var hoaMo = num($('cyh-mgHoa'));

    var down = price * (downPct / 100);
    var loan = Math.max(0, price - down);
    $('cyh-mgDownAmt').textContent = money(down);

    if (price <= 0 || loan <= 0) {
      ['cyh-mgPI','cyh-mgTotal','cyh-mgInterest','cyh-mgPmi'].forEach(function (id) { $(id).textContent = '$0'; });
      show($('cyh-mgMsg'), ''); return;
    }

    var r = rate / 100 / 12, n = years * 12;
    var pi = r > 0 ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n;

    /* PMI: conventional loans below 20% down. Rough industry band is
       0.5%-1.5% of the loan a year; 0.75% is a mid-range assumption and
       is stated on the page as an assumption, not a quote. */
    var ltv = loan / price * 100;
    var pmiMo = ltv > 80 ? (loan * 0.0075) / 12 : 0;

    var taxMo = price * (taxPct / 100) / 12;
    var insMo = insYr / 12;
    var total = pi + taxMo + insMo + hoaMo + pmiMo;
    var totalInterest = (pi * n) - loan;

    $('cyh-mgPI').textContent = money(pi);
    $('cyh-mgTotal').textContent = money(total);
    $('cyh-mgInterest').textContent = money(totalInterest);
    $('cyh-mgPmi').textContent = pmiMo > 0 ? money(pmiMo) : '$0';

    var m = '';
    if (ltv > 80) {
      /* Months until the balance reaches 78% of ORIGINAL value, where the
         Homeowners Protection Act forces automatic PMI termination. */
      var bal = loan, k = 0, target = price * 0.78;
      while (bal > target && k < n) { bal = bal * (1 + r) - pi; k++; }
      var pmiTotal = pmiMo * k;
      m = '<b>You are putting ' + downPct.toFixed(1) + '% down, so this loan carries PMI.</b> ' +
          'Private mortgage insurance protects the lender, not you — it pays them if you default. ' +
          'At roughly ' + money(pmiMo) + ' a month it adds about <b>' + money(pmiTotal) + '</b> before it ' +
          'drops off automatically at 78% loan-to-value, around ' + months(k) + ' from now. ' +
          '<br><br><b>This is the 20% rule, and here is the actual reason for it.</b> Twenty percent down is not ' +
          'a moral standard — it is the exact line where three things change at once: PMI disappears, you ' +
          'start with equity instead of owing more than the house is worth after closing costs, and lenders ' +
          'price your rate lower because their risk fell. Putting ' + money(price * 0.20 - down) + ' more down ' +
          'would clear it. <br><br><b>If that is not realistic right now, that is normal and there are real ' +
          'programs for it</b> — FHA loans (3.5% down), VA loans (0% down, no mortgage insurance, for eligible ' +
          'service members), USDA rural loans (0% down), and state housing finance agency down-payment ' +
          'assistance, which exists in every state and is routinely unclaimed. Waiting to save 20% while ' +
          'paying rent is sometimes the more expensive choice. Run both.';
    } else {
      m = '<b>20% down or more — no PMI on a conventional loan.</b> That saves roughly ' +
          money((loan * 0.0075) / 12) + ' a month versus a smaller down payment, and it means you own real ' +
          'equity from day one rather than being underwater the moment you account for closing costs.';
    }
    var ratio = total;
    m += '<br><br><b>The affordability check most people skip:</b> housing is meant to sit at or under 28% of ' +
         'your gross monthly income, and all debt payments together under 36%. At ' + money(ratio) +
         ' a month, that means a household income of about ' + money(ratio / 0.28) +
         ' a month — ' + money(ratio / 0.28 * 12) + ' a year — to stay inside the guideline.';
    show($('cyh-mgMsg'), m);
  };

  /* ================================================================
     14 AUTO LOAN  (cyhAuto)  - includes the 20/4/10 rule check
     ================================================================ */
  window.cyhAuto = function () {
    var price = num($('cyh-auPrice'));
    var down  = num($('cyh-auDown'));
    var trade = num($('cyh-auTrade'));
    var rate  = num($('cyh-auRate'));
    var mos   = num($('cyh-auTerm')) || 60;
    var taxPct = num($('cyh-auTax'));
    var income = num($('cyh-auIncome'));

    var salesTax = price * (taxPct / 100);
    var loan = Math.max(0, price + salesTax - down - trade);
    if (price <= 0 || loan <= 0) {
      ['cyh-auPay','cyh-auInterest','cyh-auTotal'].forEach(function (id) { $(id).textContent = '$0'; });
      $('cyh-auRule').textContent = '–';
      show($('cyh-auMsg'), ''); return;
    }

    var r = rate / 100 / 12;
    var pay = r > 0 ? loan * r / (1 - Math.pow(1 + r, -mos)) : loan / mos;
    var totalInterest = pay * mos - loan;

    $('cyh-auPay').textContent = money(pay);
    $('cyh-auInterest').textContent = money(totalInterest);
    $('cyh-auTotal').textContent = money(price + salesTax + totalInterest);

    /* 20/4/10: >=20% down, <=4-year term, total transport <=10% of gross. */
    var downPct = (down + trade) / price * 100;
    var passDown = downPct >= 20, passTerm = mos <= 48;
    var passTen = income > 0 ? (pay / income * 100) <= 10 : null;
    var passes = [passDown, passTerm].concat(passTen === null ? [] : [passTen]);
    var nPass = passes.filter(Boolean).length;
    $('cyh-auRule').textContent = nPass + '/' + passes.length;

    var m = '<b>The 20/4/10 rule: ' + nPass + ' of ' + passes.length + ' met.</b><ul style="margin:10px 0 0;padding-left:20px">';
    m += '<li><b>20% down —</b> you are at ' + downPct.toFixed(0) + '%. ' +
         (passDown
           ? 'Good. A new car loses roughly 20% of its value in year one, so 20% down is what stops you owing more than the car is worth the moment you drive it off.'
           : 'Below the line. A new car drops about 20% in the first year, so with ' + downPct.toFixed(0) +
             '% down you will likely be <b>upside down</b> — owing more than it is worth — for a while. That matters ' +
             'if it gets totalled: insurance pays what the car is worth, not what you owe, and you keep paying the difference. ' +
             'Gap insurance covers that gap and costs far less than the exposure.') + '</li>';
    m += '<li><b>4 years or less —</b> you chose ' + (mos / 12).toFixed(1) + ' years. ' +
         (passTerm
           ? 'Good. Short terms cost less interest and get you out from under it faster.'
           : 'Longer terms shrink the monthly payment and quietly raise the price. Over ' + mos + ' months this loan ' +
             'costs you ' + money(totalInterest) + ' in interest. If you need 72 or 84 months to afford the payment, ' +
             'the honest read is that the car is too expensive — not that the term is too short.') + '</li>';
    if (passTen !== null) {
      m += '<li><b>Under 10% of gross income —</b> this payment is ' + (pay / income * 100).toFixed(1) + '% of your monthly gross. ' +
           (passTen ? 'Inside the guideline.' :
            'Above it. And the payment is not the real cost — insurance, fuel, maintenance and registration typically ' +
            'add 50-100% on top. Total transport spending above ~15-20% of income is what makes a car the thing that ' +
            'stops everything else from working.') + '</li>';
    }
    m += '</ul>';
    show($('cyh-auMsg'), m);
  };

  /* ---------- recalc everything ---------- */
  function cyhAll() {
    cyhBudget(); cyhSF(); cyhDebt(); cyhNW();
  }
  window.cyhAll = cyhAll;

  /* ---------- mobile: land on the calculator, not the hero ----------
     On desktop the calculator rail sits beside the tool, so a plain
     link is right. Under 940px the rail stacks ABOVE <main>, so a plain
     link drops the reader at the top of the next page - hero, badges,
     then the whole 14-item accordion again - and they have to scroll
     past all of it to reach the thing they just asked for.

     Every standalone page carries <main id="calc">, so appending #calc
     on mobile only makes the browser land on the tool itself. The
     selector is deliberately narrow: all 14 slugs end in
     -calculator.html, so the hub and the Financial Literacy link at the
     bottom of the rail are left alone. */
  function cyhMobileDeepLinks() {
    if (!window.matchMedia || !window.matchMedia('(max-width:940px)').matches) return;
    var links = document.querySelectorAll('.cyh-side a[href$="-calculator.html"]');
    Array.prototype.forEach.call(links, function (a) {
      if (a.hasAttribute('aria-current')) return;      /* current page */
      a.setAttribute('href', a.getAttribute('href') + '#calc');
    });
  }

  /* ---------- seed sensible starting rows ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    cyhMobileDeepLinks();

    cyhAdd('cyh-inc', 'Income source', 'Job / Wages');
    cyhAdd('cyh-inc', 'Income source', 'Side Income');
    ['Rent / Mortgage', 'Food & Groceries', 'Transportation', 'Phone', 'Utilities']
      .forEach(function (l) { cyhAdd('cyh-exp', 'Expense', l); });

    [['Car registration', 180], ['Holiday gifts', 600], ['Car maintenance', 480],
     ['Annual subscriptions', 200], ['Insurance premium', 240]]
      .forEach(function (x) { cyhAddSF(x[0], x[1]); });

    cyhAddDebt('Credit card', '', 22.9, '');
    cyhAddDebt('Car loan', '', 9.5, '');

    ['Checking', 'Savings', 'Retirement accounts', 'Car value']
      .forEach(function (l) { cyhAdd('cyh-asset', 'Asset', l); });
    ['Credit cards', 'Car loan', 'Student loans']
      .forEach(function (l) { cyhAdd('cyh-liab', 'Liability', l); });

    cyhAll();

    /* Field-based calculators normally recompute on input. Standalone
       pages ship sensible default values in the HTML, so kick each one
       once on load: the page must show real numbers to a reader (and to
       a crawler taking a screenshot) before anything is typed. */
    [['cyh-pcAmt', cyhPaycheck], ['cyh-efNow', cyhEF], ['cyh-poBal', cyhPayoff],
     ['cyh-utBal', cyhUtil], ['cyh-ciStart', cyhCompound], ['cyh-igStart', cyhInvest],
     ['cyh-ffSpend', cyhFreedom], ['cyh-whGross', cyhWithhold],
     ['cyh-mgPrice', cyhMortgage], ['cyh-auPrice', cyhAuto],
     ['cyh-rcAmt', cyhRoth]]
      .forEach(function (pair) { if (has(pair[0])) { try { pair[1](); } catch (e) {} } });
  });
})();
