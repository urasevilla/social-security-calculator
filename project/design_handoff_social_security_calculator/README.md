# Handoff: Social Security Subsidy Cost Calculator (step-through walkthrough)

## Overview

An interactive calculator that estimates what it would cost a government to co-pay
social insurance contributions for workers in informal employment, and what those
workers get in return. It is a redesign of WIEGO's R/Shiny model
(`wiego.shinyapps.io/social_security_model`) as a five-step guided walkthrough aimed at
non-analysts — ministry officials, worker organisations, donors, press — ending in a
shareable summary and a CSV export.

Five steps: **1** who is covered → **2** what a contribution costs → **3** who pays which
part → **4** how many enrol → **5** what it adds up to. Every figure recomputes live from
the current assumptions; the model runs entirely client-side.

## About the design files

`Social Security Calculator.dc.html` in this bundle is a **design reference created in
HTML** — a working prototype showing intended look, arithmetic and behaviour. It is not
production code to lift wholesale. The task is to **recreate this design in the target
codebase's existing environment** (React, Vue, SwiftUI, native, or a fresh Shiny/Quarto
app) using that codebase's established patterns, component library and data layer. If no
environment exists yet, pick the framework that best fits the deployment target and
implement the design there.

The one part worth porting almost verbatim is the **model** (`runModel`, below) — it is
pure arithmetic with no framework dependency.

## Fidelity

**High-fidelity.** Final colours, typography, spacing, copy and interactions. Recreate the
UI closely, substituting the codebase's own primitives (buttons, sliders, cards) where they
exist. The palette is WIEGO's brand palette and should be preserved exactly.

## The model (port this first)

All figures derive from one function. Inputs, all user-editable:

| Param | Meaning | Range / default |
|---|---|---|
| `country` | Selects the country data block | Kenya (default), Ghana, India, South Africa, Mexico, Peru |
| `years` | Horizon simulated, year 1 = 2026 | 3–35, default 10 |
| `contrib` | Monthly minimum total contribution, USD | 1–40 step 0.5, default 5 |
| `govShare` | Government share of the contribution, % | 0–100 step 5, default 50 |
| `employerShare` | Employer share, taken **before** the subsidy, % | 0–100 step 5, default 0 |
| `decreaseAfter` | Year after which the subsidy tapers | 0–`years`, default `years` (= no taper) |
| `signup` | % of eligible workers enrolling immediately | 0–60 step 1, default 8 |
| `signupGrowth` | Additional percentage points enrolling each later year | 0–10 step 0.5, default 1.5 |
| `informal` | Share of workers in informal employment, % | 10–95, country default |
| `subgroup` / `subgroupPct` | Restrict eligibility to one worker category | off; 1–100% of informal workers |
| `inflation` | Annual inflation, % | −2–30 step 0.1, country default |
| `interest` | Interest earned on accumulated contributions, % | 0–20 step 0.5, default 6 |
| `spendBasis` | `"actual"` (reported expenditure) or `"assumed"` (% of GDP) | `"actual"` |
| `spend` | Assumed government spending, % of GDP (used only when `spendBasis === "assumed"`) | 5–60 |

Per simulated year `t` (1-indexed):

```
pop        = pop₀ × (1 + growth/100)^(t−1)
informalN  = pop × workingAge% × participation% × informal%
eligible   = subgroup ? informalN × subgroupPct% : informalN
signup(t)  = clamp(signup + signupGrowth × (t−1), 0, 100)
enrolled   = eligible × signup(t)%

emp        = employerShare/100
share      = (govShare/100) × (1 − emp)                     // employer's part comes off first
if t > decreaseAfter:                                        // linear taper to zero at the horizon
    share = share × max(0, 1 − (t − decreaseAfter) / max(1, years − decreaseAfter))

annual     = 12 × contrib
gov(t)     = enrolled × annual × share
employer(t)= enrolled × annual × emp
worker(t)  = enrolled × annual × max(0, 1 − share − emp)
```

Aggregates:

```
total          = Σ gov(t)                                    // nominal USD
totalReal      = Σ gov(t) / (1 + inflation/100)^(t−1)        // present value, "today's money"
totalUprated   = Σ enrolled × annual × (1+inflation/100)^(t−1) × share   // if the floor is uprated
totalEmployer  = Σ employer(t)
spendUsed      = gdp × (spendBasis === "assumed" ? spend : expPct) / 100
pctSpend       = (total / years) / spendUsed × 100
pctGdp         = (total / years) / gdp × 100
totalPctGdp    = total / gdp × 100
```

