# Conjecture Engine

Mines bounds between graph invariants from an exhaustive corpus of small graphs, then
tries to break them.

**[Open the instrument →](https://rostam.github.io/graph-conjectures/)**

In 1986 Siemion Fajtlowicz's *Graffiti* program produced conjectures about graph
invariants that mathematicians then spent years proving or refuting — several became
published theorems. The idea was never really rebuilt with the compute we have now.
This is that loop, in a browser: pick an invariant, pick a direction, and watch a few
thousand candidate inequalities get tested against every connected graph up to eight
vertices.

## What it does

Given a target invariant *t* and a direction, it searches expressions built from the
other 32 invariants and keeps `t ≤ f` (or `t ≥ f`) when two things hold:

1. **It is never violated** on the search corpus.
2. **It is significant** — strictly tighter than every bound already kept, on at least
   one graph. This is Fajtlowicz's *Dalmatian* rule, and it is what stops the output
   filling up with weaker restatements of the same fact.

Then it attacks each survivor with two sets it never mined on: 9,000 sampled graphs on
9–11 vertices, and 27 named graphs chosen because they are famous for breaking things.

## It rediscovers real theorems

Ask for upper bounds on the chromatic number and the first things out are:

| Conjecture | Status |
| --- | --- |
| χ ≤ λ₁ + 1 | **Wilf's theorem** (1967) |
| χ ≤ n − α + 1 | classical, true |
| χ ≤ ω + 1 | **false** — and the engine says so |

That last row is the point. χ ≤ ω + 1 holds on every one of the 12,112 graphs up to
eight vertices, and on 9,000 random graphs up to eleven. It is still false: the
Grötzsch graph is triangle-free (ω = 2) with χ = 4, and the Mycielski construction
pushes the gap arbitrarily wide. The engine finds the Grötzsch graph, names it, and
marks the bound **Broken**.

Which is the honest lesson of the whole exercise. Exhaustive search over small graphs
produces statements that are *true on everything you looked at*, and the interesting
ones are exactly the ones where that is not the same as true.

## The evidence

| Set | Graphs | Role |
| --- | --- | --- |
| Exhaustive | 12,112 | every connected graph on 2–8 vertices (`nauty-geng`) |
| Holdout | 9,000 | sampled connected graphs on 9–11 vertices |
| Named | 27 | Grötzsch, Chvátal, Kneser, Mycielski chain, Petersen, … |

33 invariants per graph, all computed **exactly** — no heuristics. The NP-hard ones
(χ, α, ω, γ) are brute-forced over bitmasks, which is affordable at these sizes and is
what makes a mined bound mean anything.

## Reproducing it

```bash
sudo apt install nauty                 # provides nauty-geng
pip install networkx numpy

python pipeline/02_corpus.py           # enumerate + compute invariants  (~30 s)
python pipeline/03_compact.py          # columnar rewrite for the browser
python pipeline/05_famous.py           # the named-graph test set
node   pipeline/04_precompute.mjs      # optional: static conjecture export
```

Then serve `docs/` over HTTP (the page fetches its data, so `file://` will not work):

```bash
python -m http.server -d docs 8801
```

## Layout

```
pipeline/
  invariants.py      33 exact invariants
  02_corpus.py       nauty-geng enumeration -> invariants
  03_compact.py      columnar rewrite (8.6 MB -> 2.0 MB)
  04_precompute.mjs  static conjecture export via the same miner the page uses
  05_famous.py       named-graph falsification set
docs/
  js/mine.js         the miner: candidate pool, validity, Dalmatian filter
  js/graph6.js       graph6 decoding + spring layout for the drawings
  js/app.js          the instrument
```

`mine.js` is plain ES modules with no dependencies and runs unchanged in the browser
and in node, so the precompute script and the page cannot drift apart.

## Caveats

- A conjecture here is a statement that survived a search, not a theorem. The point of
  the named-graph set is to make that concrete rather than to hide it.
- The expression pool is deliberately small and interpretable (sums, products, ratios,
  square roots of at most two invariants). Graffiti's real pool was richer.
- Invariants are exact only because the graphs are small. Nothing here extends to
  n = 50 without giving that up.
