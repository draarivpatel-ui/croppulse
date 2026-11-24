import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/quota-lab-ui.js', import.meta.url), 'utf8');

for (const [name, marker] of [
  ['case select', "els.case.addEventListener('change'"],
  ['quota range', "els.quota.addEventListener('input'"],
  ['frontier pointer selection', "els.qchart.addEventListener('click'"],
  ['frontier keyboard selection', "els.qchart.addEventListener('keydown'"],
]) {
  test(`${name} invalidates a stale digest verification`, () => {
    const at = source.indexOf(marker);
    assert.notEqual(at, -1);
    assert.match(source.slice(at, at + 520), /invalidateIntegrity\(\)|selectQuota\(/);
  });
}

for (const [name, marker, helper] of [
  ['frontier pointer selection', "els.qchart.addEventListener('click'", 'selectQuota'],
  ['frontier keyboard selection', "els.qchart.addEventListener('keydown'", 'selectQuota'],
  ['envelope pointer selection', "els.echart.addEventListener('click'", 'selectDay'],
  ['envelope keyboard selection', "els.echart.addEventListener('keydown'", 'selectDay'],
]) {
  test(`${name} restores focus after rebuilding its SVG`, () => {
    const at = source.indexOf(marker);
    assert.notEqual(at, -1);
    assert.match(source.slice(at, at + 560), new RegExp(`${helper}\\(`));
    assert.match(source, new RegExp(`function ${helper}[\\s\\S]{0,420}\\.focus\\(`));
  });
}
