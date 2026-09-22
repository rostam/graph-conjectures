import { buildPool, mine, exprLabel, verify } from './mine.js';
import { graphSVG } from './graph6.js';

const $ = s => document.querySelector(s);
const stage = $('#stage');

const state = { upper: true, target: 'chromatic', limit: 25, open: -1, last: null };
let corpus, holdout, famous, meta, keys, cCols, hCols, fCols;

const toCols = d => d.cols.map(c => Float64Array.from(c));
const sym = k => (meta[k] ? meta[k].symbol : k);

async function boot() {
  const [c, h, f, m] = await Promise.all(
    ['corpus', 'holdout', 'famous', 'invariants']
      .map(n => fetch(`data/${n}.json`).then(r => r.json())));
  corpus = c; holdout = h; famous = f; meta = m;
  keys = corpus.keys;
  cCols = toCols(corpus); hCols = toCols(holdout); fCols = toCols(famous);

  const sel = $('#target');
  for (const k of keys) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = `${meta[k].symbol} — ${meta[k].desc}`;
    if (k === state.target) o.selected = true;
    sel.append(o);
  }

  $('#sets').innerHTML = [
    ['All graphs, n ≤ 8', corpus.count.toLocaleString()],
    ['Sampled, n = 9–11', holdout.count.toLocaleString()],
    ['Named graphs', famous.count],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

  sel.onchange = () => { state.target = sel.value; run(); };
  $('#dir').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    state.upper = b.dataset.v === 'upper';
    [...$('#dir').children].forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    run();
  };
  $('#limit').oninput = e => { state.limit = +e.target.value; $('#limitVal').textContent = e.target.value; };
  $('#limit').onchange = run;
  $('#run').onclick = run;
  run();
}

function shapeHint() {
  $('#shape').innerHTML =
    `Looking for expressions <em>f</em> built from the other invariants with
     ${sym(state.target)} ${state.upper ? '≤' : '≥'} <em>f</em> on every graph in the search set.`;
}

function run() {
  shapeHint();
  const t = keys.indexOf(state.target);
  const pool = buildPool(keys, t, { unary: $('#useUnary').checked, binary: $('#useBinary').checked });
  if (!pool.length) { stage.innerHTML = `<div class="empty"><h3>Nothing to search</h3><p>Turn at least one expression family back on.</p></div>`; return; }

  stage.innerHTML = `<div class="empty"><h3>Mining…</h3><p>Testing ${pool.length.toLocaleString()} candidate expressions against ${corpus.count.toLocaleString()} graphs.</p></div>`;

  // Paint the pending state before the synchronous sweep. setTimeout rather than
  // requestAnimationFrame: rAF never fires while the tab is in the background,
  // which would leave the page stuck on "Mining…" until it was focused.
  setTimeout(() => {
    const t0 = performance.now();
    const res = mine({ keys, cols: cCols, target: cCols[t], upper: state.upper, pool, limit: state.limit });
    res.ms = performance.now() - t0;
    res.t = t;
    state.last = res;
    state.open = -1;
    render();
  }, 16);
}

