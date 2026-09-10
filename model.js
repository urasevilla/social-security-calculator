/**
 * Pure arithmetic model for the WIEGO social security subsidy calculator.
 * Ported from the Claude Design prototype's `runModel` (see design_handoff
 * bundle README for the full spec). No DOM, no framework dependency.
 */

/**
 * Country data (CC), covering the 168 countries with complete World Bank
 * data for all six model fields, sourced from a CSV export of World
 * Development Indicators (WDI) that WIEGO downloaded from World Bank
 * DataBank (https://databank.worldbank.org/source/world-development-indicators
 * — the same data documented at
 * https://documents.worldbank.org/en/publication/documents-reports/api and
 * wrapped by the wbstats R package,
 * https://cran.r-project.org/web/packages/wbstats/vignettes/wbstats.html).
 * Each country's value is whichever of 2021-2025 that country last
 * reported (years vary per country and per indicator).
 *
 * Per-field provenance:
 *
 *   pop, growth, inflation, lfp, workingAge, gdp
 *     World Bank / WDI. Indicator codes: pop=SP.POP.TOTL,
 *     growth=SP.POP.GROW, inflation=FP.CPI.TOTL.ZG, lfp=SL.TLF.CACT.ZS,
 *     workingAge=SP.POP.1564.TO.ZS, gdp=NY.GDP.MKTP.CD. Countries missing
 *     any of these six in the export are left out of CC entirely (~49
 *     mostly small territories and a few economies WDI has gaps for —
 *     see app/scripts/parse-worldbank-csv.mjs) rather than filled with a
 *     guess.
 *
 *   expPct, expLevel, expSrc (government expenditure, % of GDP)
 *     World Bank / WDI "Expense (% of GDP)", GC.XPN.TOTL.GD.ZS — per its
 *     own indicator definition this targets the general government
 *     sector (IMF Government Finance Statistics Manual). 121 of the 168
 *     countries report it (expReported: true); the other 47 (including
 *     China, Indonesia, Nigeria, Pakistan) don't, and get expReported:
 *     false with expPct set to the ~27% cross-country median — the app
 *     must disable "Reported" and default to "Assume % of GDP" for those.
 *     (Earlier revision used IMF Regional Economic Outlook / RBI actuals
 *     for 6 hand-picked countries; switched to a single World Bank series
 *     for uniform coverage across all 168, per WIEGO's direction.)
 *
 *   informal (% of workers in informal employment)
 *     NOT from the World Bank — informal-employment share is WIEGO/ILO's
 *     domain, not a WDI indicator. Kenya/Ghana/India/South
 *     Africa/Mexico/Peru keep the figures researched in the original
 *     design session; every other country gets a placeholder bucketed by
 *     GDP per capita (>= $30k -> 15%, >= $10k -> 35%, >= $4k -> 55%,
 *     else 75%) so a rich country doesn't default to an absurd informal
 *     share — still just a placeholder, and the slider (10-95%) is
 *     always user-adjustable pending real per-country WIEGO/ILO figures.
 *
 *   spend (default for the hypothetical "assume % of GDP" slider)
 *     Set equal to expPct (or the median, when unreported) so toggling
 *     between "reported" and "assumed" starts from the same number.
 */
