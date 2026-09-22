/* Precompute a default conjecture set for every target invariant, so the page
   shows real results on first paint instead of an empty instrument. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPool, mine, exprLabel, verify } from '../site/js/mine.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(here, '..', 'site', 'data');

const corpus = JSON.parse(fs.readFileSync(path.join(SITE, 'corpus.json')));
const holdout = JSON.parse(fs.readFileSync(path.join(SITE, 'holdout.json')));
const meta = JSON.parse(fs.readFileSync(path.join(SITE, 'invariants.json')));

const toCols = d => d.cols.map(c => Float64Array.from(c));
const cCols = toCols(corpus), hCols = toCols(holdout);
const keys = corpus.keys;

const out = {};
const t0 = Date.now();

for (const dir of [true, false]) {
  for (let t = 0; t < keys.length; t++) {
    const pool = buildPool(keys, t, {});
    const res = mine({ keys, cols: cCols, target: cCols[t], upper: dir, pool, limit: 25 });
    const rows = res.accepted.map(a => {
      const v = verify(a.e, hCols, hCols[t], dir);
      return {
        label: exprLabel(a.e, keys, meta),
        expr: a.e.kind === 1
          ? { kind: 1, a: keys[a.e.a], op: a.e.op.id }
          : { kind: 2, a: keys[a.e.a], b: keys[a.e.b], op: a.e.op.id },
        touch: a.touch,
        avgSlack: +a.avgSlack.toFixed(4),
        improves: a.improves,
        holdout: { holds: v.holds, worst: +v.worst.toFixed(4), touch: v.touch, tested: v.tested },
      };
    });
    out[`${keys[t]}|${dir ? 'upper' : 'lower'}`] = {
      target: keys[t], upper: dir,
      scanned: res.scanned, valid: res.validCount,
      envelopeSlack: +res.envelopeSlack.toFixed(4),
      envelopeTouch: res.envelopeTouch,
      rows,
    };
  }
}

fs.writeFileSync(path.join(SITE, 'conjectures.json'), JSON.stringify(out));
const size = fs.statSync(path.join(SITE, 'conjectures.json')).size;
console.log(`precomputed ${Object.keys(out).length} target/direction pairs in ${((Date.now()-t0)/1000).toFixed(1)}s -> ${(size/1e6).toFixed(2)} MB`);

// sanity: show what it found for the chromatic number
const chi = out['chromatic|upper'];
console.log(`\nchromatic, upper bounds  (scanned ${chi.scanned}, ${chi.valid} valid, ${chi.rows.length} kept):`);
for (const r of chi.rows.slice(0, 8)) {
  console.log(`  χ ≤ ${r.label.padEnd(26)} tight on ${String(r.touch).padStart(5)}  holdout ${r.holdout.holds ? 'holds' : 'FAILS worst='+r.holdout.worst}`);
}
const alpha = out['independence|lower'];
console.log(`\nindependence, lower bounds:`);
for (const r of alpha.rows.slice(0, 6)) {
  console.log(`  α ≥ ${r.label.padEnd(26)} tight on ${String(r.touch).padStart(5)}  holdout ${r.holdout.holds ? 'holds' : 'FAILS worst='+r.holdout.worst}`);
}
