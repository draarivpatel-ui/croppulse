---
name: CropPulse
description: A field notebook workbench for a simulated irrigation plan, ruled like a ledger and read like a chart of record.
colors:
  ivory-paper: '#f4eee0'
  raised-paper: '#faf6ea'
  warm-ink: '#2b2417'
  ink-soft: '#5d5340'
  row-rule: '#d8cdb4'
  rule-strong: '#7a6d4e'
  forest-data: '#2e5c38'
  forest-deep: '#1e4026'
  forest-wash: 'rgba(46, 92, 56, 0.16)'
  terra-calendar: '#a8523a'
  amber-raw: '#7a5d0f'
  sienna-critical: '#8c3a1c'
  warm-grid: '#e3d8be'
  day-band: 'rgba(46, 92, 56, 0.07)'
  focus-blue: '#1f5fae'
  dark-paper: '#1e1a12'
  dark-raised: '#262017'
  dark-ink: '#eae1cd'
  dark-forest: '#8ab892'
  dark-terra: '#d08a6c'
typography:
  display:
    fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif'
    fontSize: 'clamp(2.1rem, 4.6vw, 3.3rem)'
    fontWeight: '700'
    lineHeight: '1.05'
    letterSpacing: '-0.022em'
  headline:
    fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif'
    fontSize: '1.45rem'
    fontWeight: '700'
    letterSpacing: '-0.015em'
  body:
    fontFamily: '"Avenir Next", Avenir, "Segoe UI", "Helvetica Neue", Arial, sans-serif'
    fontSize: '15px'
    lineHeight: '1.55'
  label:
    fontFamily: '"Avenir Next", Avenir, "Segoe UI", "Helvetica Neue", Arial, sans-serif'
    fontSize: '0.78rem'
    fontWeight: '650'
    letterSpacing: '0.06em'
rounded:
  control: '4px'
  panel: '6px'
spacing:
  hairline: '1px'
  group-pad: '1rem'
  column-gap: 'clamp(1.6rem, 3.5vw, 3.2rem)'
  section-gap: '2.4rem'
  page-gutter: 'clamp(1rem, 4vw, 2.5rem)'
components:
  button-secondary:
    border: '1px solid {colors.rule-strong}'
    rounded: '{rounded.control}'
    background: '{colors.raised-paper}'
    color: '{colors.warm-ink}'
    padding: '0.42rem 0.8rem'
  input-select:
    border: '1px solid {colors.rule-strong}'
    rounded: '{rounded.control}'
    background: '{colors.raised-paper}'
    padding: '0.42rem 0.55rem'
  table-ledger:
    border: '0'
    color: '{colors.warm-ink}'
    fontSize: '0.88rem'
---

# Design System: CropPulse

## Overview

**Creative North Star: "The Field Notebook"**

CropPulse looks like the ruled notebook a grower keeps next to the pump log:
warm ivory paper, hairline row rules, and two ink colors that never blur
together, forest green for the optimized plan and muted terracotta for the
fixed calendar. The layout is a code-led workbench, not a marketing page: a
settings column on the left, one dominant water-depletion figure on the right,
a ledger of plan differences, then the weekly schedule and the method notes.

Everything earns its rule. There are no decorative cards, no illustration,
no pills; separation comes from hairlines and spacing. Data numerals are
tabular, axes are labeled, and every surface states plainly that the data is
synthetic.

**Key Characteristics:**

- Ivory paper ground with hairline ledger rules
- Two data inks: forest green (optimized), terracotta (fixed calendar)
- Expressive serif display face, quiet sans for everything else
- One authored chart per plot, dense and gridded like a chart of record
- Focus is always visible; every interactive element is a native control

## Colors

The palette is pulled from paper, graphite, and field ink. Warm neutrals only;
gray appears nowhere on its own.

