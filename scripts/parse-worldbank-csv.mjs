#!/usr/bin/env node
/**
 * Regenerate app/model.js's CC country table from a World Bank DataBank
 * CSV export (World Development Indicators).
 *
 * Get the export from https://databank.worldbank.org/source/world-development-indicators
 * — select all countries, the last 3-5 years, and these series:
 *   SP.POP.TOTL, SP.POP.GROW, FP.CPI.TOTL.ZG, SL.TLF.CACT.ZS,
 *   SP.POP.1564.TO.ZS, NY.GDP.MKTP.CD, GC.XPN.TOTL.GD.ZS
 * Download as CSV, unzip, and pass the "..._Data.csv" file here:
 *
 *   node app/scripts/parse-worldbank-csv.mjs path/to/..._Data.csv
 *
 * Prints the regenerated `const CC = { ... }` block to stdout — paste it
 * into app/model.js in place of the existing CC constant. See
 * lib/build-cc.mjs for the shared logic on informal-employment
 * placeholders and unreported government expenditure (this script only
 * handles getting World Bank fields out of the CSV).
 */

import { readFileSync } from "node:fs";
import { buildCCEntries, serializeCC } from "./lib/build-cc.mjs";

const [, , csvPath] = process.argv;
if (!csvPath) {
  console.error("Usage: node parse-worldbank-csv.mjs path/to/..._Data.csv");
  process.exit(1);
}

const SERIES_MAP = {
  "Population, total": "pop",
  "Population growth (annual %)": "growth",
  "Inflation, consumer prices (annual %)": "inflation",
  "Labor force participation rate, total (% of total population ages 15+) (modeled ILO estimate)": "lfp",
  "Population ages 15-64 (% of total population)": "workingAge",
  "GDP (current US$)": "gdp",
  "Expense (% of GDP)": "expPct"
};

// World Bank regional/income-group/lending-group aggregates to exclude —
// these share the same CSV shape as real countries but aren't one. (The
// DataBank CSV export doesn't include a region/aggregate flag column, so
// this is a name-pattern filter rather than structured metadata.)
const AGGREGATE_RE = new RegExp([
  "\\bWorld\\b", "income\\b", "IDA\\b", "IBRD\\b", "dividend", "small states",
  "East Asia", "Europe &", "Latin America", "Middle East", "North America",
  "South Asia", "Sub-Saharan Africa", "Africa (Eastern|Western)", "Arab World",
  "Euro area", "European Union", "OECD", "HIPC", "developed countries",
  "Not classified", "Central Europe and the Baltics", "Caribbean small states",
  "conflict", "fragile", "demographic"
].join("|"), "i");

// Minimal CSV parser: handles quoted fields with embedded commas, no
// embedded newlines (the WDI export doesn't produce those).
function parseCsv(text) {
  return text.split(/\r?\n/).filter(Boolean).map(line => {
    const cells = [];
    let cur = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ",") { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    return cells;
  });
}

const rows = parseCsv(readFileSync(csvPath, "utf8"));
const header = rows[0];
const yearCols = header.slice(4).map(h => parseInt(h, 10));

const dataByCode = {};
for (const row of rows.slice(1)) {
  if (row.length < 5) continue;
  const [name, code, seriesName] = row;
  const field = SERIES_MAP[seriesName];
  if (!field || !code || AGGREGATE_RE.test(name)) continue;
  let chosen = null;
  for (let i = yearCols.length - 1; i >= 0; i--) {
    const raw = (row[4 + i] || "").trim();
    if (raw && raw !== "..") { chosen = { value: parseFloat(raw), year: yearCols[i] }; break; }
  }
  dataByCode[code] ??= { name };
  dataByCode[code][field] = chosen;
}

const entries = buildCCEntries(dataByCode);
console.log(serializeCC(entries));
console.error(`\n${entries.length} countries with complete data (of ${Object.keys(dataByCode).length} non-aggregate rows seen).`);
