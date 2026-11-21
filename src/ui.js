// CropPulse workbench. Wires the scenario/planner/exports model to native
// controls. All strings come from i18n.js; all charts are authored SVG.

import { SCENARIOS, STAGES } from './scenarios.js';
import { prepare, compare } from './planner.js';
import { scheduleCSV, scheduleICS, canonicalJSON, makeAudit, verifyAudit } from './exports.js';
import { T, scenarioNames, regionNames, cropNames } from './i18n.js';

const SVG = 'http://www.w3.org/2000/svg';
const PLOT_IDS = ['A', 'B', 'C'];
const AUDIT_MAX_BYTES = 1024 * 1024;

const state = {
  scenario: SCENARIOS[0].id,
  quota: SCENARIOS[0].quota,
  stages: SCENARIOS[0].plots.map(p => p.stage),
  shock: false,
  plot: 0,
  day: 0,
  es: false,
};
let input;
let comparison;
let dark = false;
const els = {};
const sig = {};

const t = () => T[state.es ? 'es' : 'en'];
const lang = () => (state.es ? 'es' : 'en');

const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
};
const sv = (tag, attrs = {}) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const num = (v, d = 1) => new Intl.NumberFormat(lang(), {
  minimumFractionDigits: d, maximumFractionDigits: d,
}).format(v);
const signed = (v, d = 1) => `${v > 0 ? '+' : v < 0 ? '-' : '±'}${num(Math.abs(v), d)}`;
const pct = v => `${num(v * 100, 1)}%`;

function solve() {
  input = prepare(state.scenario, { quota: state.quota, shock: state.shock, stages: state.stages });
  comparison = compare(input);
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function tableEl(cls) {
  const table = h('table', cls);
  table.append(h('thead'), h('tbody'));
  return table;
}
function setHead(table, cols) {
  const tr = h('tr');
  for (const label of cols) {
    const th = h('th', '', label);
    th.scope = 'col';
    tr.append(th);
  }
  table.tHead.replaceChildren(tr);
}
function setRows(table, rows, rowHead = false) {
  const frag = document.createDocumentFragment();
  for (const cells of rows) {
    const tr = h('tr');
    cells.forEach((cell, i) => {
      if (cell instanceof Node) {
        tr.append(cell);
      } else if (rowHead && i === 0) {
        const th = h('th', '', String(cell));
        th.scope = 'row';
        tr.append(th);
      } else {
        tr.append(h('td', '', String(cell)));
      }
    });
    frag.append(tr);
  }
  table.tBodies[0].replaceChildren(frag);
}
const td = (cls, text) => h('td', cls, text);
const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };

// ---------- build ----------

function buildControls() {
  const c = document.getElementById('controls');
  c.className = 'controls';
  els.controlsTitle = h('h2', 'section-title');
  c.append(els.controlsTitle);

  const gScenario = h('div', 'group');
  els.scenarioLabel = h('label', 'field-label');
  els.scenarioLabel.htmlFor = 'scenario';
  els.scenario = h('select', 'input');
  els.scenario.id = 'scenario';
  for (const s of SCENARIOS) {
    const o = h('option');
    o.value = s.id;
    els.scenario.append(o);
  }
  els.scenarioMeta = h('p', 'hint');
  gScenario.append(els.scenarioLabel, els.scenario, els.scenarioMeta);

  const gQuota = h('div', 'group');
  const qRow = h('div', 'label-row');
  els.quotaLabel = h('label', 'field-label');
  els.quotaLabel.htmlFor = 'quota';
  els.quotaValue = h('output', 'quota-value');
  els.quotaValue.id = 'quota-value';
  els.quotaValue.htmlFor = 'quota';
  qRow.append(els.quotaLabel, els.quotaValue);
  els.quota = h('input', 'input range');
  els.quota.id = 'quota';
  els.quota.type = 'range';
  els.quota.min = '0';
  els.quotaHint = h('p', 'hint');
  els.pumpNote = h('p', 'hint');
  gQuota.append(qRow, els.quota, els.quotaHint, els.pumpNote);

  const gShock = h('div', 'group');
  const sRow = h('div', 'check-row');
  els.shock = h('input', 'check');
  els.shock.id = 'shock';
  els.shock.type = 'checkbox';
  els.shockLabel = h('label', 'field-label inline');
  els.shockLabel.htmlFor = 'shock';
  sRow.append(els.shock, els.shockLabel);
  els.shockHint = h('p', 'hint');
  gShock.append(sRow, els.shockHint);

  const fs = h('fieldset', 'group stages');
  els.stageLegend = h('legend', 'field-label');
  fs.append(els.stageLegend);
  els.stageLabels = {};
  els.stageSelects = {};
  for (const id of PLOT_IDS) {
    const row = h('div', 'stage-row');
    const lab = h('label', 'field-label');
    lab.htmlFor = `stage-${id}`;
    const sel = h('select', 'input');
    sel.id = `stage-${id}`;
    for (const st of STAGES) {
      const o = h('option');
      o.value = st;
      sel.append(o);
    }
    row.append(lab, sel);
    fs.append(row);
    els.stageLabels[id] = lab;
    els.stageSelects[id] = sel;
  }

  els.synthetic = h('p', 'synthetic');
  c.append(gScenario, gQuota, gShock, fs, els.synthetic);
}

