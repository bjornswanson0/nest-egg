/* Nest Egg — UI wiring. State lives in localStorage (ne_ prefix), never leaves the browser. */
(function () {
  'use strict';

  var fmtMoney = NestEggCharts.fmtMoney;
  var fmtMoneyFull = NestEggCharts.fmtMoneyFull;

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { } }
  };

  /* Personal fields start blank; only generic assumptions get defaults. */
  var DEFAULTS = {
    profile: { currentAge: '', retirementAge: '', annualIncome: '', incomeGrowthPct: 3, takeHomeMonthly: '' },
    k401: { balance: '', type: 'pretax', preTaxBalPct: 100, contribPct: '', matchRatePct: '', matchCapPct: '', returnPct: 7 },
    roth: { balance: '', monthly: '', returnPct: 7 },
    hsa: { eligible: false, balance: '', monthly: '', returnPct: 7 },
    hysa: { balance: '', apyPct: 3.5, monthly: '', efTarget: '' },
    brokerage: { balance: '', monthly: '', returnPct: 7 },
    debts: [],
    extraDebtMonthly: '',
    growContrib: true,
    vendors: { k401: '', roth: '', hsa: '', hysa: '', brokerage: '' },
    goals: { retireSpendMonthly: '', inflationPct: 2.5, swrPct: 4, taxRatePct: 15, ssMonthly: '', ssStartAge: 67 },
    limits: { k401: 24500, ira: 7500, hsa: 4400, highAprPct: 7 }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* A fictional example so the page is explorable before you enter anything. */
  var SAMPLE = {
    profile: { currentAge: 32, retirementAge: 65, annualIncome: 85000, incomeGrowthPct: 3, takeHomeMonthly: 5300 },
    k401: { balance: 40000, type: 'pretax', preTaxBalPct: 100, contribPct: 6, matchRatePct: 50, matchCapPct: 6, returnPct: 7 },
    roth: { balance: 12000, monthly: 300, returnPct: 7 },
    hsa: { eligible: true, balance: 5000, monthly: 150, returnPct: 7 },
    hysa: { balance: 8000, apyPct: 3.8, monthly: 200, efTarget: 15000 },
    brokerage: { balance: 15000, monthly: 250, returnPct: 7 },
    debts: [
      { name: 'Credit card', kind: 'card', balance: 6200, aprPct: 23.5, minPayment: 140 },
      { name: 'Student loan', kind: 'student', balance: 18000, aprPct: 4.5, minPayment: 190 },
      { name: 'Car loan', kind: 'auto', balance: 9800, aprPct: 6.9, minPayment: 310 }
    ],
    extraDebtMonthly: 200,
    growContrib: true,
    vendors: { k401: 'fidelity', roth: 'vanguard', hsa: 'healthequity', hysa: 'ally', brokerage: 'schwab' },
    goals: { retireSpendMonthly: 5000, inflationPct: 2.5, swrPct: 4, taxRatePct: 15, ssMonthly: 2200, ssStartAge: 67 },
    limits: { k401: 24500, ira: 7500, hsa: 4400, highAprPct: 7 }
  };

  function load() {
    if (location.hash.indexOf('demo') !== -1) return clone(SAMPLE);
    var raw = store.get('ne_state');
    if (!raw) return clone(DEFAULTS);
    var merged = clone(DEFAULTS);
    try {
      var saved = JSON.parse(raw);
      for (var k in merged) {
        if (!(k in saved)) continue;
        if (merged[k] && typeof merged[k] === 'object' && !Array.isArray(merged[k])) {
          for (var k2 in merged[k]) if (k2 in saved[k]) merged[k][k2] = saved[k][k2];
        } else {
          merged[k] = saved[k];
        }
      }
    } catch (e) { }
    return merged;
  }

  var demoMode = location.hash.indexOf('demo') !== -1;
  var state = load();
  function save() {
    if (demoMode) return; /* demo edits never clobber real saved numbers */
    store.set('ne_state', JSON.stringify(state));
  }

  function getPath(path) {
    var parts = path.split('.'), o = state;
    for (var i = 0; i < parts.length; i++) o = o ? o[parts[i]] : undefined;
    return o;
  }
  function setPath(path, v) {
    var parts = path.split('.'), o = state;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = v;
  }

  /* ---------- input binding ---------- */
  var recalcTimer = null;
  function queueRecalc() {
    clearTimeout(recalcTimer);
    recalcTimer = setTimeout(recalc, 120);
  }

  document.querySelectorAll('[data-bind]').forEach(function (input) {
    var path = input.getAttribute('data-bind');
    var v = getPath(path);
    if (input.type === 'checkbox') input.checked = !!v;
    else if (input.tagName === 'SELECT') input.value = v || input.value;
    else input.value = (v === '' || v == null) ? '' : v;

    input.addEventListener('input', function () {
      if (input.type === 'checkbox') setPath(path, input.checked);
      else if (input.tagName === 'SELECT') setPath(path, input.value);
      else setPath(path, input.value === '' ? '' : parseFloat(input.value));
      save();
      queueRecalc();
    });
  });

  /* ---------- debts ---------- */
  var debtList = document.getElementById('debt-list');
  var debtTpl = document.getElementById('debt-row-tpl');

  function renderDebts() {
    debtList.textContent = '';
    state.debts.forEach(function (d, idx) {
      var row = debtTpl.content.firstElementChild.cloneNode(true);
      var name = row.querySelector('.debt-name');
      var kind = row.querySelector('.debt-kind');
      var bal = row.querySelector('.debt-balance');
      var apr = row.querySelector('.debt-apr');
      var min = row.querySelector('.debt-min');
      name.value = d.name || '';
      kind.value = d.kind || 'other';
      bal.value = d.balance === '' ? '' : d.balance;
      apr.value = d.aprPct === '' ? '' : d.aprPct;
      min.value = d.minPayment === '' ? '' : d.minPayment;
      name.addEventListener('input', function () { d.name = name.value; save(); queueRecalc(); });
      kind.addEventListener('change', function () { d.kind = kind.value; save(); queueRecalc(); });
      bal.addEventListener('input', function () { d.balance = bal.value === '' ? '' : parseFloat(bal.value); save(); queueRecalc(); });
      apr.addEventListener('input', function () { d.aprPct = apr.value === '' ? '' : parseFloat(apr.value); save(); queueRecalc(); });
      min.addEventListener('input', function () { d.minPayment = min.value === '' ? '' : parseFloat(min.value); save(); queueRecalc(); });
      row.querySelector('.debt-remove').addEventListener('click', function () {
        state.debts.splice(idx, 1);
        save(); renderDebts(); queueRecalc();
      });
      debtList.appendChild(row);
    });
  }

  document.getElementById('add-debt').addEventListener('click', function () {
    state.debts.push({ name: '', kind: 'card', balance: '', aprPct: '', minPayment: '' });
    save(); renderDebts();
    var rows = debtList.querySelectorAll('.debt-name');
    if (rows.length) rows[rows.length - 1].focus();
  });

  renderDebts();

  /* ---------- account providers (monogram badges in brand colors — no logo assets) ---------- */
  var VENDORS = {
    fidelity: { name: 'Fidelity', tag: 'F', bg: '#4E8F1C' },
    vanguard: { name: 'Vanguard', tag: 'V', bg: '#96151D' },
    schwab: { name: 'Charles Schwab', tag: 'CS', bg: '#0087C6' },
    merrill: { name: 'Merrill', tag: 'ML', bg: '#00377D' },
    empower: { name: 'Empower', tag: 'EM', bg: '#DF4E27' },
    bofa: { name: 'Bank of America', tag: 'BA', bg: '#E31837' },
    chase: { name: 'Chase', tag: 'CH', bg: '#117ACA' },
    amex: { name: 'American Express', tag: 'AX', bg: '#006FCF' },
    ally: { name: 'Ally', tag: 'AL', bg: '#6E2C91' },
    marcus: { name: 'Marcus', tag: 'MA', bg: '#1B2D5B' },
    discover: { name: 'Discover', tag: 'DI', bg: '#E55C20' },
    capitalone: { name: 'Capital One', tag: 'C1', bg: '#C43B2F' },
    sofi: { name: 'SoFi', tag: 'SF', bg: '#00A5C8' },
    etrade: { name: 'E*TRADE', tag: 'ET', bg: '#6633CC' },
    robinhood: { name: 'Robinhood', tag: 'RH', bg: '#1F9D55' },
    healthequity: { name: 'HealthEquity', tag: 'HE', bg: '#7A3DAF' },
    hsabank: { name: 'HSA Bank', tag: 'HB', bg: '#006A52' },
    optum: { name: 'Optum Bank', tag: 'OP', bg: '#D9660C' },
    other: { name: 'Other', tag: '·', bg: '#8a8478' }
  };

  document.querySelectorAll('.vendor-select').forEach(function (sel) {
    var key = sel.getAttribute('data-vendor');
    sel.appendChild(new Option('Provider…', ''));
    Object.keys(VENDORS).forEach(function (k) {
      sel.appendChild(new Option(VENDORS[k].name, k));
    });
    sel.value = (state.vendors && state.vendors[key]) || '';
    function applyBadge() {
      var b = document.getElementById('vb-' + key);
      var v = VENDORS[sel.value];
      if (!v) { b.hidden = true; return; }
      b.hidden = false;
      b.textContent = v.tag;
      b.style.background = v.bg;
      b.title = v.name;
    }
    sel.addEventListener('change', function () {
      state.vendors[key] = sel.value;
      save();
      applyBadge();
      queueRecalc(); /* provider names flow into the marching orders */
    });
    applyBadge();
  });

  function vendorSuffix(key) {
    var v = VENDORS[state.vendors && state.vendors[key]];
    return (v && v.name !== 'Other') ? ' at ' + v.name : '';
  }

  /* ---------- sample data ---------- */
  document.getElementById('load-sample').addEventListener('click', function () {
    store.set('ne_state', JSON.stringify(SAMPLE));
    location.reload();
  });

  /* ---------- employer match, in plain English ---------- */
  function updateMatchHint() {
    var host = el('match-hint');
    var rate = parseFloat(state.k401.matchRatePct) || 0;
    var cap = parseFloat(state.k401.matchCapPct) || 0;
    var salary = parseFloat(state.profile.annualIncome) || 0;
    var contrib = parseFloat(state.k401.contribPct) || 0;
    if (!rate || !cap) {
      host.textContent = 'Example: “100% on your first 6%” means dollar-for-dollar — contribute 6% of pay and your employer adds the same amount on top.';
      return;
    }
    var perDollar = rate === 100 ? 'dollar-for-dollar'
      : rate < 100 ? Math.round(rate) + '¢ for every $1 you put in'
        : '$' + (rate / 100).toFixed(2) + ' for every $1 you put in';
    var t = 'Your employer adds ' + perDollar + ', on your first ' + cap + '% of pay';
    if (salary) {
      var maxYr = rate / 100 * cap / 100 * salary;
      t += ' — free money worth up to ' + fmtMoneyFull(maxYr) + '/yr for you';
      if (contrib >= cap) {
        t += '. ✓ Your ' + contrib + '% contribution collects all of it';
      } else {
        var got = rate / 100 * Math.min(contrib, cap) / 100 * salary;
        t += '. At ' + contrib + '% you collect ' + fmtMoneyFull(got) +
          ' — raise it to ' + cap + '% for the rest';
      }
    }
    host.textContent = t + '.';
  }

  /* ---------- HSA monthly-max guidance (2026 IRS limits) ---------- */
  function updateHsaHint() {
    var lim = parseFloat(state.limits.hsa) || 4400;
    var perMo = lim / 12;
    var cur = parseFloat(state.hsa.monthly) || 0;
    var text = 'Maxing it: ≈ $' + Math.round(perMo).toLocaleString('en-US') + '/mo hits your $' +
      Math.round(lim).toLocaleString('en-US') + ' annual limit. 2026 IRS caps: $4,400 self-only (≈ $367/mo) · ' +
      '$8,750 family (≈ $729/mo) — set yours under Advanced. +$1,000/yr catch-up from age 55.';
    if (state.hsa.eligible && cur >= perMo - 0.5) text = '✓ You’re maxing your HSA. ' + text;
    el('hsa-max-hint').textContent = text;
  }

  document.getElementById('hsa-max-btn').addEventListener('click', function () {
    var lim = parseFloat(state.limits.hsa) || 4400;
    var v = Math.round(lim / 12 * 100) / 100;
    state.hsa.monthly = v;
    if (!state.hsa.eligible) {
      state.hsa.eligible = true;
      document.querySelector('[data-bind="hsa.eligible"]').checked = true;
    }
    document.querySelector('[data-bind="hsa.monthly"]').value = v;
    save();
    queueRecalc();
  });

  /* ---------- reset ---------- */
  document.getElementById('reset').addEventListener('click', function () {
    if (!confirm('Clear every number you’ve entered on this device?')) return;
    store.del('ne_state');
    location.reload();
  });

  /* ---------- export / import (data stays yours) ---------- */
  document.getElementById('export-data').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nest-egg-numbers.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });
  var importFile = document.getElementById('import-file');
  document.getElementById('import-data').addEventListener('click', function () {
    importFile.click();
  });
  importFile.addEventListener('change', function () {
    var f = importFile.files && importFile.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var obj = JSON.parse(reader.result);
        if (!obj || typeof obj !== 'object' || !obj.profile) throw new Error('shape');
        store.set('ne_state', JSON.stringify(obj));
        location.hash = '';
        location.reload();
      } catch (e) {
        alert('That file doesn’t look like a Nest Egg export.');
      }
    };
    reader.readAsText(f);
  });

  /* ---------- theme ---------- */
  var themeBtn = document.getElementById('theme-toggle');
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  function effectiveTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyThemeMeta() {
    themeMeta.setAttribute('content', effectiveTheme() === 'dark' ? '#0e131d' : '#ece5d8');
  }
  themeBtn.addEventListener('click', function () {
    var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store.set('ne_theme', next);
    applyThemeMeta();
  });
  applyThemeMeta();

  /* ---------- field help (the "?" popovers) ---------- */
  var HELP = {
    k401: {
      title: 'What’s a 401(k)?',
      body: 'A retirement account through your employer. Money leaves your paycheck before you see it, grows tax-advantaged, and many employers add matching money on top of yours. The match is part of your pay — always capture all of it.'
    },
    match: {
      title: 'How the match works',
      body: 'Two numbers: the rate (how much they add per dollar you put in) and the cap (how much of your pay it applies to). “100% on your first 6%” is dollar-for-dollar: contribute 6% and they add the same amount on top. “50%” would mean 50¢ per dollar. Contribute below the cap and part of that free money never gets paid to you.'
    },
    returns: {
      title: 'Expected return',
      body: 'Your guess at average yearly growth. Diversified stock funds have averaged roughly 7% a year after inflation over long stretches; bonds and cash are lower. Use a smaller number to be conservative — the future isn’t obligated to match the past.'
    },
    roth: {
      title: 'What’s a Roth IRA?',
      body: 'You fund it with money you’ve already paid taxes on, and in exchange it grows and comes out in retirement completely tax-free. There’s a yearly cap, and at higher incomes the front door closes (a “backdoor” contribution still works).'
    },
    hsa: {
      title: 'What’s an HSA?',
      body: 'A health savings account with the best tax treatment there is: pre-tax going in, untaxed growth, untaxed coming out for medical costs — and after 65 it behaves like a 401(k) for any spending. Requires a high-deductible health plan.'
    },
    brokerage: {
      title: 'What’s a brokerage account?',
      body: 'A regular investment account with no tax breaks — but no rules either: no contribution limits, no income caps, withdraw whenever. It’s where money goes after the tax-advantaged accounts are maxed, and long-held gains get favorable capital-gains rates.'
    },
    hysa: {
      title: 'High-yield savings',
      body: 'A savings account that pays real interest (good ones are around 4%). It’s for money you can’t afford to risk — your emergency fund, near-term goals. It won’t beat the market, and that’s exactly the point.'
    },
    ef: {
      title: 'Emergency fund',
      body: 'Cash for when life happens — job loss, medical bill, the car. A common target is 3–6 months of expenses. The recommended order fills this early because expensive debt is usually what happens to people who don’t have one.'
    },
    debts: {
      title: 'How debts are handled',
      body: 'List each balance with its APR (yearly interest rate) and minimum payment. Extra payments go to the highest APR first — the “avalanche” — which mathematically minimizes total interest. When a debt dies, its minimum rolls into your plan. Student loans: federal ones are usually low-rate (minimums + investing often wins), private ones often aren’t. On an income-driven plan, enter your actual monthly payment as the minimum.'
    },
    extraDebt: {
      title: 'Why pay extra?',
      body: 'Every extra dollar thrown at a 20% APR balance earns you a guaranteed, tax-free 20% by not being owed anymore. No investment reliably promises that, which is why high-APR debt outranks most investing.'
    },
    inflation: {
      title: 'How inflation is used',
      body: 'Prices creep up ~2–3% a year, so a dollar at retirement buys less than one today. It’s used here to size your spending goal at retirement age and to translate big future numbers into honest today’s-dollar equivalents.'
    },
    swr: {
      title: 'Withdrawal rate',
      body: 'The share of your nest egg you draw each year once retired. The classic “4% rule”: a $1M portfolio supports about $40K a year with good odds of lasting 30+ years. Lower is safer; higher is optimistic.'
    },
    highApr: {
      title: 'What counts as “high interest”?',
      body: 'Debt above this APR gets treated as an emergency — paid off before most investing — because interest saved is a guaranteed return that beats an expected one. Below it, minimum payments plus investing usually wins. ~7% is a common dividing line.'
    },
    k401type: {
      title: 'Pre-tax vs. Roth 401(k)',
      body: 'Pre-tax (traditional) contributions skip taxes now but owe them in retirement; Roth contributions are taxed now and come out tax-free. This tool discounts pre-tax dollars by your retirement tax rate so the nest egg is honest. Employer match is always pre-tax.'
    },
    taxrate: {
      title: 'Tax rate in retirement',
      body: 'Your best guess at the effective (average, not top-bracket) rate you’ll pay on pre-tax 401(k) withdrawals. Most retirees land somewhere around 10–20% — retirement income is usually smaller than working income, and only the pre-tax slice is taxed.'
    },
    ss: {
      title: 'Social Security',
      body: 'Your estimated monthly benefit in today’s dollars — ssa.gov/myaccount shows your real number. It shrinks the nest egg you need, and it’s inflation-adjusted by law. Claiming later (up to 70) permanently raises the check.'
    },
    growc: {
      title: 'Growing contributions',
      body: 'When on, your flat monthly contributions (Roth, HSA, HYSA, brokerage, extra debt) rise with your raises, keeping your savings rate steady. When off, $300/mo today is still $300/mo at 60 — which quietly becomes a much smaller share of your income.'
    },
    fifty: {
      title: 'The 50/30/20 rule',
      body: 'A budgeting rule of thumb (popularized by Elizabeth Warren): after tax, put ~50% of your paycheck toward needs (housing, groceries, minimum payments), ~30% toward wants, and ~20% toward your future — savings, investing, and extra debt payoff.'
    }
  };

  var pop = document.createElement('div');
  pop.className = 'help-pop';
  pop.hidden = true;
  pop.setAttribute('role', 'note');
  document.body.appendChild(pop);
  var popFor = null;

  function closePop() {
    if (popFor) popFor.setAttribute('aria-expanded', 'false');
    popFor = null;
    pop.hidden = true;
  }

  document.querySelectorAll('.help-btn').forEach(function (btn) {
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', function (ev) {
      ev.preventDefault(); /* keep the wrapping <label> from stealing focus */
      ev.stopPropagation();
      if (popFor === btn) { closePop(); return; }
      var h = HELP[btn.getAttribute('data-help')];
      if (!h) return;
      pop.textContent = '';
      var t = document.createElement('div');
      t.className = 'help-pop-title';
      t.textContent = h.title;
      var b = document.createElement('p');
      b.textContent = h.body;
      pop.appendChild(t); pop.appendChild(b);
      pop.hidden = false;
      var w = Math.min(300, window.innerWidth - 24);
      pop.style.maxWidth = w + 'px';
      var r = btn.getBoundingClientRect();
      pop.style.left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12)) + 'px';
      pop.style.top = (r.bottom + 8) + 'px';
      var ph = pop.offsetHeight;
      if (r.bottom + 8 + ph > window.innerHeight - 8) {
        pop.style.top = Math.max(8, r.top - ph - 8) + 'px';
      }
      if (popFor) popFor.setAttribute('aria-expanded', 'false');
      popFor = btn;
      btn.setAttribute('aria-expanded', 'true');
    });
  });
  document.addEventListener('click', function (ev) {
    if (!pop.hidden && !pop.contains(ev.target)) closePop();
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closePop(); });
  window.addEventListener('scroll', closePop, { passive: true });

  /* ---------- coaching corner (salary-based education) ---------- */
  var BENCH = [
    { age: 30, mult: 1 }, { age: 35, mult: 2 }, { age: 40, mult: 3 }, { age: 45, mult: 4 },
    { age: 50, mult: 6 }, { age: 55, mult: 7 }, { age: 60, mult: 8 }, { age: 67, mult: 10 }
  ];

  function insightRow(host, tone, glyph, title, body) {
    var row = document.createElement('div');
    row.className = 'insight tone-' + tone;
    var ic = document.createElement('span');
    ic.className = 'insight-ic';
    ic.setAttribute('aria-hidden', 'true');
    ic.textContent = glyph;
    var box = document.createElement('div');
    var t = document.createElement('div');
    t.className = 'insight-title';
    t.textContent = title;
    var b = document.createElement('p');
    b.className = 'insight-body';
    b.textContent = body;
    box.appendChild(t); box.appendChild(b);
    row.appendChild(ic); row.appendChild(box);
    host.appendChild(row);
  }

  function renderInsights(a) {
    var host = el('insights');
    host.textContent = '';
    var inp = a.inputs, p = inp.profile;
    var salary = p.annualIncome;
    var retAge = Math.round(p.retirementAge);

    if (!salary) {
      insightRow(host, 'info', 'i', 'Add your salary to unlock coaching',
        'Most of this panel — savings rate, employer-match math, benchmarks — is computed from your income.');
      el('milestones-wrap').hidden = true;
      return;
    }

    var gross = salary / 12;
    var fa = a.current.firstAlloc;
    var saved = fa ? fa.k401 + fa.roth + fa.hsa + fa.hysa + fa.brok + fa.debtExtra : 0;
    var savedTotal = saved + (fa ? fa.match : 0);
    var rate = savedTotal / gross * 100;
    var onePct = salary / 100 / 12;

    var tone = rate >= 15 ? 'good' : rate >= 10 ? 'warn' : 'crit';
    insightRow(host, tone, tone === 'good' ? '✓' : '!',
      'You’re saving ' + Math.round(rate) + '% of your income',
      fmtMoneyFull(savedTotal) + ' of your ' + fmtMoneyFull(gross) + ' gross monthly pay goes toward your future (employer match and extra debt payments included). The classic guideline is 15–20% of gross. For you, each 1% of salary is ' + fmtMoneyFull(onePct) + '/mo.');

    if (inp.k401.matchRatePct > 0 && inp.k401.matchCapPct > 0) {
      if (inp.k401.contribPct >= inp.k401.matchCapPct) {
        var worth = inp.k401.matchRatePct / 100 * inp.k401.matchCapPct / 100 * salary;
        insightRow(host, 'good', '✓',
          'Full employer match captured — worth ' + fmtMoney(worth) + '/yr',
          'Contributing ' + inp.k401.contribPct + '% of pay collects every matched dollar: an instant ' + inp.k401.matchRatePct + '% return on those contributions before the market does anything.');
      } else {
        var missed = inp.k401.matchRatePct / 100 * (inp.k401.matchCapPct - inp.k401.contribPct) / 100 * salary;
        insightRow(host, 'crit', '!',
          'You’re leaving ' + fmtMoney(missed) + '/yr of free money on the table',
          'Your employer matches up to ' + inp.k401.matchCapPct + '% of pay, but you contribute ' + (inp.k401.contribPct || 0) + '%. Raising it to ' + inp.k401.matchCapPct + '% captures a guaranteed ' + inp.k401.matchRatePct + '% return — that’s step 1 of the recommended order for a reason.');
      }
    }

    /* the compounding lesson: re-run the sim with +1% of salary to the 401(k) */
    var plus = clone(state);
    plus.k401.contribPct = (parseFloat(plus.k401.contribPct) || 0) + 1;
    var delta = NestEgg.analyze(plus).spendable - a.spendable;
    if (delta > 0) {
      insightRow(host, 'info', '↑',
        'One more 1% today ≈ ' + fmtMoney(delta) + ' at ' + retAge,
        'Bumping your 401(k) contribution by a single point costs ' + fmtMoneyFull(onePct) + '/mo from your current paycheck, but compounds into roughly ' + fmtMoney(delta) + ' by retirement. Small levers, decades of leverage.');
    }

    var topApr = 0;
    inp.debts.forEach(function (d) { if (d.aprPct >= inp.limits.highAprPct && d.aprPct > topApr) topApr = d.aprPct; });
    if (topApr > 0) {
      insightRow(host, 'warn', '!',
        'Your ' + topApr + '% APR debt outranks the market',
        'Paying it down is a guaranteed, tax-free ' + topApr + '% return — better than the ~' + (inp.k401.returnPct || 7) + '% you expect from investments. That’s why it sits right after the match in the recommended order.');
    }

    var sl = inp.debts.filter(function (d) { return d.kind === 'student' && d.balance > 0; });
    if (sl.length) {
      var slMax = Math.max.apply(null, sl.map(function (d) { return d.aprPct; }));
      var thr = inp.limits.highAprPct;
      var ded;
      if (salary >= 100000) {
        ded = 'One tax note: at your income the student-loan interest deduction is fully phased out (it fades around $85–100K MAGI for single filers), so there’s no tax discount left on that interest.';
      } else if (salary >= 85000) {
        ded = 'You’re inside the deduction phase-out band (~$85–100K single), so only part of the up-to-$2,500/yr interest deduction survives.';
      } else {
        ded = 'Up to $2,500/yr of the interest is likely tax-deductible at your income, which trims its true cost.';
      }
      if (slMax < thr) {
        insightRow(host, 'info', 'i',
          'Your student loans can wait their turn — that’s math, not neglect',
          'At ' + slMax + '% APR they sit below your ' + thr + '% high-interest line, so the recommended order pays the minimums and invests the difference — expected market returns beat the interest you’d save. ' + ded);
      } else {
        insightRow(host, 'warn', '!',
          'Your ' + slMax + '% student loan lands in the high-interest bucket',
          'A rate like that usually means private loans — the avalanche treats them like card debt and attacks them right after the employer match. ' + ded);
      }
    }

    if (inp.hsa.eligible && !inp.hsa.monthly) {
      insightRow(host, 'info', 'i',
        'Your HSA is sitting idle',
        'It’s the only triple-tax-advantaged account — pre-tax in, tax-free growth, tax-free out for medical costs, and 401(k)-like after 65. Even $50/mo builds a real health buffer.');
    }

    if (salary >= 140000) {
      insightRow(host, 'info', 'i',
        'Heads up: Roth IRA income limits',
        'Around $153K of income (single filers, 2026) the direct Roth IRA door starts to close. The standard workaround is the “backdoor Roth”: contribute to a traditional IRA, then convert.');
    }

    /* salary-multiple milestones */
    var wrap = el('milestones-wrap'), ms = el('milestones');
    ms.textContent = '';
    var shown = 0;
    BENCH.forEach(function (m) {
      if (m.age < p.currentAge - 5 || m.age > p.retirementAge || shown >= 5) return;
      var ratio, label;
      if (m.age <= p.currentAge) {
        ratio = (inp.k401.balance + inp.roth.balance + inp.hsa.balance + inp.hysa.balance + inp.brokerage.balance) / salary;
        label = 'you now: ';
      } else {
        var idx = Math.min(a.current.series.length - 1, Math.round((m.age - p.currentAge) * 12) - 1);
        if (idx < 0) return;
        var salThen = salary * Math.pow(1 + p.incomeGrowthPct / 100, m.age - p.currentAge);
        ratio = a.current.series[idx].invested / salThen;
        label = 'projected: ';
      }
      shown++;
      var msTone = ratio >= m.mult ? 'good' : ratio >= m.mult * 0.75 ? 'warn' : 'crit';
      var chip = document.createElement('div');
      chip.className = 'ms-chip';
      var goal = document.createElement('span');
      goal.className = 'ms-goal';
      goal.textContent = m.mult + '× salary by ' + m.age;
      var you = document.createElement('span');
      you.className = 'ms-you ' + msTone;
      you.textContent = (msTone === 'good' ? '✓ ' : msTone === 'warn' ? '~ ' : '✗ ') + label + ratio.toFixed(1) + '×';
      chip.appendChild(goal); chip.appendChild(you);
      ms.appendChild(chip);
    });
    wrap.hidden = shown === 0;
  }

  /* ---------- charts ---------- */
  /* Legend chips mirror the mark: line, rect (fills), band (wash), dash (threshold). */
  function makeLegend(host, items) {
    host.textContent = '';
    items.forEach(function (it) {
      var chip = document.createElement('span');
      chip.className = 'legend-chip';
      var key = document.createElement('span');
      key.className = 'legend-' + (it.kind || 'line');
      if (it.kind === 'dash') key.style.borderTopColor = 'var(' + it.color + ')';
      else key.style.background = 'var(' + it.color + ')';
      var name = document.createElement('span');
      name.textContent = it.name;
      chip.appendChild(key); chip.appendChild(name);
      host.appendChild(chip);
    });
  }

  var thisYear = new Date().getFullYear();
  var baseAge = 0; /* set on every recalc; charts read it lazily via chartXMeta */
  function chartXMeta(p) {
    return 'Age ' + Math.floor(p.age) + ' · ' + (thisYear + Math.floor(p.age - baseAge));
  }

  var chartProjection = NestEggCharts.makeChart(document.getElementById('chart-projection'), {
    mode: 'lines', height: 260, xMeta: chartXMeta,
    ariaLabel: 'Net worth projection, your plan versus the recommended order, with a band showing returns two points higher or lower. Full values are in the projection table below.',
    series: [
      { key: 'cur', name: 'Your plan', color: '--s1' },
      { key: 'rec', name: 'Recommended', color: '--s2' }
    ],
    band: { low: 'curLow', high: 'curHigh', color: '--s1' },
    tipExtra: function (tip, p) {
      if (p.curLow == null) return;
      var row = document.createElement('div');
      row.className = 'tip-range';
      row.textContent = '±2% returns: ' + fmtMoney(p.curLow) + ' – ' + fmtMoney(p.curHigh);
      tip.appendChild(row);
    }
  });
  makeLegend(document.getElementById('legend-projection'),
    [{ name: 'Your plan', color: '--s1' }, { name: 'Recommended', color: '--s2' }]);

  var MIX_SERIES = [
    { key: 'k401', name: '401(k)', color: '--s1' },
    { key: 'roth', name: 'Roth IRA', color: '--s2' },
    { key: 'hsa', name: 'HSA', color: '--s3' },
    { key: 'hysa', name: 'HYSA', color: '--s4' },
    { key: 'brok', name: 'Brokerage', color: '--s5' }
  ];
  var chartMix = NestEggCharts.makeChart(document.getElementById('chart-mix'), {
    mode: 'stacked', height: 220, endLabels: false, xMeta: chartXMeta,
    ariaLabel: 'Account balances stacked over time. Full values are in the projection table below.',
    series: MIX_SERIES
  });
  makeLegend(document.getElementById('legend-mix'), MIX_SERIES.map(function (s) {
    return { name: s.name, color: s.color, kind: 'rect' };
  }));

  var chartDebt = NestEggCharts.makeChart(document.getElementById('chart-debt'), {
    mode: 'lines', height: 220, endLabels: false, xMeta: chartXMeta,
    ariaLabel: 'Total debt balance over time, your plan versus the recommended order.',
    series: [
      { key: 'cur', name: 'Your plan', color: '--s1' },
      { key: 'rec', name: 'Recommended', color: '--s2' }
    ]
  });
  makeLegend(document.getElementById('legend-debt'),
    [{ name: 'Your plan', color: '--s1' }, { name: 'Recommended', color: '--s2' }]);

  /* ---------- rendering ---------- */
  var el = function (id) { return document.getElementById(id); };
  var lastAnalysis = null;

  /* re-sync every bound input from state (after adopting the recommended plan) */
  function syncInputs() {
    document.querySelectorAll('[data-bind]').forEach(function (input) {
      var v = getPath(input.getAttribute('data-bind'));
      if (input.type === 'checkbox') input.checked = !!v;
      else if (input.tagName === 'SELECT') input.value = v || input.value;
      else input.value = (v === '' || v == null) ? '' : v;
    });
  }

  /* ---------- collapsible result sections (state remembered per device) ---------- */
  (function () {
    var collapsed = {};
    try { collapsed = JSON.parse(store.get('ne_ui') || '{}').collapsed || {}; } catch (e) { }
    document.querySelectorAll('.results .card[id]').forEach(function (card) {
      var head = card.querySelector('.card-head');
      if (!head) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'collapse-btn';
      btn.setAttribute('aria-label', 'Collapse or expand this section');
      head.appendChild(btn);
      function apply() {
        var is = !!collapsed[card.id];
        card.classList.toggle('collapsed', is);
        btn.setAttribute('aria-expanded', String(!is));
        btn.textContent = is ? '▸' : '▾';
      }
      btn.addEventListener('click', function () {
        collapsed[card.id] = !collapsed[card.id];
        store.set('ne_ui', JSON.stringify({ collapsed: collapsed }));
        apply();
      });
      apply();
    });
  })();

  function monthsToDate(m) {
    var d = new Date();
    d.setMonth(d.getMonth() + m);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  function allocRow(tbody, label, value, opts) {
    opts = opts || {};
    var tr = document.createElement('tr');
    if (!value && !opts.keepBold) tr.className = 'zero';
    var td1 = document.createElement('td');
    td1.textContent = label;
    var td2 = document.createElement('td');
    td2.className = 'amt';
    td2.textContent = value ? fmtMoneyFull(value) : '—';
    tr.appendChild(td1); tr.appendChild(td2);
    tbody.appendChild(tr);
  }

  function renderAllocTables(a) {
    var cur = a.current.firstAlloc, rec = a.recommended.firstAlloc;
    var tbodyCur = el('alloc-current'), tbodyRec = el('alloc-rec');
    tbodyCur.textContent = ''; tbodyRec.textContent = '';
    if (!cur || !rec) return;

    allocRow(tbodyCur, '401(k) — you', cur.k401);
    allocRow(tbodyCur, '401(k) — employer match', cur.match);
    allocRow(tbodyCur, 'Roth IRA', cur.roth);
    allocRow(tbodyCur, 'HSA', cur.hsa);
    allocRow(tbodyCur, 'HYSA', cur.hysa);
    allocRow(tbodyCur, 'Brokerage', cur.brok);
    allocRow(tbodyCur, 'Debt minimums', cur.minimums);
    allocRow(tbodyCur, 'Extra to debt', cur.debtExtra);

    var s = rec.steps || {};
    allocRow(tbodyRec, '1 · 401(k) to full match', s.match);
    allocRow(tbodyRec, '2 · High-interest debt', s.hiDebt);
    allocRow(tbodyRec, '3 · Emergency fund', s.ef);
    allocRow(tbodyRec, '4 · HSA', s.hsa);
    allocRow(tbodyRec, '5 · Roth IRA', s.roth);
    allocRow(tbodyRec, '6 · 401(k) toward max', s.k401Max);
    allocRow(tbodyRec, '7 · Remaining debt', s.lowDebt);
    allocRow(tbodyRec, '8 · Brokerage (taxable)', s.overflow);
    allocRow(tbodyRec, 'Employer match (unchanged)', rec.match);
    allocRow(tbodyRec, 'Debt minimums (unchanged)', rec.minimums);
  }

  /* The recommended plan as directives: what to do with this month's money. */
  function renderOrders(a) {
    var list = el('orders');
    var note = el('orders-match-note');
    var adoptBtn = el('adopt-plan');
    var adoptNote = el('adopt-note');
    list.textContent = '';
    var rec = a.recommended.firstAlloc, cur = a.current.firstAlloc;
    var s = rec && rec.steps;

    function order(text, amt) {
      var li = document.createElement('li');
      var t = document.createElement('span');
      t.textContent = text;
      var amount = document.createElement('span');
      amount.className = 'amt';
      amount.textContent = fmtMoneyFull(amt) + '/mo';
      li.appendChild(t); li.appendChild(amount);
      list.appendChild(li);
    }

    if (!rec || rec.budget <= 0) {
      var li = document.createElement('li');
      li.className = 'orders-empty';
      li.textContent = 'Enter your income and what you can save each month, and this becomes a numbered to-do list.';
      list.appendChild(li);
      note.textContent = '';
      adoptBtn.disabled = true;
      adoptNote.textContent = '';
      return;
    }

    if (s.match >= 1) order('Contribute to your 401(k)' + vendorSuffix('k401') + ' — captures the full employer match', s.match);
    if (s.hiDebt >= 1) order('Attack the high-interest debt — highest APR first', s.hiDebt);
    if (s.ef >= 1) order('Top up the emergency fund' + vendorSuffix('hysa'), s.ef);
    if (s.hsa >= 1) order('Fund the HSA' + vendorSuffix('hsa') + ' — triple tax-advantaged', s.hsa);
    if (s.roth >= 1) order('Fund your Roth IRA' + vendorSuffix('roth'), s.roth);
    if (s.k401Max >= 1) order('Add more to the 401(k)' + vendorSuffix('k401') + ' — toward the annual max', s.k401Max);
    if (s.lowDebt >= 1) order('Put extra on the remaining lower-rate debt', s.lowDebt);
    if (s.overflow >= 1) order('Invest the rest in your brokerage' + vendorSuffix('brokerage'), s.overflow);

    note.textContent = 'Total: ' + fmtMoneyFull(rec.budget) + '/mo of your money' +
      (rec.match >= 1 ? ' — and your employer adds ' + fmtMoneyFull(rec.match) + '/mo on top' : '') +
      (rec.minimums >= 1 ? '. Debt minimums (' + fmtMoneyFull(rec.minimums) + '/mo) keep getting paid separately.' : '.');

    var matches = cur && ['k401', 'roth', 'hsa', 'hysa', 'brok', 'debtExtra'].every(function (k) {
      return Math.abs(cur[k] - rec[k]) < 1;
    });
    adoptBtn.disabled = !!matches;
    adoptBtn.textContent = matches ? '✓ This is your plan' : 'Make this my plan';
    adoptNote.textContent = matches
      ? 'Your inputs already match the recommended order.'
      : 'Writes these amounts into your inputs — your plan becomes the recommended one.';
  }

  document.getElementById('adopt-plan').addEventListener('click', function () {
    if (!lastAnalysis || !lastAnalysis.recommended.firstAlloc) return;
    if (!confirm('Overwrite your current plan inputs with the recommended allocation?')) return;
    var rec = lastAnalysis.recommended.firstAlloc;
    var salaryMo = (parseFloat(state.profile.annualIncome) || 0) / 12;
    if (salaryMo > 0) state.k401.contribPct = Math.round(rec.k401 / salaryMo * 1000) / 10;
    state.roth.monthly = Math.round(rec.roth);
    state.hsa.monthly = Math.round(rec.hsa);
    state.hysa.monthly = Math.round(rec.hysa);
    state.brokerage.monthly = Math.round(rec.brok);
    state.extraDebtMonthly = Math.round(rec.debtExtra);
    save();
    syncInputs();
    recalc();
  });

  /* Concrete moves that turn the current plan into the recommended one. */
  function renderChecklist(a) {
    var wrap = el('checklist-wrap'), list = el('checklist');
    var cur = a.current.firstAlloc, rec = a.recommended.firstAlloc;
    list.textContent = '';
    if (!cur || !rec) { wrap.hidden = true; return; }
    var buckets = [
      ['your 401(k) contribution', cur.k401, rec.k401],
      ['Roth IRA', cur.roth, rec.roth],
      ['HSA', cur.hsa, rec.hsa],
      ['HYSA / emergency fund', cur.hysa, rec.hysa],
      ['brokerage', cur.brok, rec.brok],
      ['extra debt payments', cur.debtExtra, rec.debtExtra]
    ];
    var moves = 0;
    buckets.forEach(function (b) {
      var d = b[2] - b[1];
      if (Math.abs(d) < 1) return;
      moves++;
      var li = document.createElement('li');
      var text = document.createElement('span');
      text.textContent = (d > 0 ? 'Raise ' : 'Trim ') + b[0] + ' by ' +
        fmtMoneyFull(Math.abs(d)) + '/mo ';
      var to = document.createElement('span');
      to.className = 'to';
      to.textContent = '→ ' + fmtMoneyFull(b[2]) + '/mo';
      li.appendChild(text); li.appendChild(to);
      list.appendChild(li);
    });
    if (!moves) {
      var ok = document.createElement('li');
      ok.textContent = 'Your plan already matches the recommended order — nothing to move.';
      list.appendChild(ok);
    }
    wrap.hidden = false;
  }

  /* 50/30/20: needs / wants / future-you, against take-home pay. */
  function renderFifty(a) {
    var wrap = el('fifty-wrap');
    var p = a.inputs.profile;
    var takeHome = p.takeHomeMonthly || (p.annualIncome ? p.annualIncome / 12 * 0.75 : 0);
    if (!takeHome) { wrap.hidden = true; return; }
    var estimated = !p.takeHomeMonthly;

    var fa = a.current.firstAlloc;
    /* the "future you" bucket: your own dollars — savings, investing, extra debt.
       Minimum payments count as needs under the classic rule. */
    var future = fa ? fa.k401 + fa.roth + fa.hsa + fa.hysa + fa.brok + fa.debtExtra : 0;
    var pct = future / takeHome * 100;

    el('fifty-note').textContent = 'Take-home ' + fmtMoneyFull(takeHome) + '/mo' +
      (estimated ? ' (estimated at 75% of gross — enter yours under “About you” for accuracy)' : '') +
      ', split the classic way:';

    el('fifty-marker').style.left = Math.min(100, Math.max(0, pct)) + '%';

    var rows = el('fifty-rows');
    rows.textContent = '';
    var data = [
      ['fk-needs', 'Needs — housing, groceries, insurance, minimum payments', '50%', takeHome * 0.5],
      ['fk-wants', 'Wants — the fun column', '30%', takeHome * 0.3],
      ['fk-future', 'Future you — saving, investing, extra debt payoff', '20%', takeHome * 0.2]
    ];
    data.forEach(function (r) {
      var div = document.createElement('div');
      div.className = 'fr';
      var key = document.createElement('span');
      key.className = 'fifty-key ' + r[0];
      var amt = document.createElement('span');
      amt.className = 'amt';
      amt.textContent = fmtMoneyFull(r[3]);
      var lab = document.createElement('span');
      lab.textContent = r[2] + ' · ' + r[1];
      div.appendChild(key); div.appendChild(amt); div.appendChild(lab);
      rows.appendChild(div);
    });
    var you = document.createElement('div');
    you.className = 'fr fifty-you ' + (pct >= 20 ? 'good' : pct >= 12 ? 'warn' : 'crit');
    var youAmt = document.createElement('span');
    youAmt.className = 'amt';
    youAmt.textContent = fmtMoneyFull(future);
    var youLab = document.createElement('span');
    youLab.textContent = 'is what you actually put toward future you — ' + Math.round(pct) +
      '% of take-home' + (pct >= 20 ? ' — ahead of the 20% bucket.' : pct >= 12 ? ' — close; the marker shows the gap to 20%.' : ' — well short of the 20% bucket.');
    you.appendChild(youAmt); you.appendChild(youLab);
    rows.appendChild(you);
    wrap.hidden = false;
  }

  function renderTable(a) {
    var tbody = document.querySelector('#projection-table tbody');
    tbody.textContent = '';
    var cs = a.current.series, rs = a.recommended.series;
    var lo = a.currentLow.series, hi = a.currentHigh.series;
    for (var i = 11; i < cs.length; i += 12) addRow(i);
    if ((cs.length - 1) % 12 !== 11 && cs.length) addRow(cs.length - 1);
    function addRow(i) {
      var p = cs[i], r = rs[i];
      var tr = document.createElement('tr');
      var cells = [
        Math.round(p.age),
        fmtMoneyFull(p.k401), fmtMoneyFull(p.roth), fmtMoneyFull(p.hsa), fmtMoneyFull(p.hysa),
        fmtMoneyFull(p.brok), fmtMoneyFull(p.debt), fmtMoneyFull(p.netWorth), fmtMoneyFull(r.netWorth),
        fmtMoneyFull(lo[i].netWorth), fmtMoneyFull(hi[i].netWorth)
      ];
      cells.forEach(function (c, j) {
        var td = document.createElement(j === 0 ? 'th' : 'td');
        if (j === 0) td.setAttribute('scope', 'row');
        td.textContent = c;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
  }

  function recalc() {
    updateHsaHint(); /* input-column hints refresh even before ages are set */
    updateMatchHint();
    var p = state.profile;
    var ageOk = p.currentAge !== '' && p.retirementAge !== '' &&
      +p.retirementAge > +p.currentAge && +p.currentAge > 0;

    el('empty-state').hidden = ageOk;
    el('results-body').hidden = !ageOk;
    if (!ageOk) return;

    var a = NestEgg.analyze(state);
    lastAnalysis = a;
    baseAge = a.inputs.profile.currentAge;
    var retAge = Math.round(a.inputs.profile.retirementAge);

    /* nest egg tile — spendable (after-tax) is the honest headline */
    el('kpi-nestegg').textContent = fmtMoney(a.spendable);
    el('kpi-nestegg-today').textContent =
      '≈ ' + fmtMoney(a.finalTodayDollars) + ' in today’s dollars (' + fmtMoney(a.grossFinal) +
      ' gross) · supports ' + fmtMoney(a.retireIncomeMonthlyToday) + '/mo' +
      (a.inputs.goals.ssMonthly > 0 ? ' incl. Social Security' : '');

    /* coverage tile + meter */
    var meter = el('kpi-meter');
    var fill = meter.querySelector('.meter-fill');
    if (a.coverage != null) {
      var pct = a.coverage * 100;
      el('kpi-coverage').textContent = (pct >= 999 ? '999+' : Math.round(pct)) + '%';
      fill.style.width = Math.min(100, pct) + '%';
      meter.className = 'meter ' + (pct >= 100 ? 'good' : pct >= 60 ? 'warn' : 'crit');
      var gap = a.spendable - a.target;
      var covText =
        (pct >= 100 ? 'On track — ' + fmtMoney(gap) + ' beyond your goal of '
          : (pct >= 60 ? 'Getting there — ' : 'Off track — ') + fmtMoney(-gap) + ' short of your goal of ') +
        fmtMoney(a.target);
      if (a.earliestRetireAge && a.earliestRetireAge < retAge - 0.4) {
        covText += ' · could retire ≈ age ' + Math.round(a.earliestRetireAge);
      }
      el('kpi-coverage-sub').textContent = covText;
    } else {
      el('kpi-coverage').textContent = '—';
      fill.style.width = '0%';
      meter.className = 'meter';
      el('kpi-coverage-sub').textContent = 'Set a retirement spending goal to see this.';
    }

    /* debt tile */
    var hasDebt = a.inputs.debts.length > 0;
    if (!hasDebt) {
      el('kpi-debtfree').textContent = 'Debt-free now';
      el('kpi-interest').textContent = 'No debts entered.';
    } else if (a.current.debtFreeMonth === null) {
      el('kpi-debtfree').textContent = 'Not by ' + retAge;
      el('kpi-interest').textContent = 'Minimums + extra never clear it — ' +
        fmtMoney(a.current.totalInterest) + ' interest along the way.';
    } else {
      el('kpi-debtfree').textContent = monthsToDate(a.current.debtFreeMonth);
      var saved = a.current.totalInterest - a.recommended.totalInterest;
      el('kpi-interest').textContent = fmtMoney(a.current.totalInterest) + ' interest on your plan' +
        (saved > 1 ? ' — recommended order saves ' + fmtMoney(saved) : '');
    }

    /* boost tile */
    var d = a.deltaAtRetirement;
    var boost = el('kpi-boost'), boostSub = el('kpi-boost-sub');
    boost.classList.remove('delta-up', 'delta-down');
    if (Math.abs(d) < 1) {
      boost.textContent = '$0';
      boostSub.textContent = 'Your order already matches the recommended one.';
    } else if (d > 0) {
      boost.textContent = '+' + fmtMoney(d);
      boost.classList.add('delta-up');
      boostSub.textContent = 'Extra spendable dollars at ' + retAge + ' from reordering the same budget.';
    } else {
      boost.textContent = '−' + fmtMoney(-d);
      boost.classList.add('delta-down');
      boostSub.textContent = 'The recommended order trades some growth for the emergency fund and payoff safety.';
    }

    /* charts */
    var cs = a.current.series, rsr = a.recommended.series;
    var lo = a.currentLow.series, hi = a.currentHigh.series;
    var proj = cs.map(function (pt, i) {
      return {
        age: pt.age, cur: pt.netWorth, rec: rsr[i].netWorth,
        curLow: lo[i].netWorth, curHigh: hi[i].netWorth
      };
    });
    var goal = a.target > 0 ? { value: a.target, label: 'Goal ' + fmtMoney(a.target) } : null;
    chartProjection.update(proj, goal);

    var projLegend = [
      { name: 'Your plan', color: '--s1' },
      { name: 'Recommended', color: '--s2' },
      { name: '±2% range', color: '--s1', kind: 'band' }
    ];
    if (goal) projLegend.push({ name: 'Goal', color: '--muted', kind: 'dash' });
    makeLegend(el('legend-projection'), projLegend);

    chartMix.update(cs.map(function (pt) {
      return { age: pt.age, k401: pt.k401, roth: pt.roth, hsa: pt.hsa, hysa: pt.hysa, brok: pt.brok };
    }));

    el('debt-card').hidden = !hasDebt;
    if (hasDebt) {
      /* show the payoff window, not decades of flat zero after it */
      var mCur = a.current.debtFreeMonth === null ? cs.length : a.current.debtFreeMonth;
      var mRec = a.recommended.debtFreeMonth === null ? rsr.length : a.recommended.debtFreeMonth;
      var end = Math.min(cs.length, Math.max(mCur, mRec) + 6);
      var debtPts = [];
      for (var di = 0; di < end; di++) {
        debtPts.push({ age: cs[di].age, cur: cs[di].debt, rec: rsr[di].debt });
      }
      chartDebt.update(debtPts);
    }

    renderOrders(a);
    renderInsights(a);
    renderFifty(a);
    renderAllocTables(a);
    renderChecklist(a);
    renderTable(a);
  }

  recalc();
})();
