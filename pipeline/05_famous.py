"""A third test set: named graphs that are famous precisely because they break things.

The exhaustive corpus stops at n=8 and the holdout is a *random* sample, so both
miss the sparse, highly-structured graphs that refute plausible bounds — the
Mycielski chain (triangle-free with unbounded chromatic number) above all.
Mining against this set is how a conjecture earns any trust.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import networkx as nx
import invariants

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SITE = os.path.join(ROOT, "site", "data")


def kneser(n, k):
    from itertools import combinations
    V = list(combinations(range(n), k))
    G = nx.Graph()
    G.add_nodes_from(range(len(V)))
    for i in range(len(V)):
        for j in range(i + 1, len(V)):
            if not set(V[i]) & set(V[j]):
                G.add_edge(i, j)
    return G


def mycielski_chain():
    out = []
    G = nx.complete_graph(2)
    for i in range(1, 4):
        G = nx.mycielskian(G)
        out.append((f"Mycielskian^{i}(K₂)", G.copy(),
                    "triangle-free, χ = %d" % (i + 2)))
    return out


NAMED = [
    ("Petersen",            nx.petersen_graph(),              "3-regular, girth 5, χ = 3"),
    ("Grötzsch",            nx.mycielskian(nx.cycle_graph(5)), "triangle-free but χ = 4"),
    ("Chvátal",             nx.chvatal_graph(),               "4-regular, triangle-free, χ = 4"),
    ("Heawood",             nx.heawood_graph(),               "bipartite, girth 6"),
    ("Desargues",           nx.desargues_graph(),             "bipartite, distance-regular"),
    ("Pappus",              nx.pappus_graph(),                "bipartite, girth 6"),
    ("Möbius–Kantor",       nx.moebius_kantor_graph(),        "girth 6, generalized Petersen"),
    ("Frucht",              nx.frucht_graph(),                "trivial automorphism group"),
    ("Dodecahedral",        nx.dodecahedral_graph(),          "planar, 3-regular"),
    ("Icosahedral",         nx.icosahedral_graph(),           "planar, 5-regular, χ = 4"),
    ("Octahedral",          nx.octahedral_graph(),            "K₂,₂,₂, χ = 3"),
    ("Kneser(5,2)",         kneser(5, 2),                     "= Petersen"),
    ("Kneser(6,2)",         kneser(6, 2),                     "triangle-free, χ = 4"),
    ("Hypercube Q₄",        nx.hypercube_graph(4),            "bipartite, 4-regular"),
    ("Wheel W₈",            nx.wheel_graph(9),                "hub plus C₈"),
    ("Complete K₈",         nx.complete_graph(8),             "χ = ω = 8"),
    ("Complete bip. K₄,₄",  nx.complete_bipartite_graph(4, 4), "χ = 2, α = 4"),
    ("Turán T(9,3)",        nx.turan_graph(9, 3),             "extremal triangle-free-free"),
    ("Cycle C₁₅",           nx.cycle_graph(15),               "odd cycle, χ = 3"),
    ("Path P₁₂",            nx.path_graph(12),                "tree, χ = 2"),
    ("Star K₁,₁₁",          nx.star_graph(11),                "Δ = 11, χ = 2"),
    ("Circular ladder CL₈", nx.circular_ladder_graph(8),      "prism over C₈"),
    ("Grid 4×4",            nx.convert_node_labels_to_integers(nx.grid_2d_graph(4, 4)), "planar bipartite"),
    ("Bull",                nx.bull_graph(),                  "triangle with two horns"),
    ("Krackhardt kite",     nx.krackhardt_kite_graph(),       "social-network test case"),
]


def build():
    rows = []
    entries = NAMED + mycielski_chain()
    for name, G, note in entries:
        G = nx.convert_node_labels_to_integers(G)
        if not nx.is_connected(G):
            print(f"skip {name}: disconnected")
            continue
        if G.number_of_nodes() > 22:
            print(f"skip {name}: n={G.number_of_nodes()} too large for exact invariants")
            continue
        inv = invariants.compute(G)
        inv["name"] = name
        inv["note"] = note
        inv["g6"] = nx.to_graph6_bytes(G, header=False).decode().strip()
        rows.append(inv)
        print(f"{name:22s} n={inv['n']:3d} m={inv['m']:4d} χ={inv['chromatic']} ω={inv['clique']} α={inv['independence']}")

    keys = [k for k in rows[0] if k not in ("g6", "name", "note")]
    out = {
        "keys": keys,
        "cols": [[r[k] for r in rows] for k in keys],
        "g6": [r["g6"] for r in rows],
        "names": [r["name"] for r in rows],
        "notes": [r["note"] for r in rows],
        "count": len(rows),
    }
    path = os.path.join(SITE, "famous.json")
    json.dump(out, open(path, "w"), separators=(",", ":"))
    print(f"\nwrote {path}: {len(rows)} named graphs")


if __name__ == "__main__":
    build()