function render() {
  const res = state.last, t = res.t;
  const rel = state.upper ? '≤' : '≥';

  const banner = `<div class="banner">
    <div class="statement">${sym(state.target)} <span class="q">${rel}</span> <span class="q">?</span></div>
    <div class="meta">
      <b>${res.scanned.toLocaleString()}</b> expressions tested ·
      <b>${res.validCount.toLocaleString()}</b> never violated ·
      <b>${res.accepted.length}</b> kept ·
      <b>${res.ms.toFixed(0)}</b> ms
    </div>
  </div>`;

  if (!res.accepted.length) {
    stage.innerHTML = banner + `<div class="empty"><h3>No bound survived</h3>
      <p>Nothing in this search space bounds ${sym(state.target)} from ${state.upper ? 'above' : 'below'}
      across all ${corpus.count.toLocaleString()} graphs while also being tight somewhere.
      Widen the search space, or try the other direction.</p></div>`;
    return;
  }

  const rows = res.accepted.map((a, i) => {
    const hv = verify(a.e, hCols, hCols[t], state.upper);
    const fv = verify(a.e, fCols, fCols[t], state.upper);
    let cls = 'survives', text = 'Survives';
    if (!fv.holds) { cls = 'broken'; text = 'Broken'; }
    else if (!hv.holds) { cls = 'broken'; text = 'Broken'; }
    a._h = hv; a._f = fv;
    return `<article class="cj" aria-expanded="${state.open === i}" data-i="${i}">
      <div class="head" role="button" tabindex="0">
        <span class="rank">${String(i + 1).padStart(2, '0')}</span>
        <span class="claim">${sym(state.target)}<span class="op">${rel}</span>${exprLabel(a.e, keys, meta)}</span>
        <span class="metric">${a.touch.toLocaleString()}<small>tight on</small></span>
        <span class="metric">${a.avgSlack.toFixed(2)}<small>mean gap</small></span>
        <span class="verdict ${cls}">${text}</span>
      </div>
      ${state.open === i ? detail(a, i) : ''}
    </article>`;
  }).join('');

  stage.innerHTML = banner + `<div class="rows">${rows}</div>`;

  stage.querySelectorAll('.cj .head').forEach(h => {
    const act = () => {
      const i = +h.closest('.cj').dataset.i;
      state.open = state.open === i ? -1 : i;
      render();
      if (state.open === i) stage.querySelector(`.cj[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' });
    };
    h.onclick = act;
    h.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } };
  });
}

function detail(a, i) {
  const t = state.last.t, rel = state.upper ? '≤' : '≥';
  const hv = a._h, fv = a._f;

  // counterexample from the named set, if this bound dies there
  let kill = '';
  if (!fv.holds && fv.worstIdx >= 0) {
    const k = fv.worstIdx;
    kill = `<div class="killbox">
      <div class="who">${famous.names[k]} breaks it.</div>
      <div class="why">${famous.notes[k]} — here ${sym(state.target)} = ${fCols[t][k]}
      but the bound gives ${(evalAt(a.e, fCols, k)).toFixed(3)}, off by ${Math.abs(fv.worst).toFixed(3)}.</div>
    </div>`;
  } else if (!hv.holds && hv.worstIdx >= 0) {
    kill = `<div class="killbox">
      <div class="who">A sampled graph on ${hCols[keys.indexOf('n')][hv.worstIdx]} vertices breaks it.</div>
      <div class="why">Holds on every graph up to 8 vertices, then fails by ${Math.abs(hv.worst).toFixed(3)}.</div>
    </div>`;
  }

  const verdictLine = fv.holds && hv.holds
    ? `<p>Holds on all ${corpus.count.toLocaleString()} graphs up to 8 vertices, all
       ${hv.tested.toLocaleString()} sampled graphs on 9–11 vertices, and all ${fv.tested} named graphs.
       That is evidence, not a proof — the next graph is always the one that matters.</p>`
    : `<p>True on every graph up to 8 vertices, which is exactly why a search of that size
       cannot be trusted on its own.</p>`;

  return `<div class="detail">
    <div>
      <h4>How tight it is</h4>
      ${verdictLine}
      ${kill}
      ${scatter(a, t)}
      <p>Each mark is one graph: the bound's value against the true ${sym(state.target)}.
      Marks on the diagonal are the cases where the bound is exactly attained.</p>
    </div>
    <div>
      <h4>Where it is attained</h4>
      <div class="gallery">${tightGallery(a, t)}</div>
      <h4>On the named graphs</h4>
      <div class="gallery">${famousGallery(a, t)}</div>
    </div>
  </div>`;
}

function evalAt(e, cols, i) {
  return e.kind === 1 ? e.op.f(cols[e.a][i]) : e.op.f(cols[e.a][i], cols[e.b][i]);
}

function scatter(a, t) {
  const W = 430, H = 250, pad = 36;
  const n = corpus.count;
  const xs = new Float64Array(n), ys = cCols[t];
  for (let i = 0; i < n; i++) xs[i] = evalAt(a.e, cCols, i);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(xs[i])) { lo = Math.min(lo, xs[i]); hi = Math.max(hi, xs[i]); }
    lo = Math.min(lo, ys[i]); hi = Math.max(hi, ys[i]);
  }
  if (!Number.isFinite(lo)) return '';
  const span = (hi - lo) || 1;
  const X = v => pad + ((v - lo) / span) * (W - pad - 12);
  const Y = v => H - pad - ((v - lo) / span) * (H - pad - 12);

  // bucket to avoid emitting 12k nodes
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(xs[i])) continue;
    const kx = Math.round(X(xs[i]) * 1.4), ky = Math.round(Y(ys[i]) * 1.4);
    const key = kx * 10000 + ky;
    if (!seen.has(key)) seen.set(key, [X(xs[i]), Y(ys[i]), 0]);
    seen.get(key)[2]++;
  }
  const pts = [...seen.values()].map(([x, y, c]) =>
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.min(2.6, 0.9 + Math.log10(c + 1))}" fill="var(--sig)" fill-opacity="${Math.min(0.75, 0.2 + c / 300)}"/>`).join('');

  return `<svg class="scatter" viewBox="0 0 ${W} ${H}" width="100%" role="img"
      aria-label="scatter of bound value against true value over all ${n} graphs">
    <line x1="${pad}" y1="${H - pad}" x2="${W - 12}" y2="${H - pad}" stroke="var(--rule)"/>
    <line x1="${pad}" y1="12" x2="${pad}" y2="${H - pad}" stroke="var(--rule)"/>
    <line x1="${X(lo)}" y1="${Y(lo)}" x2="${X(hi)}" y2="${Y(hi)}" stroke="var(--ink-faint)" stroke-dasharray="3 3" stroke-width="1"/>
    ${pts}
    <text x="${pad}" y="${H - 10}" font-size="10" fill="var(--ink-faint)" font-family="IBM Plex Mono, monospace">${lo.toFixed(1)}</text>
    <text x="${W - 12}" y="${H - 10}" font-size="10" text-anchor="end" fill="var(--ink-faint)" font-family="IBM Plex Mono, monospace">bound → ${hi.toFixed(1)}</text>
    <text x="6" y="20" font-size="10" fill="var(--ink-faint)" font-family="IBM Plex Mono, monospace">${sym(state.target)}</text>
  </svg>`;
}

function tightGallery(a, t) {
  const n = corpus.count, out = [];
  for (let i = 0; i < n && out.length < 6; i++) {
    const v = evalAt(a.e, cCols, i);
    if (!Number.isFinite(v)) continue;
    if (Math.abs(v - cCols[t][i]) < 1e-9) out.push(i);
  }
  if (!out.length) return '<p>No graph attains it exactly.</p>';
  return out.map(i => `<div class="gcard">${graphSVG(corpus.g6[i], 104)}
    <div class="cap">n=${cCols[keys.indexOf('n')][i]} ${sym(state.target)}=${cCols[t][i]}</div></div>`).join('');
}

function famousGallery(a, t) {
  const rel = state.upper ? 1 : -1;
  const scored = [];
  for (let i = 0; i < famous.count; i++) {
    const v = evalAt(a.e, fCols, i);
    if (!Number.isFinite(v)) continue;
    scored.push({ i, slack: rel * (v - fCols[t][i]) });
  }
  scored.sort((p, q) => p.slack - q.slack);
  return scored.slice(0, 4).map(({ i, slack }) => {
    const broken = slack < -1e-9;
    return `<div class="gcard ${broken ? 'kill' : ''}">${graphSVG(famous.g6[i], 104)}
      <div class="cap">${famous.names[i]}<br>${broken ? 'fails by ' + Math.abs(slack).toFixed(2) : 'gap ' + slack.toFixed(2)}</div></div>`;
  }).join('');
}

boot().catch(e => {
  stage.innerHTML = `<div class="empty"><h3>Could not load the corpus</h3>
    <p>${e.message}. The data files sit next to this page in <code>data/</code>; a plain
    file:// open will not fetch them, so serve the folder over HTTP.</p></div>`;
});
