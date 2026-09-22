/* mine.js — Dalmatian-style conjecture mining over a graph invariant corpus.
 *
 * Fajtlowicz's Graffiti kept a conjecture only if it was (a) true on every graph
 * it knew and (b) *significant*: strictly better than every bound already held,
 * on at least one graph. That second test is what stops the list filling with
 * weaker restatements of the same fact. Both tests are implemented here.
 *
 * Runs unchanged in a worker and in node (the precompute script imports it).
 */

// --- expression pool -------------------------------------------------------

// Unary shapes applied to a single invariant x.
const UNARY = [
  { id: 'id',    label: x => `${x}`,            f: x => x },
  { id: 'p1',    label: x => `${x} + 1`,        f: x => x + 1 },
  { id: 'm1',    label: x => `${x} − 1`,        f: x => x - 1 },
  { id: 'p2',    label: x => `${x} + 2`,        f: x => x + 2 },
  { id: 'm2',    label: x => `${x} − 2`,        f: x => x - 2 },
  { id: 'x2',    label: x => `2·${x}`,          f: x => 2 * x },
  { id: 'half',  label: x => `${x} / 2`,        f: x => x / 2 },
  { id: 'sq',    label: x => `${x}²`,           f: x => x * x },
  { id: 'sqrt',  label: x => `√${x}`,           f: x => Math.sqrt(x) },
];

// Binary shapes over an ordered pair (x, y).
const BINARY = [
  { id: 'add',   label: (a, b) => `${a} + ${b}`,       f: (a, b) => a + b,           sym: true },
  { id: 'sub',   label: (a, b) => `${a} − ${b}`,       f: (a, b) => a - b,           sym: false },
  { id: 'mul',   label: (a, b) => `${a} · ${b}`,       f: (a, b) => a * b,           sym: true },
  { id: 'div',   label: (a, b) => `${a} / ${b}`,       f: (a, b) => a / b,           sym: false },
  { id: 'mean',  label: (a, b) => `(${a} + ${b}) / 2`, f: (a, b) => (a + b) / 2,     sym: true },
  { id: 'gmean', label: (a, b) => `√(${a}·${b})`,      f: (a, b) => Math.sqrt(a * b), sym: true },
  { id: 'addm1', label: (a, b) => `${a} + ${b} − 1`,   f: (a, b) => a + b - 1,       sym: true },
  { id: 'subp1', label: (a, b) => `${a} − ${b} + 1`,   f: (a, b) => a - b + 1,       sym: false },
  { id: 'ratio2',label: (a, b) => `${a}² / ${b}`,      f: (a, b) => (a * a) / b,     sym: false },
  { id: 'harm',  label: (a, b) => `${a}·${b} / (${a} + ${b})`, f: (a, b) => (a * b) / (a + b), sym: false },
];

/**
 * Build the candidate expression list for a given target.
 * @param {string[]} keys   invariant names, in column order
 * @param {number}   tIdx   column index of the target (excluded from expressions)
 * @param {object}   opts   {unary, binary} toggles
 */
export function buildPool(keys, tIdx, opts = {}) {
  const useUnary = opts.unary !== false;
  const useBinary = opts.binary !== false;
  const pool = [];
  const cols = keys.map((_, i) => i).filter(i => i !== tIdx);

  if (useUnary) {
    for (const i of cols) {
      for (const u of UNARY) {
        if (u.id === 'id') { pool.push({ kind: 1, a: i, op: u }); continue; }
        pool.push({ kind: 1, a: i, op: u });
      }
    }
  }
  if (useBinary) {
    for (let p = 0; p < cols.length; p++) {
      for (let q = 0; q < cols.length; q++) {
        if (p === q) continue;
        const i = cols[p], j = cols[q];
        for (const b of BINARY) {
          if (b.sym && p > q) continue;   // a+b === b+a, keep one
          pool.push({ kind: 2, a: i, b: j, op: b });
        }
      }
    }
  }
  return pool;
}

export function exprLabel(e, keys, meta) {
  const sym = k => (meta && meta[keys[k]] ? meta[keys[k]].symbol : keys[k]);
  return e.kind === 1 ? e.op.label(sym(e.a)) : e.op.label(sym(e.a), sym(e.b));
}

// --- evaluation ------------------------------------------------------------

function evalInto(e, cols, out, n) {
  if (e.kind === 1) {
    const A = cols[e.a], f = e.op.f;
    for (let i = 0; i < n; i++) out[i] = f(A[i]);
  } else {
    const A = cols[e.a], B = cols[e.b], f = e.op.f;
    for (let i = 0; i < n; i++) out[i] = f(A[i], B[i]);
  }
  return out;
}

