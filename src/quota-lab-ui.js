// CropPulse quota and stress lab panel. Mounted lazily by ui.js so the
// section stays hidden if this module is absent (offline old shell, stripped
// file). Owns its settings, draws two authored SVG charts, exports the
// audited brief, mirrors state into the #cp= bookmark hash and runs the
// deterministic in-page checks.

import { SCENARIOS } from './scenarios.js';
import { T, cropNames, regionNames, scenarioNames } from './i18n.js';
import { STRATEGIES, buildBrief, compareStrategies, decodeState, encodeState,
  labInput, labScenario, labSelfChecks, maxQuota, quotaSweep, tamperForDemo,
  verifyBrief } from './quota-lab.js';

const SVG = 'http://www.w3.org/2000/svg';

export function mountLab(section) {
  const els = {};
  let es = false;
  try { es = localStorage.getItem('croppulse-lang') === 'es'; } catch { /* private mode */ }
  const t = () => T[es ? 'es' : 'en'];
  const lang = () => (es ? 'es' : 'en');
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
  const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };

  const state = { v: 1, case: SCENARIOS[0].id, quota: SCENARIOS[0].quota,
    shock: false, strategy: 'calorie-optimal', plot: 0 };
  const decoded = decodeState(location.hash);
  if (decoded) Object.assign(state, decoded);
  let selDay = 0;

  let inputKey = '';
  let cachedInput = null;
  let cmpKey = '';
  let cachedComparison = null;
  let sweepKey = '';
  let cachedSweep = null;
  const input = () => {
    const key = `${state.case}|${state.quota}|${state.shock}`;
    if (key !== inputKey) {
      cachedInput = labInput(state.case, { quota: state.quota, shock: state.shock });
      inputKey = key;
    }
    return cachedInput;
  };
  const comparison = () => {
    const realKey = `${state.case}|${state.quota}|${state.shock}`;
    if (realKey !== cmpKey) {
      cachedComparison = compareStrategies(input());
      cmpKey = realKey;
    }
    return cachedComparison;
  };
  const sweep = () => {
    const key = `${state.case}|${state.shock}`;
    if (key !== sweepKey) {
      cachedSweep = quotaSweep(state.case, { shock: state.shock });
      sweepKey = key;
    }
    return cachedSweep;
  };
  const selectedRun = () => comparison().strategies.find(run => run.id === state.strategy);

  // ---------- build ----------

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
  const td = (cls, text) => h('td', cls, text);

  function scrollWrap() {
    const w = h('div', 'table-scroll');
    w.tabIndex = 0;
    w.setAttribute('role', 'region');
    w.setAttribute('aria-label', t().scrollRegion);
    return w;
  }

  function build() {
    section.setAttribute('aria-labelledby', 'lab-title');
    els.title = h('h2', 'section-title');
    els.title.id = 'lab-title';

    const controls = h('div', 'lab-controls');

    const gCase = h('div', 'group');
    els.caseLabel = h('label', 'field-label');
    els.caseLabel.htmlFor = 'lab-case';
    els.case = h('select', 'input');
    els.case.id = 'lab-case';
    for (const s of SCENARIOS) {
      const o = h('option');
      o.value = s.id;
      els.case.append(o);
    }
    els.caseMeta = h('p', 'hint');
    gCase.append(els.caseLabel, els.case, els.caseMeta);

    const gQuota = h('div', 'group');
    const qRow = h('div', 'label-row');
    els.quotaLabel = h('label', 'field-label');
    els.quotaLabel.htmlFor = 'lab-quota';
    els.quotaValue = h('output', 'quota-value');
    els.quotaValue.id = 'lab-quota-value';
    els.quotaValue.htmlFor = 'lab-quota';
    qRow.append(els.quotaLabel, els.quotaValue);
    els.quota = h('input', 'input range');
    els.quota.id = 'lab-quota';
    els.quota.type = 'range';
    els.quota.min = '0';
    els.quotaHint = h('p', 'hint');
    gQuota.append(qRow, els.quota, els.quotaHint);

    const gShock = h('div', 'group');
    const sRow = h('div', 'check-row');
    els.shock = h('input', 'check');
    els.shock.id = 'lab-shock';
    els.shock.type = 'checkbox';
    els.shockLabel = h('label', 'field-label inline');
    els.shockLabel.htmlFor = 'lab-shock';
    sRow.append(els.shock, els.shockLabel);
    els.shockHint = h('p', 'hint');
    gShock.append(sRow, els.shockHint);

    const gStrategy = h('div', 'group');
    els.strategyLabel = h('label', 'field-label');
    els.strategyLabel.htmlFor = 'lab-strategy';
    els.strategy = h('select', 'input');
    els.strategy.id = 'lab-strategy';
    for (const id of STRATEGIES) {
      const o = h('option');
      o.value = id;
      els.strategy.append(o);
    }
    gStrategy.append(els.strategyLabel, els.strategy);

    const gPlot = h('div', 'group');
    els.plotLabel = h('label', 'field-label');
    els.plotLabel.htmlFor = 'lab-plot';
    els.plot = h('select', 'input');
    els.plot.id = 'lab-plot';
    for (let i = 0; i < 3; i++) {
      const o = h('option');
      o.value = String(i);
      els.plot.append(o);
    }
    gPlot.append(els.plotLabel, els.plot);

    controls.append(gCase, gQuota, gShock, gStrategy, gPlot);

    const comp = h('div', 'metrics lab-comp');
    els.compTitle = h('h3', 'lab-sub');
    const compScroll = scrollWrap();
    els.compTable = tableEl('data-table comp-table');
    compScroll.append(els.compTable);
    els.compNote = h('p', 'note');
    comp.append(els.compTitle, compScroll, els.compNote);

    const fFig = h('figure', 'chart-figure lab-figure');
    els.qchart = sv('svg', { class: 'labchart', id: 'lab-frontier', role: 'img', viewBox: '0 0 720 300' });
    els.qchart.setAttribute('aria-labelledby', 'lab-f-title lab-f-desc');
    els.fLegend = h('ul', 'legend');
    els.fCaption = h('figcaption', 'chart-caption');
    fFig.append(els.qchart, els.fLegend, els.fCaption);

    const eFig = h('figure', 'chart-figure lab-figure');
    els.echart = sv('svg', { class: 'labchart', id: 'lab-envelope', role: 'img', viewBox: '0 0 720 280' });
    els.echart.setAttribute('aria-labelledby', 'lab-e-title lab-e-desc');
    els.eLegend = h('ul', 'legend');
    els.eCaption = h('figcaption', 'chart-caption');
    els.dayStatus = h('p', 'note lab-day-status');
    els.dayStatus.setAttribute('role', 'status');
    eFig.append(els.echart, els.eLegend, els.eCaption, els.dayStatus);

    const exp = h('div', 'lab-export');
    els.exportTitle = h('h3', 'lab-sub');
    const actions = h('div', 'actions');
    for (const id of ['lab-json', 'lab-csv', 'lab-md', 'lab-link', 'lab-verify', 'lab-tamper']) {
      const b = h('button', 'btn');
      b.id = id;
      b.type = 'button';
      els[id.slice(4)] = b;
      actions.append(b);
    }
    const fpr = h('p', 'fingerprint');
    els.fingerprintLabel = h('span', 'fingerprint-label');
    els.digest = h('code', 'digest');
    fpr.append(els.fingerprintLabel, els.digest);
    const shareWrap = h('div', 'share-wrap');
    els.shareLabel = h('label', 'field-label');
    els.shareLabel.htmlFor = 'lab-share';
    els.share = h('input', 'input share');
    els.share.id = 'lab-share';
    els.share.type = 'text';
    els.share.readOnly = true;
    shareWrap.append(els.shareLabel, els.share);
    els.integrity = h('p', 'audit-status');
    els.integrity.setAttribute('role', 'status');
    exp.append(els.exportTitle, actions, fpr, shareWrap, els.integrity);

    const checks = h('details', 'chart-data lab-checks');
    checks.id = 'lab-checks';
    els.checksSummary = h('summary');
    const cInner = h('div', 'checks-body');
    els.run = h('button', 'btn');
    els.run.id = 'lab-run';
    els.run.type = 'button';
    els.checksStatus = h('p', 'audit-status checks-status');
    els.checksStatus.setAttribute('role', 'status');
    els.checkList = h('ul', 'check-list');
    els.checksNote = h('p', 'note');
    cInner.append(els.run, els.checksStatus, els.checkList, els.checksNote);
    checks.append(els.checksSummary, cInner);

    els.synthetic = h('p', 'synthetic');
    section.append(els.title, controls, comp, fFig, eFig, exp, checks, els.synthetic);
  }

  // ---------- localize ----------

  function localizeLab() {
    const s = t();
    setText(els.title, s.labTitle);
    setText(els.caseLabel, s.labCase);
    setText(els.quotaLabel, s.labQuota);
    setText(els.shockLabel, s.labShock);
    setText(els.shockHint, s.labShockHint);
    setText(els.strategyLabel, s.labStrategy);
    setText(els.plotLabel, s.labPlot);
    for (const o of els.case.options) o.textContent = scenarioNames[lang()][o.value];
    for (const o of els.strategy.options) o.textContent = s.labStrategies[o.value];
    setText(els.compTitle, s.labCompTitle);
    setText(els.compNote, s.labCompNote);
    setText(els.fCaption, s.labFrontierCaption);
    setText(els.eCaption, s.labEnvCaption);
    setText(els.exportTitle, s.labExportTitle);
    setText(els.json, s.labJson);
    setText(els.csv, s.labCsv);
    setText(els.md, s.labMd);
    setText(els.link, s.labLink);
    setText(els.verify, s.labVerify);
    setText(els.tamper, s.labTamper);
    setText(els.fingerprintLabel, `${s.labFingerprint} `);
    setText(els.shareLabel, s.labShareLabel);
    els.integrity.dataset.key = els.integrity.dataset.key || 'labVerifyIdle';
    setText(els.integrity, s[els.integrity.dataset.key] || s.labVerifyIdle);
    setText(els.checksSummary, s.labChecksTitle);
    setText(els.run, s.labRun);
    setText(els.checksNote, s.labChecksNote);
    setText(els.synthetic, s.labSynthetic);
    for (const w of section.querySelectorAll('.table-scroll')) {
      w.setAttribute('aria-label', s.scrollRegion);
    }
  }

  // ---------- render ----------

  function renderControls() {
    const s = t();
    const scenario = labScenario(state.case);
    els.case.value = state.case;
    setText(els.caseMeta, s.scenarioMeta({
      region: regionNames[lang()][state.case],
      lat: scenario.latitude, elev: scenario.elevation,
    }));
    const sliderMax = Math.min(maxQuota(state.case),
      scenario.lot * scenario.weather.length * input().dailyLots);
    if (els.quota.max !== String(sliderMax)) {
      els.quota.max = String(sliderMax);
      els.quota.step = 'any';
    }
    if (els.quota.value !== String(state.quota)) els.quota.value = String(state.quota);
    setText(els.quotaValue, s.labQuotaDisplay(num(state.quota, state.quota % 1 ? 1 : 0),
      Math.floor(state.quota / scenario.lot)));
    setText(els.quotaHint, s.labQuotaHint(sliderMax, scenario.lot));
    if (els.shock.checked !== state.shock) els.shock.checked = state.shock;
    els.strategy.value = state.strategy;
    const plotKey = `${lang()}:${state.case}`;
    if (els.plotSig !== plotKey) {
      els.plotSig = plotKey;
      const frag = document.createDocumentFragment();
      input().plots.forEach((p, i) => {
        const o = h('option', '', `${s.plotWord} ${p.id} - ${cropNames[lang()][p.cropId]}`);
        o.value = String(i);
        frag.append(o);
      });
      els.plot.replaceChildren(frag);
    }
    els.plot.value = String(state.plot);
  }

  function renderComparator() {
    const s = t();
    setHead(els.compTable, s.labCompCols);
    const frag = document.createDocumentFragment();
    for (const run of comparison().strategies) {
      const tr = h('tr');
      if (run.id === state.strategy) tr.className = 'sel';
      const th = h('th');
      th.scope = 'row';
      const pick = h('button', 'pick');
      pick.type = 'button';
      pick.dataset.strategy = run.id;
      pick.setAttribute('aria-pressed', String(run.id === state.strategy));
      pick.append(h('span', '', s.labStrategies[run.id]));
      if (run.id === state.strategy) pick.append(h('span', 'pick-sel', ` ${s.labSelected}`));
      th.append(pick);
      tr.append(
        th,
        td('num', `${num(run.water, 0)} m3`),
        td('num', num(run.calories, 0)),
        td('num', num(run.kg, 1)),
        td('num', num(run.value, 2)),
        td('num', String(run.criticalDays)),
        td('num', String(run.stressDays)),
        td('num', `${num(run.maxDepletionPct, 1)}%`),
        td('num', run.productivity === null ? s.labNoProd : num(run.productivity, 0)),
      );
      frag.append(tr);
    }
    els.compTable.tBodies[0].replaceChildren(frag);
  }

  function linePts(days, pick) {
    return days.map((d, i) => `${pick.x(i)},${pick.y(d)}`).join(' ');
  }

  function renderFrontier() {
    const s = t();
    const pts = sweep().points;
    const scenario = labScenario(state.case);
    const W = 720;
    const H = 300;
    const m = { l: 60, r: 52, t: 18, b: 44 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const qMin = Math.min(...pts.map(p => p.quota));
    const qMax = Math.max(...pts.map(p => p.quota));
    const calTop = Math.max(1, ...pts.flatMap(p => [p.optimalCalories, p.calendarCalories])) * 1.06;
    const critTop = Math.max(1, ...pts.map(p => p.optimalCritical)) + 0.5;
    const x = q => m.l + iw * (q - qMin) / ((qMax - qMin) || 1);
    const yCal = v => m.t + ih * (1 - v / calTop);
    const yCrit = v => m.t + ih * (1 - v / critTop);

    els.qchart.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const title = sv('title', { id: 'lab-f-title' });
    title.textContent = s.labFrontierTitle;
    const desc = sv('desc', { id: 'lab-f-desc' });
    desc.textContent = s.labFrontierDesc;
    els.qchart.replaceChildren(title, desc);
    const add = el => els.qchart.append(el);

    for (let i = 0; i <= 4; i++) {
      const gy = m.t + ih * i / 4;
      add(sv('line', { class: 'grid', x1: m.l, y1: gy, x2: W - m.r, y2: gy }));
      const lab = sv('text', { class: 'tick', x: m.l - 6, y: gy + 4, 'text-anchor': 'end' });
      lab.textContent = `${num(calTop * (4 - i) / 4 / 1e6, 1)}M`;
      add(lab);
      const clab = sv('text', { class: 'tick r', x: W - m.r + 6, y: gy + 4, 'text-anchor': 'start' });
      clab.textContent = num(critTop * (4 - i) / 4, 1);
      add(clab);
    }
    const ylab = sv('text', { class: 'axis-name', x: m.l, y: m.t - 6, 'text-anchor': 'start' });
    ylab.textContent = s.labAxisKcal;
    add(ylab);
    const rlab = sv('text', { class: 'axis-name r', x: W - m.r, y: m.t - 6, 'text-anchor': 'end' });
    rlab.textContent = s.labAxisCrit;
    add(rlab);
    const xlab = sv('text', { class: 'axis-name', x: m.l + iw / 2, y: H - 4, 'text-anchor': 'middle' });
    xlab.textContent = s.labAxisQuota;
    add(xlab);

    const cliffArea = sv('path', { class: 'crit-area' });
    let dPath = `M${x(pts[0].quota)},${yCrit(pts[0].optimalCritical)}`;
    for (let i = 1; i < pts.length; i++) {
      dPath += ` L${x(pts[i].quota)},${yCrit(pts[i - 1].optimalCritical)}` +
        ` L${x(pts[i].quota)},${yCrit(pts[i].optimalCritical)}`;
    }
    dPath += ` L${x(pts[pts.length - 1].quota)},${m.t + ih} L${x(pts[0].quota)},${m.t + ih} Z`;
    cliffArea.setAttribute('d', dPath);
    add(cliffArea);

    const caseX = x(scenario.quota);
    add(sv('line', { class: 'mark', x1: caseX, y1: m.t, x2: caseX, y2: m.t + ih }));
    const caseLab = sv('text', { class: 'ref-label mark-label', x: caseX + 4, y: m.t + 12, 'text-anchor': 'start' });
    caseLab.textContent = s.labCaseLine;
    add(caseLab);

    add(sv('polyline', {
      class: 'line-cal',
      points: pts.map(p => `${x(p.quota)},${yCal(p.calendarCalories)}`).join(' '), fill: 'none',
    }));
    for (const p of pts) {
      add(sv('rect', {
        class: 'sq-cal', x: x(p.quota) - 3, y: yCal(p.calendarCalories) - 3, width: 6, height: 6,
      }));
    }
    add(sv('polyline', {
      class: 'line-opt',
      points: pts.map(p => `${x(p.quota)},${yCal(p.optimalCalories)}`).join(' '), fill: 'none',
    }));

    for (const p of pts) {
      const dot = sv('circle', {
        class: 'qdot', cx: x(p.quota), cy: yCal(p.optimalCalories), r: 5.5,
        tabindex: '0', role: 'button',
        'aria-label': s.labPoint(p.pct, num(p.quota, 1), num(p.optimalCalories, 0), p.optimalCritical),
      });
      dot.dataset.quota = String(p.quota);
      add(dot);
    }

    const cliff = sweep().cliffQuota;
    const cliffPt = pts.find(p => p.quota === cliff);
    if (cliffPt) {
      const cx = x(cliffPt.quota);
      const cy = yCal(cliffPt.optimalCalories);
      add(sv('path', {
        class: 'cliff', d: `M${cx},${cy - 9} L${cx + 7},${cy} L${cx},${cy + 9} L${cx - 7},${cy} Z`,
        'pointer-events': 'none',
      }));
      const toRight = cx < W * 0.55;
      const cliffLab = sv('text', { class: 'ref-label cliff-label',
        x: toRight ? cx + 10 : cx - 10, y: m.t + 26,
        'text-anchor': toRight ? 'start' : 'end' });
      cliffLab.textContent = s.labCliff;
      add(cliffLab);
    }

    for (let i = 0; i < pts.length; i += 2) {
      const lab = sv('text', { class: 'tick x', x: x(pts[i].quota), y: m.t + ih + 16, 'text-anchor': 'middle' });
      lab.textContent = `${pts[i].pct}%`;
      add(lab);
    }

    const items = [
      ['opt', s.legendOpt], ['cal', s.legendCal], ['crit', s.labAxisCrit],
      ['raw', s.labCaseLine], ['cliffm', s.labCliff],
    ];
    const frag = document.createDocumentFragment();
    for (const [kind, label] of items) {
      const li = h('li', `legend-item ${kind}`);
      const sw = sv('svg', { class: `swatch ${kind}`, viewBox: '0 0 30 12', 'aria-hidden': 'true' });
      if (kind === 'crit') {
        sw.append(sv('rect', { x: 4, y: 2, width: 22, height: 9 }));
      } else if (kind === 'cliffm') {
        sw.append(sv('path', { d: 'M15,1 L20,6 L15,11 L10,6 Z' }));
      } else {
        sw.append(sv('line', { x1: 1, y1: 6, x2: 29, y2: 6 }));
      }
      li.append(sw, h('span', '', label));
      frag.append(li);
    }
    els.fLegend.replaceChildren(frag);
  }

  function renderEnvelope() {
    const s = t();
    const run = selectedRun();
    const plots = input().plots;
    const n = input().weather.length;
    const W = 720;
    const H = 280;
    const m = { l: 48, r: 30, t: 18, b: 44 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const cw = iw / n;
    const x = i => m.l + (i + 0.5) * cw;
    const y = v => m.t + ih * (1 - v / 100);
    selDay = Math.min(selDay, n - 1);

    const series = plots.map((plot, i) =>
      run.plots[i].days.map(day => 100 * day.dr / plot.taw));

    els.echart.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const title = sv('title', { id: 'lab-e-title' });
    title.textContent = s.labEnvTitle;
    const desc = sv('desc', { id: 'lab-e-desc' });
    desc.textContent = s.labEnvDesc;
    els.echart.replaceChildren(title, desc);
    const add = el => els.echart.append(el);

    for (const f of [0, 25, 50, 75, 100]) {
      const gy = y(f);
      add(sv('line', { class: 'grid', x1: m.l, y1: gy, x2: W - m.r, y2: gy }));
      const lab = sv('text', { class: 'tick', x: m.l - 6, y: gy + 4, 'text-anchor': 'end' });
      lab.textContent = `${num(f, 0)}%`;
      add(lab);
    }
    for (let i = 0; i <= n; i++) {
      add(sv('line', { class: 'vgrid', x1: m.l + i * cw, y1: m.t, x2: m.l + i * cw, y2: m.t + ih }));
    }
    const ylab = sv('text', { class: 'axis-name', x: m.l, y: m.t - 6, 'text-anchor': 'start' });
    ylab.textContent = s.labAxisDepl;
    add(ylab);

    const top = series[0].map((_, i) => Math.max(series[0][i], series[1][i], series[2][i]));
    const bottom = series[0].map((_, i) => Math.min(series[0][i], series[1][i], series[2][i]));
    const band = sv('path', { class: 'env-band' });
    let d = `M${x(0)},${y(top[0])}`;
    for (let i = 1; i < n; i++) d += ` L${x(i)},${y(top[i])}`;
    for (let i = n - 1; i >= 0; i--) d += ` L${x(i)},${y(bottom[i])}`;
    band.setAttribute('d', `${d} Z`);
    add(band);

    const crit = y(90);
    add(sv('line', { class: 'crit', x1: m.l, y1: crit, x2: W - m.r, y2: crit }));
    const critLab = sv('text', { class: 'ref-label crit-label', x: W - m.r - 2, y: crit - 4, 'text-anchor': 'end' });
    critLab.textContent = '90%';
    add(critLab);

    const rawSeries = run.plots[state.plot].days.map(day => 100 * day.raw / plots[state.plot].taw);
    add(sv('polyline', {
      class: 'raw', points: rawSeries.map((v, i) => `${x(i)},${y(v)}`).join(' '), fill: 'none',
    }));

    const dash = ['line-a', 'line-b', 'line-c'];
    series.forEach((values, i) => {
      add(sv('polyline', {
        class: `env-line ${dash[i]}${i === state.plot ? ' insp' : ''}`,
        points: values.map((v, j) => `${x(j)},${y(v)}`).join(' '), fill: 'none',
      }));
      const endLab = sv('text', { class: 'end-label',
        x: x(n - 1) + 7, y: y(values[n - 1]) + 4, 'text-anchor': 'start' });
      endLab.textContent = plots[i].id;
      add(endLab);
    });

    series[state.plot].forEach((v, i) => {
      const dot = sv('circle', {
        class: `eday${i === selDay ? ' sel' : ''}`, cx: x(i), cy: y(v), r: i === selDay ? 6 : 5,
        tabindex: '0', role: 'button', 'data-day': String(i),
        'aria-label': s.labDayPoint(i + 1, input().weather[i].date, num(v, 1)),
      });
      add(dot);
    });

    const dfmt = new Intl.DateTimeFormat(lang(), { weekday: 'short', timeZone: 'UTC' });
    for (let i = 0; i < n; i++) {
      const lab = sv('text', { class: 'tick x', x: x(i), y: m.t + ih + 16, 'text-anchor': 'middle' });
      lab.textContent = dfmt.format(new Date(`${input().weather[i].date}T00:00:00Z`));
      add(lab);
      const sub = sv('text', { class: 'tick x sub', x: x(i), y: m.t + ih + 30, 'text-anchor': 'middle' });
      sub.textContent = input().weather[i].date.slice(5);
      add(sub);
    }

    const items = [['a', `${s.plotWord} A`], ['b', `${s.plotWord} B`], ['c', `${s.plotWord} C`],
      ['raw', s.legendRaw], ['crit', s.legendCrit]];
    const frag = document.createDocumentFragment();
    for (const [kind, label] of items) {
      const li = h('li', `legend-item env-${kind}`);
      const sw = sv('svg', { class: `swatch env-${kind}`, viewBox: '0 0 30 12', 'aria-hidden': 'true' });
      sw.append(sv('line', { x1: 1, y1: 6, x2: 29, y2: 6 }));
      li.append(sw, h('span', '', label));
      frag.append(li);
    }
    els.eLegend.replaceChildren(frag);
    renderDayStatus();
  }

  function renderDayStatus() {
    const s = t();
    const run = selectedRun();
    const plot = input().plots[state.plot];
    const v = 100 * run.plots[state.plot].days[selDay].dr / plot.taw;
    const crit = run.plots[state.plot].days[selDay].critical ? s.labCritMark : '';
    setText(els.dayStatus,
      s.labDayStatus(selDay + 1, input().weather[selDay].date, plot.id, num(v, 1), crit));
  }

  function renderExports() {
    const s = t();
    const brief = buildBrief(state);
    setText(els.digest, brief.digest);
    const link = `${location.origin}${location.pathname}#${encodeState(state)}`;
    if (els.share.value !== link) els.share.value = link;
    if (!els.integrity.dataset.key) els.integrity.dataset.key = 'labVerifyIdle';
    setText(els.integrity, s[els.integrity.dataset.key] || s.labVerifyIdle);
  }

  function writeHash() {
    try {
      history.replaceState(null, '', `#${encodeState(state)}`);
    } catch { /* file:// or locked history */ }
  }

  function renderAll() {
    renderControls();
    renderComparator();
    renderFrontier();
    renderEnvelope();
    renderExports();
  }

  function mutate(patch) {
    Object.assign(state, patch);
    els.integrity.dataset.key = 'labVerifyIdle';
    selDay = Math.min(selDay, input().weather.length - 1);
    writeHash();
    renderAll();
  }

  // ---------- events ----------

  function wire() {
    els.case.addEventListener('change', () => {
      const scenario = labScenario(els.case.value);
      Object.assign(state, { case: scenario.id, quota: scenario.quota, plot: 0 });
      selDay = 0;
      writeHash();
      renderAll();
    });
    let quotaRaf = 0;
    els.quota.addEventListener('input', () => {
      state.quota = Number(els.quota.value);
      writeHash();
      if (!quotaRaf) {
        quotaRaf = requestAnimationFrame(() => { quotaRaf = 0; renderAll(); });
      }
    });
    els.shock.addEventListener('change', () => {
      mutate({ shock: els.shock.checked });
    });
    els.strategy.addEventListener('change', () => {
      if (STRATEGIES.includes(els.strategy.value)) mutate({ strategy: els.strategy.value });
    });
    els.plot.addEventListener('change', () => {
      const plot = Number(els.plot.value);
      if (Number.isInteger(plot) && plot >= 0 && plot < input().plots.length) {
        mutate({ plot });
      }
    });
    els.compTable.addEventListener('click', event => {
      const pick = event.target.closest('button.pick');
      if (pick && STRATEGIES.includes(pick.dataset.strategy)) {
        mutate({ strategy: pick.dataset.strategy });
      }
    });
    els.qchart.addEventListener('click', event => {
      const dot = event.target.closest('circle.qdot');
      if (dot) {
        state.quota = Number(dot.dataset.quota);
        writeHash();
        renderAll();
      }
    });
    els.qchart.addEventListener('keydown', event => {
      const dot = event.target.closest('circle.qdot');
      if (!dot) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        state.quota = Number(dot.dataset.quota);
        writeHash();
        renderAll();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const dots = [...els.qchart.querySelectorAll('circle.qdot')];
        const next = dots[(dots.indexOf(dot) + (event.key === 'ArrowRight' ? 1 : dots.length - 1)) % dots.length];
        next?.focus();
      }
    });
    els.echart.addEventListener('click', event => {
      const dot = event.target.closest('circle.eday');
      if (dot) {
        selDay = Number(dot.dataset.day);
        renderEnvelope();
      }
    });
    els.echart.addEventListener('keydown', event => {
      const dot = event.target.closest('circle.eday');
      if (!dot) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selDay = Number(dot.dataset.day);
        renderEnvelope();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const dots = [...els.echart.querySelectorAll('circle.eday')];
        const next = dots[(dots.indexOf(dot) + (event.key === 'ArrowRight' ? 1 : dots.length - 1)) % dots.length];
        next?.focus();
      }
    });
    els.json.addEventListener('click', () => {
      const brief = buildBrief(state);
      download(`croppulse-lab-${state.case}.json`, brief.json, 'application/json');
    });
    els.csv.addEventListener('click', () => {
      const brief = buildBrief(state);
      download(`croppulse-lab-${state.case}.csv`, brief.csv, 'text/csv');
    });
    els.md.addEventListener('click', () => {
      const brief = buildBrief(state);
      download(`croppulse-lab-${state.case}.md`, brief.markdown, 'text/markdown');
    });
    const setIntegrity = key => {
      els.integrity.dataset.key = key;
      els.integrity.dataset.state = key === 'labVerifyIdle' ? 'idle' :
        key === 'labVerifyOk' || key === 'labLinkCopied' ? 'good' : 'warn';
      els.integrity.textContent = t()[key];
    };
    els.link.addEventListener('click', async () => {
      const link = `${location.origin}${location.pathname}#${encodeState(state)}`;
      try {
        await navigator.clipboard.writeText(link);
        setIntegrity('labLinkCopied');
      } catch {
        els.share.focus();
        els.share.select();
        setIntegrity('labLinkReady');
      }
    });
    els.verify.addEventListener('click', () => {
      const brief = buildBrief(state);
      setIntegrity(verifyBrief(JSON.parse(brief.json)).digestValid ? 'labVerifyOk' : 'labVerifyIdle');
    });
    els.tamper.addEventListener('click', () => {
      const brief = buildBrief(state);
      setIntegrity(verifyBrief(tamperForDemo(brief)).digestValid ? 'labVerifyIdle' : 'labTamperBad');
    });
    els.run.addEventListener('click', runChecks);
    els.share.addEventListener('focus', () => els.share.select());
    window.addEventListener('hashchange', () => {
      const next = decodeState(location.hash);
      if (next) {
        Object.assign(state, next);
        els.integrity.dataset.key = 'labVerifyIdle';
        selDay = 0;
        renderAll();
      }
    });
    document.addEventListener('croppulse:language', event => {
      es = Boolean(event.detail?.es);
      localizeLab();
      renderAll();
    });
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

  function runChecks() {
    const s = t();
    els.run.disabled = true;
    els.checkList.replaceChildren();
    setText(els.checksStatus, s.labChecksRunning);
    setTimeout(() => {
      const { checks, passed, total } = labSelfChecks();
      const frag = document.createDocumentFragment();
      for (const item of checks) {
        const li = h('li', item.ok ? 'pass' : 'fail');
        li.textContent = `${item.ok ? 'PASS' : 'FAIL'}  ${item.name}`;
        frag.append(li);
      }
      els.checkList.replaceChildren(frag);
      els.checksStatus.dataset.state = passed === total ? 'good' : 'bad';
      setText(els.checksStatus, s.labChecksStatus(passed, total));
      els.run.disabled = false;
    }, 30);
  }

  // ---------- init ----------

  build();
  localizeLab();
  wire();
  renderAll();
  section.hidden = false;
  runChecks();
}
