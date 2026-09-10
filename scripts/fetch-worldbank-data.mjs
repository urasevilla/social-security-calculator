#!/usr/bin/env node
/**
 * Regenerate app/model.js's CC country table from a *live* World Bank API
 * call, covering every country (not just a hand-picked few).
 *
 * Sources (as specified by WIEGO for this calculator):
 *   https://documents.worldbank.org/en/publication/documents-reports/api
 *   https://cran.r-project.org/web/packages/wbstats/vignettes/wbstats.html
 *
 * This hits the same World Bank API (v2, JSON) that the wbstats R package
 * wraps, querying country="all" and using mrnev=1 ("most recent
 * non-empty value") per indicator so each field lands on whatever year
 * that country last reported it. Real countries are distinguished from
 * WB's regional/income-group aggregates via each row's `region.value`
 * field (aggregates report region "Aggregates").
 *
 * Usage:  node app/scripts/fetch-worldbank-data.mjs
 * Requires network access to api.worldbank.org. Prints the regenerated
 * `const CC = { ... }` block to stdout — paste it into app/model.js in
 * place of the existing CC constant.
 *
 * See lib/build-cc.mjs for the shared logic on informal-employment
 * placeholders and unreported government expenditure (this script only
 * handles getting World Bank fields out of the API).
 */

import { buildCCEntries, serializeCC } from "./lib/build-cc.mjs";

const INDICATORS = {
  pop: "SP.POP.TOTL",              // Population, total
  growth: "SP.POP.GROW",           // Population growth (annual %)
  inflation: "FP.CPI.TOTL.ZG",     // Inflation, consumer prices (annual %)
  lfp: "SL.TLF.CACT.ZS",           // Labor force participation rate, total (% ages 15+, modeled ILO estimate)
  workingAge: "SP.POP.1564.TO.ZS", // Population ages 15-64 (% of total population)
  gdp: "NY.GDP.MKTP.CD",           // GDP (current US$)
  expPct: "GC.XPN.TOTL.GD.ZS"      // Expense (% of GDP) — general government, per IMF GFS Manual
};

const BASE = "https://api.worldbank.org/v2";

async function fetchIndicator(indicator) {
  const byCode = {};
  let page = 1, pages = 1;
  do {
    const url = `${BASE}/country/all/indicator/${indicator}?format=json&mrnev=1&per_page=400&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${indicator}: HTTP ${res.status}`);
    const json = await res.json();
    const meta = json[0] || {};
    pages = meta.pages || 1;
    for (const row of json[1] || []) {
      if (row.value === null || row.value === undefined) continue;
      if (row.region && row.region.value === "Aggregates") continue; // skip WB regional/income aggregates
      byCode[row.countryiso3code || row.country.id] = { name: row.country.value, value: row.value, year: row.date };
    }
    page++;
  } while (page <= pages);
  return byCode;
}

async function main() {
  const results = {};
  for (const [field, indicator] of Object.entries(INDICATORS)) {
    results[field] = await fetchIndicator(indicator);
  }

  const codes = new Set();
  for (const byCode of Object.values(results)) for (const code of Object.keys(byCode)) codes.add(code);

  const dataByCode = {};
  for (const code of codes) {
    const name = (results.pop[code] || results.gdp[code] || {}).name;
    if (!name) continue;
    dataByCode[code] = { name };
    for (const field of Object.keys(INDICATORS)) {
      const hit = results[field][code];
      if (hit) dataByCode[code][field] = { value: hit.value, year: hit.year };
    }
  }

  const entries = buildCCEntries(dataByCode);
  console.log(serializeCC(entries));
  console.error(`\n${entries.length} countries with complete data, fetched ${new Date().toISOString()} from ${BASE}`);
}

main().catch(err => {
  console.error("Fetch failed:", err.message);
  console.error("If this is EGRESS_BLOCKED / network error, api.worldbank.org is not reachable from this environment.");
  process.exit(1);
});
