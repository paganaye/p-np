**English** · [Français](signature-2-fr.md)

# Signature 2 — colour refinement, one pass at a time

`Signature 2` is the second signature panel of the page. It answers the same
question as the first one — *what does this colouring look like, independently of
how the vertices happen to be numbered?* — but by a completely different route:
**a signature built one pass at a time, without unrolling anything.**

The first signature unrolls the neighbourhood tree until every vertex is told
apart, and falls back on a 30 000-node budget when that never happens. On a
symmetric graph it never happens: `K18` all red spends the whole budget and gives
up. `Signature 2` never unrolls, so it never explodes — and, in exchange, it
sometimes stops early and says so.

---

## The idea

> A pass turns the current partition of the vertices into a finer one. The
> result of a pass depends only on the **shape** of the red graph: two graphs
> that are the same up to relabelling produce exactly the same pass, and
> therefore exactly the same signature.

That is the whole contract. It has two halves, and they must be kept apart when
testing:

| property | statement | a failure means |
|---|---|---|
| **invariance** | isomorphic graphs → identical signature | a **bug**: the signature depends on the labelling |
| **completeness** | identical signature → isomorphic graphs | **expected**: the known ceiling of colour refinement |

`Signature 2` guarantees the first. It aims at the second and cannot always reach
it (see [The ceiling](#the-ceiling)).

---

## The state

The working state is **one integer per vertex**: its *class number*.

```
vertex    A  B  C  D  E  F  G  H  I
class     0  0  0  0  0  0  0  0  0      ← K9 all red
```

Nothing else is kept. No tree, no stack, no budget. Two vertices in the same
class are, as far as the algorithm knows, indistinguishable.

The class numbers are always in **canonical order**: they are renumbered at every
pass by an order that compares class numbers only, never the `A…R` labels. This
is what makes the record label-free.

---

## Pass 0

The initial class is the **red degree**, highest degree first.

```
red degrees 8 8 8 8 8 8 8 8 8   →  one class: [9]
red degrees 1 2 2 2 2 2 2 2 1   →  two classes: [7, 2]
```

Two vertices of different degree can never be swapped by an isomorphism, so this
split is free and it is already correct.

---

## A pass

For every vertex `v`:

1. `rest(v)` = the class numbers of its red neighbours, sorted ascending;
2. `key(v)` = `(class(v), rest(v))` — a small array.

Then:

3. sort the vertices by `key`, ties broken by vertex index (the tie order only
   affects the order *inside* a class, never the order of the classes);
4. every maximal run of equal keys becomes one class;
5. renumber the classes `0, 1, 2, …` in the order the keys sort.

Equivalently: two vertices stay together exactly as long as they had the same
class **and** the same multiset of class numbers among their neighbours.

### Why it only ever splits

Each new class is a subset of an old one, so the partition can only get finer.
It can never merge two vertices that a previous pass had separated. This
monotonicity is what makes the stopping rule below sound.

---

## When it stops

The loop stops as soon as a pass leaves the partition **unchanged**:

> if one pass separates nothing, no later pass ever will.

That is not a heuristic. The pass is a deterministic function of the partition,
the partition can only get finer, and there are finitely many partitions of `n`
vertices. So a pass that changes nothing is a **fixed point**, and it is
permanent. The record says so with `"split": false`.

At that point the partition is called **equitable**: inside a class, all members
have the same number of neighbours in every class. Nothing is left for the
refinement to see.

If the partition reaches `n` classes — one vertex each — it is **discrete**: the
refinement told every vertex apart.

---

## The record

The panel shows one JSON document:

```json
{
  "stable": true,
  "passes": [
    {
      "pass": 0,
      "classes": [
        { "size": 7, "views": [{ "count": 5, "neighbours": [0, 0] },
                               { "count": 2, "neighbours": [0, 1] }] },
        { "size": 2, "views": [{ "count": 2, "neighbours": [0] }] }
      ]
    },
    {
      "pass": 4,
      "classes": [
        { "size": 1, "views": [{ "count": 1, "neighbours": [1, 1] }] },
        { "size": 2, "views": [{ "count": 2, "neighbours": [0, 2] }] },
        { "size": 2, "views": [{ "count": 2, "neighbours": [1, 3] }] },
        { "size": 2, "views": [{ "count": 2, "neighbours": [2, 4] }] },
        { "size": 2, "views": [{ "count": 2, "neighbours": [3] }] }
      ],
      "split": false
    }
  ]
}
```

### Fields

| field | where | meaning |
|---|---|---|
| `stable` | root | `true` when the last pass changed nothing — the fixed point was reached |
| `passes` | root | pass `0` (degrees), then one entry per refinement pass |
| `pass` | pass | the pass number; `0` is the initial split by red degree |
| `classes` | pass | the partition at the end of that pass, in canonical class order |
| `size` | class | how many vertices the class holds |
| `views` | class | the distinct neighbourhood situations inside the class |
| `count` | view | how many members of the class have this situation |
| `neighbours` | view | the sorted class numbers of that member's red neighbours |
| `split` | pass | absent on pass `0`; `true` if this pass separated anything |

### How to read `views`

A `view` is what one member of the class sees, expressed in class numbers. Its
length is the **degree**: `[1, 1]` is a vertex of degree 2 with both neighbours
in class 1; `[3]` is a vertex of degree 1 whose only neighbour sits in class 3.

The `views` of a class are exactly the information the **next** pass consumes:

- **one view** → every member has the same neighbourhood situation, the class
  cannot split again;
- **several views** → the class will split at the next pass, one sub-class per
  view.

So `"split": false` on a pass is the same statement as *"every class of that pass
has exactly one view"*. The views are recorded per pass because they carry more
than the sizes: two graphs can have the same class sizes pass after pass and
still connect those classes differently.

The `count` field is also a symmetry detector: `{"count": 9, ...}` inside a class
of `size: 9` says that all nine members are in the same situation.

---

## Worked examples

### `K9` all red — one class, one pass

```json
{ "stable": true,
  "passes": [
    { "pass": 0, "classes": [ { "size": 9, "views": [ { "count": 9, "neighbours": [0,0,0,0,0,0,0,0] } ] } ] },
    { "pass": 1, "split": false, "classes": [ { "size": 9, "views": [ { "count": 9, "neighbours": [0,0,0,0,0,0,0,0] } ] } ] } ] }
```

One class, nine vertices, each with eight neighbours — all in class 0. Pass 1
produces the same thing, so the partition is equitable and the loop stops.

Reading: **every vertex looks exactly like every other one; the refinement will
never tell them apart.** That is a result, not a failure.

### `P9`, the path on nine vertices — four passes

```
pass 0   [7, 2]        degrees 2 and 1
pass 1   [5, 2, 2]     the ends separate, then their neighbours
pass 2   [3, 2, 2, 2]
pass 3   [1, 2, 2, 2, 2]   the middle vertex is alone
pass 4   [1, 2, 2, 2, 2]   split: false → fixed point
```

Each pass peels one layer. The sizes are shown for intuition; the record carries
the full views, which is what actually drives the split.

---

## The ceiling

Colour refinement is the **1-dimensional Weisfeiler–Leman** algorithm. Its limits
are known and they are not a bug in this panel:

- every `d`-regular graph looks the same from every vertex, so the refinement
  ends on a single class and says nothing more;
- the smallest counterexamples are `C6` versus `2×C3` (2-regular) and `K3,3`
  versus the triangular prism (3-regular), all on six vertices;
- one edge away from regularity, `K3,3 − e` and `prism − e` collide too: they
  share the quotient `A(2) ↔ B(4)`, and the refinement cannot see whether the two
  `B`-neighbours of an `A` vertex are opposite or adjacent inside the induced
  `C4`. Their complements form a fourth pair;
- as a consequence, `Signature 2` separates every graph of order ≤ 5 and collides
  exactly four times at order 6 — 156 isomorphism classes, 152 signatures. That
  is what the test suite measures, pair by pair.

`Signature 2` also does **not** produce a canonical labelling: when the partition
ends on one class, there is no order to read off. Giving a canonical order in
that case requires *individualization* — fix a vertex, refine again, recurse, and
keep the lexicographically best certificate — which is what nauty, traces and
bliss do, with automorphism pruning to keep the search tree small.

Between the two extremes, `Signature 2` is the honest middle: it never lies, it
never runs out of budget, and it says exactly how far the refinement got.

---

## Cost

Per pass: reading the neighbours, sorting their class numbers, sorting `n` keys —
`O(n + m log deg)` with `m` the number of red edges. The number of passes is at
most `n`, and in practice a handful: the partition strictly refines at every
non-final pass, so there can be at most `n − 1` of them.

On 18 vertices this is microseconds, and nothing in the algorithm can grow: the
state is `n` integers.

---

## What it does not give

- **no vertex correspondence** — two globally symmetric vertices stay together,
  by definition;
- **no canonical order** in the ambiguous cases;
- **no guarantee of completeness** — `C6` and `2×C3` share a signature, and so do
  all pairs of `d`-regular graphs;
- **no cycle information** — the first signature's `ll` (loop length) has no
  counterpart here, because there is no tree to loop in. The information it
  carried — *this edge comes back to an ancestor* — is already implied by the
  fact that a neighbour sits in an ancestor's class.
