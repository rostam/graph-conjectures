"""Build the graph corpus: every connected graph up to n=8, plus samples above.

Small orders are enumerated exhaustively with nauty-geng, so a bound that survives
them has genuinely been checked against *all* graphs of that size. Orders 9-11 are
sampled and held out as a falsification set the miner never sees.
"""
import json, os, subprocess, sys, random, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import networkx as nx
import invariants

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(ROOT, "data")
os.makedirs(DATA, exist_ok=True)

GENG = "nauty-geng"
# exhaustive up to 8; sampled beyond (the full n=9 class is 261,080 graphs)
EXHAUSTIVE = [(2, None), (3, None), (4, None), (5, None), (6, None), (7, None), (8, None)]
SAMPLED = [(9, 4000), (10, 3000), (11, 2000)]


def geng(n, limit=None, seed=11):
    """Yield graph6 strings for connected graphs on n vertices."""
    out = subprocess.run([GENG, "-c", "-q", str(n)], capture_output=True, text=True)
    lines = [l for l in out.stdout.split("\n") if l]
    if limit is not None and len(lines) > limit:
        random.Random(seed).shuffle(lines)
        lines = lines[:limit]
    return lines


def geng_sampled(n, limit, seed=11):
    """For large n, stream geng and reservoir-sample so we never hold the class."""
    proc = subprocess.Popen([GENG, "-c", "-q", str(n)], stdout=subprocess.PIPE, text=True)
    rng = random.Random(seed)
    reservoir, seen = [], 0
    for line in proc.stdout:
        line = line.strip()
        if not line:
            continue
        seen += 1
        if len(reservoir) < limit:
            reservoir.append(line)
        else:
            j = rng.randrange(seen)
            if j < limit:
                reservoir[j] = line
        if seen >= 3_000_000:      # enough of the class for a fair sample
            proc.kill()
            break
    try:
        proc.stdout.close(); proc.wait(timeout=5)
    except Exception:
        proc.kill()
    return reservoir, seen


def build(entries, sampled, label):
    rows = []
    for n, limit in entries:
        t0 = time.time()
        if sampled:
            g6s, seen = geng_sampled(n, limit)
            print(f"n={n}: sampled {len(g6s)} of {seen:,} scanned", flush=True)
        else:
            g6s = geng(n, limit)
            print(f"n={n}: {len(g6s)} connected graphs", flush=True)
        for s in g6s:
            G = nx.from_graph6_bytes(s.encode())
            inv = invariants.compute(G)
            inv["g6"] = s
            rows.append(inv)
        print(f"   invariants in {time.time()-t0:.1f}s (total {len(rows)})", flush=True)
    path = os.path.join(DATA, f"{label}.json")
    with open(path, "w") as fh:
        json.dump(rows, fh, separators=(",", ":"))
    print(f"wrote {path}: {len(rows)} graphs  ({os.path.getsize(path)/1e6:.1f} MB)", flush=True)
    return rows


if __name__ == "__main__":
    build(EXHAUSTIVE, False, "corpus")
    build(SAMPLED, True, "holdout")
    meta = {k: {"symbol": v[0], "desc": v[1], "kind": v[2]}
            for k, v in invariants.INVARIANT_META.items()}
    with open(os.path.join(DATA, "invariants.json"), "w") as fh:
        json.dump(meta, fh, indent=1)
    print("done", flush=True)