Per-worker view, for one worker enrolling in year 1 and staying the full horizon:
`wPaid`, `gPaid`, `ePaid` accumulate `annual × (worker | gov | employer) share` per year,
and `fund = (fund + annual) × (1 + interest/100)` compounds each year.

**Two labelling rules that were bugs during design — keep them right:**
1. `totalReal` is a *present value* and must be **lower** than nominal. The escalating-floor
   figure is a different quantity (`totalUprated`) and must be labelled as such.
2. Where an employer share exists, every headline, caption and note must quote the
   **effective** government share (`rows[0].share`), not the nominal `govShare`.

### Country data

Constant across the simulation (this is an explicit stated assumption, not an oversight).
`pop`, `growth`, `inflation`, `lfp` (participation), `workingAge`, `gdp`, `informal` come
from World Bank indicators; `expPct` is government expenditure as % of GDP with its own
source and level of government:

| Country | expPct | Level | Source |
|---|---|---|---|
| Kenya | 23.26 | general government | IMF Regional Economic Outlook, 2024 |
| Ghana | 23.18 | general government | IMF Regional Economic Outlook, 2024 |
| India | 14.77 | **central** government | Reserve Bank of India, 2024 |
| South Africa | 32.98 | general government | IMF Regional Economic Outlook, 2024 |
| Mexico | 30.32 | general government | IMF, 2024 |
| Peru | 21.41 | general government | IMF Regional Economic Outlook, 2024 |

India's figure excludes state spending, so its denominator understates the base — the UI
names the level of government for this reason. **Replace the whole table with live World
Bank / IMF data in production** (see *Data provenance*). Subgroup sizes and employer shares
below are structural placeholders pending WIEGO's own values.

## Screens / views

One card, 820px wide on desktop, `#FBF8F3` on an `#EDE8DE` desk, 10px radius, 1px
`rgba(94,81,77,.16)` border, `0 2px 10px rgba(58,49,43,.07)` shadow. Three fixed regions:
**header** (logo + step rail), **intro panel**, **step body**; the body ends with a
sources disclosure and a back/next bar.

### Header

- 20px 30px 14px padding, 1px bottom border `rgba(94,81,77,.14)`, flex, 16px gap.
- Logo slot: 90×32, dashed 1px `rgba(94,81,77,.4)` placeholder — **replace with the real
  WIEGO logo**.
- Step rail: five equal buttons (min-width 66px, 5px gap), each a card —
  `#EFDBB2` fill + `#8B5B29` border when active, `#F3EDE1` + `rgba(94,81,77,.22)`
  otherwise, 6px radius, 7px 8px 8px padding, hover border `#8B5B29`. Inside each: a 4px
  progress bar (`#FF671F` if step ≤ current, else `rgba(94,81,77,.2)`) over a label
  `700 9.5px IBM Plex Mono, letter-spacing .04em` — `#3A312B` active, `#5E514D` inactive.
  Labels: `1 Workers`, `2 Contribution`, `3 Who pays`, `4 Take-up`, `5 Result`.
  Clicking any step jumps to it.

### Intro panel

`#EFDBB2` card, 1px `rgba(139,91,41,.3)`, 10px radius, 18px 20px 16px padding, inside a
20px 34px 0 wrapper. Title `900 17px Lato, #3A312B, letter-spacing −.01em`. A right-aligned
toggle button (`1px rgba(139,91,41,.45)` border, `#8B5B29` text, 6px radius, 5px 11px,
hover fills `#8B5B29` with white text) reads **Hide** when open and **What is this?** when
collapsed. Open by default; the collapse state persists across steps.

Body copy (verbatim, max-width 74ch, 11px gap):

1. `400 13.5px/1.62 Lato, #3A312B` — "Social security is a human right and labour right
   for all workers, including workers in informal employment. For workers in formal wage
   employment, the affordability of social insurance contributions and adequacy of benefits
   is generally ensured by dividing contributions between themselves and their employer."
2. `400 13.5px/1.62, #5E514D` — "Self-employed workers, on the other hand, are often
   expected to shoulder the entire burden of paying contributions, which results in
   unaffordably high contribution rates or contribution payments that are too low to yield
   adequate benefits. This is a major barrier for the nearly 80 percent of informal workers
   in developing countries that are self-employed."
