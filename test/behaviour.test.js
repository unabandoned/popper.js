// Loads each shipped build the way consumers do - the UMD bundle as a browser
// <script> global and through require() (package.json#main), the ES module
// build through import() (package.json#module) - and positions a popper with
// it in jsdom. jsdom has no layout engine, so this proves the bundles load and
// run the full modifier pipeline, not pixel placement.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function makeDom() {
  const dom = new JSDOM(
    '<!doctype html><button id="ref">ref</button><div id="pop">pop</div>',
    { runScripts: 'outside-only', pretendToBeVisual: true }
  );
  return dom.window;
}

// Run `fn` with jsdom's window/document/navigator/Node installed as Node globals, the
// way a bundler-built page would see them, restoring Node's own afterwards.
async function withGlobals(window, fn) {
  const keys = ['window', 'document', 'navigator', 'Node'];
  const saved = keys.map((k) => Object.getOwnPropertyDescriptor(globalThis, k));
  for (const k of keys) {
    Object.defineProperty(globalThis, k, {
      value: k === 'window' ? window : window[k],
      configurable: true,
      writable: true,
    });
  }
  try {
    return await fn();
  } finally {
    keys.forEach((k, i) => {
      if (saved[i]) Object.defineProperty(globalThis, k, saved[i]);
      else delete globalThis[k];
    });
  }
}

async function position(Popper, window, placement) {
  const ref = window.document.getElementById('ref');
  const pop = window.document.getElementById('pop');
  const data = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('onCreate never fired')), 2000);
    // eslint-disable-next-line no-new
    new Popper(ref, pop, {
      placement,
      // Every box is 0x0 in jsdom, so flip would always pick another side.
      modifiers: { flip: { enabled: false } },
      onCreate: (d) => {
        clearTimeout(timer);
        resolve(d);
      },
    });
  });
  assert.equal(data.placement, placement);
  assert.equal(pop.getAttribute('x-placement'), placement);
  assert.equal(pop.style.position, 'absolute');
  assert.match(pop.style.transform, /^translate3d\(/);
  assert.equal(typeof data.offsets.popper.top, 'number');
}

function checkApi(Popper) {
  assert.equal(typeof Popper, 'function');
  assert.ok(Array.isArray(Popper.placements));
  assert.ok(Popper.placements.includes('bottom-start'));
  assert.equal(typeof Popper.Defaults, 'object');
  // Popper.Utils is only window.PopperUtils (from popper-utils.js), not bundled.
  assert.ok('Utils' in Popper);
}

for (const file of ['dist/umd/popper.js', 'dist/umd/popper.min.js']) {
  test(`${file} as a <script> global`, async () => {
    const window = makeDom();
    window.eval(read(file));
    checkApi(window.Popper);
    await position(window.Popper, window, 'bottom');
    window.close();
  });
}

test('package.json#main through require()', async () => {
  const window = makeDom();
  await withGlobals(window, async () => {
    const main = require.resolve(path.join(root, require('../package.json').main));
    delete require.cache[main];
    const Popper = require(main);
    checkApi(Popper);
    await position(Popper, window, 'top-end');
  });
  window.close();
});

for (const file of ['dist/esm/popper.js', 'dist/esm/popper.min.js', 'dist/popper.js']) {
  test(`${file} through import()`, async (t) => {
    // The ESM builds use a .js extension under a package without
    // "type": "module", which bundlers accept and Node does not; import a
    // byte-identical .mjs copy instead.
    const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'popper-'));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
    const copy = path.join(tmp, 'popper.mjs');
    fs.copyFileSync(path.join(root, file), copy);
    const window = makeDom();
    await withGlobals(window, async () => {
      const { default: Popper } = await import(pathToFileURL(copy).href);
      checkApi(Popper);
      await position(Popper, window, 'right');
    });
    window.close();
  });
}

test('dist/umd/popper-utils.js exposes the helpers', () => {
  const window = makeDom();
  window.eval(read('dist/umd/popper-utils.js'));
  assert.equal(typeof window.PopperUtils.getBoundaries, 'function');
  assert.equal(typeof window.PopperUtils.computeAutoPlacement, 'function');
  window.close();
});
