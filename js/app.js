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
    profile: { currentAge: '', retirementAge: '', annualIncome: '', incomeGrowthPct: 3 },
    k401: { balance: '', contribPct: '', matchRatePct: '', matchCapPct: '', returnPct: 7 },
    roth: { balance: '', monthly: '', returnPct: 7 },
    hsa: { eligible: false, balance: '', monthly: '', returnPct: 7 },
    hysa: { balance: '', apyPct: 3.5, monthly: '', efTarget: '' },
    debts: [],
    extraDebtMonthly: '',
    goals: { retireSpendMonthly: '', inflationPct: 2.5, swrPct: 4 },
    limits: { k401: 24500, ira: 7500, hsa: 4400, highAprPct: 7 }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* A fictional example so the page is explorable before you enter anything. */
  var SAMPLE = {
    profile: { currentAge: 32, retirementAge: 65, annualIncome: 85000, incomeGrowthPct: 3 },
    k401: { balance: 40000, contribPct: 6, matchRatePct: 50, matchCapPct: 6, returnPct: 7 },
    roth: { balance: 12000, monthly: 300, returnPct: 7 },
    hsa: { eligible: true, balance: 5000, monthly: 150, returnPct: 7 },
    hysa: { balance: 8000, apyPct: 3.8, monthly: 200, efTarget: 15000 },
    debts: [
      { name: 'Credit card', balance: 6200, aprPct: 23.5, minPayment: 140 },
      { name: 'Car loan', balance: 9800, aprPct: 6.9, minPayment: 310 }
    ],
    extraDebtMonthly: 200,
    goals: { retireSpendMonthly: 5000, inflationPct: 2.5, swrPct: 4 },
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
    else input.value = (v === '' || v == null) ? '' : v;

    input.addEventListener('input', function () {
      if (input.type === 'checkbox') setPath(path, input.checked);
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
      var bal = row.querySelector('.debt-balance');
      var apr = row.querySelector('.debt-apr');
      var min = row.querySelector('.debt-min');
      name.value = d.name || '';
      bal.value = d.balance === '' ? '' : d.balance;
      apr.value = d.aprPct === '' ? '' : d.aprPct;
      min.value = d.minPayment === '' ? '' : d.minPayment;
      name.addEventListener('input', function () { d.name = name.value; save(); queueRecalc(); });
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
    state.debts.push({ name: '', balance: '', aprPct: '', minPayment: '' });
    save(); renderDebts();
    var rows = debtList.querySelectorAll('.debt-name');
    if (rows.length) rows[rows.length - 1].focus();
  });

  renderDebts();

  /* ---------- sample data ---------- */
  document.getElementById('load-sample').addEventListener('click', function () {
    store.set('ne_state', JSON.stringify(SAMPLE));
    location.reload();
  });

  /* ---------- reset ---------- */
  document.getElementById('reset').addEventListener('click', function () {
    if (!confirm('Clear every number you’ve entered on this device?')) return;
    store.del('ne_state');
    location.reload();
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
    themeMeta.setAttribute('content', effectiveTheme() === 'dark' ? '#0d0d0d' : '#f9f9f7');
  }
  themeBtn.addEventListener('click', function () {
    var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store.set('ne_theme', next);
    applyThemeMeta();
  });
  applyThemeMeta();

  /* ---------- charts ---------- */
  function makeLegend(host, items, kind) {
    host.textContent = '';
    items.forEach(function (it) {
      var chip = document.createElement('span');
      chip.className = 'legend-chip';
      var key = document.createElement('span');
      key.className = kind === 'line' ? 'legend-line' : 'legend-swatch';
      key.style.background = 'var(' + it.color + ')';
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
    ariaLabel: 'Net worth projection, your plan versus the recommended order. Full values are in the projection table below.',
    series: [
      { key: 'cur', name: 'Your plan', color: '--s1' },
      { key: 'rec', name: 'Recommended', color: '--s2' }
    ]
  });
  makeLegend(document.getElementById('legend-projection'),
    [{ name: 'Your plan', color: '--s1' }, { name: 'Recommended', color: '--s2' }], 'line');

  var MIX_SERIES = [
    { key: 'k401', name: '401(k)', color: '--s1' },
    { key: 'roth', name: 'Roth IRA', color: '--s2' },
    { key: 'hsa', name: 'HSA', color: '--s3' },
    { key: 'hysa', name: 'HYSA', color: '--s4' }
  ];
  var chartMix = NestEggCharts.makeChart(document.getElementById('chart-mix'), {
    mode: 'stacked', height: 220, endLabels: false, xMeta: chartXMeta,
    ariaLabel: 'Account balances stacked over time. Full values are in the projection table below.',
    series: MIX_SERIES
  });
  makeLegend(document.getElementById('legend-mix'), MIX_SERIES, 'rect');

  var chartDebt = NestEggCharts.makeChart(document.getElementById('chart-debt'), {
    mode: 'lines', height: 220, endLabels: false, xMeta: chartXMeta,
    ariaLabel: 'Total debt balance over time, your plan versus the recommended order.',
    series: [
      { key: 'cur', name: 'Your plan', color: '--s1' },
      { key: 'rec', name: 'Recommended', color: '--s2' }
    ]
  });

  /* ---------- rendering ---------- */
  var el = function (id) { return document.getElementById(id); };

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
    allocRow(tbodyRec, '8 · Savings overflow', s.overflow);
    allocRow(tbodyRec, 'Employer match (unchanged)', rec.match);
    allocRow(tbodyRec, 'Debt minimums (unchanged)', rec.minimums);
  }

  function renderTable(a) {
    var tbody = document.querySelector('#projection-table tbody');
    tbody.textContent = '';
    var cs = a.current.series, rs = a.recommended.series;
    for (var i = 11; i < cs.length; i += 12) addRow(i);
    if ((cs.length - 1) % 12 !== 11 && cs.length) addRow(cs.length - 1);
    function addRow(i) {
      var p = cs[i], r = rs[i];
      var tr = document.createElement('tr');
      var cells = [
        Math.round(p.age),
        fmtMoneyFull(p.k401), fmtMoneyFull(p.roth), fmtMoneyFull(p.hsa), fmtMoneyFull(p.hysa),
        fmtMoneyFull(p.debt), fmtMoneyFull(p.netWorth), fmtMoneyFull(r.netWorth)
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
    var p = state.profile;
    var ageOk = p.currentAge !== '' && p.retirementAge !== '' &&
      +p.retirementAge > +p.currentAge && +p.currentAge > 0;

    el('empty-state').hidden = ageOk;
    el('results-body').hidden = !ageOk;
    if (!ageOk) return;

    var a = NestEgg.analyze(state);
    baseAge = a.inputs.profile.currentAge;
    var retAge = Math.round(a.inputs.profile.retirementAge);

    /* nest egg tile */
    el('kpi-nestegg').textContent = fmtMoney(a.current.final.invested);
    el('kpi-nestegg-today').textContent =
      '≈ ' + fmtMoney(a.finalTodayDollars) + ' in today’s dollars · supports ' +
      fmtMoney(a.retireIncomeMonthlyToday) + '/mo';

    /* coverage tile + meter */
    var meter = el('kpi-meter');
    var fill = meter.querySelector('.meter-fill');
    if (a.coverage != null) {
      var pct = a.coverage * 100;
      el('kpi-coverage').textContent = (pct >= 999 ? '999+' : Math.round(pct)) + '%';
      fill.style.width = Math.min(100, pct) + '%';
      meter.className = 'meter ' + (pct >= 100 ? 'good' : pct >= 60 ? 'warn' : 'crit');
      var gap = a.current.final.invested - a.target;
      el('kpi-coverage-sub').textContent =
        (pct >= 100 ? 'On track — ' + fmtMoney(gap) + ' beyond your goal of '
          : (pct >= 60 ? 'Getting there — ' : 'Off track — ') + fmtMoney(-gap) + ' short of your goal of ') +
        fmtMoney(a.target);
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
      boostSub.textContent = 'Extra net worth at ' + retAge + ' from reordering the same dollars.';
    } else {
      boost.textContent = '−' + fmtMoney(-d);
      boost.classList.add('delta-down');
      boostSub.textContent = 'The recommended order trades some growth for the emergency fund and payoff safety.';
    }

    /* charts */
    var cs = a.current.series, rsr = a.recommended.series;
    var proj = cs.map(function (pt, i) {
      return { age: pt.age, cur: pt.netWorth, rec: rsr[i].netWorth };
    });
    var goal = a.target > 0 ? { value: a.target, label: 'Goal ' + fmtMoney(a.target) } : null;
    chartProjection.update(proj, goal);

    chartMix.update(cs.map(function (pt) {
      return { age: pt.age, k401: pt.k401, roth: pt.roth, hsa: pt.hsa, hysa: pt.hysa };
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

    renderAllocTables(a);
    renderTable(a);
  }

  recalc();
})();