### Primary
- **Forest Data** (#2e5c38): optimized plan trajectory, selected states,
  primary data accents, positive verification.
- **Forest Deep** (#1e4026): wordmark, display type accents, hover ink.

### Secondary
- **Terra Calendar** (#a8523a): the fixed calendar baseline, dashed on the
  chart and outlined in every comparison bar.
- **Amber Raw** (#8f6d1c): the readily available water reference line and
  cautionary hints.

### Tertiary
- **Sienna Critical** (#8c3a1c): the 90% stress line and rejected audit states.

### Neutral
- **Ivory Paper** (#f4eee0): page ground.
- **Raised Paper** (#faf6ea): controls, top bar, chart figure ground.
- **Warm Ink** (#2b2417): primary text.
- **Ink Soft** (#5d5340): secondary text, labels, hints; tinted from the ink,
  never plain gray.
- **Row Rule** (#d8cdb4): hairlines between every row and group.
- **Warm Grid** (#e3d8be): chart gridlines, lighter than the row rules.

**The Two-Ink Rule.** Data is forest or terracotta and never a third hue.
Amber and sienna mark thresholds only; they never carry a data series.

## Typography

**Display Font:** Iowan Old Style (with Palatino and Georgia fallback)
**Body Font:** Avenir Next (with Segoe UI and Helvetica Neue fallback)
**Label/Mono Font:** none; data uses the body face with tabular numerals

The display face gives headings a printed-manual voice; the sans keeps tables
and controls crisp and impersonal.

### Hierarchy
- **Display** (700, clamp 2.1 to 3.3rem, 1.05): the workbench title; appears once.
- **Headline** (700, 1.45rem, 1.15): section titles, always alone with no
  eyebrow, tagline, or helper line adjacent.
- **Body** (400, 15px, 1.55): prose and controls.
- **Label** (650, 0.78rem, 0.06em, uppercase): field labels and table heads.
- **Data** (400, 0.88rem, tabular-nums): every numeric cell.
- **Fine print** (400 to 650, 0.72 to 0.82rem): notes, audit status, chart
  captions, and disclaimers; the smallest roles, always at 4.5:1 contrast or
  better on the paper they sit on.

**The Title Stands Alone Rule.** No heading in the app carries a kicker above
it or a caption beneath it. Context notes live at the bottom of panels.

## Layout

A single-column editorial shell capped at 1180px. The workbench itself is a
two-column grid: a 285px settings column of ruled control groups on the left;
on the right, the plot and day selectors, the five-row plan-comparison ledger,
the dominant depletion figure with its selected-day and full-chart ledgers,
then a grid of three plot cards. Below the workbench, the seven-day schedule
table and the method section.

At 900px the columns collapse into one stack and the settings become an
auto-fit grid of groups. At 390px the chart switches to a compact viewBox so
labels stay legible; nothing scrolls sideways at the page level.

### Print

The print sheet is deliberately monochrome-neutral: ink near-black (#111) on
white with gray (#333 to #999) rules and labels, not the forest/terracotta
palette, so the schedule reads on any laser printer. The display serif is
kept for the sheet title at 16pt; data drops to 7 to 9.5pt.

## Elevation & Depth

Flat by construction. Depth is declared once, with a border or a fill, never
with shadows. Selected states use a 2px forest border plus the pale forest
wash; everything else sits on hairlines.

### Named Rules
**The Hairline Rule.** Separation comes from `row-rule` hairlines and
`rule-strong` borders at 1 to 2px. No drop shadows anywhere.

## Shapes

Squared, utilitarian corners: 4px on controls and inputs, 6px on plot cards.
Circles appear only as chart markers and the synthetic-data dot. Nothing
pill-shaped; nothing clipped or masked.

## Components

### Buttons
- **Shape:** near-square with gently eased corners (4px radius)
- **Secondary (default):** raised paper fill, 1px strong rule, ink text;
  hover picks up the forest wash and a forest border.
- **Disabled:** half opacity, no pointer, rule-colored border.

### Inputs / Fields
- **Style:** 1px strong rule, raised paper, 4px radius, full-width in the
  settings column.
- **Focus:** 2.5px focus-blue outline, offset 2px; always visible.
- **Range and checkbox:** native, tinted forest via accent-color.

### Navigation
- **Style:** topbar is a single hairline-bottomed strip; wordmark is display
  serif; action links are quiet text with an underlined rule, not buttons.
- **Mobile:** wraps under the wordmark without a menu.

### Plot Cards
- **Corner Style:** 6px
- **Background:** raised paper; selected card takes the forest wash and a
  2px forest border (padding compensated so nothing shifts).
- **Content:** display-serif plot name, meta line, three ruled stat rows,
  one shaded before/after bar pair.

### Tables (the ledger)
- Hairline row rules top of every row, a 1.5px strong rule under the head.
- Header cells are small uppercase labels; first column is a row header.
- Numbers right-aligned with tabular numerals; differences carry a sign.

### Chart of Record
- Warm quarter-TAW gridlines, per-day vertical separators, a pale green band
  under the selected day.
- Optimized is a solid forest line; fixed calendar is dashed terracotta;
  RAW is dotted amber; the 90% stress line is dashed sienna.
- Irrigation pulses are small bars on the same mm axis: filled green for the
  plan, outlined terracotta for the calendar.

## Do's and Don'ts

### Do:
- **Do** keep every numeric column in tabular numerals and right-aligned.
- **Do** label every data surface synthetic and unreviewed; place the label
  at the bottom of the panel, never under a title.
- **Do** use the forest wash plus border for selection; hover changes border
  and wash, never shadow.
- **Do** keep UTC on every time shown in the schedule.

### Don't:
- **Don't** add eyebrows, taglines, or helper lines adjacent to a heading.
- **Don't** use pills, rounded cards, gradient text, or shadows.
- **Don't** gray out secondary text to plain gray; use ink-soft so it stays
  inside the warm family.
- **Don't** let amber or sienna carry a data series; they are thresholds.