function scrollWrap() {
  const w = h('div', 'table-scroll');
  w.tabIndex = 0;
  w.setAttribute('role', 'region');
  els.regionLabels.push(w);
  return w;
}

function buildAnalysis() {
  const a = document.getElementById('analysis');
  a.setAttribute('aria-labelledby', 'figure-title');

  const head = h('div', 'hero-head');
  els.figureTitle = h('h2', 'section-title');
  els.figureTitle.id = 'figure-title';
  const selectors = h('div', 'selectors');
  const plotWrap = h('div', 'day-wrap');
  els.plotLabel = h('label', 'field-label');
  els.plotLabel.htmlFor = 'plot';
  els.plot = h('select', 'input');
  els.plot.id = 'plot';
  plotWrap.append(els.plotLabel, els.plot);
  const dayWrap = h('div', 'day-wrap');
  els.dayLabel = h('label', 'field-label');
  els.dayLabel.htmlFor = 'day';
  els.day = h('select', 'input');
  els.day.id = 'day';
  dayWrap.append(els.dayLabel, els.day);
  selectors.append(plotWrap, dayWrap);
  head.append(els.figureTitle, selectors);

  const metrics = h('div', 'metrics');
  els.metricsTitle = h('h2', 'section-title');
  const mScroll = scrollWrap();
  els.metricTable = tableEl('data-table metric-table');
  mScroll.append(els.metricTable);
  els.metricsNote = h('p', 'note');
  metrics.append(els.metricsTitle, mScroll, els.metricsNote);

  const figure = h('figure', 'chart-figure');
  els.chart = sv('svg', { id: 'chart', role: 'img', viewBox: '0 0 720 340' });
  els.chart.setAttribute('aria-labelledby', 'chart-title chart-desc');
  els.legend = h('ul', 'legend');
  els.chartCaption = h('figcaption', 'chart-caption');
  figure.append(els.chart, els.legend, els.chartCaption);

  const dayDet = h('details', 'chart-data day-detail');
  els.dayDetailSummary = h('summary');
  const dayScroll = scrollWrap();
  els.dayTable = tableEl('data-table day-table');
  dayScroll.append(els.dayTable);
  dayDet.append(els.dayDetailSummary, dayScroll);

  const det = h('details', 'chart-data');
  els.chartDataSummary = h('summary');
  const scroll = scrollWrap();
  els.chartTable = tableEl('data-table chart-table');
  scroll.append(els.chartTable);
  det.append(els.chartDataSummary, scroll);

  const plots = h('div', 'plots');
  els.plotsTitle = h('h2', 'section-title');
  els.plotGrid = h('div', 'plot-grid');
  plots.append(els.plotsTitle, els.plotGrid);

  els.planStatus = h('p', 'visually-hidden');
  els.planStatus.setAttribute('role', 'status');
  a.append(head, metrics, figure, dayDet, det, plots, els.planStatus);
}

function buildSchedule() {
  const s = document.getElementById('schedule');
  s.setAttribute('aria-labelledby', 'schedule-title');
  els.scheduleTitle = h('h2', 'section-title');
  els.scheduleTitle.id = 'schedule-title';

  const actions = h('div', 'actions');
  els.printButton = h('button', 'btn');
  els.printButton.id = 'print-button';
  els.printButton.type = 'button';
  els.csvButton = h('button', 'btn');
  els.csvButton.id = 'csv-button';
  els.csvButton.type = 'button';
  els.icsButton = h('button', 'btn');
  els.icsButton.id = 'ics-button';
  els.icsButton.type = 'button';
  els.auditButton = h('button', 'btn');
  els.auditButton.id = 'audit-button';
  els.auditButton.type = 'button';
  actions.append(els.printButton, els.csvButton, els.icsButton, els.auditButton);

  const verify = h('div', 'verify');
  els.auditLabel = h('label', 'field-label');
  els.auditLabel.htmlFor = 'audit-file';
  els.auditFile = h('input', 'input file');
  els.auditFile.id = 'audit-file';
  els.auditFile.type = 'file';
  els.auditFile.accept = '.json,application/json';
  els.auditStatus = h('p', 'audit-status');
  els.auditStatus.id = 'audit-status';
  els.auditStatus.setAttribute('role', 'status');
  verify.append(els.auditLabel, els.auditFile, els.auditStatus);
  actions.append(verify);

  const scroll = scrollWrap();
  els.schedTable = tableEl('data-table sched-table');
  scroll.append(els.schedTable);
  els.scheduleNote = h('p', 'note');
  s.append(els.scheduleTitle, actions, scroll, els.scheduleNote);
}

