// CropPulse browser verification. Drives real Chrome (headless, muted, throwaway
// mkdtemp profile inside this repo) over CDP against the local static host.
// Asserts: clean console, no page errors, no external requests, no horizontal
// overflow, working controls via real pointer and key input, EN/ES toggle,
// one-page print PDF in both locales, ready service worker, and an interactive
// offline reload. Screenshots land in docs/.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { startServer } from './serve.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DOCS = path.join(ROOT, 'docs');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// ---------- minimal CDP client over the browser websocket ----------

class CDP {
  static open(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const cdp = new CDP(ws);
      ws.addEventListener('open', () => resolve(cdp), { once: true });
      ws.addEventListener('error', event => reject(new Error(`websocket failed: ${event.message || 'error'}`)), { once: true });
      ws.addEventListener('message', event => cdp.onMessage(event.data));
    });
  }
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
  }
  onMessage(data) {
    const msg = JSON.parse(data);
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message}`));
      else resolve(msg.result);
    } else if (msg.method) {
      const keys = [`${msg.sessionId || ''}:${msg.method}`, `*:${msg.method}`];
      for (const key of keys) {
        for (const fn of this.handlers.get(key) || []) fn(msg.params || {}, msg.sessionId);
      }
    }
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout waiting for ${method}`));
        }
      }, 45000);
    });
  }
  on(method, fn, sessionId) {
    const key = `${sessionId ?? '*'}:${method}`;
    if (!this.handlers.has(key)) this.handlers.set(key, []);
    const list = this.handlers.get(key);
    list.push(fn);
    return () => {
      const i = list.indexOf(fn);
      if (i > -1) list.splice(i, 1);
    };
  }
  once(method, sessionId, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const off = this.on(method, params => { off(); resolve(params); }, sessionId);
      setTimeout(() => { off(); reject(new Error(`timeout waiting for ${method}`)); }, timeoutMs);
    });
  }
}

// ---------- chrome process ----------

async function launchChrome(profile, onSpawn) {
  const proc = spawn(CHROME, [
    '--headless=new',
    '--mute-audio',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--disable-default-apps',
    '--metrics-recording-only',
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  proc.stderr.on('data', () => {});
  onSpawn(proc);
  const file = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 300; i++) {
    if (existsSync(file)) {
      const [port, wsPath] = readFileSync(file, 'utf8').trim().split('\n');
      if (port && wsPath) return { proc, wsUrl: `ws://127.0.0.1:${port}${wsPath}` };
    }
    if (proc.exitCode !== null) throw new Error(`chrome exited early (${proc.exitCode})`);
    await sleep(100);
  }
  throw new Error('DevToolsActivePort never appeared');
}

// ---------- pdf page counter (native parse: raw bytes + inflated streams) ----------

function pdfPageInfo(buf) {
  const raw = buf.toString('latin1');
  const chunks = [raw];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end === -1) continue;
    let data = buf.subarray(start, end);
    while (data.length && data[data.length - 1] <= 0x20) data = data.subarray(0, data.length - 1);
    try {
      chunks.push(inflateSync(data).toString('latin1'));
    } catch { /* not a flate stream */ }
  }
  const text = chunks.join('\n');
  const pageDicts = (text.match(/\/Type\s*\/Page\b/g) || []).length;
  const countMatch = text.match(/\/Type\s*\/Pages[\s\S]{0,400}?\/Count\s+(\d+)/);
  const count = countMatch ? Number(countMatch[1]) : null;
  return { pageDicts, count };
}

// ---------- main ----------

