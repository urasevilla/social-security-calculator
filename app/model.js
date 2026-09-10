/**
 * Pure arithmetic model for the WIEGO social security subsidy calculator.
 * Ported from the Claude Design prototype's `runModel` (see design_handoff
 * bundle README for the full spec). No DOM, no framework dependency.
 */

/**
 * Country data (CC). Per-field provenance:
 *
 *   pop, growth, inflation, lfp, workingAge, gdp
 *     World Bank / World Development Indicators, via the API documented at
 *     https://documents.worldbank.org/en/publication/documents-reports/api
 *     (the same data the wbstats R package wraps, see
 *     https://cran.r-project.org/web/packages/wbstats/vignettes/wbstats.html).
 *     Indicator codes: pop=SP.POP.TOTL, growth=SP.POP.GROW,
 *     inflation=FP.CPI.TOTL.ZG, lfp=SL.TLF.CACT.ZS,
 *     workingAge=SP.POP.1564.TO.ZS, gdp=NY.GDP.MKTP.CD.
 *
 *     CAVEAT: the values below are a best-available snapshot, not a
 *     verified live pull — this project's environment has no network
 *     access to api.worldbank.org (outbound egress is allowlisted and
 *     that host isn't on it). Run `node app/scripts/fetch-worldbank-data.mjs`
 *     from an environment with network access to regenerate this table
 *     from a live API call, then replace these six fields per country
 *     (leave informal/spend/expPct/expLevel/expSrc as they are — the
 *     script deliberately doesn't touch them, see below).
 *
 *   expPct, expLevel, expSrc (government expenditure, % of GDP)
 *     NOT from the World Bank — IMF Regional Economic Outlook 2024, except
 *     India (Reserve Bank of India central-government expenditure). See
 *     the handoff README's "Data provenance" section for why: the original
 *     design deliberately used IMF/RBI actuals here instead of a World
 *     Bank/GDP-ratio assumption.
 *
 *   informal (% of workers in informal employment)
 *     NOT from the World Bank — informal-employment share is WIEGO/ILO's
 *     domain, not a standard WDI indicator. Structural placeholder pending
 *     WIEGO's own figures (per handoff README).
 *
 *   spend (default for the hypothetical "assume % of GDP" slider)
 *     Set close to expPct so toggling between "reported" and "assumed"
 *     starts from roughly the same number; not an independent indicator.
 */
const CC = {
  Kenya: { pop: 54027487, growth: 1.91, inflation: 7.66, lfp: 74.2, workingAge: 59.32, gdp: 113420008179, informal: 80, spend: 24, expPct: 23.26, expLevel: "general government", expSrc: "IMF Regional Economic Outlook, 2024" },
  Ghana: { pop: 33475870, growth: 1.90, inflation: 23.2, lfp: 66.5, workingAge: 60.0, gdp: 76370000000, informal: 88, spend: 22, expPct: 23.18, expLevel: "general government", expSrc: "IMF Regional Economic Outlook, 2024" },
  India: { pop: 1428627663, growth: 0.90, inflation: 5.65, lfp: 55.6, workingAge: 67.8, gdp: 3549900000000, informal: 89, spend: 15, expPct: 14.77, expLevel: "central government", expSrc: "Reserve Bank of India, 2024" },
  "South Africa": { pop: 60414495, growth: 0.90, inflation: 6.0, lfp: 59.9, workingAge: 66.1, gdp: 380700000000, informal: 34, spend: 32, expPct: 32.98, expLevel: "general government", expSrc: "IMF Regional Economic Outlook, 2024" },
  Mexico: { pop: 128455567, growth: 0.80, inflation: 5.5, lfp: 61.5, workingAge: 67.5, gdp: 1789000000000, informal: 55, spend: 26, expPct: 30.32, expLevel: "general government", expSrc: "IMF, 2024" },
  Peru: { pop: 34352719, growth: 1.00, inflation: 6.3, lfp: 74.5, workingAge: 67.3, gdp: 267600000000, informal: 76, spend: 21, expPct: 21.41, expLevel: "general government", expSrc: "IMF Regional Economic Outlook, 2024" }
};

const SUBGROUPS = [
  { name: "Self-employed only", pct: 60, employer: 0, note: "Own-account workers — no employer to share the contribution." },
  { name: "Domestic workers", pct: 8, employer: 50, note: "They have an employer: the household. Its share comes off the bill first." },
  { name: "Street vendors & market traders", pct: 12, employer: 0, note: "Own-account traders, organised through associations that can carry enrolment." },
  { name: "Home-based workers", pct: 18, employer: 35, note: "Sub-contracted piece-rate workers have a contractor who can be made liable." }
];