function buildMethod() {
  const m = document.getElementById('method');
  m.setAttribute('aria-labelledby', 'method-title');
  els.methodTitle = h('h2', 'section-title');
  els.methodTitle.id = 'method-title';
  els.methodHow = h('p', 'prose');
  els.methodModel = h('p', 'prose');
  els.methodLimits = h('p', 'prose');
  m.append(els.methodTitle, els.methodHow, els.methodModel, els.methodLimits);
}

function build() {
  els.regionLabels = [];
  els.skip = document.querySelector('.skip');
  els.nav = document.querySelector('.topbar nav');
  els.scheduleLink = document.getElementById('schedule-link');
  els.pageTitle = document.getElementById('page-title');
  els.langBtn = document.getElementById('language');
  els.themeBtn = document.getElementById('theme');
  buildControls();
  buildAnalysis();
  buildSchedule();
  buildMethod();
  wire();
}

// ---------- localize static chrome ----------

function localize() {
  const s = t();
  document.documentElement.lang = lang();
  document.title = s.docTitle;
  setText(els.skip, s.skip);
  els.nav.setAttribute('aria-label', s.navActions);
  setText(els.scheduleLink, s.scheduleLink);
  setText(els.pageTitle, s.pageTitle);
  setText(els.langBtn, s.langSwitch);
  els.langBtn.setAttribute('aria-label', s.langSwitchLabel);
  els.langBtn.lang = state.es ? 'en' : 'es';
  setText(els.themeBtn, dark ? s.themeToLight : s.themeToDark);
  els.themeBtn.setAttribute('aria-label', dark ? s.themeLightLabel : s.themeDarkLabel);
  els.themeBtn.setAttribute('aria-pressed', String(dark));

  setText(els.controlsTitle, s.settings);
  setText(els.synthetic, s.synthetic);
  setText(els.scenarioLabel, s.scenario);
  setText(els.quotaLabel, s.quota);
  setText(els.shockLabel, s.shock);
  setText(els.shockHint, s.shockHint);
  setText(els.stageLegend, s.stageLegend);

  setText(els.figureTitle, s.figureTitle);
  setText(els.dayLabel, s.dayLabel);
  setText(els.plotLabel, s.plotWord);
  setText(els.chartCaption, s.chartCaption);
  setText(els.dayDetailSummary, s.dayDetail);
  setText(els.chartDataSummary, s.chartDataToggle);
  for (const w of els.regionLabels) w.setAttribute('aria-label', s.scrollRegion);
  setText(els.metricsTitle, s.comparisonTitle);
  setText(els.metricsNote, s.metricsNote);
  setText(els.plotsTitle, s.plotsTitle);

  setText(els.scheduleTitle, s.scheduleTitle);
  setText(els.printButton, s.printButton);
  setText(els.csvButton, s.csvButton);
  setText(els.icsButton, s.icsButton);
  setText(els.auditButton, s.auditButton);
  setText(els.auditLabel, s.auditLabel);
  const statusKey = els.auditStatus.dataset.key || 'auditChoose';
  setText(els.auditStatus, s[statusKey] || s.auditChoose);
  setText(els.scheduleNote, s.scheduleNote);
  setText(els.methodTitle, s.methodTitle);
}

// ---------- render ----------