3. `400 13.5px/1.62, #5E514D` — "The most effective way to address this affordability gap
   is for governments to subsidize social insurance contributions for low-income informal
   workers. Global evidence shows that countries that have managed to significantly expand
   social insurance coverage to informal workers have recognized this and implemented
   various forms of subsidies."
4. `700 13.5px/1.62, #8B5B29` — "This calculator helps estimate the costs of different
   subsidy options, as well as the impacts of those on workers' social security benefits."
5. `400 12px/1.55, #796E65` — one line on the five steps and the CSV download.

### Step body

22px 34px 26px padding, `min-height: 376px`, column flex. Every step follows the same
rhythm: an eyebrow (`700 9.5px IBM Plex Mono, letter-spacing .12em, #FF671F`), an `h2`
(`900 30px/1.15 Lato, #3A312B, letter-spacing −.02em, text-wrap: pretty`) with the live
number in `#FF671F`, a lead paragraph (`400 14.5px/1.6, #5E514D, max-width 58ch`), then
the visual, then the controls.

**Step 1 — Workers.** `STEP 1 · WHO ARE WE COVERING?` / "In {country}, {N} people work
informally." A 25-column dot grid of 50 dots (`aspect-ratio: 1`, 4px gap, max-width 520px):
the first `round(informal/2)` are `#FF671F`, the rest `rgba(94,81,77,.18)`.
Then an eligibility block (1px top border, 16px padding-top): a two-button toggle
**Everyone informal** / **One subgroup** (active `#3A312B` on `#FBF8F3`, inactive
transparent with `rgba(94,81,77,.3)` border, 6px radius, 7px 12px, `700 12px`). Choosing
*One subgroup* reveals a 170px-minimum auto-fit grid of four cards — active `#EFDBB2` +
`#8B5B29` border, else `#F3EDE1` + `rgba(94,81,77,.2)`, hover `#8B5B29`:

| Subgroup | Size (% of informal) | Employer share |
|---|---|---|
| Self-employed only | 60 | 0 — "Own-account workers — no employer to share the contribution." |
| Domestic workers | 8 | 50 — "They have an employer: the household. Its share comes off the bill first." |
| Street vendors & market traders | 12 | 0 — "Own-account traders, organised through associations that can carry enrolment." |
| Home-based workers | 18 | 35 — "Sub-contracted piece-rate workers have a contractor who can be made liable." |

Below: a *Size of that group* slider (1–100), the live eligible pool, and — when the group
has an employer — a `#8B5B29` hand-off line pointing at step 3. Bottom row: the
*Share of workers in informal employment* slider (10–95) and the country `<select>`
(`#EFDBB2`, no border, 6px radius, 8px 11px, `700 13px`).

**Step 2 — Contribution.** `STEP 2 · WHAT DOES COVER COST?` / "A floor of {contrib} a month
buys a contribution record." Lead states the annual figure and its share of an average
income (`gdpPerCapita / 12 × 0.55` — a rough proxy, replace with a real income
distribution if one is available). Visual: an `#EFDBB2` card containing a 26px bar
(`rgba(94,81,77,.16)` track, `#8B5B29` fill = contribution ÷ monthly income, capped at
100%) with the two values labelled beneath. Control: the contribution slider (1–40).

**Step 3 — Who pays.** `STEP 3 · WHO PAYS WHICH PART?` / "Government pays {effective
share}% of the full contribution." A 70px three-segment bar, 9px radius, no gaps:
employer `#5E514D` (only when > 0, white text), government `#FF671F` (`#2A211B` text),
worker `#8E8C13` (flex: 1, white text) — each segment shows a `700 10px IBM Plex Mono`
role label over a `900 20px` monthly amount. Then the *Employer's share* slider (0–100
step 5) with a note that spells out the arithmetic and the resulting public and employer
totals; the *Government share* slider (0–100 step 5); a `#F3EDE1` note with a 3px
`#8B5B29` left border whose text depends on the government share (0 / <50 / 50+ / 100);
and the taper block (1px top border): a *Government starts reducing the subsidy after*
slider (0–`years`, label "Never — held flat" at max, else "Year N"), a 56px bar strip of
per-year effective shares (11px bars, `#FF671F` at full share, `rgba(255,103,31,.45)`
once tapering, no minimum height so 0% draws nothing), a caption quoting the effective
first-year and final-year shares, and an `#EFDBB2` note with a 3px `#FF671F` left border
stating the saving against holding it flat.

