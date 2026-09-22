"""Rewrite the corpus in columnar form so the browser downloads ~3x less."""
import json, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(ROOT, "data")
SITE = os.path.join(ROOT, "site", "data")
os.makedirs(SITE, exist_ok=True)


def compact(name):
    rows = json.load(open(os.path.join(DATA, f"{name}.json")))
    keys = [k for k in rows[0] if k != "g6"]
    cols = []
    for k in keys:
        col = [r[k] for r in rows]
        # ints stay ints; floats get 5 decimals, which is well inside the
        # separation between distinct invariant values at these sizes
        if all(isinstance(v, int) for v in col):
            cols.append(col)
        else:
            cols.append([round(float(v), 5) for v in col])
    out = {"keys": keys, "cols": cols, "g6": [r["g6"] for r in rows], "count": len(rows)}
    path = os.path.join(SITE, f"{name}.json")
    with open(path, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"{name}: {len(rows)} graphs, {len(keys)} invariants -> {os.path.getsize(path)/1e6:.2f} MB")


compact("corpus")
compact("holdout")
meta = json.load(open(os.path.join(DATA, "invariants.json")))
json.dump(meta, open(os.path.join(SITE, "invariants.json"), "w"), indent=1)
print("invariants.json copied")
