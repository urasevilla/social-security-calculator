/**
 * Vanilla JS implementation of the "1c" five-step walkthrough from the
 * Claude Design handoff (design_handoff_social_security_calculator/).
 * One state object drives everything; the whole model re-runs on every
 * change. Range sliders update their own value label live on `input`,
 * but the full derived UI (charts, notes, headline) only re-renders on
 * `change` (drag release / keyboard step) so a full innerHTML rebuild
 * never interrupts an in-progress drag.
 */
(function () {
  "use strict";

  const el = document.getElementById("app");
  const STEP_LABELS = ["Workers", "Contribution", "Who pays", "Take-up", "Result"];
  const INT_KEYS = new Set(["decreaseAfter", "years"]);

  const DEFAULT_COUNTRY = "Kenya";
  const DEFAULT_YEARS = 10;

  let state = Object.assign(countryDefaults(DEFAULT_COUNTRY), {
    country: DEFAULT_COUNTRY,
    step: 1,
    aboutOpen: false,
    notesOpen: false,
    copied: false,
    years: DEFAULT_YEARS,
    contrib: 5,
    govShare: 50,
    employerShare: 0,
    decreaseAfter: DEFAULT_YEARS,
    signup: 8,
    signupGrowth: 1.5,
    subgroup: false,
    subgroupName: "Self-employed only",
    subgroupPct: 60,
    interest: 6
    // spendBasis comes from countryDefaults(DEFAULT_COUNTRY) above — it
    // depends on whether that country reports Expense (% of GDP).
  });

  const LIVE_FORMAT = {
    informal: v => v + "%",
    subgroupPct: v => v + "% of informal workers",
    employerShare: v => v + "%",
    govShare: v => v + "%",
    decreaseAfter: v => (v >= state.years ? "Never — held flat" : "Year " + (v + 1)),
    signup: v => v + "%",
    signupGrowth: v => "+" + v + "%/yr",
    years: v => String(Math.round(v)),
    inflation: v => v + "%",
    interest: v => v + "%",
    spend: v => v + "% of GDP"
  };

  function paramsOf(s) {
    return {
      country: s.country, years: s.years, contrib: s.contrib, govShare: s.govShare,
      decreaseAfter: s.decreaseAfter === undefined ? s.years : s.decreaseAfter,
      signup: s.signup, signupGrowth: s.signupGrowth,
      subgroup: !!s.subgroup, subgroupPct: s.subgroupPct || 50,
      workingAge: s.workingAge, lfp: s.lfp, informal: s.informal,
      inflation: s.inflation, interest: s.interest, spend: s.spend,
      spendBasis: s.spendBasis || "actual", employerShare: s.employerShare || 0
    };
  }

  function computeDerived(s) {
    const taper = Math.min(s.decreaseAfter === undefined ? s.years : s.decreaseAfter, s.years);
    const m = runModel(paramsOf(Object.assign({}, s, { decreaseAfter: taper })));
    const mNoTaper = runModel(paramsOf(Object.assign({}, s, { decreaseAfter: s.years })));
    const gdpPerCapita = m.c.gdp / m.c.pop;
    const monthlyIncome = gdpPerCapita / 12 * 0.55;
    return { taper: taper, m: m, mNoTaper: mNoTaper, gdpPerCapita: gdpPerCapita, monthlyIncome: monthlyIncome };
  }

  // ---------- render: header / intro ----------

  function renderHeader(s) {
    const steps = STEP_LABELS.map((label, i) => {
      const n = i + 1;
      const active = s.step === n;
      const done = s.step >= n;
      return `<button type="button" class="step-btn${active ? " active" : ""}${done ? " done" : ""}" data-action="goto-step" data-step="${n}">
        <span class="bar"></span>
        <span class="label">${n} ${label}</span>
      </button>`;
    }).join("");
    return `<div class="dv-header">
      <div class="identity-row">
        <img class="dv-logo" src="assets/wiego-logo.png" alt="WIEGO — Women in Informal Employment: Globalizing and Organizing">
        <div class="identity-text">
          <h1 class="site-title">Social Security Subsidy Cost Calculator</h1>
          <p class="site-desc">What it costs a government to co-pay social insurance contributions for workers in informal employment.</p>
          <button type="button" class="ghost-btn-brown" data-action="toggle-about">${s.aboutOpen ? "Hide" : "What is this?"}</button>
        </div>
      </div>
      <div class="step-rail">${steps}</div>
    </div>`;
  }

  function renderIntro(s) {
    if (!s.aboutOpen) return "";
    return `<div class="intro-wrap">
      <div class="intro-panel">
        <div class="intro-body">
          <p class="intro-p1">Social security is a human right and labour right for all workers, including workers in informal employment. For workers in formal wage employment, the affordability of social insurance contributions and adequacy of benefits is generally ensured by dividing contributions between themselves and their employer.</p>
          <p class="intro-p2">Self-employed workers, on the other hand, are often expected to shoulder the entire burden of paying contributions, which results in unaffordably high contribution rates or contribution payments that are too low to yield adequate benefits. This is a major barrier for the nearly 80 percent of informal workers in developing countries that are self-employed.</p>
          <p class="intro-p2">The most effective way to address this affordability gap is for governments to subsidize social insurance contributions for low-income informal workers. Global evidence shows that countries that have managed to significantly expand social insurance coverage to informal workers have recognized this and implemented various forms of subsidies.</p>
          <p class="intro-p3">This calculator helps estimate the costs of different subsidy options, as well as the impacts of those on workers' social security benefits.</p>
          <p class="intro-p4">Five steps: who is covered, what a contribution costs, who pays which part, how many enrol, and what it adds up to. Every figure updates as you change an assumption, and you can download the full year-by-year data at the end.</p>
        </div>
      </div>
    </div>`;
  }

  // ---------- render: steps ----------

  function renderStep1(s, d) {
    const m = d.m;
    const informalCount = m.rows[0].informal;
    const eligibleCount = m.rows[0].eligible;
    const dotsOn = Math.round(s.informal / 2);
    let dots = "";
    for (let i = 0; i < 50; i++) {
      dots += `<span class="dot" style="background:${i < dotsOn ? "var(--orange)" : "rgba(94,81,77,.18)"}"></span>`;
    }
    const scopeAll = !s.subgroup;
    const subgroupBlock = s.subgroup ? `
      <div>
        <div class="subgroup-grid">
          ${SUBGROUPS.map(g => `
            <button type="button" class="subgroup-card${s.subgroupName === g.name ? " active" : ""}" data-action="pick-subgroup" data-name="${g.name}">
              <span class="name">${g.name}</span>
              <span class="note">${g.note}</span>
            </button>`).join("")}
        </div>
        <div class="ctrl-head">
          <label for="c-subpct" class="ctrl-label">Size of that group</label>
          <span class="ctrl-value tnum" id="val-subgroupPct">${s.subgroupPct}% of informal workers</span>
        </div>
        <input id="c-subpct" type="range" min="1" max="100" step="1" value="${s.subgroupPct}" data-key="subgroupPct" aria-label="Size of the subgroup as a share of informal workers">
        <p class="ctrl-note" style="margin-top:8px">Eligible pool: <strong style="color:var(--ink)">${people(eligibleCount)}</strong> — ${s.subgroup ? s.subgroupName : "All workers in informal employment"}.</p>
        ${(s.employerShare || 0) > 0 ? `<p class="ctrl-note" style="color:var(--brown);margin-top:6px">This group has an employer — set its share in step 3 before the subsidy applies.</p>` : ""}
      </div>` : "";

    return `<div>
      <div class="eyebrow">STEP 1 · WHO ARE WE COVERING?</div>
      <h2 class="step-h2">In ${s.country}, <span class="live">${people(informalCount)}</span> people work informally.</h2>
      <p class="lead">That is ${s.informal}% of everyone who works — mostly self-employed, and mostly expected to pay the whole social insurance contribution alone.</p>
      <div class="dot-grid">${dots}</div>
      <div class="eligibility-block">
        <div class="eligibility-head">
          <span class="ctrl-label">Who is eligible for the subsidy?</span>
          <div class="toggle-group">
            <button type="button" class="toggle-btn${scopeAll ? " active" : ""}" data-action="scope-all">Everyone informal</button>
            <button type="button" class="toggle-btn${!scopeAll ? " active" : ""}" data-action="scope-subgroup">One subgroup</button>
          </div>
        </div>
        ${subgroupBlock}
      </div>
      <div class="step1-bottom">
        <div class="slider-col">
          <div class="ctrl-head">
            <label for="c-informal" class="ctrl-label">Share of workers in informal employment</label>
            <span class="ctrl-value tnum" id="val-informal">${s.informal}%</span>
          </div>
          <input id="c-informal" type="range" min="10" max="95" step="1" value="${s.informal}" data-key="informal" aria-label="Share of workers in informal employment">
        </div>
        <div class="country-col">
          <label for="c-country">COUNTRY</label>
          <select id="c-country">
            ${Object.keys(CC).map(c => `<option value="${c}"${c === s.country ? " selected" : ""}>${c}</option>`).join("")}
          </select>
        </div>
      </div>
    </div>`;
  }

  function renderStep2(s, d) {
    const monthlyIncome = d.monthlyIncome;
    const incomePct = s.contrib / monthlyIncome * 100;
    return `<div>
      <div class="eyebrow">STEP 2 · WHAT DOES COVER COST?</div>
      <h2 class="step-h2">A floor of <span class="live">${dollars(s.contrib)}</span> a month buys a contribution record.</h2>
      <p class="lead">That is ${dollars(s.contrib * 12)} a year per worker — roughly ${incomePct.toFixed(1)}% of an average income here. Paid alone, that is the affordability gap.</p>
      <div class="income-card">
        <div class="heading">SHARE OF A MONTHLY INCOME</div>
        <div class="income-bar-track"><div class="income-bar-fill" style="width:${Math.min(100, incomePct).toFixed(1)}%"></div></div>
        <div class="income-labels"><span>Contribution ${dollars(s.contrib)}</span><span>Average monthly income ${dollars(Math.round(monthlyIncome))}</span></div>
      </div>
      <div class="ctrl-row">
        <label for="c-contrib" class="ctrl-label" style="display:block;margin-bottom:8px">Monthly minimum contribution (worker + government)</label>
        <div class="contrib-input-group">
          <span class="affix">$</span>
          <input id="c-contrib" type="text" inputmode="decimal" value="${s.contrib}" data-key="contrib" aria-label="Monthly minimum contribution in US dollars, 0.5 to 500">
          <span class="affix">/ month</span>
        </div>
      </div>
    </div>`;
  }

  function renderStep3(s, d) {
    const m = d.m, mNoTaper = d.mNoTaper, taper = d.taper;
    const hasEmployer = (s.employerShare || 0) > 0;
    const effShare = m.rows[0].share;
    const workerPct = Math.max(0, 100 - effShare - (s.employerShare || 0));

    const employerSeg = hasEmployer ? `
      <div class="pay-seg employer" style="width:${s.employerShare}%">
        <span class="role">EMPLOYER</span>
        <span class="amt tnum">${dollars(s.contrib * (s.employerShare || 0) / 100)}/mo</span>
      </div>` : "";

    const taperBars = m.rows.map((r, i) => ({
      pct: pctOf(i, m.rows.length),
      h: (r.share / Math.max(1, s.govShare) * 100).toFixed(1) + "%",
      fill: r.share < s.govShare - 0.01 ? "rgba(255,103,31,.45)" : "var(--orange)",
      label: (i % Math.ceil(m.rows.length / 10) === 0 || i === m.rows.length - 1) ? String(i + 1) : ""
    }));

    const taperLabel = taper >= s.years ? "Never — held flat" : "Year " + (taper + 1);

    const employerNote = hasEmployer
      ? `The employer pays ${s.employerShare || 0}% first, so the government's ${s.govShare}% applies to what is left: ${effShare.toFixed(0)}% of the full contribution. Total public cost over ${m.N} years falls to ${money(m.total)}, with ${money(m.totalEmployer)} carried by employers.`
      : `Own-account workers have no employer, so the split is only between the state and the worker. Pick a subgroup with an employer in step 1 to add a third payer.`;

    const shareNote = s.govShare === 0
      ? "With no subsidy the worker pays the whole floor. This is the status quo in most voluntary schemes — and why coverage stalls."
      : s.govShare >= 100
      ? "A fully paid contribution removes every affordability barrier, but crowds out other spending unless it tapers."
      : s.govShare >= 50
      ? "At or above half, the state matches or beats what a formal employer would pay — the level that has actually moved coverage in Mongolia, Costa Rica and Cabo Verde."
      : "Below half, the worker still carries more than a formal employee would. Expect take-up to lag.";

    const taperNote = taper >= s.years
      ? `The subsidy stays at ${m.rows[0].share.toFixed(0)}% of the full contribution${hasEmployer ? " — " + s.govShare + "% of the " + (100 - (s.employerShare || 0)) + "% the employer does not cover" : ""} for the whole ${s.years} years. Simple to administer, but the bill never falls — and it never asks workers whose earnings have grown to take on more.`
      : `From year ${taper + 1} the government share falls in a straight line from ${m.rows[0].share.toFixed(0)}% of the full contribution to zero by year ${s.years}, reaching ${m.last.share.toFixed(0)}% in the final year. Tapering saves ${money(mNoTaper.total - m.total)} against holding it flat — the standard argument being that a subsidy is there to get workers in, not to pay for them forever.`;

    return `<div>
      <div class="eyebrow">STEP 3 · WHO PAYS WHICH PART?</div>
      <h2 class="step-h2">Government pays <span class="live">${effShare.toFixed(0)}% of the full contribution</span>.</h2>
      <p class="lead">Formal employees split contributions with an employer. Where an informal worker does have one — a household employing a domestic worker, a contractor putting out piece work — that share comes off before any subsidy.</p>
      <div class="pay-bar">
        ${employerSeg}
        <div class="pay-seg gov" style="width:${Math.max(0, effShare)}%">
          <span class="role">GOVERNMENT</span>
          <span class="amt tnum">${dollars(s.contrib * effShare / 100)}/mo</span>
        </div>
        <div class="pay-seg worker">
          <span class="role">WORKER</span>
          <span class="amt tnum">${dollars(Math.max(0, s.contrib * workerPct / 100))}/mo</span>
        </div>
      </div>
      <div class="ctrl-row" style="margin-bottom:16px">
        <div class="ctrl-head">
          <label for="c-employer" class="ctrl-label">Employer's share of the contribution</label>
          <span class="ctrl-value tnum" id="val-employerShare">${s.employerShare || 0}%</span>
        </div>
        <input id="c-employer" type="range" min="0" max="100" step="5" value="${s.employerShare || 0}" data-key="employerShare" aria-label="Employer share of the contribution">
        <p class="ctrl-note">${employerNote}</p>
      </div>
      <div class="ctrl-row" style="margin-bottom:18px">
        <div class="ctrl-head">
          <label for="c-gov" class="ctrl-label">Government share of the contribution</label>
          <span class="ctrl-value tnum" id="val-govShare">${s.govShare}%</span>
        </div>
        <input id="c-gov" type="range" min="0" max="100" step="5" value="${s.govShare}" data-key="govShare" aria-label="Government share of contribution">
      </div>
      <div class="note-box brown" style="margin-bottom:18px">${shareNote}</div>
      <div class="taper-block">
        <div class="ctrl-head">
          <label for="c-taper" class="ctrl-label">Government starts reducing the subsidy after</label>
          <span class="ctrl-value tnum" id="val-decreaseAfter">${taperLabel}</span>
        </div>
        <input id="c-taper" type="range" min="0" max="${s.years}" step="1" value="${taper}" data-key="decreaseAfter" aria-label="Year the government starts reducing the subsidy">
        <div class="taper-chart">
          <div class="taper-bars">
            ${taperBars.map(t => `<div class="taper-bar" style="left:${t.pct};height:${t.h};background:${t.fill}"></div>`).join("")}
            <div class="taper-baseline"></div>
            ${taperBars.map(t => `<div class="taper-tick-label" style="left:${t.pct}">${t.label}</div>`).join("")}
          </div>
        </div>
        <div class="taper-caption">Government share of each full contribution, by year — ${m.rows[0].share.toFixed(0)}% at the start, ${m.last.share.toFixed(0)}% in year ${s.years}.</div>
        <div class="note-box orange">${taperNote}</div>
      </div>
    </div>`;
  }

  function renderStep4(s, d) {
    const m = d.m;
    const covW = 608, covH = 170;
    const cv = m.rows.map(r => r.enrolled);
    const cMax = Math.max.apply(null, cv) * 1.12 || 1;
    const cn = cv.length;
    const cgap = cn > 20 ? 2 : Math.max(3, 50 / cn);
    const cbw = (covW - (cn - 1) * cgap) / cn;
    const cEvery = Math.ceil(cn / 12);
    const covTicksArr = ticks(cMax, covH, people);
    const covBars = cv.map((v, i) => {
      const h = (v / cMax) * covH, x = i * (cbw + cgap);
      return {
        x: x.toFixed(1), w: cbw.toFixed(1),
        pct: ((x + cbw / 2) / covW * 100).toFixed(3) + "%",
        y: (covH - h).toFixed(1), h: h.toFixed(1),
        fill: i === cn - 1 ? "var(--orange)" : "rgba(255,103,31,.45)",
        label: (i % cEvery === 0 || i === cn - 1) ? String(i + 1) : ""
      };
    });

    const gridLines = covTicksArr.map(y => `<line x1="0" y1="${y.y}" x2="${covW}" y2="${y.y}" stroke="rgba(94,81,77,.12)"></line>`).join("");
    const rects = covBars.map(b => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${b.fill}" rx="2"></rect>`).join("");
    const yLabels = covTicksArr.map(y => `<div class="chart-ytick" style="top:${y.pct}">${y.label}</div>`).join("");
    const xLabels = covBars.map(b => `<div class="chart-xlabel" style="left:${b.pct}">${b.label}</div>`).join("");

    return `<div>
      <div class="eyebrow">STEP 4 · HOW MANY SIGN UP?</div>
      <h2 class="step-h2">By year ${s.years}, <span class="live">${people(m.last.enrolled)}</span> workers are contributing.</h2>
      <p class="lead">Take-up is what drives cost — not the subsidy rate. Nobody enrols everyone in year one.</p>
      <div class="chart-wrap">
        <div class="chart-inner">
          <svg viewBox="0 0 ${covW} ${covH}" role="img" aria-label="Workers enrolled by year">${gridLines}${rects}</svg>
          ${yLabels}${xLabels}
        </div>
      </div>
      <div class="step4-sliders">
        <div class="ctrl-row">
          <div class="ctrl-head">
            <label for="c-signup" class="ctrl-label">Sign up immediately</label>
            <span class="ctrl-value tnum" id="val-signup">${s.signup}%</span>
          </div>
          <input id="c-signup" type="range" min="0" max="100" step="1" value="${s.signup}" data-key="signup" aria-label="Percentage signing up immediately">
        </div>
        <div class="ctrl-row">
          <div class="ctrl-head">
            <label for="c-growth" class="ctrl-label">Added each year after</label>
            <span class="ctrl-value tnum" id="val-signupGrowth">+${s.signupGrowth}%/yr</span>
          </div>
          <input id="c-growth" type="range" min="0" max="100" step="0.5" value="${s.signupGrowth}" data-key="signupGrowth" aria-label="Additional sign-up percentage per year">
        </div>
        <div class="ctrl-row">
          <div class="ctrl-head">
            <label for="c-years" class="ctrl-label">Years modelled</label>
            <span class="ctrl-value tnum" id="val-years">${s.years}</span>
          </div>
          <input id="c-years" type="range" min="3" max="35" step="1" value="${s.years}" data-key="years" aria-label="Years modelled">
        </div>
      </div>
    </div>`;
  }

  function renderStep5(s, d) {
    const m = d.m;
    const country = s.country;
    const spendBasis = s.spendBasis || "actual";
    const headline = `${m.pctGdp.toFixed(3)}% of GDP a year would cover ${people(m.last.enrolled)} workers by year ${m.N}.`;
    const subhead = `That's ${usd(Math.round(m.total))} in total public cost over ${m.N} years — ${m.pctSpend.toFixed(2)}% of ${country}'s annual government expenditure, or ${m.totalPctGdp.toFixed(2)}% of one year's GDP.`;

    const closing = `For that, ${people(m.last.enrolled)} workers in informal employment gain a contribution record and a savings balance — a worker who joins in year 1 builds up ${usd(Math.round(m.perWorker.fund))} by year ${m.N}. The barrier is affordability, not willingness.`;

    const spendBasisNote = spendBasis === "actual"
      ? `Measured against ${country}'s reported ${m.c.expLevel} expenditure, ${m.c.expPct}% of GDP (${money(m.spendUsed)} a year) — ${m.c.expSrc}. Held constant across the horizon.`
      : `Measured against an assumed ${s.spend}% of GDP (${money(m.spendUsed)} a year) instead of the reported ${m.c.expPct}%.`;

    // Dual-axis chart: orange bars (annual public cost, left axis) + brown
    // line (that year's cost as % of GDP, right axis), both on bar centres.
    const chW = 608, chH = 168;
    const rows = m.rows;
    const cn = rows.length;
    const cgap = cn > 20 ? 2 : Math.max(3, 50 / cn);
    const cbw = (chW - (cn - 1) * cgap) / cn;
    const cEvery = Math.ceil(cn / 12);
    const govVals = rows.map(r => r.gov);
    const pctVals = rows.map(r => r.gov / m.c.gdp * 100);
    const leftMax = Math.max.apply(null, govVals) * 1.12 || 1;
    const rightMax = Math.max.apply(null, pctVals) * 1.12 || 1;
    const leftTicks = ticks(leftMax, chH, money);
    const rightTicks = ticks(rightMax, chH, v => v.toFixed(3) + "%");
    const bars = govVals.map((v, i) => {
      const h = (v / leftMax) * chH, x = i * (cbw + cgap);
      return {
        x: x.toFixed(1), w: cbw.toFixed(1), y: (chH - h).toFixed(1), h: h.toFixed(1),
        pct: ((x + cbw / 2) / chW * 100).toFixed(3) + "%",
        label: (i % cEvery === 0 || i === cn - 1) ? String(rows[i].t) : ""
      };
    });
    const linePts = pctVals.map((v, i) => ({
      x: i * (cbw + cgap) + cbw / 2,
      y: chH - (v / rightMax) * chH
    }));
    const linePath = linePts.map((p, i) => (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ");
    const gridLines = leftTicks.map(y => `<line x1="0" y1="${y.y}" x2="${chW}" y2="${y.y}" stroke="rgba(94,81,77,.12)"></line>`).join("");
    const barRects = bars.map(b => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="var(--orange)" rx="2"></rect>`).join("");
    const dots = linePts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.2" fill="var(--brown)" stroke="var(--panel)" stroke-width="1.5"></circle>`).join("");
    const leftLabels = leftTicks.map(y => `<div class="chart-ytick chart-ytick-left" style="top:${y.pct}">${y.label}</div>`).join("");
    const rightLabels = rightTicks.map(y => `<div class="chart-ytick chart-ytick-right" style="top:${y.pct}">${y.label}</div>`).join("");
    const xLabels = bars.map(b => `<div class="chart-xlabel" style="left:${b.pct}">${b.label}</div>`).join("");

    return `<div>
      <div class="eyebrow">THE ANSWER</div>
      <h2 class="answer-h2">${headline}</h2>
      <p class="lead" style="max-width:62ch">${subhead}</p>
      <div class="cost-chart-panel">
        <div class="cost-chart-head">
          <span class="cost-chart-title">Public cost, year by year</span>
          <div class="cost-chart-legend">
            <span class="legend-item"><span class="legend-swatch bar"></span>Total public cost</span>
            <span class="legend-item"><span class="legend-swatch line"></span>% of GDP</span>
          </div>
        </div>
        <div class="chart-wrap2">
          <div class="chart-inner" style="aspect-ratio:${chW}/${chH}">
            <svg viewBox="0 0 ${chW} ${chH}" role="img" aria-label="Annual public cost and its share of GDP, by year">
              ${gridLines}${barRects}
              <path d="${linePath}" fill="none" stroke="var(--brown)" stroke-width="2.5"></path>
              ${dots}
            </svg>
            ${leftLabels}${rightLabels}${xLabels}
          </div>
        </div>
        <p class="cost-chart-caption">Year of the programme · left axis total public cost, right axis share of GDP</p>
      </div>
      <p class="closing">${closing}</p>
      <div class="econ-panel">
        <div class="econ-head">
          <span class="sources-eyebrow">ECONOMIC ASSUMPTIONS</span>
          <span class="rt">In today's money: <strong class="tnum" style="color:var(--brown)">${usd(Math.round(m.totalReal))}</strong> · if the contribution floor is uprated with inflation: <strong class="tnum" style="color:var(--brown)">${usd(Math.round(m.totalUprated))}</strong></span>
        </div>
        <div class="econ-grid">
          <div class="ctrl-row">
            <div class="ctrl-head">
              <label for="c-inflation" class="ctrl-label">Inflation rate</label>
              <span class="ctrl-value tnum" id="val-inflation">${s.inflation}%</span>
            </div>
            <input id="c-inflation" type="range" min="-2" max="30" step="0.1" value="${s.inflation}" data-key="inflation" aria-label="Inflation rate">
          </div>
          <div class="ctrl-row">
            <div class="ctrl-head">
              <label for="c-interest" class="ctrl-label">Interest on contributions</label>
              <span class="ctrl-value tnum" id="val-interest">${s.interest}%</span>
            </div>
            <input id="c-interest" type="range" min="0" max="20" step="0.5" value="${s.interest}" data-key="interest" aria-label="Interest rate on accumulated contributions">
          </div>
          <div>
            <div class="ctrl-label" style="margin-bottom:6px">Denominator for "% of government spending"</div>
            <div class="toggle-group">
              <button type="button" class="toggle-btn${spendBasis === "actual" ? " active" : ""}" style="flex:1" data-action="spend-actual"${m.c.expReported ? "" : " disabled title=\"Not reported by the World Bank for this country\""}>${m.c.expReported ? `Reported (${m.c.expPct}% of GDP)` : "Not reported for this country"}</button>
              <button type="button" class="toggle-btn${spendBasis === "assumed" ? " active" : ""}" style="flex:1" data-action="spend-assumed">Assume % of GDP</button>
            </div>
            ${spendBasis === "assumed" ? `
            <div class="ctrl-row" style="margin-top:10px">
              <div class="ctrl-head">
                <label for="c-spend" class="ctrl-label">Assumed government spending</label>
                <span class="ctrl-value tnum" id="val-spend">${s.spend}% of GDP</span>
              </div>
              <input id="c-spend" type="range" min="5" max="60" step="1" value="${s.spend}" data-key="spend" aria-label="Assumed government spending as a share of GDP">
            </div>` : ""}
          </div>
        </div>
        <p class="econ-note">${spendBasisNote}</p>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-copy" data-action="copy">${s.copied ? "Summary copied ✓" : "Copy this summary"}</button>
        <button type="button" class="btn btn-csv" data-action="download-csv">Download the data (CSV)</button>
        <button type="button" class="btn btn-ghost" data-action="restart">Change the assumptions</button>
      </div>
    </div>`;
  }

  function renderSources(s, d) {
    const m = d.m;
    const assumptions = [
      "Population growth, workforce participation, inflation and so on are kept constant throughout the simulation.",
      "It is assumed that informal workers will contribute the minimum and the government will match that according to the government share.",
      "Percentage of informal workers who sign up for social security immediately: refers to how many people will sign up immediately upon introduction of the program.",
      "Additional sign up percentage per year: additional percentage points of how many informal workers will sign up each year following the introduction. Presumably the participation rate will slowly increase with time."
    ];
    const sourceNote = `World Bank data (World Development Indicators), retrieved via the World Bank API / wbstats R package for population, growth, inflation, labor force participation, working-age share and GDP. Government expenditure for ${s.country}: ${m.c.expReported ? `${m.c.expLevel}, ${m.c.expPct}% of GDP (${m.c.expSrc})` : m.c.expSrc}.`;
    const body = s.notesOpen ? `
      <div class="sources-grid">
        <div class="sources-col">
          <span class="sources-col-title">Assumptions</span>
          ${assumptions.map(a => `<p class="assumption-p">${a}</p>`).join("")}
        </div>
        <div class="sources-col">
          <span class="sources-col-title">Data sources</span>
          <p class="source-note">${sourceNote}</p>
          <a class="source-link" href="https://documents.worldbank.org/en/publication/documents-reports/api" target="_blank" rel="noopener">World Bank API documentation ↗</a>
          <a class="source-link" href="https://cran.r-project.org/web/packages/wbstats/vignettes/wbstats.html" target="_blank" rel="noopener">wbstats R package vignette ↗</a>
          <p class="source-caveat">Subgroup sizes and employer shares are structural placeholders pending WIEGO's own values. Informal employment share isn't a World Bank indicator — Kenya, Ghana, India, South Africa, Mexico and Peru use figures researched for this calculator; every other country defaults to a rough placeholder by income level, always adjustable with the slider above.</p>
        </div>
      </div>` : "";
    return `<div class="sources">
      <div class="sources-head">
        <span class="sources-eyebrow">SOURCES &amp; ASSUMPTIONS</span>
        <button type="button" class="ghost-btn-gray" data-action="toggle-notes">${s.notesOpen ? "Hide" : "Show"}</button>
      </div>
      ${body}
    </div>`;
  }

  function renderNav(s) {
    const backDisabled = s.step === 1;
    const nextLabel = s.step === 4 ? "See the cost →" : "Next →";
    const nextVis = s.step === 5 ? "hidden" : "visible";
    return `<div class="navbar">
      <button type="button" class="nav-back" data-action="back" style="color:${backDisabled ? "rgba(94,81,77,.35)" : "var(--khaki-dark)"};cursor:${backDisabled ? "default" : "pointer"}">← Back</button>
      <span class="nav-progress">Step ${s.step} of 5</span>
      <button type="button" class="nav-next" data-action="next" style="visibility:${nextVis}">${nextLabel}</button>
    </div>`;
  }

  function render() {
    const d = computeDerived(state);
    let stepHtml;
    if (state.step === 1) stepHtml = renderStep1(state, d);
    else if (state.step === 2) stepHtml = renderStep2(state, d);
    else if (state.step === 3) stepHtml = renderStep3(state, d);
    else if (state.step === 4) stepHtml = renderStep4(state, d);
    else stepHtml = renderStep5(state, d);

    // A `change` on a slider or select rebuilds the whole card. If that
    // element (e.g. a range input) had keyboard focus, recreating the DOM
    // drops it — breaking repeated arrow-key presses. Restore focus to the
    // same id afterward so keyboard interaction keeps working.
    const activeId = document.activeElement && document.activeElement.id;

    el.innerHTML =
      renderHeader(state) +
      renderIntro(state) +
      `<div class="step-body">${stepHtml}${renderSources(state, d)}${renderNav(state)}</div>`;

    if (activeId) {
      const toFocus = document.getElementById(activeId);
      if (toFocus) toFocus.focus({ preventScroll: true });
    }
  }

  // ---------- actions ----------

  function doCopy() {
    const s = state, d = computeDerived(s), m = d.m, taper = d.taper;
    const txt = s.country + " — social security subsidy for informal workers\n"
      + "Eligible: " + (s.subgroup ? s.subgroupName + " (" + s.subgroupPct + "% of informal workers)" : "all workers in informal employment") + ".\n"
      + ((s.employerShare || 0) > 0 ? "Employers pay " + s.employerShare + "% of each contribution first (" + money(m.totalEmployer) + " over the horizon), so the government's " + s.govShare + "% applies to the remainder.\n" : "")
      + "Assumptions: $" + s.contrib + "/month minimum contribution, " + s.govShare + "% government share, "
      + (taper >= s.years ? "subsidy held flat, " : "subsidy tapering from year " + (taper + 1) + " to zero by year " + s.years + ", ")
      + s.signup + "% immediate take-up rising " + s.signupGrowth + "pp a year, " + s.years + "-year horizon, "
      + s.inflation + "% inflation, " + s.interest + "% interest.\n"
      + "Measured against " + ((s.spendBasis || "actual") === "actual" ? "reported " + m.c.expLevel + " expenditure (" + m.c.expSrc + ") of " : "an assumed " + s.spend + "% of GDP, ")
      + money(m.spendUsed) + " a year.\n"
      + "Cost: " + m.pctSpend.toFixed(2) + "% of annual government expenditure, " + m.pctGdp.toFixed(3) + "% of GDP a year, "
      + m.totalPctGdp.toFixed(2) + "% of one year's GDP over the full horizon.\n"
      + "Total government cost: " + usd(Math.round(m.total)) + " (" + m.pctSpend.toFixed(2) + "% of annual government spending).\n"
      + "Workers covered by year " + m.N + ": " + num(m.last.enrolled) + ".\n"
      + "Accumulated savings per worker joining in year 1: " + usd(Math.round(m.perWorker.fund)) + ".";
    if (navigator.clipboard) navigator.clipboard.writeText(txt);
    state.copied = true;
    render();
    setTimeout(() => { state.copied = false; render(); }, 2200);
  }

  function doDownloadCsv() {
    const s = state, d = computeDerived(s), m = d.m, taper = d.taper;
    const head = "Year,Population,Informal workers,Enrolled workers,Government share %,Government cost,Employer cost,Worker cost,Cumulative government cost";
    const body = m.rows.map(r => [r.year, Math.round(r.pop), Math.round(r.informal), Math.round(r.enrolled), r.share.toFixed(1), Math.round(r.gov), Math.round(r.employer), Math.round(r.worker), Math.round(r.cum)].join(","));
    const meta = [
      "# " + s.country + " — WIEGO social security subsidy model",
      "# Eligible group," + (s.subgroup ? s.subgroupName : "All informal workers"),
      "# Subgroup share of informal workers %," + (s.subgroup ? s.subgroupPct : 100),
      "# Government expenditure basis," + ((s.spendBasis || "actual") === "actual" ? "reported " + m.c.expLevel + " expenditure (" + m.c.expSrc + ")" : "assumed % of GDP"),
      "# Government expenditure used (USD/yr)," + Math.round(m.spendUsed),
      "# Government spending % of GDP," + m.spendPctGdp.toFixed(2),
      "# Average annual cost % of gov expenditure," + m.pctSpend.toFixed(3),
      "# Average annual cost % of GDP," + m.pctGdp.toFixed(4),
      "# Cumulative cost % of one year GDP," + m.totalPctGdp.toFixed(3),
      "# Subsidy taper starts after year," + (taper >= s.years ? "never" : taper),
      "# Employer share %," + (s.employerShare || 0),
      "# Total employer contributions," + Math.round(m.totalEmployer),
      "# Monthly minimum contribution," + s.contrib, "# Government share %," + s.govShare,
      "# Immediate take-up %," + s.signup, "# Take-up growth pp/yr," + s.signupGrowth,
      "# Informal employment %," + s.informal, "# Inflation %," + s.inflation, "# Interest %," + s.interest,
      "# Years," + s.years, "# Total government cost," + Math.round(m.total), ""
    ];
    const blob = new Blob([meta.concat(head, body).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wiego-subsidy-" + s.country.toLowerCase().replace(/ /g, "-") + "-" + s.years + "yr.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------- events ----------

  el.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    switch (btn.dataset.action) {
      case "goto-step": state.step = parseInt(btn.dataset.step, 10); break;
      case "toggle-about": state.aboutOpen = !state.aboutOpen; break;
      case "toggle-notes": state.notesOpen = !state.notesOpen; break;
      case "scope-all": state.subgroup = false; state.employerShare = 0; break;
      case "scope-subgroup": state.subgroup = true; break;
      case "pick-subgroup": {
        const g = SUBGROUPS.find(x => x.name === btn.dataset.name);
        if (g) { state.subgroup = true; state.subgroupName = g.name; state.subgroupPct = g.pct; state.employerShare = g.employer; }
        break;
      }
      case "spend-actual": state.spendBasis = "actual"; break;
      case "spend-assumed": state.spendBasis = "assumed"; break;
      case "copy": doCopy(); return;
      case "download-csv": doDownloadCsv(); return;
      case "restart": state.step = 1; break;
      case "back": state.step = Math.max(1, state.step - 1); break;
      case "next": state.step = Math.min(5, state.step + 1); break;
      default: return;
    }
    render();
  });

  el.addEventListener("input", function (e) {
    const t = e.target;
    if (t.tagName !== "INPUT" || t.type !== "range") return;
    const key = t.dataset.key;
    const v = INT_KEYS.has(key) ? parseInt(t.value, 10) : parseFloat(t.value);
    const span = document.getElementById("val-" + key);
    if (span && LIVE_FORMAT[key]) span.textContent = LIVE_FORMAT[key](v);
  });

  el.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.id === "c-contrib") e.target.blur();
  });

  el.addEventListener("change", function (e) {
    const t = e.target;
    if (t.tagName === "SELECT" && t.id === "c-country") {
      Object.assign(state, countryDefaults(t.value), { country: t.value });
      render();
      return;
    }
    if (t.id === "c-contrib") {
      // Free numeric entry (0.5-500): a non-numeric value is left exactly
      // as typed, without touching the model, so the user can keep editing
      // rather than having the field snap back mid-correction.
      const parsed = parseFloat(t.value);
      if (Number.isFinite(parsed)) {
        state.contrib = Math.min(500, Math.max(0.5, parsed));
        render();
      }
      return;
    }
    if (t.tagName !== "INPUT" || t.type !== "range") return;
    const key = t.dataset.key;
    const v = INT_KEYS.has(key) ? parseInt(t.value, 10) : parseFloat(t.value);
    state[key] = v;
    if (key === "years") {
      state.decreaseAfter = Math.min(state.decreaseAfter === undefined ? v : state.decreaseAfter, v);
    }
    render();
  });

  render();
})();