**Step 4 — Take-up.** `STEP 4 · HOW MANY SIGN UP?` / "By year {years}, {N} workers are
contributing." A bar chart of workers enrolled per year (608×170 viewBox; final bar
`#FF671F`, others `rgba(255,103,31,.45)`, 2px radius; four gridlines
`rgba(94,81,77,.12)`). Three sliders in a 200px-minimum auto-fit grid: *Sign up
immediately* (0–60), *Added each year after* (0–10 step 0.5), *Years modelled* (3–35).

**Step 5 — Result.** Eyebrow `THE ANSWER`, `h2` at `900 32px/1.12, letter-spacing −.025em`:
"{total} over {years} years — {pctSpend}% of what {country} already spends each year."
Then three summary cards (150px minimum auto-fit, 9px radius, 15px 16px, value
`900 24px/1.05`): total public cost on `#3A312B`; workers covered on `#EFDBB2`; savings per
year-1 worker on `#F3EDE1` with `#8B5B29` value. Then three share cards (190px minimum,
white, 4px left border): % of annual government expenditure (`#FF671F`), % of GDP per year
(`#8E8C13`, 3dp), cumulative % of one year's GDP (`#8B5B29`). Then the closing paragraph,
the economic-assumptions panel, and the actions.

*Economic assumptions panel:* `#F3EDE1`, 1px `rgba(94,81,77,.18)`, 9px radius. Header row —
`ECONOMIC ASSUMPTIONS` eyebrow and, right-aligned, "In today's money: {totalReal} · if the
contribution floor is uprated with inflation: {totalUprated}". A 210px-minimum auto-fit
grid holds *Inflation rate* (−2–30 step 0.1), *Interest on contributions* (0–20 step 0.5),
and the expenditure denominator: a two-button toggle **Reported ({expPct}% of GDP)** /
**Assume % of GDP**, the latter revealing an *Assumed government spending* slider (5–60).
A footnote states which denominator is live, its USD value, the level of government and
the source.

*Actions:* **Copy this summary** (`#8B5B29`, white, 7px radius, 11px 18px, hover `#FF671F`
with `#2A211B` text; label becomes "Summary copied ✓" for 2.2s), **Download the data (CSV)**
(`#3A312B`, hover `#8E8C13`), **Change the assumptions** (ghost, 1px `rgba(94,81,77,.3)`,
hover border and text `#8B5B29` → returns to step 1).

### Sources & assumptions