function renderScenario() {
  const s = t();
  const sc = input.scenario;
  for (const o of els.scenario.options) {
    o.textContent = scenarioNames[lang()][o.value];
  }
  els.scenario.value = sc.id;
  setText(els.scenarioMeta, s.scenarioMeta({
    region: regionNames[lang()][sc.id], lat: sc.latitude, elev: sc.elevation,
  }));

  const days = input.weather.length;
  const max = sc.lot * days * input.dailyLots;
  if (sig.quotaMax !== max) {
    sig.quotaMax = max;
    els.quota.max = String(max);
    els.quota.step = String(sc.lot);
  }
  if (els.quota.value !== String(state.quota)) els.quota.value = String(state.quota);
  setText(els.quotaValue, s.quotaDisplay(state.quota, Math.floor(state.quota / sc.lot)));
  setText(els.quotaHint, s.quotaHint(max, sc.lot));
  setText(els.pumpNote, s.pumpNote(input.dailyLots, sc.pumpMinutes));
  if (els.shock.checked !== state.shock) els.shock.checked = state.shock;

  const plotKey = `${lang()}:${sc.id}`;
  if (sig.plotKey !== plotKey) {
    sig.plotKey = plotKey;
    const frag = document.createDocumentFragment();
    sc.plots.forEach((p, i) => {
      const o = h('option', '', `${s.plotWord} ${p.id} - ${cropNames[lang()][p.cropId]}`);
      o.value = String(i);
      frag.append(o);
    });
    els.plot.replaceChildren(frag);
  }
  if (els.plot.value !== String(state.plot)) els.plot.value = String(state.plot);

  sc.plots.forEach((p, i) => {
    const sel = els.stageSelects[p.id];
    setText(els.stageLabels[p.id], s.stageFor(p.id, cropNames[lang()][p.cropId]));
    for (const o of sel.options) o.textContent = s.stageNames[o.value];
    if (sel.value !== state.stages[i]) sel.value = state.stages[i];
  });

  state.day = Math.min(state.day, days - 1);
  const dayKey = `${lang()}:${sc.id}:${days}`;
  if (sig.dayKey !== dayKey) {
    sig.dayKey = dayKey;
    const frag = document.createDocumentFragment();
    input.weather.forEach((w, i) => {
      const o = h('option', '', s.dayOption(i + 1, w.date));
      o.value = String(i);
      frag.append(o);
    });
    els.day.replaceChildren(frag);
  }
  if (els.day.value !== String(state.day)) els.day.value = String(state.day);
}

function linePts(days, pick) {
  return days.map((d, i) => `${pick.x(i)},${pick.y(d)}`).join(' ');
}

function legendSwatch(kind) {
  const g = sv('svg', { class: `swatch ${kind}`, viewBox: '0 0 30 12', 'aria-hidden': 'true' });
  if (kind === 'irr') {
    g.append(sv('rect', { x: 10, y: 2, width: 10, height: 9 }));
  } else {
    g.append(sv('line', { x1: 1, y1: 6, x2: 29, y2: 6 }));
  }
  return g;
}

