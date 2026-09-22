"""Graph invariants for the conjecture corpus.

Every invariant here is *exact* — no heuristics — which is what makes the mined
bounds meaningful. Exponential ones (chromatic, independence, domination) are
brute-forced over bitmasks, which is fine for the n <= 10 range we enumerate.
"""
import math
from itertools import combinations

import numpy as np
import networkx as nx


# --- exact NP-hard invariants over bitmasks -------------------------------

def _neighbor_masks(G, nodes):
    idx = {v: i for i, v in enumerate(nodes)}
    masks = [0] * len(nodes)
    for u, v in G.edges():
        masks[idx[u]] |= 1 << idx[v]
        masks[idx[v]] |= 1 << idx[u]
    return masks


def independence_number(G):
    """Largest independent set, by branch and bound on bitmasks."""
    nodes = list(G.nodes())
    n = len(nodes)
    if n == 0:
        return 0
    nbr = _neighbor_masks(G, nodes)
    best = 0

    def expand(cand, size):
        nonlocal best
        if size + bin(cand).count("1") <= best:
            return
        if cand == 0:
            best = max(best, size)
            return
        # branch on the candidate vertex of highest degree within `cand`
        v = max((i for i in range(n) if cand >> i & 1),
                key=lambda i: bin(nbr[i] & cand).count("1"))
        # take v
        expand(cand & ~nbr[v] & ~(1 << v), size + 1)
        # skip v
        expand(cand & ~(1 << v), size)

    expand((1 << n) - 1, 0)
    return best


def clique_number(G):
    return independence_number(nx.complement(G))


def chromatic_number(G):
    """Smallest k with a proper k-colouring, by DSATUR-ordered backtracking."""
    nodes = list(G.nodes())
    n = len(nodes)
    if n == 0:
        return 0
    if G.number_of_edges() == 0:
        return 1
    nbr = _neighbor_masks(G, nodes)
    lower = clique_number(G)

    order = sorted(range(n), key=lambda i: -bin(nbr[i]).count("1"))

    def colourable(k):
        colour = [-1] * n

        def place(pos):
            if pos == n:
                return True
            v = order[pos]
            used = set()
            for u in range(n):
                if nbr[v] >> u & 1 and colour[u] >= 0:
                    used.add(colour[u])
            # symmetry breaking: never open more than one fresh colour
            top = min(k, max(colour) + 2)
            for c in range(top):
                if c in used:
                    continue
                colour[v] = c
                if place(pos + 1):
                    return True
                colour[v] = -1
            return False

        return place(0)

    for k in range(lower, n + 1):
        if colourable(k):
            return k
    return n


def domination_number(G):
    """Smallest dominating set, by increasing-size search over bitmasks."""
    nodes = list(G.nodes())
    n = len(nodes)
    if n == 0:
        return 0
    nbr = _neighbor_masks(G, nodes)
    closed = [nbr[i] | (1 << i) for i in range(n)]
    full = (1 << n) - 1
    for size in range(1, n + 1):
        for combo in combinations(range(n), size):
            cov = 0
            for i in combo:
                cov |= closed[i]
            if cov == full:
                return size
    return n


# --- spectral --------------------------------------------------------------

def _spectra(G, nodes):
    A = nx.to_numpy_array(G, nodelist=nodes)
    deg = A.sum(axis=1)
    L = np.diag(deg) - A
    ev_a = np.linalg.eigvalsh(A)
    ev_l = np.linalg.eigvalsh(L)
    return A, deg, ev_a, ev_l


# --- degree-based topological indices --------------------------------------

def _edge_indices(G):
    abc = randic = harmonic = sumconn = 0.0
    zagreb1 = zagreb2 = 0
    deg = dict(G.degree())
    for u, v in G.edges():
        du, dv = deg[u], deg[v]
        abc += math.sqrt((du + dv - 2) / (du * dv))
        randic += 1.0 / math.sqrt(du * dv)
        harmonic += 2.0 / (du + dv)
        sumconn += 1.0 / math.sqrt(du + dv)
        zagreb2 += du * dv
    zagreb1 = sum(d * d for d in deg.values())
    return abc, randic, harmonic, sumconn, zagreb1, zagreb2