const CC = {
  "Afghanistan": { pop: 43844111, growth: 2.77, inflation: -6.6, lfp: 37.5, workingAge: 55.01, gdp: 17778508876, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Albania": { pop: 2349580, growth: -1.17, inflation: 2.15, lfp: 64.3, workingAge: 65.77, gdp: 30540188271, informal: 35, spend: 25.44, expPct: 25.44, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Algeria": { pop: 47435312, growth: 1.32, inflation: 1.42, lfp: 40.8, workingAge: 63.27, gdp: 287031225988, informal: 55, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Angola": { pop: 39040039, growth: 3.0, inflation: 20.16, lfp: 74.8, workingAge: 53.01, gdp: 122174889424, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Argentina": { pop: 45851378, growth: 0.34, inflation: 219.88, lfp: 61.9, workingAge: 66.35, gdp: 683097891619, informal: 35, spend: 21.01, expPct: 21.01, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Armenia": { pop: 3086700, growth: 1.74, inflation: 3.31, lfp: 59.4, workingAge: 66.57, gdp: 29243452882, informal: 55, spend: 20.95, expPct: 20.95, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Australia": { pop: 27614411, growth: 1.53, inflation: 2.87, lfp: 66.5, workingAge: 64.23, gdp: 1798518933689, informal: 15, spend: 27.58, expPct: 27.58, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Austria": { pop: 9208163, growth: 0.33, inflation: 3.53, lfp: 60.1, workingAge: 64.76, gdp: 579470021095, informal: 15, spend: 46.03, expPct: 46.03, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Azerbaijan": { pop: 10246996, growth: 0.43, inflation: 5.62, lfp: 63.3, workingAge: 69.63, gdp: 75937647059, informal: 55, spend: 23.01, expPct: 23.01, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Bahamas, The": { pop: 403033, growth: 0.44, inflation: 0.41, lfp: 73.8, workingAge: 70.36, gdp: 15832800000, informal: 15, spend: 20.35, expPct: 20.35, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Bahrain": { pop: 1600366, growth: 0.73, inflation: -0.14, lfp: 70.4, workingAge: 77.56, gdp: 48965725532, informal: 15, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Bangladesh": { pop: 175686899, growth: 1.22, inflation: 8.77, lfp: 58.8, workingAge: 65.69, gdp: 456319229256, informal: 75, spend: 8.32, expPct: 8.32, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2021" },
  "Barbados": { pop: 282623, growth: 0.06, inflation: 0.85, lfp: 64.7, workingAge: 65.85, gdp: 8016550000, informal: 35, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Belarus": { pop: 9085991, growth: -0.51, inflation: 6.6, lfp: 62.7, workingAge: 65.83, gdp: 93397215864, informal: 35, spend: 28.47, expPct: 28.47, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Belgium": { pop: 11941781, growth: 0.7, inflation: 2.47, lfp: 54.3, workingAge: 63.34, gdp: 725466462860, informal: 15, spend: 39.71, expPct: 39.71, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Belize": { pop: 422924, growth: 1.39, inflation: 1.06, lfp: 59.1, workingAge: 68.5, gdp: 3326500000, informal: 55, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Benin": { pop: 14814460, growth: 2.4, inflation: 1.1, lfp: 76.4, workingAge: 55.59, gdp: 24566420904, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Bhutan": { pop: 796682, growth: 0.65, inflation: 3.56, lfp: 64.8, workingAge: 73.01, gdp: 3579320145, informal: 55, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Bolivia": { pop: 12581843, growth: 1.35, inflation: 19.52, lfp: 78.6, workingAge: 64.82, gdp: 64768947525, informal: 55, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Bosnia and Herzegovina": { pop: 3140095, growth: -0.77, inflation: 6.11, lfp: 49.0, workingAge: 64.29, gdp: 32599982936, informal: 35, spend: 35.3, expPct: 35.3, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Botswana": { pop: 2562122, growth: 1.61, inflation: 2.66, lfp: 68.8, workingAge: 63.96, gdp: 19928479839, informal: 55, spend: 26.53, expPct: 26.53, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2024" },
  "Brazil": { pop: 212812405, growth: 0.38, inflation: 5.02, lfp: 63.1, workingAge: 69.13, gdp: 2279920092492, informal: 35, spend: 32.43, expPct: 32.43, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Brunei Darussalam": { pop: 466330, growth: 0.78, inflation: -0.3, lfp: 64.2, workingAge: 72.14, gdp: 15031980994, informal: 15, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Bulgaria": { pop: 6433302, growth: -0.13, inflation: 4.58, lfp: 56.1, workingAge: 63.36, gdp: 130777235530, informal: 35, spend: 35.76, expPct: 35.76, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Burkina Faso": { pop: 24074580, growth: 2.21, inflation: -0.59, lfp: 70.0, workingAge: 56.15, gdp: 27627297461, informal: 75, spend: 19.57, expPct: 19.57, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Burundi": { pop: 14390003, growth: 2.41, inflation: 34.13, lfp: 78.3, workingAge: 53.47, gdp: 3364713864, informal: 75, spend: 12.26, expPct: 12.26, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2021" },
  "Cabo Verde": { pop: 527326, growth: 0.47, inflation: 2.34, lfp: 57.0, workingAge: 68.15, gdp: 3056630435, informal: 55, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Cambodia": { pop: 17847982, growth: 1.18, inflation: 2.35, lfp: 82.4, workingAge: 64.13, gdp: 51267065843, informal: 75, spend: 12.95, expPct: 12.95, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Cameroon": { pop: 29879337, growth: 2.56, inflation: 3.4, lfp: 65.2, workingAge: 56.07, gdp: 58933453924, informal: 75, spend: 12.42, expPct: 12.42, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2021" },
  "Canada": { pop: 41651653, growth: 0.94, inflation: 2.07, lfp: 64.5, workingAge: 64.76, gdp: 2319899772426, informal: 15, spend: 19.06, expPct: 19.06, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Central African Republic": { pop: 5513282, growth: 3.37, inflation: 1.0, lfp: 73.4, workingAge: 49.12, gdp: 3066109226, informal: 75, spend: 11.66, expPct: 11.66, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2021" },
  "Chad": { pop: 21003705, growth: 3.41, inflation: -3.91, lfp: 59.4, workingAge: 51.92, gdp: 21472835225, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Chile": { pop: 19859921, growth: 0.48, inflation: 4.21, lfp: 62.3, workingAge: 68.86, gdp: 357371159575, informal: 35, spend: 24.56, expPct: 24.56, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "China": { pop: 1406585000, growth: -0.17, inflation: 0.06, lfp: 64.6, workingAge: 69.68, gdp: 19498039388043, informal: 35, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Colombia": { pop: 53425635, growth: 1.01, inflation: 5.14, lfp: 63.4, workingAge: 69.81, gdp: 457410034203, informal: 55, spend: 33.28, expPct: 33.28, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Comoros": { pop: 882847, growth: 1.85, inflation: 3.25, lfp: 55.8, workingAge: 58.68, gdp: 1814920856, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Congo, Rep.": { pop: 6484437, growth: 2.36, inflation: 2.4, lfp: 67.8, workingAge: 57.0, gdp: 16306633779, informal: 75, spend: 16.13, expPct: 16.13, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2021" },
  "Costa Rica": { pop: 5152950, growth: 0.45, inflation: -0.07, lfp: 57.7, workingAge: 68.94, gdp: 102904921157, informal: 35, spend: 28.57, expPct: 28.57, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Cote d'Ivoire": { pop: 32711547, growth: 2.4, inflation: 0.13, lfp: 67.1, workingAge: 56.89, gdp: 99773555666, informal: 75, spend: 17.88, expPct: 17.88, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Croatia": { pop: 3876200, growth: 0.26, inflation: 3.69, lfp: 52.1, workingAge: 62.69, gdp: 105060182186, informal: 35, spend: 38.13, expPct: 38.13, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Cyprus": { pop: 1370754, growth: 0.91, inflation: 0.13, lfp: 67.0, workingAge: 68.99, gdp: 41225787247, informal: 15, spend: 38.46, expPct: 38.46, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Czechia": { pop: 10886878, growth: -0.17, inflation: 2.46, lfp: 60.3, workingAge: 63.73, gdp: 391026962800, informal: 15, spend: 34.44, expPct: 34.44, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Denmark": { pop: 6009169, growth: 0.54, inflation: 1.89, lfp: 64.9, workingAge: 63.32, gdp: 462526660468, informal: 15, spend: 33.34, expPct: 33.34, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Djibouti": { pop: 1184076, growth: 1.31, inflation: -0.31, lfp: 31.7, workingAge: 66.22, gdp: 4624533092, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Dominican Republic": { pop: 11520487, growth: 0.81, inflation: 3.87, lfp: 64.8, workingAge: 65.61, gdp: 127407463759, informal: 35, spend: 18.07, expPct: 18.07, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Ecuador": { pop: 18289896, growth: 0.85, inflation: 0.71, lfp: 64.5, workingAge: 67.5, gdp: 130320560400, informal: 55, spend: 30.44, expPct: 30.44, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Egypt, Arab Rep.": { pop: 118365995, growth: 1.56, inflation: 14.07, lfp: 44.6, workingAge: 63.17, gdp: 365254630180, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "El Salvador": { pop: 6365503, growth: 0.43, inflation: 0.26, lfp: 62.1, workingAge: 67.31, gdp: 36708110000, informal: 55, spend: 27.92, expPct: 27.92, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Equatorial Guinea": { pop: 1938431, growth: 2.4, inflation: 2.92, lfp: 60.5, workingAge: 59.15, gdp: 12823210426, informal: 55, spend: 11.05, expPct: 11.05, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Estonia": { pop: 1366475, growth: -0.43, inflation: 4.83, lfp: 65.1, workingAge: 62.94, gdp: 47030833799, informal: 15, spend: 37.69, expPct: 37.69, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Ethiopia": { pop: 135472051, growth: 2.55, inflation: 13.23, lfp: 68.5, workingAge: 57.92, gdp: 126358758448, informal: 75, spend: 6.12, expPct: 6.12, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Fiji": { pop: 933154, growth: 0.47, inflation: -1.38, lfp: 57.2, workingAge: 66.54, gdp: 6198013062, informal: 55, spend: 27.76, expPct: 27.76, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Finland": { pop: 5646436, growth: 0.47, inflation: 0.34, lfp: 59.7, workingAge: 61.47, gdp: 317039368820, informal: 15, spend: 44.91, expPct: 44.91, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "France": { pop: 68720337, growth: 0.25, inflation: 0.94, lfp: 55.3, workingAge: 61.23, gdp: 3366315927447, informal: 15, spend: 47.26, expPct: 47.26, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Gabon": { pop: 2593130, growth: 2.11, inflation: 1.77, lfp: 51.1, workingAge: 59.63, gdp: 21427119323, informal: 55, spend: 14.05, expPct: 14.05, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2021" },
  "Gambia, The": { pop: 2822093, growth: 2.23, inflation: 11.56, lfp: 47.5, workingAge: 57.09, gdp: 2593673988, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Georgia": { pop: 3935766, growth: 3.18, inflation: 3.87, lfp: 64.3, workingAge: 63.52, gdp: 38143612855, informal: 55, spend: 25.24, expPct: 25.24, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Germany": { pop: 83491249, growth: -0.03, inflation: 2.17, lfp: 60.6, workingAge: 62.41, gdp: 5050922925047, informal: 15, spend: 31.17, expPct: 31.17, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Ghana": { pop: 35064272, growth: 1.83, inflation: 14.2, lfp: 58.5, workingAge: 60.78, gdp: 114209905279, informal: 88, spend: 22.68, expPct: 22.68, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Greece": { pop: 10413962, growth: 0.08, inflation: 2.48, lfp: 52.0, workingAge: 62.75, gdp: 280635521324, informal: 35, spend: 47.3, expPct: 47.3, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Guatemala": { pop: 18687881, growth: 1.52, inflation: 1.49, lfp: 59.6, workingAge: 64.01, gdp: 123306008821, informal: 55, spend: 13.51, expPct: 13.51, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Guinea": { pop: 15099727, growth: 2.31, inflation: 3.55, lfp: 52.6, workingAge: 55.98, gdp: 28346024753, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Guinea-Bissau": { pop: 2249515, growth: 2.16, inflation: 0.87, lfp: 64.8, workingAge: 58.44, gdp: 2527930273, informal: 75, spend: 15.54, expPct: 15.54, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Guyana": { pop: 835986, growth: 0.59, inflation: 3.33, lfp: 55.0, workingAge: 64.09, gdp: 27097477218, informal: 15, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Haiti": { pop: 11906095, growth: 1.13, inflation: 28.64, lfp: 63.9, workingAge: 64.42, gdp: 32077278409, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Honduras": { pop: 11005850, growth: 1.65, inflation: 4.6, lfp: 56.6, workingAge: 65.2, gdp: 39601409103, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Hong Kong SAR, China": { pop: 7498900, growth: -0.34, inflation: 1.44, lfp: 56.4, workingAge: 66.02, gdp: 427310315922, informal: 15, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Hungary": { pop: 9514251, growth: -0.5, inflation: 4.41, lfp: 60.6, workingAge: 64.49, gdp: 246490213513, informal: 35, spend: 42.42, expPct: 42.42, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Iceland": { pop: 392404, growth: 1.51, inflation: 4.09, lfp: 74.9, workingAge: 66.51, gdp: 38582528789, informal: 15, spend: 32.05, expPct: 32.05, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "India": { pop: 1463865525, growth: 0.89, inflation: 2.4, lfp: 55.7, workingAge: 68.43, gdp: 3956067115772, informal: 89, spend: 13.73, expPct: 13.73, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Indonesia": { pop: 285721236, growth: 0.78, inflation: 1.91, lfp: 68.0, workingAge: 68.21, gdp: 1445642584164, informal: 55, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Iran, Islamic Rep.": { pop: 92417681, growth: 0.92, inflation: 42.17, lfp: 41.0, workingAge: 69.4, gdp: 362682115433, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Iraq": { pop: 47020774, growth: 2.1, inflation: 0.3, lfp: 41.5, workingAge: 60.52, gdp: 254367293538, informal: 55, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Ireland": { pop: 5484367, growth: 1.63, inflation: 2.21, lfp: 64.8, workingAge: 65.7, gdp: 721701359046, informal: 15, spend: 19.24, expPct: 19.24, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Israel": { pop: 10122800, growth: 1.2, inflation: 3.04, lfp: 65.5, workingAge: 60.14, gdp: 610777842874, informal: 15, spend: 37.35, expPct: 37.35, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Italy": { pop: 58915656, growth: -0.06, inflation: 1.53, lfp: 49.3, workingAge: 63.24, gdp: 2551556954100, informal: 15, spend: 47.28, expPct: 47.28, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Jamaica": { pop: 2837077, growth: -0.07, inflation: 4.0, lfp: 69.6, workingAge: 73.14, gdp: 22704903218, informal: 55, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Japan": { pop: 123366734, growth: -0.49, inflation: 3.17, lfp: 63.4, workingAge: 58.77, gdp: 4435162999977, informal: 15, spend: 20.06, expPct: 20.06, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Jordan": { pop: 11520684, growth: -0.28, inflation: 1.77, lfp: 40.1, workingAge: 65.05, gdp: 61610052535, informal: 55, spend: 25.89, expPct: 25.89, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Kazakhstan": { pop: 20843754, growth: 1.21, inflation: 11.39, lfp: 67.8, workingAge: 61.86, gdp: 306239209650, informal: 35, spend: 17.45, expPct: 17.45, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Kenya": { pop: 57532493, growth: 1.93, inflation: 4.07, lfp: 67.4, workingAge: 60.72, gdp: 135941278879, informal: 80, spend: 27.84, expPct: 27.84, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Korea, Rep.": { pop: 51684564, growth: -0.13, inflation: 2.12, lfp: 64.4, workingAge: 69.47, gdp: 1872374961553, informal: 15, spend: 28.32, expPct: 28.32, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Kuwait": { pop: 4865298, growth: -0.65, inflation: 2.36, lfp: 73.4, workingAge: 78.85, gdp: 157209026926, informal: 15, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Kyrgyz Republic": { pop: 7343064, growth: 1.66, inflation: 8.21, lfp: 57.4, workingAge: 62.13, gdp: 22623752095, informal: 75, spend: 23.71, expPct: 23.71, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Lao PDR": { pop: 7873046, growth: 1.32, inflation: 7.74, lfp: 66.1, workingAge: 65.35, gdp: 18302970219, informal: 75, spend: 10.32, expPct: 10.32, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Latvia": { pop: 1847785, growth: -0.99, inflation: 3.75, lfp: 60.5, workingAge: 62.62, gdp: 48618869160, informal: 35, spend: 34.2, expPct: 34.2, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Lebanon": { pop: 5849421, growth: 0.75, inflation: 14.6, lfp: 43.4, workingAge: 63.97, gdp: 25971643441, informal: 55, spend: 6.3, expPct: 6.3, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2021" },
  "Lesotho": { pop: 2363325, growth: 1.1, inflation: 4.27, lfp: 57.1, workingAge: 62.02, gdp: 2573572920, informal: 75, spend: 40.23, expPct: 40.23, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Liberia": { pop: 5731206, growth: 2.09, inflation: 8.32, lfp: 76.6, workingAge: 57.58, gdp: 5245938900, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Libya": { pop: 7458555, growth: 1.04, inflation: 1.84, lfp: 48.0, workingAge: 67.96, gdp: 48098909614, informal: 55, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Lithuania": { pop: 2888774, growth: 0.02, inflation: 3.79, lfp: 62.9, workingAge: 64.77, gdp: 95210150818, informal: 15, spend: 33.86, expPct: 33.86, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Luxembourg": { pop: 686970, growth: 1.46, inflation: 2.26, lfp: 61.5, workingAge: 68.44, gdp: 101157829491, informal: 15, spend: 42.23, expPct: 42.23, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Macao SAR, China": { pop: 685900, growth: -0.16, inflation: 0.33, lfp: 67.8, workingAge: 71.2, gdp: 52061007670, informal: 15, spend: 19.59, expPct: 19.59, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Madagascar": { pop: 32740678, growth: 2.4, inflation: 8.05, lfp: 85.5, workingAge: 57.59, gdp: 19620352036, informal: 75, spend: 11.04, expPct: 11.04, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Malawi": { pop: 22216120, growth: 2.56, inflation: 28.37, lfp: 62.6, workingAge: 57.28, gdp: 14918276698, informal: 75, spend: 20.17, expPct: 20.17, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Malaysia": { pop: 35977838, growth: 1.17, inflation: 1.38, lfp: 66.1, workingAge: 70.66, gdp: 472193128645, informal: 35, spend: 17.01, expPct: 17.01, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Maldives": { pop: 529676, growth: 0.35, inflation: 4.01, lfp: 63.5, workingAge: 76.01, gdp: 7741066861, informal: 35, spend: 29.48, expPct: 29.48, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2021" },
  "Mali": { pop: 25198821, growth: 2.9, inflation: 3.28, lfp: 67.0, workingAge: 51.84, gdp: 30069148581, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Malta": { pop: 579704, growth: 1.89, inflation: 2.36, lfp: 64.0, workingAge: 66.56, gdp: 27771821561, informal: 15, spend: 33.67, expPct: 33.67, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Mauritania": { pop: 5315065, growth: 2.78, inflation: 1.55, lfp: 40.8, workingAge: 54.37, gdp: 11679910946, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Mauritius": { pop: 1243741, growth: -0.16, inflation: 3.67, lfp: 58.5, workingAge: 71.35, gdp: 16157804492, informal: 35, spend: 29.14, expPct: 29.14, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Mexico": { pop: 131946900, growth: 0.83, inflation: 3.81, lfp: 61.6, workingAge: 67.39, gdp: 1832641364776, informal: 55, spend: 22.46, expPct: 22.46, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Moldova": { pop: 2360527, growth: -1.75, inflation: 7.76, lfp: 72.3, workingAge: 63.61, gdp: 20351796275, informal: 55, spend: 34.47, expPct: 34.47, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Mongolia": { pop: 3568978, growth: 1.25, inflation: 8.61, lfp: 59.7, workingAge: 63.01, gdp: 25369107325, informal: 55, spend: 31.7, expPct: 31.7, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2021" },
  "Montenegro": { pop: 623129, growth: -0.06, inflation: 3.9, lfp: 58.0, workingAge: 63.83, gdp: 9232801465, informal: 35, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Morocco": { pop: 38430770, growth: 0.91, inflation: 0.7, lfp: 43.9, workingAge: 66.35, gdp: 182374250612, informal: 55, spend: 26.61, expPct: 26.61, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Mozambique": { pop: 35631653, growth: 2.85, inflation: 4.37, lfp: 78.7, workingAge: 53.1, gdp: 22337997046, informal: 75, spend: 26.0, expPct: 26.0, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Namibia": { pop: 3092816, growth: 2.05, inflation: 3.51, lfp: 58.8, workingAge: 59.56, gdp: 15080340654, informal: 55, spend: 36.16, expPct: 36.16, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Nepal": { pop: 29618118, growth: -0.11, inflation: 2.65, lfp: 39.2, workingAge: 65.32, gdp: 45489810283, informal: 75, spend: 19.44, expPct: 19.44, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2021" },
  "Netherlands": { pop: 18087633, growth: 0.52, inflation: 3.26, lfp: 67.2, workingAge: 64.2, gdp: 1332767651100, informal: 15, spend: 39.97, expPct: 39.97, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "New Zealand": { pop: 5324700, growth: 0.65, inflation: 2.84, lfp: 70.4, workingAge: 64.51, gdp: 264057413740, informal: 15, spend: 35.5, expPct: 35.5, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Nicaragua": { pop: 7007502, growth: 1.31, inflation: 2.08, lfp: 66.1, workingAge: 65.99, gdp: 22237167113, informal: 75, spend: 16.28, expPct: 16.28, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Niger": { pop: 27917831, growth: 3.22, inflation: -4.45, lfp: 79.7, workingAge: 51.16, gdp: 21646191388, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Nigeria": { pop: 237527782, growth: 2.06, inflation: 23.01, lfp: 82.5, workingAge: 56.41, gdp: 290794361542, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "North Macedonia": { pop: 1820909, growth: -0.19, inflation: 4.07, lfp: 51.9, workingAge: 64.95, gdp: 19101199817, informal: 35, spend: 33.38, expPct: 33.38, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Norway": { pop: 5610870, growth: 0.69, inflation: 3.06, lfp: 65.6, workingAge: 65.0, gdp: 530755719439, informal: 15, spend: 34.52, expPct: 34.52, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Oman": { pop: 5494691, growth: 3.96, inflation: 0.97, lfp: 68.4, workingAge: 72.99, gdp: 109604780696, informal: 35, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Pakistan": { pop: 255219554, growth: 1.56, inflation: 3.55, lfp: 52.3, workingAge: 59.39, gdp: 407307214476, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Panama": { pop: 4571189, growth: 1.22, inflation: -0.19, lfp: 66.3, workingAge: 65.82, gdp: 90462600000, informal: 35, spend: 17.14, expPct: 17.14, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2021" },
  "Papua New Guinea": { pop: 10762817, growth: 1.75, inflation: 4.42, lfp: 52.1, workingAge: 63.27, gdp: 32498658654, informal: 75, spend: 20.32, expPct: 20.32, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Paraguay": { pop: 7013078, growth: 1.2, inflation: 4.04, lfp: 70.2, workingAge: 64.91, gdp: 49278227554, informal: 55, spend: 18.95, expPct: 18.95, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Peru": { pop: 34576665, growth: 1.04, inflation: 1.53, lfp: 72.9, workingAge: 66.92, gdp: 334854659182, informal: 76, spend: 22.84, expPct: 22.84, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2021" },
  "Philippines": { pop: 116786962, growth: 0.81, inflation: 1.66, lfp: 61.4, workingAge: 67.14, gdp: 487086123720, informal: 55, spend: 16.88, expPct: 16.88, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Poland": { pop: 36435861, growth: -0.34, inflation: 3.81, lfp: 58.3, workingAge: 64.79, gdp: 1035491784197, informal: 35, spend: 39.1, expPct: 39.1, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Portugal": { pop: 10804871, growth: 1.03, inflation: 2.34, lfp: 58.2, workingAge: 62.34, gdp: 346639825142, informal: 15, spend: 37.16, expPct: 37.16, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Qatar": { pop: 2972215, growth: 3.92, inflation: 1.27, lfp: 87.0, workingAge: 83.3, gdp: 215559615385, informal: 15, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Romania": { pop: 19020271, growth: -0.17, inflation: 7.19, lfp: 51.3, workingAge: 64.31, gdp: 428677977855, informal: 35, spend: 37.3, expPct: 37.3, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Russian Federation": { pop: 143513328, growth: -0.11, inflation: 8.72, lfp: 61.1, workingAge: 65.18, gdp: 2561310169359, informal: 35, spend: 29.97, expPct: 29.97, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Rwanda": { pop: 14569341, growth: 2.17, inflation: 5.91, lfp: 63.7, workingAge: 58.96, gdp: 16372132990, informal: 75, spend: 17.97, expPct: 17.97, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Samoa": { pop: 219306, growth: 0.59, inflation: 2.21, lfp: 42.5, workingAge: 55.87, gdp: 1287936622, informal: 55, spend: 26.68, expPct: 26.68, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Sao Tome and Principe": { pop: 240254, growth: 1.98, inflation: 11.05, lfp: 23.3, workingAge: 58.6, gdp: 981293587, informal: 55, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Saudi Arabia": { pop: 36973555, growth: 4.63, inflation: 2.08, lfp: 65.1, workingAge: 73.32, gdp: 1276942933333, informal: 15, spend: 24.22, expPct: 24.22, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Senegal": { pop: 18931966, growth: 2.3, inflation: 1.46, lfp: 52.0, workingAge: 58.61, gdp: 37006536238, informal: 75, spend: 23.56, expPct: 23.56, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Serbia": { pop: 6549143, growth: -0.57, inflation: 3.89, lfp: 59.1, workingAge: 62.69, gdp: 99953324473, informal: 35, spend: 35.46, expPct: 35.46, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Sierra Leone": { pop: 8819794, growth: 2.04, inflation: 7.49, lfp: 53.4, workingAge: 59.07, gdp: 7464157904, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Singapore": { pop: 6111175, growth: 1.22, inflation: 0.9, lfp: 69.7, workingAge: 74.1, gdp: 603869516999, informal: 15, spend: 17.11, expPct: 17.11, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Slovak Republic": { pop: 5413813, growth: -0.15, inflation: 4.0, lfp: 60.4, workingAge: 65.39, gdp: 154530066507, informal: 35, spend: 39.77, expPct: 39.77, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Slovenia": { pop: 2130986, growth: 0.17, inflation: 2.37, lfp: 57.6, workingAge: 63.31, gdp: 79648204979, informal: 15, spend: 42.87, expPct: 42.87, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Solomon Islands": { pop: 838645, growth: 2.35, inflation: 3.36, lfp: 84.3, workingAge: 59.77, gdp: 1749572443, informal: 75, spend: 28.89, expPct: 28.89, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "South Africa": { pop: 64747319, growth: 1.15, inflation: 3.21, lfp: 55.6, workingAge: 67.39, gdp: 427184325997, informal: 34, spend: 33.42, expPct: 33.42, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Spain": { pop: 49355143, growth: 1.03, inflation: 2.7, lfp: 57.4, workingAge: 65.74, gdp: 1906453309986, informal: 15, spend: 34.04, expPct: 34.04, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Sri Lanka": { pop: 21756000, growth: -0.73, inflation: -4.76, lfp: 48.5, workingAge: 65.82, gdp: 108825231671, informal: 55, spend: 18.04, expPct: 18.04, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "St. Lucia": { pop: 180149, growth: 0.23, inflation: 2.03, lfp: 68.3, workingAge: 72.79, gdp: 2656444444, informal: 35, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "St. Vincent and the Grenadines": { pop: 99924, growth: -0.69, inflation: 0.82, lfp: 67.9, workingAge: 66.88, gdp: 1255222222, informal: 35, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Sudan": { pop: 51662147, growth: 2.38, inflation: 138.81, lfp: 37.5, workingAge: 56.4, gdp: 60162634574, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Suriname": { pop: 639850, growth: 0.85, inflation: 9.21, lfp: 53.8, workingAge: 66.47, gdp: 4523657797, informal: 55, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Sweden": { pop: 10596620, growth: 0.25, inflation: 0.68, lfp: 64.6, workingAge: 62.38, gdp: 668998664082, informal: 15, spend: 32.51, expPct: 32.51, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Switzerland": { pop: 9092436, growth: 0.96, inflation: 0.15, lfp: 66.7, workingAge: 64.68, gdp: 1043529899251, informal: 15, spend: 16.11, expPct: 16.11, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Tanzania": { pop: 70545865, growth: 2.86, inflation: 3.33, lfp: 83.7, workingAge: 54.62, gdp: 90143496090, informal: 75, spend: 16.34, expPct: 16.34, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2024" },
  "Thailand": { pop: 71619863, growth: -0.07, inflation: -0.13, lfp: 66.7, workingAge: 69.57, gdp: 577009981112, informal: 55, spend: 20.72, expPct: 20.72, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Timor-Leste": { pop: 1418517, growth: 1.27, inflation: 0.43, lfp: 67.0, workingAge: 61.66, gdp: 1902180258, informal: 75, spend: 52.49, expPct: 52.49, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2022" },
  "Togo": { pop: 8591626, growth: 2.18, inflation: 0.43, lfp: 57.8, workingAge: 56.1, gdp: 11889949067, informal: 75, spend: 16.03, expPct: 16.03, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Tonga": { pop: 103742, growth: -0.42, inflation: 5.59, lfp: 49.8, workingAge: 58.23, gdp: 679218219, informal: 55, spend: 34.65, expPct: 34.65, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Trinidad and Tobago": { pop: 1367764, growth: -0.04, inflation: 0.99, lfp: 57.8, workingAge: 69.58, gdp: 25942749718, informal: 35, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Tunisia": { pop: 12348573, growth: 0.58, inflation: 5.15, lfp: 45.2, workingAge: 66.5, gdp: 57502836548, informal: 55, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "Turkiye": { pop: 85878556, growth: 0.42, inflation: 34.88, lfp: 54.4, workingAge: 68.41, gdp: 1597293229287, informal: 35, spend: 33.03, expPct: 33.03, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Uganda": { pop: 51384894, growth: 2.7, inflation: 3.58, lfp: 80.0, workingAge: 54.66, gdp: 61985829288, informal: 75, spend: 16.58, expPct: 16.58, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Ukraine": { pop: 38980376, growth: 2.92, inflation: 12.73, lfp: 54.6, workingAge: 67.33, gdp: 214233312784, informal: 55, spend: 65.56, expPct: 65.56, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "United Arab Emirates": { pop: 11513149, growth: 4.68, inflation: 1.25, lfp: 78.6, workingAge: 82.23, gdp: 552324919096, informal: 15, spend: 3.77, expPct: 3.77, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "United Kingdom": { pop: 69487000, growth: 0.3, inflation: 3.88, lfp: 61.4, workingAge: 63.33, gdp: 4002587541846, informal: 15, spend: 41.23, expPct: 41.23, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "United States": { pop: 341784857, growth: 0.52, inflation: 2.95, lfp: 61.7, workingAge: 64.51, gdp: 30769700000000, informal: 15, spend: 24.43, expPct: 24.43, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Uruguay": { pop: 3384688, growth: -0.06, inflation: 4.65, lfp: 65.0, workingAge: 65.82, gdp: 85347696278, informal: 35, spend: 36.45, expPct: 36.45, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Uzbekistan": { pop: 37053428, growth: 1.88, inflation: 8.8, lfp: 57.5, workingAge: 62.64, gdp: 147038081129, informal: 75, spend: 22.34, expPct: 22.34, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Vanuatu": { pop: 335169, growth: 2.23, inflation: 0.66, lfp: 58.1, workingAge: 57.66, gdp: 1353658841, informal: 55, spend: 26.61, expPct: 26.61, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2023" },
  "Viet Nam": { pop: 101598527, growth: 0.6, inflation: 3.31, lfp: 72.8, workingAge: 67.65, gdp: 514697215165, informal: 55, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
  "West Bank and Gaza": { pop: 5413596, growth: 2.33, inflation: 9.81, lfp: 45.0, workingAge: 58.56, gdp: 17167100000, informal: 75, spend: 26.17, expPct: 26.17, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2021" },
  "Zambia": { pop: 21913874, growth: 2.77, inflation: 13.91, lfp: 61.9, workingAge: 57.03, gdp: 28879806220, informal: 75, spend: 25.14, expPct: 25.14, expReported: true, expLevel: "general government", expSrc: "World Bank, Expense (% of GDP), 2021" },
  "Zimbabwe": { pop: 16950795, growth: 1.88, inflation: 104.71, lfp: 67.7, workingAge: 56.15, gdp: 51215643906, informal: 75, spend: 27, expPct: 27, expReported: false, expLevel: "", expSrc: "not reported by World Bank \u2014 using the cross-country median" },
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
  return {
    workingAge: Math.round(c.workingAge * 10) / 10, lfp: c.lfp, informal: c.informal, inflation: c.inflation, spend: c.spend,
    // Countries with no reported Expense (% of GDP) can't default to
    // "actual" — there's nothing real to report, so start on "assumed".
    spendBasis: c.expReported ? "actual" : "assumed"
  };
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