function renderChart() {
  const s = t();
  const plot = input.plots[state.plot];
  const optDays = comparison.optimized.plots[state.plot].days;
  const calDays = comparison.baseline.plots[state.plot].days;
  const n = input.weather.length;
  const taw = plot.taw;
  const narrow = window.innerWidth < 560;
  const W = narrow ? 400 : 720;
  const H = narrow ? 380 : 340;
  const m = narrow ? { l: 38, r: 10, t: 18, b: 48 } : { l: 46, r: 16, t: 20, b: 46 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const cw = iw / n;
  const x = i => m.l + (i + 0.5) * cw;
  const y = v => m.t + ih * (1 - v / taw);
  sig.chartW = W;

  els.chart.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const title = sv('title', { id: 'chart-title' });
  title.textContent = s.chartTitle(plot.id, cropNames[lang()][plot.cropId]);
  const desc = sv('desc', { id: 'chart-desc' });
  desc.textContent = s.chartDesc;
  els.chart.replaceChildren(title, desc);
  const add = el => els.chart.append(el);

  // warm grid: quarter TAW rows plus full boundary
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    const gy = y(taw * f);
    add(sv('line', { class: 'grid', x1: m.l, y1: gy, x2: W - m.r, y2: gy }));
    const lab = sv('text', { class: 'tick', x: m.l - 6, y: gy + 4, 'text-anchor': 'end' });
    lab.textContent = num(taw * f, 0);
    add(lab);
  }
  const yl = sv('text', { class: 'axis-name', x: m.l, y: m.t - 6, 'text-anchor': 'start' });
  yl.textContent = s.axisY;
  add(yl);

  // day separators and selected-day band
  for (let i = 0; i <= n; i++) {
    add(sv('line', { class: 'vgrid', x1: m.l + i * cw, y1: m.t, x2: m.l + i * cw, y2: m.t + ih }));
  }
  add(sv('rect', {
    class: 'day-band', x: m.l + state.day * cw, y: m.t, width: cw, height: ih,
  }));

  // irrigation pulses as bars on the shared mm axis, optimized left, calendar right
  const bw = Math.min(16, cw * 0.3);
  for (let i = 0; i < n; i++) {
    const o = optDays[i];
    const c = calDays[i];
    if (o.pulse) {
      add(sv('rect', {
        class: 'bar-opt', x: x(i) - bw - 1.5, y: y(o.irrigation), width: bw, height: m.t + ih - y(o.irrigation),
      }));
    }
    if (c.pulse) {
      add(sv('rect', {
        class: 'bar-cal', x: x(i) + 1.5, y: y(c.irrigation), width: bw, height: m.t + ih - y(c.irrigation),
      }));
    }
  }

  // readily available water (varies daily) and the 90% stress line
  add(sv('polyline', {
    class: 'raw', points: linePts(optDays.map(d => d.raw), { x, y }), fill: 'none',
  }));
  const crit = y(0.9 * taw);
  add(sv('line', { class: 'crit', x1: m.l, y1: crit, x2: W - m.r, y2: crit }));
  const critLab = sv('text', { class: 'ref-label crit-label', x: W - m.r - 2, y: crit - 4, 'text-anchor': 'end' });
  critLab.textContent = '90%';
  add(critLab);
  const rawLab = sv('text', { class: 'ref-label raw-label', x: W - m.r - 2, y: y(optDays[n - 1].raw) - 5, 'text-anchor': 'end' });
  rawLab.textContent = `RAW ${num(optDays[n - 1].raw, 0)}`;
  add(rawLab);
  const tawLab = sv('text', { class: 'ref-label', x: W - m.r - 2, y: m.t + 12, 'text-anchor': 'end' });
  tawLab.textContent = `TAW ${num(taw, 0)}`;
  add(tawLab);

  // the two trajectories
  add(sv('polyline', {
    class: 'line-cal', points: linePts(calDays.map(d => d.dr), { x, y }), fill: 'none',
  }));
  add(sv('polyline', {
    class: 'line-opt', points: linePts(optDays.map(d => d.dr), { x, y }), fill: 'none',
  }));

  // selected-day markers and x labels
  add(sv('circle', { class: 'dot-cal', cx: x(state.day), cy: y(calDays[state.day].dr), r: 4.5 }));
  add(sv('circle', { class: 'dot-opt', cx: x(state.day), cy: y(optDays[state.day].dr), r: 4.5 }));
  const dfmt = new Intl.DateTimeFormat(lang(), { weekday: 'short', timeZone: 'UTC' });
  for (let i = 0; i < n; i++) {
    const lab = sv('text', { class: 'tick x', x: x(i), y: m.t + ih + 16, 'text-anchor': 'middle' });
    lab.textContent = dfmt.format(new Date(`${input.weather[i].date}T00:00:00Z`));
    add(lab);
    const sub = sv('text', { class: 'tick x sub', x: x(i), y: m.t + ih + 30, 'text-anchor': 'middle' });
    sub.textContent = input.weather[i].date.slice(5);
    add(sub);
  }

  const items = [
    ['opt', s.legendOpt], ['cal', s.legendCal], ['raw', s.legendRaw],
    ['crit', s.legendCrit], ['irr', s.legendIrr],
  ];
  const frag = document.createDocumentFragment();
  for (const [kind, label] of items) {
    const li = h('li', `legend-item ${kind}`);
    li.append(legendSwatch(kind), h('span', '', label));
    frag.append(li);
  }
  els.legend.replaceChildren(frag);
}

function renderDayTable() {
  const s = t();
  const o = comparison.optimized.plots[state.plot].days[state.day];
  const c = comparison.baseline.plots[state.plot].days[state.day];
  const w = input.weather[state.day];
  setHead(els.dayTable, s.dayTableCols);
  setRows(els.dayTable, [
    [s.dayRows.et0, td('num', `${num(w.et0, 2)} mm`), td('num', `${num(w.et0, 2)} mm`)],
    [s.dayRows.etc, td('num', `${num(o.etc, 2)} mm`), td('num', `${num(c.etc, 2)} mm`)],
    [s.dayRows.eta, td('num', `${num(o.eta, 2)} mm`), td('num', `${num(c.eta, 2)} mm`)],
    [s.dayRows.rain, td('num', `${num(o.rain, 1)} (${num(o.effectiveRain, 1)}) mm`), td('num', `${num(c.rain, 1)} (${num(c.effectiveRain, 1)}) mm`)],
    [s.dayRows.irr, td('num', `${num(o.irrigation, 2)} mm`), td('num', `${num(c.irrigation, 2)} mm`)],
    [s.dayRows.vol, td('num', `${num(o.volume, 0)} m3`), td('num', `${num(c.volume, 0)} m3`)],
    [s.dayRows.dr, td('num', `${num(o.dr, 1)} mm`), td('num', `${num(c.dr, 1)} mm`)],
    [s.dayRows.ks, td('num', num(o.ks, 3)), td('num', num(c.ks, 3))],
    [s.dayRows.dp, td('num', `${num(o.dp, 2)} mm`), td('num', `${num(c.dp, 2)} mm`)],
    [s.dayRows.runoff, td('num', `${num(o.runoff, 2)} mm`), td('num', `${num(c.runoff, 2)} mm`)],
    [s.dayRows.pulse, o.pulse ? s.yes : s.no, c.pulse ? s.yes : s.no],
  ], true);
}

