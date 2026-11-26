import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('mobile-sized controls keep a 44px target contract', () => {
  assert.match(css, /\.topbar nav a \{[\s\S]*?min-height: 44px;[\s\S]*?min-width: 44px;/);
  assert.match(css, /\.btn, \.topbar button \{[\s\S]*?min-height: 44px;[\s\S]*?min-width: 44px;/);
  assert.match(css, /\.input, select\.input, input\.input \{[\s\S]*?min-height: 44px;[\s\S]*?min-width: 44px;/);
  assert.match(css, /input\[type="range"\] \{[\s\S]*?min-height: 44px;/);
  assert.match(css, /details\.chart-data summary \{[\s\S]*?min-height: 44px;/);
  assert.match(css, /\.check-row \{[^}]*min-height: 44px;/);
  assert.match(css, /\.check-row \.field-label\.inline \{[^}]*min-height: 44px;/);
  assert.match(css, /\.comp-table \.pick \{[\s\S]*?min-height: 44px;[\s\S]*?min-width: 44px;/);
});

test('the offline shell version advances with the control stylesheet', () => {
  assert.ok(sw.includes("const CACHE = `${PREFIX}v5`;"));
});
