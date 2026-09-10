/**
 * Shared logic for turning raw per-country World Bank indicator values
 * (however they were fetched — CSV export or live API) into the CC table
 * app/model.js expects. Used by both parse-worldbank-csv.mjs (offline,
 * from a DataBank CSV export) and fetch-worldbank-data.mjs (live API), so
 * the two entry paths can't quietly drift out of sync.
 */

export const REQUIRED_FIELDS = ["pop", "growth", "inflation", "lfp", "workingAge", "gdp"];

// Kenya/Ghana/India/South Africa/Mexico/Peru: figures researched for this
// calculator (see model.js's CC comment) — not a World Bank indicator, so
// keep them rather than overwrite with the income-bucketed placeholder.
export const CURATED_INFORMAL = { KEN: 80, GHA: 88, IND: 89, ZAF: 34, MEX: 55, PER: 76 };

// Cross-country median of "Expense (% of GDP)" among countries that report
// it — used as the starting "assumed" value for countries that don't.
export const MEDIAN_EXP = 27;

export function informalDefault(gdp, pop) {
  const perCapita = gdp / pop;
  if (perCapita >= 30000) return 15;
  if (perCapita >= 10000) return 35;
  if (perCapita >= 4000) return 55;
  return 75;
}

/**
 * @param {Record<string, {name: string, pop?, growth?, inflation?, lfp?,
 *   workingAge?, gdp?, expPct?}>} dataByCode - each field (when present) is
 *   {value: number, year: number|string}. `expPct` absent/null means the
 *   country doesn't report it.
 * @returns {[string, object][]} sorted [countryName, ccEntry] pairs, ready
 *   to serialize. Countries missing any REQUIRED_FIELDS are dropped.
 */
export function buildCCEntries(dataByCode) {
  const entries = [];
  for (const [code, d] of Object.entries(dataByCode)) {
    if (REQUIRED_FIELDS.some(f => !d[f])) continue;
    const exp = d.expPct;
    const expReported = !!exp;
    entries.push([d.name, {
      pop: Math.round(d.pop.value),
      growth: Math.round(d.growth.value * 100) / 100,
      inflation: Math.round(d.inflation.value * 100) / 100,
      lfp: Math.round(d.lfp.value * 10) / 10,
      workingAge: Math.round(d.workingAge.value * 100) / 100,
      gdp: Math.round(d.gdp.value),
      informal: CURATED_INFORMAL[code] ?? informalDefault(d.gdp.value, d.pop.value),
      spend: expReported ? Math.round(exp.value * 100) / 100 : MEDIAN_EXP,
      expPct: expReported ? Math.round(exp.value * 100) / 100 : MEDIAN_EXP,
      expReported,
      expLevel: expReported ? "general government" : "",
      expSrc: expReported
        ? `World Bank, Expense (% of GDP), ${exp.year}`
        : "not reported by World Bank — using the cross-country median"
    }]);
  }
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  return entries;
}

export function serializeCC(entries) {
  const lines = ["const CC = {"];
  for (const [name, obj] of entries) {
    const parts = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
    lines.push(`  ${JSON.stringify(name)}: { ${parts} },`);
  }
  lines.push("};");
  return lines.join("\n");
}