function renderChartTable() {
  const s = t();
  const plot = input.plots[state.plot];
  const optDays = comparison.optimized.plots[state.plot].days;
  const calDays = comparison.baseline.plots[state.plot].days;
  const critical = 0.9 * plot.taw;
  setHead(els.chartTable, s.chartCols);
  setRows(els.chartTable, input.weather.map((w, i) => [
    String(i + 1), w.date,
    td('num', num(optDays[i].dr, 1)), td('num', num(calDays[i].dr, 1)),
    td('num', num(optDays[i].raw, 1)), td('num', num(critical, 1)),
    td('num', num(optDays[i].etc, 2)), td('num', num(optDays[i].rain, 1)),
    td('num', num(optDays[i].irrigation, 1)), td('num', num(calDays[i].irrigation, 1)),
  ]), true);
}

function barPair(base, opt) {
  const svg = sv('svg', { class: 'bars', viewBox: '0 0 72 14', 'aria-hidden': 'true' });
  const max = Math.max(base, opt) || 1;
  svg.append(
    sv('rect', { class: 'bar cal', x: 0, y: 1, width: Math.max(2, 68 * base / max), height: 5 }),
    sv('rect', { class: 'bar opt', x: 0, y: 8, width: Math.max(2, 68 * opt / max), height: 5 }),
  );
  return svg;
}

function barCell(pair) {
  const cell = td('bars-cell');
  cell.append(barPair(pair[0], pair[1]));
  return cell;
}

function renderMetrics() {
  const s = t();
  const b = comparison.baseline;
  const o = comparison.optimized;
  const cols = [...s.mCols, ''];
  setHead(els.metricTable, cols);
  const valueDelta = 100 * (o.valueIndex - b.valueIndex);
  const waterDelta = comparison.waterSavedPct === null || comparison.waterSavedPct === undefined
    ? s.waterSaved(`${signed(comparison.waterSaved, 0)} m3, ${s.deltaNA}`)
    : s.waterSaved(`${signed(comparison.waterSaved, 0)} m3, ${signed(comparison.waterSavedPct, 1)}%`);
  const bars = [
    [b.water, o.water], [b.yieldIndex, o.yieldIndex], [b.calorieIndex, o.calorieIndex],
    [b.valueIndex, o.valueIndex], [b.criticalDays, o.criticalDays],
  ];
  setRows(els.metricTable, [
    [s.mWater, td('num', `${num(b.water, 0)} m3`), td('num', `${num(o.water, 0)} m3`),
      td('num delta', waterDelta), barCell(bars[0])],
    [s.mYield, td('num', pct(b.yieldIndex)), td('num', pct(o.yieldIndex)),
      td('num delta', `${signed(comparison.yieldLossAvoidedPoints, 1)} ${s.pts}`), barCell(bars[1])],
    [s.mCal, td('num', pct(b.calorieIndex)), td('num', pct(o.calorieIndex)),
      td('num delta', `${signed(comparison.calorieGainPoints, 1)} ${s.pts}`), barCell(bars[2])],
    [s.mValue, td('num', pct(b.valueIndex)), td('num', pct(o.valueIndex)),
      td('num delta', `${signed(valueDelta, 1)} ${s.pts}`), barCell(bars[3])],
    [s.mCrit, td('num', String(b.criticalDays)), td('num', String(o.criticalDays)),
      td('num delta', s.criticalAvoided(signed(comparison.criticalDaysAvoided, 0))), barCell(bars[4])],
  ], true);
}

