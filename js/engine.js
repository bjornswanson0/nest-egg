/* Nest Egg — simulation engine.
   Pure math, no DOM. Exposed as window.NestEgg for app.js and tests/. */
(function () {
  'use strict';

  var num = function (v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; };
  var monthlyRate = function (annualPct) { return Math.pow(1 + num(annualPct) / 100, 1 / 12) - 1; };
  var room = function (limit, used) { return Math.max(0, num(limit) - num(used)); };

  /* Coerce a raw state object (possibly with blanks) into clean numbers. */
  function normalize(raw) {
    raw = raw || {};
    var g = function (o, k) { return num(o && typeof o[k] === 'number' ? o[k] : parseFloat(o && o[k])); };
    var gDef = function (o, k, def) {
      return (o && o[k] !== '' && o[k] != null) ? num(parseFloat(o[k])) : def;
    };
    return {
      profile: {
        currentAge: g(raw.profile, 'currentAge'),
        retirementAge: g(raw.profile, 'retirementAge'),
        annualIncome: g(raw.profile, 'annualIncome'),
        incomeGrowthPct: g(raw.profile, 'incomeGrowthPct'),
        takeHomeMonthly: g(raw.profile, 'takeHomeMonthly')
      },
      k401: {
        balance: g(raw.k401, 'balance'),
        type: (raw.k401 && raw.k401.type === 'roth') ? 'roth' : 'pretax',
        preTaxBalPct: gDef(raw.k401, 'preTaxBalPct', 100),
        contribPct: g(raw.k401, 'contribPct'),
        matchRatePct: g(raw.k401, 'matchRatePct'),
        matchCapPct: g(raw.k401, 'matchCapPct'),
        returnPct: g(raw.k401, 'returnPct')
      },
      roth: {
        balance: g(raw.roth, 'balance'),
        monthly: g(raw.roth, 'monthly'),
        returnPct: g(raw.roth, 'returnPct')
      },
      hsa: {
        eligible: !!(raw.hsa && raw.hsa.eligible),
        balance: g(raw.hsa, 'balance'),
        monthly: g(raw.hsa, 'monthly'),
        returnPct: g(raw.hsa, 'returnPct')
      },
      hysa: {
        balance: g(raw.hysa, 'balance'),
        apyPct: g(raw.hysa, 'apyPct'),
        monthly: g(raw.hysa, 'monthly'),
        efTarget: g(raw.hysa, 'efTarget')
      },
      brokerage: {
        balance: g(raw.brokerage, 'balance'),
        monthly: g(raw.brokerage, 'monthly'),
        returnPct: g(raw.brokerage, 'returnPct')
      },
      debts: (raw.debts || []).map(function (d) {
        return {
          name: (d && d.name) || 'Debt',
          kind: (d && d.kind) || 'other',
          balance: g(d, 'balance'),
          aprPct: g(d, 'aprPct'),
          minPayment: g(d, 'minPayment')
        };
      }).filter(function (d) { return d.balance > 0; }),
      extraDebtMonthly: g(raw, 'extraDebtMonthly'),
      growContrib: raw.growContrib === undefined ? true : !!raw.growContrib,
      goals: {
        retireSpendMonthly: g(raw.goals, 'retireSpendMonthly'),
        swrPct: g(raw.goals, 'swrPct') || 4,
        inflationPct: g(raw.goals, 'inflationPct'),
        taxRatePct: gDef(raw.goals, 'taxRatePct', 15),
        ssMonthly: g(raw.goals, 'ssMonthly'),
        ssStartAge: g(raw.goals, 'ssStartAge') || 67
      },
      limits: {
        k401: g(raw.limits, 'k401') || 24500,
        ira: g(raw.limits, 'ira') || 7500,
        hsa: g(raw.limits, 'hsa') || 4400,
        highAprPct: gDef(raw.limits, 'highAprPct', 7)
      }
    };
  }

  function totalDebt(debts) {
    return debts.reduce(function (s, d) { return s + Math.max(0, d.balance); }, 0);
  }

  /* IRS-style limits for a given sim year: inflation-indexed, with 50+/55+ catch-ups. */
  function limitsForYear(inputs, year) {
    var idx = Math.pow(1 + inputs.goals.inflationPct / 100, year);
    var age = inputs.profile.currentAge + year;
    return {
      k401: (inputs.limits.k401 + (age >= 50 ? 8000 : 0)) * idx,
      ira: (inputs.limits.ira + (age >= 50 ? 1100 : 0)) * idx,
      hsa: (inputs.limits.hsa + (age >= 55 ? 1000 : 0)) * idx
    };
  }

  /* One month's allocation of the savings budget.
     Both strategies draw on the same budget so the comparison is fair.
     ctx.m holds the (possibly raise-grown) flat monthly amounts;
     ctx.limY holds this year's contribution limits. */
  function allocate(strategy, ctx) {
    var inp = ctx.inputs, ytd = ctx.ytd, limY = ctx.limY, m = ctx.m;
    var a = { k401: 0, roth: 0, hsa: 0, hysa: 0, brok: 0, debtExtra: 0, steps: null };

    if (strategy === 'current') {
      var planned401k = ctx.salary * inp.k401.contribPct / 100;
      a.k401 = Math.min(planned401k, room(limY.k401, ytd.k401));
      a.roth = Math.min(m.roth, room(limY.ira, ytd.roth));
      a.hsa = inp.hsa.eligible ? Math.min(m.hsa, room(limY.hsa, ytd.hsa)) : 0;
      a.hysa = m.hysa;
      a.brok = m.brok;
      /* Dollars blocked by annual limits, plus freed-up minimums, keep working:
         toward debt while any remains, into savings after. */
      var spill = (planned401k - a.k401) + (m.roth - a.roth) +
        ((inp.hsa.eligible ? m.hsa : 0) - a.hsa);
      var flex = m.extra + ctx.freedMinimums + spill;
      if (ctx.debtRemaining > 0) a.debtExtra = flex; else a.hysa += flex;
      return a;
    }

    /* Recommended order: match → high-APR debt → emergency fund → HSA → Roth →
       max 401(k) → remaining debt → overflow to taxable brokerage. */
    var rem = ctx.budget;
    var steps = { match: 0, hiDebt: 0, ef: 0, hsa: 0, roth: 0, k401Max: 0, lowDebt: 0, overflow: 0 };

    var matchCapDollars = ctx.salary * inp.k401.matchCapPct / 100;
    var s1 = Math.min(rem, matchCapDollars, room(limY.k401, ytd.k401));
    a.k401 += s1; steps.match = s1; rem -= s1;

    var s2 = Math.min(rem, ctx.hiDebtRemaining);
    a.debtExtra += s2; steps.hiDebt = s2; rem -= s2;

    var s3 = Math.min(rem, Math.max(0, inp.hysa.efTarget - ctx.balances.hysa));
    a.hysa += s3; steps.ef = s3; rem -= s3;

    var s4 = inp.hsa.eligible ? Math.min(rem, room(limY.hsa, ytd.hsa)) : 0;
    a.hsa += s4; steps.hsa = s4; rem -= s4;

    var s5 = Math.min(rem, room(limY.ira, ytd.roth));
    a.roth += s5; steps.roth = s5; rem -= s5;

    var s6 = Math.min(rem, room(limY.k401, ytd.k401) - s1);
    s6 = Math.max(0, s6);
    a.k401 += s6; steps.k401Max = s6; rem -= s6;

    var s7 = Math.min(rem, Math.max(0, ctx.debtRemaining - ctx.hiDebtRemaining));
    a.debtExtra += s7; steps.lowDebt = s7; rem -= s7;

    a.brok += rem; steps.overflow = rem;
    a.steps = steps;
    return a;
  }

  /* Month-by-month accumulation from current age to retirement age.
     The 401(k) is tracked as two buckets: pre-tax (match always lands here,
     plus employee dollars if type is pretax) and Roth. */
  function simulate(inputs, strategy) {
    var p = inputs.profile;
    var months = Math.max(0, Math.round((p.retirementAge - p.currentAge) * 12));
    var preShare = Math.min(100, Math.max(0, inputs.k401.preTaxBalPct)) / 100;
    var bal = {
      k401Pre: inputs.k401.balance * preShare,
      k401Roth: inputs.k401.balance * (1 - preShare),
      roth: inputs.roth.balance,
      hsa: inputs.hsa.balance,
      hysa: inputs.hysa.balance,
      brok: inputs.brokerage.balance
    };
    var rate = {
      k401: monthlyRate(inputs.k401.returnPct),
      roth: monthlyRate(inputs.roth.returnPct),
      hsa: monthlyRate(inputs.hsa.returnPct),
      hysa: monthlyRate(inputs.hysa.apyPct),
      brok: monthlyRate(inputs.brokerage.returnPct)
    };
    var debts = inputs.debts.map(function (d) {
      return { name: d.name, balance: d.balance, aprPct: d.aprPct, minPayment: d.minPayment };
    });
    var ytd = { k401: 0, roth: 0, hsa: 0 };
    var freedMinimums = 0;
    var totalInterest = 0;
    var debtFreeMonth = totalDebt(debts) > 0 ? null : 0;
    var firstAlloc = null;
    var series = [];

    for (var m = 0; m < months; m++) {
      if (m % 12 === 0) ytd = { k401: 0, roth: 0, hsa: 0 };
      var year = Math.floor(m / 12);
      var salary = p.annualIncome / 12 * Math.pow(1 + p.incomeGrowthPct / 100, year);
      var limY = limitsForYear(inputs, year);

      /* Flat monthly amounts optionally grow with raises so the savings
         rate holds steady instead of silently decaying over decades. */
      var gf = inputs.growContrib ? Math.pow(1 + p.incomeGrowthPct / 100, year) : 1;
      var monthly = {
        roth: inputs.roth.monthly * gf,
        hsa: inputs.hsa.monthly * gf,
        hysa: inputs.hysa.monthly * gf,
        brok: inputs.brokerage.monthly * gf,
        extra: inputs.extraDebtMonthly * gf
      };

      /* The budget: what the current plan sets aside this month. */
      var planned401k = salary * inputs.k401.contribPct / 100;
      var budget = planned401k + monthly.roth +
        (inputs.hsa.eligible ? monthly.hsa : 0) +
        monthly.hysa + monthly.brok + monthly.extra + freedMinimums;

      var hiDebtRemaining = debts.reduce(function (s, d) {
        return s + (d.aprPct >= inputs.limits.highAprPct ? Math.max(0, d.balance) : 0);
      }, 0);

      var alloc = allocate(strategy, {
        inputs: inputs, salary: salary, ytd: ytd, balances: bal, budget: budget,
        freedMinimums: freedMinimums, m: monthly, limY: limY,
        debtRemaining: totalDebt(debts), hiDebtRemaining: hiDebtRemaining
      });

      ytd.k401 += alloc.k401; ytd.roth += alloc.roth; ytd.hsa += alloc.hsa;

      var matchable = Math.min(alloc.k401, salary * inputs.k401.matchCapPct / 100);
      var match = matchable * inputs.k401.matchRatePct / 100;
      if (!firstAlloc) {
        firstAlloc = {
          k401: alloc.k401, match: match, roth: alloc.roth, hsa: alloc.hsa,
          hysa: alloc.hysa, brok: alloc.brok, debtExtra: alloc.debtExtra,
          minimums: debts.reduce(function (s, d) { return s + (d.balance > 0 ? d.minPayment : 0); }, 0),
          steps: alloc.steps, budget: budget
        };
      }

      /* employee dollars follow the chosen tax treatment; match is always pre-tax */
      if (inputs.k401.type === 'roth') bal.k401Roth += alloc.k401;
      else bal.k401Pre += alloc.k401;
      bal.k401Pre += match;
      bal.roth += alloc.roth;
      bal.hsa += alloc.hsa;
      bal.hysa += alloc.hysa;
      bal.brok += alloc.brok;

      /* Debts: accrue interest, pay minimums, then extra by highest APR. */
      var i, d, pay;
      for (i = 0; i < debts.length; i++) {
        d = debts[i];
        if (d.balance <= 0) continue;
        var interest = d.balance * d.aprPct / 100 / 12;
        d.balance += interest; totalInterest += interest;
      }
      for (i = 0; i < debts.length; i++) {
        d = debts[i];
        if (d.balance <= 0) continue;
        pay = Math.min(d.minPayment, d.balance);
        d.balance -= pay;
      }
      var extra = alloc.debtExtra;
      var byApr = debts.slice().sort(function (x, y) { return y.aprPct - x.aprPct; });
      for (i = 0; i < byApr.length && extra > 0; i++) {
        d = byApr[i];
        if (d.balance <= 0) continue;
        pay = Math.min(extra, d.balance);
        d.balance -= pay; extra -= pay;
      }
      bal.hysa += extra; /* payoff-month remainder keeps working */

      freedMinimums = debts.reduce(function (s, d) {
        return s + (d.balance <= 0 ? d.minPayment : 0);
      }, 0);
      if (debtFreeMonth === null && totalDebt(debts) <= 0.005) debtFreeMonth = m + 1;

      bal.k401Pre *= 1 + rate.k401;
      bal.k401Roth *= 1 + rate.k401;
      bal.roth *= 1 + rate.roth;
      bal.hsa *= 1 + rate.hsa;
      bal.hysa *= 1 + rate.hysa;
      bal.brok *= 1 + rate.brok;

      var debtNow = totalDebt(debts);
      var k401Now = bal.k401Pre + bal.k401Roth;
      var investedNow = k401Now + bal.roth + bal.hsa + bal.hysa + bal.brok;
      series.push({
        month: m + 1,
        age: p.currentAge + (m + 1) / 12,
        k401: k401Now, k401Pre: bal.k401Pre,
        roth: bal.roth, hsa: bal.hsa, hysa: bal.hysa, brok: bal.brok,
        debt: debtNow,
        invested: investedNow,
        netWorth: investedNow - debtNow
      });
    }

    var k401Fin = bal.k401Pre + bal.k401Roth;
    var invFin = k401Fin + bal.roth + bal.hsa + bal.hysa + bal.brok;
    var last = series.length ? series[series.length - 1] : {
      month: 0, age: p.currentAge, k401: k401Fin, k401Pre: bal.k401Pre,
      roth: bal.roth, hsa: bal.hsa, hysa: bal.hysa, brok: bal.brok,
      debt: totalDebt(debts), invested: invFin, netWorth: invFin - totalDebt(debts)
    };
    return {
      strategy: strategy, series: series, final: last,
      debtFreeMonth: debtFreeMonth, totalInterest: totalInterest,
      firstAlloc: firstAlloc
    };
  }

  /* Spendable (after-tax) value of a series point: pre-tax 401(k) dollars
     get a haircut at the expected effective retirement tax rate. */
  function afterTax(inputs, pt) {
    return pt.invested - pt.k401Pre * inputs.goals.taxRatePct / 100;
  }

  /* Nest-egg target at a given number of years from now (nominal dollars).
     Social Security shrinks the perpetual need; retiring before it starts
     adds a bridge: those years' benefit must come from the portfolio. */
  function targetAt(inputs, yearsOut) {
    var g = inputs.goals;
    if (!g.retireSpendMonthly || g.swrPct <= 0) return 0;
    var infl = Math.pow(1 + g.inflationPct / 100, yearsOut);
    var spendAnnual = g.retireSpendMonthly * 12 * infl;
    var ssAnnual = Math.min(g.ssMonthly * 12 * infl, spendAnnual);
    var retAge = inputs.profile.currentAge + yearsOut;
    var bridgeYears = g.ssMonthly > 0 ? Math.max(0, g.ssStartAge - retAge) : 0;
    return (spendAnnual - ssAnnual) / (g.swrPct / 100) + ssAnnual * bridgeYears;
  }

  function earliestRetireAge(inputs, sim) {
    if (!inputs.goals.retireSpendMonthly) return null;
    for (var i = 0; i < sim.series.length; i++) {
      var pt = sim.series[i];
      if (afterTax(inputs, pt) >= targetAt(inputs, pt.age - inputs.profile.currentAge)) return pt.age;
    }
    return null;
  }

  /* Same inputs with investment returns shifted by d points (HYSA/debt untouched). */
  function shiftReturns(inputs, d) {
    var c = JSON.parse(JSON.stringify(inputs));
    ['k401', 'roth', 'hsa', 'brokerage'].forEach(function (k) {
      c[k].returnPct = Math.max(0, c[k].returnPct + d);
    });
    return c;
  }

  /* Run both strategies (plus a ±2% band on the current plan) and derive headlines. */
  function analyze(raw) {
    var inputs = normalize(raw);
    var p = inputs.profile;
    var years = p.retirementAge - p.currentAge;
    var current = simulate(inputs, 'current');
    var recommended = simulate(inputs, 'recommended');
    var currentLow = simulate(shiftReturns(inputs, -2), 'current');
    var currentHigh = simulate(shiftReturns(inputs, 2), 'current');
    var target = targetAt(inputs, years);
    var deflate = Math.pow(1 + inputs.goals.inflationPct / 100, years);
    var swr = inputs.goals.swrPct / 100;

    var spendable = afterTax(inputs, current.final);
    var spendableRec = afterTax(inputs, recommended.final);

    return {
      inputs: inputs,
      years: years,
      current: current,
      recommended: recommended,
      currentLow: currentLow,
      currentHigh: currentHigh,
      target: target,
      spendable: spendable,
      spendableRec: spendableRec,
      coverage: target > 0 ? spendable / target : null,
      coverageRec: target > 0 ? spendableRec / target : null,
      grossFinal: current.final.invested,
      finalTodayDollars: spendable / deflate,
      retireIncomeMonthlyToday: spendable / deflate * swr / 12 + inputs.goals.ssMonthly,
      deltaAtRetirement: spendableRec - spendable,
      earliestRetireAge: earliestRetireAge(inputs, current),
      earliestRetireAgeRec: earliestRetireAge(inputs, recommended)
    };
  }

  window.NestEgg = {
    normalize: normalize,
    simulate: simulate,
    analyze: analyze,
    targetAt: targetAt,
    afterTax: afterTax,
    limitsForYear: limitsForYear,
    monthlyRate: monthlyRate
  };
})();