async function main() {
  const host = await startServer({ port: 0 });
  console.log(`server: ${host.url}`);
  let chrome;
  let profile;
  let exitCode = 0;
  try {
    profile = await mkdtemp(path.join(ROOT, '.browser-profile-'));
    const launched = await launchChrome(profile, proc => { chrome = proc; });
    const cdp = await CDP.open(launched.wsUrl);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

    const consoleErrors = [];
    const pageErrors = [];
    const external = [];
    const badResponses = [];
    const netFailures = [];

    cdp.on('Runtime.consoleAPICalled', p => {
      if (p.type === 'error') {
        consoleErrors.push((p.args || []).map(a => a.value ?? a.description ?? '').join(' '));
      }
    }, sessionId);
    cdp.on('Runtime.exceptionThrown', p => {
      pageErrors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'exception');
    }, sessionId);
    cdp.on('Log.entryAdded', p => {
      if (p.entry?.level === 'error') consoleErrors.push(p.entry.text);
    }, sessionId);
    cdp.on('Network.requestWillBeSent', p => {
      const u = p.request?.url || '';
      if (/^https?:/u.test(u)) {
        try {
          if (new URL(u).origin !== host.origin) external.push(u);
        } catch { /* unparseable */ }
      }
    }, sessionId);
    cdp.on('Network.responseReceived', p => {
      if (p.response?.status >= 400) badResponses.push(`${p.response.status} ${p.response.url}`);
    }, sessionId);
    cdp.on('Network.loadingFailed', p => {
      if (!p.canceled && !/net::ERR_INTERNET_DISCONNECTED|net::ERR_NETWORK_CHANGED/u.test(p.errorText || '')) {
        netFailures.push(p.errorText || 'loading failed');
      }
    }, sessionId);

    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);
    await cdp.send('Log.enable', {}, sessionId);

    const ev = async (expr, awaitPromise = false) => {
      const r = await cdp.send('Runtime.evaluate',
        { expression: expr, returnByValue: true, awaitPromise }, sessionId);
      if (r.exceptionDetails) {
        throw new Error(`evaluate failed: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      }
      return r.result?.value;
    };
    const key = (k, code, vk) => cdp.send('Input.dispatchKeyEvent',
      { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk }, sessionId)
      .then(() => cdp.send('Input.dispatchKeyEvent',
        { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }, sessionId));
    const navigate = async url => {
      const loaded = cdp.once('Page.loadEventFired', sessionId);
      await cdp.send('Page.navigate', { url }, sessionId);
      await loaded;
    };
    const overflow = width => ev(
      `Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth) - ${width}`);
    const pointerClick = async sel => {
      const pt = await ev(`(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        return { x, y, hit: Boolean(hit && (hit === el || el.contains(hit))) };
      })()`);
      if (!pt) throw new Error(`pointerClick: ${sel} not found`);
      check(`pointer target visible ${sel}`, pt.hit === true);
      await cdp.send('Input.dispatchMouseEvent',
        { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 }, sessionId);
      await cdp.send('Input.dispatchMouseEvent',
        { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 }, sessionId);
      await sleep(150);
    };
    const contrast = () => ev(`(() => {
      const parse = value => {
        const v = value.trim();
        const hex = /^#([0-9a-f]{6})$/i.exec(v);
        if (hex) return [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16));
        return v.match(/[\\d.]+/g).slice(0, 3).map(Number);
      };
      const lum = rgb => {
        const c = parse(rgb).map(v => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      const ratio = (a, b) => {
        const pair = [lum(a), lum(b)].sort((x, y) => y - x);
        return (pair[0] + 0.05) / (pair[1] + 0.05);
      };
      const cs = getComputedStyle(document.documentElement);
      const paper = cs.getPropertyValue('--paper');
      const raised = cs.getPropertyValue('--paper-raised');
      const rule = cs.getPropertyValue('--rule-strong');
      const amber = cs.getPropertyValue('--amber');
      return { rulePaper: ratio(rule, paper), ruleRaised: ratio(rule, raised),
        amberPaper: ratio(amber, paper), amberRaised: ratio(amber, raised) };
    })()`);
    const checkContrast = theme => contrast().then(c => {
      check(`${theme} rule-strong border contrast`, c.rulePaper >= 3 && c.ruleRaised >= 3,
        `${c.rulePaper.toFixed(2)} paper / ${c.ruleRaised.toFixed(2)} raised`);
      check(`${theme} amber label contrast`, c.amberPaper >= 4.5 && c.amberRaised >= 4.5,
        `${c.amberPaper.toFixed(2)} paper / ${c.amberRaised.toFixed(2)} raised`);
    });

    // ----- desktop pass -----
    await cdp.send('Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(host.url);
    await sleep(400);

    check('page title', await ev('document.title') === 'CropPulse - Irrigation workbench');
    check('document lang en', await ev('document.documentElement.lang') === 'en');
    const desktopOverflow = await overflow(1440);
    check('no horizontal overflow 1440', desktopOverflow <= 0, `excess ${desktopOverflow}px`);
    check('scenario options', await ev('document.getElementById("scenario").options.length') === 3);
    check('quota default', await ev('document.getElementById("quota").value') === '126');
    check('plot select options', await ev('document.getElementById("plot").options.length') === 3);
    check('plot cards', await ev('document.querySelectorAll(".plot-card").length') === 3);
    check('chart has both trajectories', await ev(
      'Boolean(document.querySelector("#chart .line-opt") && document.querySelector("#chart .line-cal"))'));
    check('schedule covers seven days', await ev(
      'document.querySelectorAll("#schedule tbody tr").length') >= 7);

    // scenario change resets quota and repaints
    await ev('(() => { const s = document.getElementById("scenario"); s.value = "cooperative"; s.dispatchEvent(new Event("change", { bubbles: true })); })()');
    await sleep(250);
    check('scenario switch resets quota', await ev('document.getElementById("quota").value') === '144');
    check('quota display follows', /144/.test(await ev('document.getElementById("quota-value").textContent')));

    // keyboard: Tab order reaches the controls, arrows drive the native range
    await ev('document.querySelector(".skip").focus()');
    let focused = '';
    for (let i = 0; i < 9; i++) {
      await key('Tab', 'Tab', 9);
      focused = await ev('document.activeElement && document.activeElement.id');
      if (focused === 'scenario') break;
    }
    check('tab reaches scenario control', focused === 'scenario', `last focus ${focused || '?'}`);
    await ev('document.getElementById("quota").focus()');
    const before = Number(await ev('document.getElementById("quota").value'));
    await key('ArrowRight', 'ArrowRight', 39);
    await sleep(250);
    const after = Number(await ev('document.getElementById("quota").value'));
    check('arrow keys drive quota range', after === before + 18, `${before} -> ${after}`);

    // day selector provides the day table
    await ev('(() => { const d = document.getElementById("day"); d.value = "3"; d.dispatchEvent(new Event("change", { bubbles: true })); })()');
    await sleep(150);
    check('day table has exact water rows', await ev(
      'document.querySelectorAll("#analysis .day-table tbody tr").length') >= 10);

    // real pointer: plot card selects the charted plot and syncs the select
    await pointerClick('.plot-card:nth-child(3)');
    check('plot button selects plot', await ev(
      'document.querySelectorAll(".plot-card")[2].getAttribute("aria-pressed")') === 'true');
    check('plot select follows card', await ev('document.getElementById("plot").value') === '2');

    // real pointer: language toggle
    await pointerClick('#language');
    check('language switch sets es', await ev('document.documentElement.lang') === 'es');
    check('spanish heading', await ev('document.getElementById("page-title").textContent') === 'Mesa de riego');
    await pointerClick('#language');
    check('language back to en', await ev('document.documentElement.lang') === 'en');

    // real pointer: theme toggle engages the dark dataset and releases it
    await pointerClick('#theme');
    check('dark dataset set', await ev('document.documentElement.dataset.theme') === 'dark');
    await checkContrast('dark');
    await pointerClick('#theme');
    check('theme released to light', await ev('document.documentElement.dataset.theme') === 'light');

    // zero quota disables the ics export
    await ev('(() => { const q = document.getElementById("quota"); q.value = "0"; q.dispatchEvent(new Event("input", { bubbles: true })); })()');
    await sleep(300);
    check('ics disabled with no events', await ev('document.getElementById("ics-button").disabled') === true);
    await ev('(() => { const s = document.getElementById("scenario"); s.value = "high-plains"; s.dispatchEvent(new Event("change", { bubbles: true })); })()');
    await sleep(250);

    // print sheet content and document outline
    check('print sheet covers seven days', await ev(
      'document.querySelectorAll("#print-sheet .print-table tbody tr").length') >= 7);
    check('print sheet shows UTC', /UTC/u.test(await ev('document.getElementById("print-sheet").textContent')));
    check('single h1 heading', await ev('document.querySelectorAll("h1").length') === 1);
    check('print sheet label localized en', await ev(
      'document.getElementById("print-sheet").getAttribute("aria-label")') === 'Field schedule');
    await checkContrast('light');

    // service worker
    const scope = await ev(
      `'serviceWorker' in navigator ? navigator.serviceWorker.ready.then(r => r.scope) : Promise.resolve('no-sw')`,
      true);
    check('service worker active at scope', typeof scope === 'string' && scope.endsWith('/croppulse/'), scope);

    // screenshots
    const shot = async name => {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
      await writeFile(path.join(DOCS, name), Buffer.from(data, 'base64'));
    };
    await ev('window.scrollTo(0, 0)');
    await sleep(150);
    await shot('desktop.png');
    await ev('document.getElementById("schedule").scrollIntoView()');
    await sleep(350);
    await shot('schedule.png');
    await ev('window.scrollTo(0, 0)');

    // ----- print PDF: default locale, then ES + dense schedule -----
    const pdf1 = await cdp.send('Page.printToPDF',
      { preferCSSPageSize: true, printBackground: true }, sessionId);
    const info1 = pdfPageInfo(Buffer.from(pdf1.data, 'base64'));
    check('print PDF is one page (EN)', info1.pageDicts === 1 || info1.count === 1,
      `dicts ${info1.pageDicts}, count ${info1.count}`);

    await ev('(() => { const s = document.getElementById("scenario"); s.value = "terraces"; s.dispatchEvent(new Event("change", { bubbles: true })); })()');
    await ev('document.getElementById("language").click()');
    await sleep(150);
    check('print sheet label localized es', await ev(
      'document.getElementById("print-sheet").getAttribute("aria-label")') === 'Calendario de riego');
    await ev('(() => { const q = document.getElementById("quota"); q.value = "252"; q.dispatchEvent(new Event("input", { bubbles: true })); })()');
    await sleep(300);
    const pdf2 = await cdp.send('Page.printToPDF',
      { preferCSSPageSize: true, printBackground: true }, sessionId);
    const info2 = pdfPageInfo(Buffer.from(pdf2.data, 'base64'));
    check('print PDF is one page (ES dense)', info2.pageDicts === 1 || info2.count === 1,
      `dicts ${info2.pageDicts}, count ${info2.count}`);
    await ev('document.getElementById("language").click()');
    await ev('(() => { const s = document.getElementById("scenario"); s.value = "high-plains"; s.dispatchEvent(new Event("change", { bubbles: true })); })()');
    await sleep(200);

    // ----- offline reload through the service worker -----
    await cdp.send('Network.emulateNetworkConditions',
      { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sessionId);
    {
      const loaded = cdp.once('Page.loadEventFired', sessionId);
      await cdp.send('Page.reload', {}, sessionId);
      await loaded;
    }
    await sleep(400);
    check('offline reload renders workbench', await ev(
      'Boolean(document.getElementById("scenario") && document.querySelector("#chart .line-opt"))'));
    await ev('(() => { const s = document.getElementById("scenario"); s.value = "cooperative"; s.dispatchEvent(new Event("change", { bubbles: true })); })()');
    await sleep(250);
    check('offline scenario switch re-solves', await ev('document.getElementById("quota").value') === '144');
    await cdp.send('Network.emulateNetworkConditions',
      { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sessionId);

    // ----- mobile pass -----
    await cdp.send('Emulation.setDeviceMetricsOverride',
      { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
    await navigate(host.url);
    await sleep(400);
    const mobileOverflow = await overflow(390);
    check('no horizontal overflow 390', mobileOverflow <= 0, `excess ${mobileOverflow}px`);
    check('mobile workbench renders', await ev(
      'Boolean(document.getElementById("scenario") && document.querySelector("#chart .line-opt"))'));
    const intr = await ev(`(() => {
      const q = document.getElementById('quota-value');
      const row = q.parentElement;
      const aside = document.getElementById('controls');
      const r = el => { const b = el.getBoundingClientRect(); return [b.left, b.right].map(v => Math.round(v * 10) / 10); };
      return {
        innerWidth: window.innerWidth,
        docScroll: document.documentElement.scrollWidth,
        quota: r(q), row: r(row), aside: r(aside),
        quotaWS: getComputedStyle(q).whiteSpace,
        rowWrap: getComputedStyle(row).flexWrap,
        visualScale: window.visualViewport ? window.visualViewport.scale : 1,
      };
    })()`);
    console.log(`mobile intrinsics: ${JSON.stringify(intr)}`);
    check('quota value inside viewport', intr.quota[1] <= 390 &&
      Math.abs(intr.visualScale - 1) <= 0.001,
      `quota right ${intr.quota[1]} of 390px at scale ${intr.visualScale}`);
    await ev('window.scrollTo(0, 0)');
    await sleep(150);
    await shot('mobile.png');

    // ----- network hygiene -----
    check('zero console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    check('zero external requests', external.length === 0, external.slice(0, 3).join(' | '));
    check('zero failed responses', badResponses.length === 0, badResponses.slice(0, 3).join(' | '));
    check('zero request failures', netFailures.length === 0, netFailures.slice(0, 3).join(' | '));

    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) exitCode = 1;
  } catch (error) {
    console.error(`FATAL  ${error.message}`);
    exitCode = 1;
  } finally {
    if (chrome) {
      try { chrome.kill('SIGTERM'); } catch { /* already gone */ }
      await Promise.race([
        new Promise(resolve => chrome.once('exit', resolve)),
        sleep(4000).then(() => { try { chrome.kill('SIGKILL'); } catch { /* gone */ } }),
      ]);
    }
    await host.close();
    if (profile) rmSync(profile, { recursive: true, force: true });
  }
  process.exit(exitCode);
}

await main();