def compute(G):
    """Return the full invariant dict for a connected graph G."""
    nodes = sorted(G.nodes())
    n = G.number_of_nodes()
    m = G.number_of_edges()
    deg = [d for _, d in G.degree()]

    A, degv, ev_a, ev_l = _spectra(G, nodes)
    ev_a_sorted = np.sort(ev_a)[::-1]
    ev_l_sorted = np.sort(ev_l)

    sp = dict(nx.all_pairs_shortest_path_length(G))
    ecc = {v: max(sp[v].values()) for v in nodes}
    wiener = sum(sp[u][v] for u, v in combinations(nodes, 2))

    girth = float("inf")
    try:
        girth = nx.girth(G)
    except Exception:
        cyc = nx.cycle_basis(G)
        girth = min((len(c) for c in cyc), default=float("inf"))
    if girth == float("inf"):
        girth = 0  # acyclic: reported as 0 rather than infinity

    abc, randic, harmonic, sumconn, z1, z2 = _edge_indices(G)

    alpha = independence_number(G)
    omega = clique_number(G)
    chi = chromatic_number(G)

    # Kirchhoff (resistance) index from the non-zero Laplacian eigenvalues
    nz = ev_l_sorted[1:]
    kirchhoff = float(n * np.sum(1.0 / nz)) if n > 1 and np.all(nz > 1e-9) else 0.0

    return {
        "n": n,
        "m": m,
        "max_degree": max(deg),
        "min_degree": min(deg),
        "avg_degree": 2.0 * m / n,
        "degree_var": float(np.var(deg)),
        "diameter": max(ecc.values()),
        "radius": min(ecc.values()),
        "girth": girth,
        "triangles": int(sum(nx.triangles(G).values()) // 3),
        "density": nx.density(G),
        "chromatic": chi,
        "independence": alpha,
        "clique": omega,
        "domination": domination_number(G),
        "matching": len(nx.max_weight_matching(G)),
        "vertex_conn": nx.node_connectivity(G),
        "edge_conn": nx.edge_connectivity(G),
        "spectral_radius": float(ev_a_sorted[0]),
        "second_eigenvalue": float(ev_a_sorted[1]) if n > 1 else 0.0,
        "smallest_eigenvalue": float(ev_a_sorted[-1]),
        "energy": float(np.sum(np.abs(ev_a))),
        "algebraic_conn": float(ev_l_sorted[1]) if n > 1 else 0.0,
        "laplacian_radius": float(ev_l_sorted[-1]),
        "kirchhoff": kirchhoff,
        "estrada": float(np.sum(np.exp(ev_a))),
        "wiener": wiener,
        "abc_index": abc,
        "randic": randic,
        "harmonic": harmonic,
        "sum_connectivity": sumconn,
        "zagreb1": z1,
        "zagreb2": z2,
    }


INVARIANT_META = {
    "n":                     ("n",                         "number of vertices",                          "int"),
    "m":                     ("m",                         "number of edges",                             "int"),
    "max_degree":            ("Δ",                         "maximum degree",                              "int"),
    "min_degree":            ("δ",                         "minimum degree",                              "int"),
    "avg_degree":            ("d̄",                        "2m/n",                                        "float"),
    "degree_var":            ("Var(d)",                    "variance of the degree sequence",             "float"),
    "diameter":              ("diam",                      "longest shortest path",                       "int"),
    "radius":                ("rad",                       "minimum eccentricity",                        "int"),
    "girth":                 ("g",                         "shortest cycle length (0 if acyclic)",        "int"),
    "triangles":             ("t",                         "number of 3-cliques",                         "int"),
    "density":               ("ρ",                         "2m / n(n-1)",                                 "float"),
    "chromatic":             ("χ",                         "chromatic number",                            "int"),
    "independence":          ("α",                         "independence number",                         "int"),
    "clique":                ("ω",                         "clique number",                               "int"),
    "domination":            ("γ",                         "domination number",                           "int"),
    "matching":              ("ν",                         "maximum matching size",                       "int"),
    "vertex_conn":           ("κ",                         "vertex connectivity",                         "int"),
    "edge_conn":             ("λₑ",                        "edge connectivity",                           "int"),
    "spectral_radius":       ("λ₁",                        "largest adjacency eigenvalue",                "float"),
    "second_eigenvalue":     ("λ₂",                        "second adjacency eigenvalue",                 "float"),
    "smallest_eigenvalue":   ("λₙ",                        "smallest adjacency eigenvalue",               "float"),
    "energy":                ("E",                         "sum of |adjacency eigenvalues|",              "float"),
    "algebraic_conn":        ("μ",                         "algebraic connectivity",                      "float"),
    "laplacian_radius":      ("μ₁",                        "largest Laplacian eigenvalue",                "float"),
    "kirchhoff":             ("Kf",                        "resistance index",                            "float"),
    "estrada":               ("EE",                        "sum of exp(eigenvalues)",                     "float"),
    "wiener":                ("W",                         "sum of all pairwise distances",               "int"),
    "abc_index":             ("ABC",                       "atom-bond connectivity index",                "float"),
    "randic":                ("R",                         "Randić connectivity index",                   "float"),
    "harmonic":              ("H",                         "harmonic index",                              "float"),
    "sum_connectivity":      ("SCI",                       "sum-connectivity index",                      "float"),
    "zagreb1":               ("M₁",                        "first Zagreb index",                          "int"),
    "zagreb2":               ("M₂",                        "second Zagreb index",                         "int"),
}