Foot of the body, above the nav, 1px top border, collapsed by default, present on every
step. Header row: `SOURCES & ASSUMPTIONS` eyebrow + a **Show**/**Hide** ghost button. Open
state is a 280px-minimum two-column auto-fit grid.

Left, *Assumptions* — four paragraphs (`400 12px/1.55, #5E514D`, 11px left padding, 2px
`rgba(139,91,41,.35)` left border), verbatim:

- "Population growth, workforce participation, inflation and so on are kept constant
  throughout the simulation."
- "It is assumed that informal workers will contribute the minimum and the government will
  match that according to the government share."
- "Percentage of informal workers who sign up for social security immediately: refers to how
  many people will sign up immediately upon introduction of the program."
- "Additional sign up percentage per year: additional percentage points of how many informal
  workers will sign up each year following the introduction. Presumably the participation
  rate will slowly increase with time."

Right, *Data sources* — "World Bank data retrieved via the World Bank API using the wbstats
R package." plus the live country's expenditure source, then two links (`#8B5B29`, "↗"):

- https://documents.worldbank.org/en/publication/documents-reports/api
- https://cran.r-project.org/web/packages/wbstats/vignettes/wbstats.html

and a `#796E65` caveat that subgroup sizes and employer shares are placeholders.

### Navigation bar

20px padding-top, space-between. **← Back** (ghost, `700 13px`; `rgba(94,81,77,.35)` and
`cursor: default` on step 1), a centred "Step N of 5" (`400 11.5px, #796E65`), and
**Next →** (`#FF671F`, `#2A211B`, 7px radius, 11px 20px, `900 13px`, hover `#8B5B29` with
white text). The next button reads "See the cost →" on step 4 and is
`visibility: hidden` on step 5.

## Interactions & behaviour

- Every control writes to one state object and the whole model re-runs; no debounce needed
  at these input sizes. Sliders update on change.
- Step rail is fully clickable — no forced linear progression, no validation gates.
- Choosing a subgroup sets both its size and its employer share; switching back to
  *Everyone informal* resets the employer share to 0.
- Changing country reloads that country's `workingAge`, `lfp`, `informal`, `inflation` and
  `spend` defaults, discarding manual overrides of those five fields only.
- `decreaseAfter` is clamped to `years`, so shortening the horizon cannot leave a taper
  starting after the end.
- Copy button writes a plain-text summary to the clipboard (country, eligibility, employer
  share, all assumptions, the three cost shares, coverage, per-worker savings) and shows a
  2.2s confirmation.
- CSV export builds a Blob and triggers a download named
  `wiego-subsidy-{country}-{years}yr.csv`: a `#`-commented assumption header, then
  `Year, Population, Informal workers, Enrolled workers, Government share %, Government
  cost, Employer cost, Worker cost, Cumulative government cost`.
- Responsive: the card is `max-width: 100%`; every multi-column block is
  `repeat(auto-fit, minmax(…, 1fr))` and every chart is a percentage-positioned label layer
  over an `aspect-ratio` SVG, so nothing needs a fixed height. Below ~560px the summary,
  share and subgroup grids collapse to one column. Hit targets are ≥ 36px on desktop; raise
  to 44px for touch.
- Accessibility: every slider has an `aria-label`; the country picker is a real `<select>`
  with a `<label>`; charts carry `role="img"` with an `aria-label` describing the series.
  Slider focus shows a 2px `#8B5B29` outline at 2px offset.

## State management

```
country, step (1–5), aboutOpen, notesOpen, copied,
years, contrib, govShare, employerShare, decreaseAfter,
signup, signupGrowth,
subgroup, subgroupName, subgroupPct,
informal, workingAge, lfp, inflation, interest,
spend, spendBasis
```

All client-side; no fetching in the prototype. In production, load the country table from
the World Bank API at startup (or build it at deploy time) and keep the rest local.

## Design tokens

Colours — WIEGO brand palette, preserve exactly:

| Token | Hex | Use |
|---|---|---|
| Orange | `#FF671F` | Government share, primary action, live figures, active progress |
| Green | `#8E8C13` | Worker share, positive deltas |
| Brown | `#8B5B29` | Values, secondary action, links, active borders |
| Dark khaki | `#5E514D` | Employer share, body text |
| Warm gray | `#796E65` | Captions, axis labels |
| Nude khaki | `#EFDBB2` | Intro panel, selected cards, country picker |
| Ink | `#3A312B` | Headings, dark fills |
| Ink (on orange) | `#2A211B` | Text on `#FF671F` |
| Card | `#FBF8F3` | Card surface |
| Desk | `#EDE8DE` | Page background |
| Panel | `#F3EDE1` | Inset panels, inactive step cards |
| Hairline | `rgba(94,81,77,.14)` | Dividers |
| Track | `rgba(94,81,77,.2)` | Slider tracks, inactive bars |

Type — **Lato** 400/700/900 for everything, **IBM Plex Mono** 500/700 for eyebrows, axis
labels and numerals (`font-variant-numeric: tabular-nums` on every changing figure).
Scale: 32/30 (step `h2`) · 24/21 (card values) · 17 (intro title) · 14.5 (lead) · 13.5
(intro body) · 12.5 (labels) · 12 (notes) · 11.5 (captions) · 9.5–10 mono (eyebrows, axes).

Spacing 4 / 6 / 9 / 12 / 16 / 18 / 22 / 26 / 34px. Radii 5 / 6 / 7 / 9 / 10px, pills 50%.
Shadows: card `0 2px 10px rgba(58,49,43,.07)`; slider thumb
`0 1px 4px rgba(58,49,43,.35)`. Sliders: 5px track, 3px radius, 17px `#FF671F` thumb with a
2.5px `#FBF8F3` ring.

## Assets

- **WIEGO logo** — a dashed 90×32 placeholder in the header; drop in the real asset.
- Fonts from Google Fonts (`Lato`, `IBM Plex Mono`); self-host in production.
- No images, icons or illustrations. All charts are inline SVG geometry with HTML label
  layers — no charting library required, and no icon font.

## Data provenance

World Bank indicators were pulled in the original Shiny app via the World Bank API using
the **wbstats** R package. Government expenditure figures are IMF Regional Economic Outlook
2024 (via FRED) except India, which is Reserve Bank of India central-government expenditure.
Replace the hard-coded country table with live calls, keep the level of government explicit
per country, and expect the informal-employment share to come from WIEGO/ILO rather than
the World Bank.

## Files

- `Social Security Calculator.dc.html` — the design, self-contained apart from `support.js`.
  Open it directly in a browser.
- `support.js` — the runtime the prototype file needs in order to render. Not part of the
  design; do not port it.