function renderPlots() {
  const s = t();
  if (!els.plotCards || els.plotCards.length !== input.plots.length) {
    els.plotCards = [];
    els.plotGrid.replaceChildren();
    input.plots.forEach((p, i) => {
      const btn = h('button', 'plot-card');
      btn.type = 'button';
      const name = h('span', 'plot-name');
      name.id = `plot-${i}-name`;
      const meta = h('span', 'plot-meta');
      const rows = [0, 1, 2].map(j => {
        const row = h('span', 'plot-row');
        row.id = `plot-${i}-stat${j}`;
        const k = h('span', 'k');
        const v = h('span', 'v');
        row.append(k, v);
        return { row, k, v };
      });
      const bars = h('span', 'plot-bars');
      btn.setAttribute('aria-labelledby', name.id);
      btn.setAttribute('aria-describedby', rows.map(r => r.row.id).join(' '));
      btn.append(name, meta, rows[0].row, rows[1].row, rows[2].row, bars);
      btn.addEventListener('click', () => {
        if (state.plot !== i) { state.plot = i; render(); }
      });
      els.plotGrid.append(btn);
      els.plotCards.push({ btn, name, meta, rows, bars });
    });
  }
  input.plots.forEach((p, i) => {
    const card = els.plotCards[i];
    const ob = comparison.baseline.plots[i];
    const oo = comparison.optimized.plots[i];
    card.btn.setAttribute('aria-pressed', String(i === state.plot));
    setText(card.name, `${s.plotWord} ${p.id} - ${cropNames[lang()][p.cropId]}`);
    setText(card.meta, `${s.stageNames[state.stages[i]]} · ${s.plotArea(p.area)}`);
    setText(card.rows[0].k, `${s.plotYield} (${s.optCal})`);
    setText(card.rows[0].v, `${pct(oo.yieldRatio)} / ${pct(ob.yieldRatio)}`);
    setText(card.rows[1].k, `${s.plotCrit} (${s.optCal})`);
    setText(card.rows[1].v, `${oo.criticalDays} / ${ob.criticalDays}`);
    setText(card.rows[2].k, `${s.plotWater} (${s.optCal})`);
    setText(card.rows[2].v, `${oo.lots} / ${ob.lots}`);
    card.bars.replaceChildren(barPair(ob.yieldRatio, oo.yieldRatio));
  });
}

function renderSchedule() {
  const s = t();
  setHead(els.schedTable, s.schedCols);
  const rows = [];
  for (const day of comparison.optimized.schedule) {
    if (day.events.length === 0) {
      const cell = td('rest', s.noPump);
      cell.colSpan = 6;
      rows.push([day.date, cell]);
    } else {
      for (const ev of day.events) {
        rows.push([
          day.date, ev.plot,
          td('num', ev.start.slice(11, 16)), td('num', ev.end.slice(11, 16)),
          td('num', num(ev.volume, 0)), td('num', num(ev.irrigation, 1)), td('num', num(ev.minutes, 0)),
        ]);
      }
    }
  }
  setRows(els.schedTable, rows, true);
  const hasEvents = comparison.optimized.schedule.some(d => d.events.length > 0);
  els.icsButton.disabled = !hasEvents;
  els.icsButton.title = hasEvents ? '' : s.icsDisabled;
}

function renderMethod() {
  const s = t();
  setText(els.methodHow, s.methodHow(input.scenario.lot, input.dailyLots));
  setText(els.methodModel, s.methodModel);
  setText(els.methodLimits, s.methodLimits);
}

function renderPrintSheet() {
  const s = t();
  const sheet = document.getElementById('print-sheet');
  sheet.setAttribute('aria-label', s.printTitle);
  sheet.replaceChildren(
    h('p', 'print-title', s.printTitle),
    h('p', 'print-meta', s.printMeta(scenarioNames[lang()][input.scenario.id], new Date().toISOString())),
  );
  const table = tableEl('print-table');
  setHead(table, s.schedCols.slice(0, 6));
  const rows = [];
  for (const day of comparison.optimized.schedule) {
    if (day.events.length === 0) {
      const cell = td('rest', s.noPump);
      cell.colSpan = 5;
      rows.push([day.date, cell]);
    } else {
      for (const ev of day.events) {
        rows.push([day.date, ev.plot, ev.start.slice(11, 16), ev.end.slice(11, 16),
          String(ev.volume), num(ev.irrigation, 1)]);
      }
    }
  }
  setRows(table, rows);
  sheet.append(
    table,
    h('p', 'print-usage', s.printUsage(comparison.optimized.water, input.quota, comparison.optimized.lots)),
    h('p', 'print-disclaimer', s.printDisclaimer),
  );
}

