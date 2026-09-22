/* graph6.js — decode graph6 strings and lay graphs out for drawing.
   Format: github.com/.../formats.txt — n in the first byte(s) (+63), then the
   upper triangle column by column, six bits per printable character. */

export function decodeGraph6(s) {
  const b = [];
  for (let i = 0; i < s.length; i++) b.push(s.charCodeAt(i) - 63);
  let n, p;
  if (b[0] === 63) {          // 126 - 63: two-byte or eight-byte length prefix
    n = (b[1] << 12) | (b[2] << 6) | b[3];
    p = 4;
  } else {
    n = b[0];
    p = 1;
  }
  const adj = Array.from({ length: n }, () => new Uint8Array(n));
  let bit = 0;
  for (let j = 1; j < n; j++) {
    for (let i = 0; i < j; i++) {
      const byte = b[p + ((bit / 6) | 0)];
      const v = (byte >> (5 - (bit % 6))) & 1;
      if (v) { adj[i][j] = 1; adj[j][i] = 1; }
      bit++;
    }
  }
  const edges = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (adj[i][j]) edges.push([i, j]);
  return { n, adj, edges };
}

/* Spring layout, seeded on a circle. Small n, so a plain Fruchterman–Reingold
   pass is both fast enough and more readable than anything fancier. */
export function layout(g, iters = 260) {
  const { n, edges } = g;
  const pos = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    pos.push([Math.cos(a), Math.sin(a)]);
  }
  if (n < 3) return pos;
  const k = Math.sqrt(1.6 / n);
  let temp = 0.16;
  for (let it = 0; it < iters; it++) {
    const disp = Array.from({ length: n }, () => [0, 0]);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1];
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-6) { dx = (i - j) * 1e-3 + 1e-3; dy = 1e-3; d2 = dx * dx + dy * dy; }
        const d = Math.sqrt(d2);
        const rep = (k * k) / d2;
        disp[i][0] += (dx / d) * rep; disp[i][1] += (dy / d) * rep;
        disp[j][0] -= (dx / d) * rep; disp[j][1] -= (dy / d) * rep;
      }
    }
    for (const [u, v] of edges) {
      const dx = pos[u][0] - pos[v][0], dy = pos[u][1] - pos[v][1];
      const d = Math.hypot(dx, dy) || 1e-6;
      const att = (d * d) / k;
      disp[u][0] -= (dx / d) * att; disp[u][1] -= (dy / d) * att;
      disp[v][0] += (dx / d) * att; disp[v][1] += (dy / d) * att;
    }
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(disp[i][0], disp[i][1]) || 1e-6;
      const s = Math.min(d, temp) / d;
      pos[i][0] += disp[i][0] * s;
      pos[i][1] += disp[i][1] * s;
    }
    temp *= 0.975;
  }
  return pos;
}

export function graphSVG(g6, size = 132, opts = {}) {
  const g = decodeGraph6(g6);
  const pos = layout(g);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pos) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const pad = 13;
  const w = Math.max(maxX - minX, 1e-6), h = Math.max(maxY - minY, 1e-6);
  const sc = Math.min((size - 2 * pad) / w, (size - 2 * pad) / h);
  const P = pos.map(([x, y]) => [
    pad + (x - minX) * sc + (size - 2 * pad - w * sc) / 2,
    pad + (y - minY) * sc + (size - 2 * pad - h * sc) / 2,
  ]);
  const r = g.n > 14 ? 3 : 4.2;
  const parts = [`<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="graph on ${g.n} vertices with ${g.edges.length} edges">`];
  for (const [u, v] of g.edges) {
    parts.push(`<line x1="${P[u][0].toFixed(1)}" y1="${P[u][1].toFixed(1)}" x2="${P[v][0].toFixed(1)}" y2="${P[v][1].toFixed(1)}" stroke="currentColor" stroke-opacity=".38" stroke-width="1"/>`);
  }
  for (let i = 0; i < g.n; i++) {
    parts.push(`<circle cx="${P[i][0].toFixed(1)}" cy="${P[i][1].toFixed(1)}" r="${r}" fill="${opts.fill || 'var(--sig)'}"/>`);
  }
  parts.push('</svg>');
  return parts.join('');
}
