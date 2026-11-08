// The published files must stay byte-identical to upstream's popper.js@1.16.1
// tarball: consumers alias this package over `popper.js` and deep-import files
// such as `popper.js/dist/umd/popper.js`, so a changed byte or a moved file is
// a behaviour change for them. popper.js-1.16.1.sha256 was generated from
// `npm pack popper.js@1.16.1` (registry integrity
// sha512-Wb4p1J4zyFTbM+u6WuO4XstYx4Ky9Cewe4DWrel7B0w6VVICvPwdOpotjzcf6eD8TsckVnIMNONQyPIUFOUbCQ==).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = fs
  .readFileSync(path.join(__dirname, 'popper.js-1.16.1.sha256'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => {
    const [hash, file] = line.split(/\s+/);
    return { hash, file };
  });

const walk = (dir) =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    return e.isDirectory() ? walk(rel) : [rel];
  });

test('every upstream 1.16.1 file is present and byte-identical', () => {
  for (const { hash, file } of manifest) {
    const actual = createHash('sha256')
      .update(fs.readFileSync(path.join(root, file)))
      .digest('hex');
    assert.equal(actual, hash, `${file} differs from popper.js@1.16.1`);
  }
});

test('dist/ and src/ hold nothing upstream did not ship', () => {
  const expected = new Set(manifest.map((m) => m.file));
  for (const file of [...walk('dist'), ...walk('src')]) {
    assert.ok(expected.has(file), `${file} is not part of popper.js@1.16.1`);
  }
});

test('entry points match upstream package.json', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.main, 'dist/umd/popper.js');
  assert.equal(pkg.module, 'dist/esm/popper.js');
  assert.equal(pkg.unpkg, 'dist/umd/popper.min.js');
  assert.equal(pkg.types, 'index.d.ts');
  assert.equal(pkg.sideEffects, false);
  // upstream had no exports map; adding one would block deep imports such as
  // popper.js/dist/umd/popper.js that consumers rely on.
  assert.equal(pkg.exports, undefined);
  assert.equal(pkg.dependencies, undefined);
});

test('the packed tarball ships every upstream file', () => {
  // npm <= 11 prints an array of results, npm 12 an object keyed by name.
  const report = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: root,
      encoding: 'utf8',
    })
  );
  const packed = new Set(
    (Array.isArray(report) ? report[0] : Object.values(report)[0]).files.map(
      (f) => f.path
    )
  );
  for (const { file } of manifest) {
    assert.ok(packed.has(file), `${file} is missing from the tarball`);
  }
});
