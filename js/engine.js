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
    return {
      profile: {
        currentAge: g(raw.profile, 'currentAge'),
        retirementAge: g(raw.profile, 'retirementAge'),
        annualIncome: g(raw.profile, 'annualIncome'),
        incomeGrowthPct: g(raw.profile, 'incomeGrowthPct')
      },
      k401: {
        balance: g(raw.k401, 'balance'),
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
          balance: g(d, 'balance'),
          aprPct: g(d, 'aprPct'),
          minPayment: g(d, 'minPayment')
        };
      }).filter(function (d) { return d.balance > 0; }),
      extraDebtMonthly: g(raw, 'extraDebtMonthly'),
      goals: {
        retireSpendMonthly: g(raw.goals, 'retireSpendMonthly'),
        swrPct: g(raw.goals, 'swrPct') || 4,
        inflationPct: g(raw.goals, 'inflationPct')
      },
      limits: {
        k401: g(raw.limits, 'k401') || 24500,
        ira: g(raw.limits, 'ira') || 7500,
        hsa: g(raw.limits, 'hsa') || 4400,
        highAprPct: (raw.limits && raw.limits.highAprPct !== '' && raw.limits.highAprPct != null)
          ? num(parseFloat(raw.limits.highAprPct)) : 7
      }
    };
  }

  function totalDebt(debts) {
    return debts.reduce(function (s, d) { return s + Math.max(0, d.balance); }, 0);
  }

  /* One month's allocation of the savings budget.
     Both strategies draw on the same budget so the comparison is fair. */
  function allocate(strategy, ctx) {
    var inp = ctx.inputs, ytd = ctx.ytd, lim = inp.limits;
    var a = { k401: 0, roth: 0, hsa: 0, hysa: 0, brok: 0, debtExtra: 0, steps: null };

    if (strategy === 'current') {
      var planned401k = ctx.salary * inp.k401.contribPct / 100;
      a.k401 = Math.min(planned401k, room(lim.k401, ytd.k401));
      a.roth = Math.min(inp.roth.monthly, room(lim.ira, ytd.roth));
      a.hsa = inp.hsa.eligible ? Math.min(inp.hsa.monthly, room(lim.hsa, ytd.hsa)) : 0;
      a.hysa = inp.hysa.monthly;
      a.brok = inp.brokerage.monthly;
      /* Dollars blocked by annual limits, plus freed-up minimums, keep working:
         toward debt while any remains, into savings after. */
      var spill = (planned401k - a.k401) + (inp.roth.monthly - a.roth) +
        ((inp.hsa.eligible ? inp.hsa.monthly : 0) - a.hsa);
      var flex = inp.extraDebtMonthly + ctx.freedMinimums + spill;
      if (ctx.debtRemaining > 0) a.debtExtra = flex; else a.hysa += flex;
      return a;
    }

    /* Recommended order: match → high-APR debt → emergency fund → HSA → Roth →
       max 401(k) → remaining debt → overflow to taxable brokerage. */
    var rem = ctx.budget;
    var steps = { match: 0, hiDebt: 0, ef: 0, hsa: 0, roth: 0, k401Max: 0, lowDebt: 0, overflow: 0 };

    var matchCapDollars = ctx.salary * inp.k401.matchCapPct / 100;
    var s1 = Math.min(rem, matchCapDollars, room(lim.k401, ytd.k401));
    a.k401 += s1; steps.match = s1; rem -= s1;

    var s2 = Math.min(rem, ctx.hiDebtRemaining);
    a.debtExtra += s2; steps.hiDebt = s2; rem -= s2;

    var s3 = Math.min(rem, Math.max(0, inp.hysa.efTarget - ctx.balances.hysa));
    a.hysa += s3; steps.ef = s3; rem -= s3;

    var s4 = inp.hsa.eligible ? Math.min(rem, room(lim.hsa, ytd.hsa)) : 0;
    a.hsa += s4; steps.hsa = s4; rem -= s4;

    var s5 = Math.min(rem, room(lim.ira, ytd.roth));
    a.roth += s5; steps.roth = s5; rem -= s5;

    var s6 = Math.min(rem, room(lim.k401, ytd.k401) - s1);
    s6 = Math.max(0, s6);
    a.k401 += s6; steps.k401Max = s6; rem -= s6;

    var s7 = Math.min(rem, Math.max(0, ctx.debtRemaining - ctx.hiDebtRemaining));
    a.debtExtra += s7; steps.lowDebt = s7; rem -= s7;

    a.brok += rem; steps.overflow = rem;
    a.steps = steps;
    return a;
  }

  /* Month-by-month accumulation from current age to retirement age. */
  function simulate(inputs, strategy) {
    var p = inputs.profile;
    var months = Math.max(0, Math.round((p.retirementAge - p.currentAge) * 12));
    var bal = {
      k401: inputs.k401.balance,
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

      /* The budget: what the current plan sets aside this month. */
      var planned401k = salary * inputs.k401.contribPct / 100;
      var budget = planned401k + inputs.roth.monthly +
        (inputs.hsa.eligible ? inputs.hsa.monthly : 0) +
        inputs.hysa.monthly + inputs.brokerage.monthly +
        inputs.extraDebtMonthly + freedMinimums;

      var hiDebtRemaining = debts.reduce(function (s, d) {
        return s + (d.aprPct >= inputs.limits.highAprPct ? Math.max(0, d.balance) : 0);
      }, 0);

      var alloc = allocate(strategy, {
        inputs: inputs, salary: salary, ytd: ytd, balances: bal, budget: budget,
        freedMinimums: freedMinimums,
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

      bal.k401 += alloc.k401 + match;
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

      bal.k401 *= 1 + rate.k401;
      bal.roth *= 1 + rate.roth;
      bal.hsa *= 1 + rate.hsa;
      bal.hysa *= 1 + rate.hysa;
      bal.brok *= 1 + rate.brok;

      var debtNow = totalDebt(debts);
      var investedNow = bal.k401 + bal.roth + bal.hsa + bal.hysa + bal.brok;
      series.push({
        month: m + 1,
        age: p.currentAge + (m + 1) / 12,
        k401: bal.k401, roth: bal.roth, hsa: bal.hsa, hysa: bal.hysa, brok: bal.brok,
        debt: debtNow,
        invested: investedNow,
        netWorth: investedNow - debtNow
      });
    }

    var last = series.length ? series[series.length - 1] : {
      month: 0, age: p.currentAge, k401: bal.k401, roth: bal.roth, hsa: bal.hsa,
      hysa: bal.hysa, brok: bal.brok, debt: totalDebt(debts),
      invested: bal.k401 + bal.roth + bal.hsa + bal.hysa + bal.brok,
      netWorth: bal.k401 + bal.roth + bal.hsa + bal.hysa + bal.brok - totalDebt(debts)
    };
    return {
      strategy: strategy, series: series, final: last,
      debtFreeMonth: debtFreeMonth, totalInterest: totalInterest,
      firstAlloc: firstAlloc
    };
  }

  /* Nest-egg target at a given number of years from now (nominal dollars). */
  function targetAt(inputs, yearsOut) {
    var g = inputs.goals;
    var annualSpend = g.retireSpendMonthly * 12 * Math.pow(1 + g.inflationPct / 100, yearsOut);
    return g.swrPct > 0 ? annualSpend / (g.swrPct / 100) : 0;
  }

  function earliestRetireAge(inputs, sim) {
    if (!inputs.goals.retireSpendMonthly) return null;
    for (var i = 0; i < sim.series.length; i++) {
      var pt = sim.series[i];
      if (pt.invested >= targetAt(inputs, pt.age - inputs.profile.currentAge)) return pt.age;
    }
    return null;
  }

  /* Run both strategies and derive the headline numbers. */
  function analyze(raw) {
    var inputs = normalize(raw);
    var p = inputs.profile;
    var years = p.retirementAge - p.currentAge;
    var current = simulate(inputs, 'current');
    var recommended = simulate(inputs, 'recommended');
    var target = targetAt(inputs, years);
    var deflate = Math.pow(1 + inputs.goals.inflationPct / 100, years);
    var swr = inputs.goals.swrPct / 100;

    return {
      inputs: inputs,
      years: years,
      current: current,
      recommended: recommended,
      target: target,
      coverage: target > 0 ? current.final.invested / target : null,
      coverageRec: target > 0 ? recommended.final.invested / target : null,
      finalTodayDollars: current.final.invested / deflate,
      finalTodayDollarsRec: recommended.final.invested / deflate,
      retireIncomeMonthly: current.final.invested * swr / 12,
      retireIncomeMonthlyToday: current.final.invested * swr / 12 / deflate,
      deltaAtRetirement: recommended.final.netWorth - current.final.netWorth,
      earliestRetireAge: earliestRetireAge(inputs, current),
      earliestRetireAgeRec: earliestRetireAge(inputs, recommended)
    };
  }

  window.NestEgg = {
    normalize: normalize,
    simulate: simulate,
    analyze: analyze,
    targetAt: targetAt,
    monthlyRate: monthlyRate
  };
})();
