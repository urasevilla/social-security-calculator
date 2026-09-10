#!/usr/bin/env node
/**
 * Refresh app/model.js's country table (CC) with live World Bank data.
 *
 * Sources (as specified by WIEGO for this calculator):
 *   https://documents.worldbank.org/en/publication/documents-reports/api
 *   https://cran.r-project.org/web/packages/wbstats/vignettes/wbstats.html
 *
 * This hits the same World Bank API (v2, JSON) that the wbstats R package
 * wraps, using mrnev=1 ("most recent non-empty value") per indicator so
 * each field lands on whatever year that country last reported it.
 *
 * Usage:  node app/scripts/fetch-worldbank-data.mjs
 * Requires network access to api.worldbank.org. Prints the regenerated
 * `CC` object to stdout — paste it into app/model.js in place of the
 * existing CC constant (or pipe/redirect and splice it in).
 *
 * NOTE: government expenditure (expPct/expLevel/expSrc) and informal
 * employment share (informal) are deliberately NOT fetched here — per the
 * design handoff README, those come from IMF/RBI and WIEGO/ILO
 * respectively, not the World Bank API. Keep the existing values for
 * those two fields when splicing in the refreshed output below.
 */

const COUNTRIES = {
  Kenya: "KE",
  Ghana: "GH",
  India: "IN",
  "South Africa": "ZA",
  Mexico: "MX",
  Peru: "PE"
};

// World Development Indicators used to populate CC.
const INDICATORS = {
  pop: "SP.POP.TOTL",           // Population, total
  growth: "SP.POP.GROW",        // Population growth (annual %)
  inflation: "FP.CPI.TOTL.ZG",  // Inflation, consumer prices (annual %)
  lfp: "SL.TLF.CACT.ZS",        // Labor force participation rate, total (% ages 15+, modeled ILO estimate)
  workingAge: "SP.POP.1564.TO.ZS", // Population ages 15-64 (% of total population)
  gdp: "NY.GDP.MKTP.CD"         // GDP (current US$)
};

const BASE = "https://api.worldbank.org/v2";

async function fetchIndicator(iso2Codes, indicator) {
  const url = `${BASE}/country/${iso2Codes.join(";")}/indicator/${indicator}?format=json&mrnev=1&per_page=200`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${indicator}: HTTP ${res.status}`);
  const json = await res.json();
  const rows = json[1] || [];
  const byCountry = {};
  for (const row of rows) {
    if (row.value === null || row.value === undefined) continue;
    byCountry[row.country.value] = { value: row.value, year: row.date };
  }
  return byCountry;
}

async function main() {
  const iso2Codes = Object.values(COUNTRIES);
  const results = {};
  for (const [key, indicator] of Object.entries(INDICATORS)) {
    results[key] = await fetchIndicator(iso2Codes, indicator);
  }

  const lines = [];
  lines.push("const CC = {");
  for (const name of Object.keys(COUNTRIES)) {
    const pop = results.pop[name];
    const growth = results.growth[name];
    const inflation = results.inflation[name];
    const lfp = results.lfp[name];
    const workingAge = results.workingAge[name];
    const gdp = results.gdp[name];
    if (!pop || !growth || !inflation || !lfp || !workingAge || !gdp) {
      console.error(`Missing data for ${name}, skipping — check indicator availability.`);
      continue;
    }
    lines.push(
      `  ${JSON.stringify(name)}: { pop: ${Math.round(pop.value)}, growth: ${growth.value.toFixed(2)}, ` +
      `inflation: ${inflation.value.toFixed(2)}, lfp: ${lfp.value.toFixed(1)}, workingAge: ${workingAge.value.toFixed(2)}, ` +
      `gdp: ${Math.round(gdp.value)}, /* pop:${pop.year} growth:${growth.year} inflation:${inflation.year} lfp:${lfp.year} workingAge:${workingAge.year} gdp:${gdp.year} */ ` +
      `informal: /* keep existing, WIEGO/ILO-sourced */ 0, spend: /* keep existing */ 0, ` +
      `expPct: /* keep existing, IMF/RBI-sourced */ 0, expLevel: /* keep existing */ "", expSrc: /* keep existing */ "" },`
    );
  }
  lines.push("};");
  console.log(lines.join("\n"));
  console.log("\n// Fetched " + new Date().toISOString() + " from " + BASE);
}

main().catch(err => {
  console.error("Fetch failed:", err.message);
  console.error("If this is EGRESS_BLOCKED / network error, api.worldbank.org is not reachable from this environment.");
  process.exit(1);
});