/* A candidate is rejected the moment it is violated. Checking in a shuffled
   order makes bad candidates die within a few graphs instead of scanning all. */
function checkValid(e, cols, target, order, n, upper, scratch) {
  const kind1 = e.kind === 1;
  const A = cols[e.a];
  const B = kind1 ? null : cols[e.b];
  const f = e.op.f;
  let touch = 0;
  let worstSlack = Infinity;
  for (let k = 0; k < n; k++) {
    const i = order[k];
    const v = kind1 ? f(A[i]) : f(A[i], B[i]);
    if (!Number.isFinite(v)) return null;
    const slack = upper ? v - target[i] : target[i] - v;
    if (slack < -1e-9) return null;
    if (slack < 1e-9) touch++;
    if (slack < worstSlack) worstSlack = slack;
  }
  // a bound that is never tight anywhere is not interesting
  if (touch === 0) return null;
  evalInto(e, cols, scratch, n);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += upper ? scratch[i] - target[i] : target[i] - scratch[i];
  return { touch, avgSlack: sum / n };
}

/**
 * Mine conjectures of the form  target <= expr  (upper) or  target >= expr  (lower).
 * @returns {Array} accepted conjectures, in Dalmatian acceptance order
 */
export function mine({ keys, cols, target, upper = true, pool, limit = 40,
                       onProgress = null, seed = 7 }) {
  const n = target.length;

  // deterministic shuffle for early-exit ordering
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  let s = seed >>> 0;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = order[i]; order[i] = order[j]; order[j] = t;
  }

  const scratch = new Float64Array(n);
  const valid = [];
  const step = Math.max(1, Math.floor(pool.length / 100));

  for (let p = 0; p < pool.length; p++) {
    const stat = checkValid(pool[p], cols, target, order, n, upper, scratch);
    if (stat) valid.push({ e: pool[p], ...stat });
    if (onProgress && p % step === 0) onProgress(p / pool.length, valid.length);
  }

  // Tightest-on-average first, so the Dalmatian filter keeps the strong ones.
  valid.sort((a, b) => a.avgSlack - b.avgSlack || b.touch - a.touch);

  // Dalmatian: keep a bound only if it strictly improves the running envelope
  // (the pointwise best of everything accepted so far) somewhere.
  const envelope = new Float64Array(n).fill(upper ? Infinity : -Infinity);
  const accepted = [];
  const vbuf = new Float64Array(n);

  for (const cand of valid) {
    if (accepted.length >= limit) break;
    evalInto(cand.e, cols, vbuf, n);
    let improves = 0;
    for (let i = 0; i < n; i++) {
      if (upper ? vbuf[i] < envelope[i] - 1e-9 : vbuf[i] > envelope[i] + 1e-9) improves++;
    }
    if (improves === 0) continue;
    for (let i = 0; i < n; i++) {
      envelope[i] = upper ? Math.min(envelope[i], vbuf[i]) : Math.max(envelope[i], vbuf[i]);
    }
    accepted.push({ ...cand, improves });
  }

  // how much of the target the accepted set explains, jointly
  let envSlack = 0, envTouch = 0;
  for (let i = 0; i < n; i++) {
    const d = upper ? envelope[i] - target[i] : target[i] - envelope[i];
    envSlack += d;
    if (d < 1e-9) envTouch++;
  }

  return {
    accepted,
    scanned: pool.length,
    validCount: valid.length,
    envelopeSlack: envSlack / n,
    envelopeTouch: envTouch,
    n,
  };
}

/** Re-test an accepted conjecture on a corpus it was never mined on. */
export function verify(e, cols, target, upper) {
  const n = target.length;
  const kind1 = e.kind === 1;
  const A = cols[e.a], B = kind1 ? null : cols[e.b], f = e.op.f;
  let touch = 0, worst = Infinity, worstIdx = -1, skipped = 0;
  for (let i = 0; i < n; i++) {
    const v = kind1 ? f(A[i]) : f(A[i], B[i]);
    if (!Number.isFinite(v)) { skipped++; continue; }
    const slack = upper ? v - target[i] : target[i] - v;
    if (slack < worst) { worst = slack; worstIdx = i; }
    if (Math.abs(slack) < 1e-9) touch++;
  }
  return { holds: worst >= -1e-9, worst, worstIdx, touch, tested: n - skipped, skipped };
}