const NUM = new Intl.NumberFormat("en-US");
function num(v) { return NUM.format(Math.round(v)); }
function money(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return "$" + (v / 1e9).toFixed(a >= 1e10 ? 0 : 1) + "bn";
  if (a >= 1e6) return "$" + (v / 1e6).toFixed(a >= 1e8 ? 0 : 1) + "m";
  if (a >= 1e3) return "$" + Math.round(v / 1e3) + "k";
  return "$" + v.toFixed(0);
}
function usd(v) { return "$" + num(v); }
function dollars(v) { return v >= 10 || v % 1 === 0 ? "$" + v.toFixed(0) : "$" + v.toFixed(2); }
function people(v) {
  if (v >= 1e6) return (v / 1e6).toFixed(1) + " million";
  if (v >= 1e3) return Math.round(v / 1e3) + " thousand";
  return num(v);
}

function countryDefaults(country) {
  const c = CC[country] || CC.Kenya;
  return { workingAge: Math.round(c.workingAge * 10) / 10, lfp: c.lfp, informal: c.informal, inflation: c.inflation, spend: c.spend };
}

function runModel(p) {
  const c = CC[p.country] || CC.Kenya;
  const N = Math.max(1, Math.round(p.years));
  const rows = []; let cum = 0, cumReal = 0, cumUprated = 0, cumWorker = 0, cumEmployer = 0;
  for (let t = 1; t <= N; t++) {
    const pop = c.pop * Math.pow(1 + c.growth / 100, t - 1);
    const informal = pop * (p.workingAge / 100) * (p.lfp / 100) * (p.informal / 100);
    const eligible = p.subgroup ? informal * (p.subgroupPct / 100) : informal;
    const signup = Math.max(0, Math.min(100, p.signup + p.signupGrowth * (t - 1)));
    const enrolled = eligible * signup / 100;
    const emp = Math.max(0, Math.min(100, p.employerShare || 0)) / 100;
    let share = (p.govShare / 100) * (1 - emp);
    if (t > p.decreaseAfter) {
      const span = Math.max(1, N - p.decreaseAfter);
      share = share * Math.max(0, 1 - (t - p.decreaseAfter) / span);
    }
    const annual = 12 * p.contrib;
    const annualReal = annual * Math.pow(1 + p.inflation / 100, t - 1);
    const gov = enrolled * annual * share;
    const employer = enrolled * annual * emp;
    const worker = enrolled * annual * Math.max(0, 1 - share - emp);
    const defl = Math.pow(1 + p.inflation / 100, t - 1);
    cum += gov; cumReal += gov / defl; cumUprated += enrolled * annualReal * share; cumWorker += worker; cumEmployer += employer;
    rows.push({ t: t, year: 2026 + t - 1, pop: pop, informal: informal, eligible: eligible, enrolled: enrolled, signup: signup, share: share * 100, gov: gov, worker: worker, employer: employer, employerShare: emp * 100, cum: cum });
  }
  const last = rows[rows.length - 1];
  const spend = c.gdp * ((p.spendBasis === "assumed" ? p.spend : c.expPct) / 100);
  let fund = 0, wPaid = 0, gPaid = 0, ePaid = 0;
  for (let t = 1; t <= N; t++) {
    const annual = 12 * p.contrib, sh = rows[t - 1].share / 100;
    const em = (Math.max(0, Math.min(100, p.employerShare || 0))) / 100;
    wPaid += annual * Math.max(0, 1 - sh - em); gPaid += annual * sh; ePaid += annual * em;
    fund = (fund + annual) * (1 + p.interest / 100);
  }
  return {
    rows: rows, N: N, c: c, last: last, spend: spend, total: cum, totalReal: cumReal, totalUprated: cumUprated, totalWorker: cumWorker,
    pctSpend: (cum / N) / spend * 100, pctGdp: (cum / N) / c.gdp * 100, spendUsed: spend, spendPctGdp: spend / c.gdp * 100, totalPctGdp: cum / c.gdp * 100,
    perWorker: { worker: wPaid, gov: gPaid, employer: ePaid, fund: fund }, totalEmployer: cumEmployer
  };
}

function ticks(max, H, fmt) {
  const out = []; const step = max / 4;
  for (let i = 0; i <= 4; i++) { const y = H - (i / 4) * H; out.push({ y: y.toFixed(1), pct: (100 - (i / 4) * 100).toFixed(2) + "%", label: fmt(step * i) }); }
  return out;
}
function pctOf(i, n) { return (n > 1 ? (i / (n - 1)) * 100 : 50).toFixed(3) + "%"; }
