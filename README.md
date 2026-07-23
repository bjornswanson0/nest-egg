# Nest Egg 🥚

**A retirement calculator that takes the whole picture** — 401(k), Roth IRA, HSA, high-yield savings, *and* high-interest debt — and shows you where your next dollar should go.

**Live: [bjornswanson0.github.io/nest-egg](https://bjornswanson0.github.io/nest-egg/)**

## What it does

Most retirement calculators project one account and ignore your credit card. Nest Egg starts with your budget and simulates your full financial picture month by month to retirement:

- **Budget first** — take-home minus essentials, everything else, and debt minimums gives your monthly surplus. A running budget bar through the walkthrough shows how much of it you've allocated (and flags over-committing), and the coaching calls out any dollars going nowhere.
- **All five account types** — 401(k) with employer match, Roth IRA, HSA, HYSA, and a taxable brokerage, each with its own balance, contributions, and expected return.
- **Debt, done right** — multiple debts with APRs and minimums, paid down avalanche-style (highest APR first). When a debt dies, its old minimum payment rolls forward instead of vanishing.
- **Two plans, one budget** — it runs *your* plan against a **recommended order** (employer match → high-interest debt → emergency fund → HSA → Roth IRA → max 401(k) → remaining debt → taxable brokerage). With no budget entered they spend identical dollars, so the gap is pure ordering; with one, the recommended plan also deploys the surplus your plan leaves idle — and says so.
- **Retirement readiness, honestly** — the headline nest egg is **after-tax** (pre-tax 401(k) dollars get a haircut at your expected retirement rate), the goal accounts for **Social Security** (including a bridge if you retire before it starts), and a **±2% return band** shows the range around the smooth line.
- **Real-world mechanics** — contribution limits indexed to inflation with 50+/55+ catch-ups, contributions that optionally grow with raises, coverage percentage, earliest-retirement age, debt-free date, and interest saved.
- **Built-in coaching** — savings rate vs. the 15–20% guideline, employer-match capture in dollars, the "one more 1%" compounding lesson, salary-multiple benchmarks by age, a **50/30/20 paycheck view**, and a checklist of concrete monthly moves.

## Privacy

Everything runs in your browser. Your numbers are saved to `localStorage` on your own device and are never uploaded anywhere.

## Stack

Plain HTML, CSS, and JavaScript — no framework, no build step, no dependencies. Charts are hand-rolled SVG with crosshair tooltips, keyboard navigation, and a full table view. Light and dark themes.

## Tests

The simulation engine has a browser-based test harness — open `tests/engine-test.html` and look for `RESULT: PASS`. It checks compound growth against closed-form math, debt amortization against the annuity formula, employer-match and annual-limit logic, and budget parity between the two strategies.

## Disclaimer

Educational tool, not financial advice. Taxes aren't modeled; projections are only as good as their assumptions.