function announce() {
  const s = t();
  setText(els.planStatus,
    `${s.planUpdated}. ${s.mWater}: ${num(comparison.optimized.water, 0)} m3 (${s.legendOpt}), ${num(comparison.baseline.water, 0)} m3 (${s.legendCal}).`);
}

function render() {
  renderScenario();
  renderChart();
  renderDayTable();
  renderChartTable();
  renderMetrics();
  renderPlots();
  renderSchedule();
  renderMethod();
  renderPrintSheet();
  announce();
}

function refresh() {
  solve();
  render();
}

// ---------- events ----------

function wire() {
  els.scenario.addEventListener('change', () => {
    const sc = SCENARIOS.find(item => item.id === els.scenario.value);
    if (!sc) return;
    state.scenario = sc.id;
    state.quota = sc.quota;
    state.stages = sc.plots.map(p => p.stage);
    state.plot = 0;
    state.day = 0;
    refresh();
  });
  let quotaRaf = 0;
  els.quota.addEventListener('input', () => {
    state.quota = Number(els.quota.value);
    if (!quotaRaf) {
      quotaRaf = requestAnimationFrame(() => { quotaRaf = 0; refresh(); });
    }
  });
  els.shock.addEventListener('change', () => {
    state.shock = els.shock.checked;
    refresh();
  });
  PLOT_IDS.forEach((id, i) => {
    els.stageSelects[id].addEventListener('change', () => {
      state.stages[i] = els.stageSelects[id].value;
      refresh();
    });
  });
  els.plot.addEventListener('change', () => {
    state.plot = Number(els.plot.value);
    render();
  });
  els.day.addEventListener('change', () => {
    state.day = Number(els.day.value);
    render();
  });
  els.langBtn.addEventListener('click', () => {
    state.es = !state.es;
    try { localStorage.setItem('croppulse-lang', state.es ? 'es' : 'en'); } catch { /* private mode */ }
    localize();
    render();
  });
  els.themeBtn.addEventListener('click', () => {
    dark = !dark;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('croppulse-theme', dark ? 'dark' : 'light'); } catch { /* private mode */ }
    localize();
  });
  els.printButton.addEventListener('click', () => {
    renderPrintSheet();
    window.print();
  });
  els.csvButton.addEventListener('click', () => {
    download(`croppulse-schedule-${input.scenario.id}.csv`, scheduleCSV(comparison.optimized), 'text/csv');
  });
  els.icsButton.addEventListener('click', () => {
    const text = scheduleICS(comparison.optimized, input.scenario.id, { es: state.es });
    if (text === null || text === undefined) return;
    download(`croppulse-schedule-${input.scenario.id}.ics`, text, 'text/calendar');
  });
  const setStatus = (key, stateName) => {
    els.auditStatus.dataset.state = stateName || 'idle';
    els.auditStatus.dataset.key = key;
    els.auditStatus.textContent = t()[key];
  };
  els.auditButton.addEventListener('click', async () => {
    const snapshot = input;
    try {
      const audit = await makeAudit(snapshot, comparison);
      download(`croppulse-audit-${snapshot.scenario.id}.json`, `${canonicalJSON(audit)}\n`, 'application/json');
    } catch {
      setStatus('auditExportFail', 'bad');
    }
  });
  els.auditFile.addEventListener('change', async () => {
    const file = els.auditFile.files && els.auditFile.files[0];
    if (!file) { setStatus('auditChoose', 'idle'); return; }
    if (file.size > AUDIT_MAX_BYTES) { setStatus('auditTooBig', 'bad'); return; }
    let bundle;
    try {
      bundle = JSON.parse(await file.text());
    } catch {
      setStatus('auditNotJson', 'bad');
      return;
    }
    try {
      const result = await verifyAudit(bundle);
      if (result.digestValid && result.replayValid) setStatus('auditOk', 'good');
      else if (result.digestValid) setStatus('auditDigestOnly', 'warn');
      else setStatus('auditFail', 'bad');
    } catch {
      setStatus('auditFail', 'bad');
    }
  });
  window.addEventListener('beforeprint', renderPrintSheet);
  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      const wantW = window.innerWidth < 560 ? 400 : 720;
      if (wantW !== sig.chartW) renderChart();
    });
  });
}

// ---------- init ----------

function init() {
  try {
    dark = localStorage.getItem('croppulse-theme') === 'dark';
    state.es = localStorage.getItem('croppulse-lang') === 'es';
  } catch { /* private mode */ }
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  build();
  localize();
  refresh();
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
    });
  }
}

init();
