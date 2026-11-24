# Graph signatures

A live view of a complete graph with two edge colours, from **K3** to **K18**
(a slider and a number field). Click an edge to
flip it between red and blue; the canonical signature of the **red** graph (blue
is its complement) is recomputed below.

Same stack as `macmahon/`: Vite + TypeScript + Tailwind CSS v4.

## Run

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build
pnpm test
```

## Structure

- `src/core/signature.ts` — port of `ramsey-v2/graph_signature_v2.py`: degree,
  resolution step, loop length, final index, neighbourhood expansion, canonical
  order.
- `src/core/signature2.ts` — colour refinement on integer classes, stopped at the
  fixed point (see below).
- `src/core/signature2.test.ts` — the test suite (see Tests).
- `vitest.config.ts` — separate from `vite.config.ts` so the tests never pull the
  Tailwind plugin into a Node run.
- `docs/signature-2.md` — the full write-up: the idea, the fields, worked
  examples, and the ceiling.
- `docs/signature-2-fr.md` — the same document in French.
- `src/ui/graphView.ts` — SVG drawing on a circle, click to toggle an edge
  (nearest-segment hit testing), hover highlight.
- `src/main.ts` — colouring state, buttons (random / all red / all blue),
  signature panel (indented JSON with light highlighting).

## Signature

Displayed as indented JSON, one entry per vertex in canonical order:

```json
[
  {
    "nc": 1,
    "fi": 0,
    "rs": 1,
    "n": [{ "nc": 1, "ll": 2 }]
  }
]
```

- `nc` — neighbour count, i.e. the red degree;
- `fi` / `rs` — final canonical index, and the pass at which it was fixed;
- `ll` — loop length: the edge points back to the ancestor that many levels up,
  which is what stops the expansion;
- `n` — neighbourhood, present only when the vertex had to be expanded.

The JSON is cut at 24 000 characters (very symmetric colourings explode).

## Signature 2

A second, independent panel, deliberately kept beside the first until it earns
its place. It computes the **colour refinement** on integer classes instead of
unrolling trees:

- state = one integer per vertex (its class); pass 0 is the red degree;
- a pass rewrites each class from `(old class, sorted classes of the neighbours)`
  and renumbers the classes in canonical order — an order that never looks at
  the `A…R` labels;
- the loop stops as soon as a pass leaves the partition **unchanged**, and that
  is a proof of the fixed point: the refinement only splits classes, never
  merges them, so nothing can change afterwards.

Nothing is unrolled, so nothing explodes: the panel answers immediately on
`K18` all red with `1 class · 1 pass · fixed point`, where the first signature
exhausts its 30 000-node budget.

The panel renders it as indented JSON, like the first signature — same document
for both, so they can be compared line by line:

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

Each pass carries its **full** result, not just the class sizes: for every class,
`size` and the distinct `views` of its members — the sorted class numbers of
their neighbours, with how many members have each. A class with a single view
cannot split again; a pass where *every* class has a single view is the fixed
point, which is exactly what `"split": false` says.

The views matter because `size` alone collides: two graphs can have the same
class sizes pass after pass and still connect those classes differently. The
honest limit is the other side of it — when the refinement ends on a single
class, every 4-regular graph on 9 vertices reads `1 class, 4 neighbours each`,
and no amount of refinement separates them. That is the known ceiling of colour
refinement, not a bug in the panel.

No vertex label ever appears. The canonical class order is computed by comparing
class numbers only, and `pass 0` is the initial split by red degree.

Full write-up, with the fields explained one by one and worked examples:
[docs/signature-2.md](docs/signature-2.md), and the French version
[docs/signature-2-fr.md](docs/signature-2-fr.md).

## Tests

```bash
pnpm test          # vitest run
pnpm test:watch
```

Two different properties are checked, and they must not be confused:

- **invariance** — isomorphic graphs give the same signature. A failure is a bug:
  the signature depends on the labelling. Only `passes` is compared; `vector`
  is *not* invariant (it is permuted with the labels).
- **completeness** — same signature implies isomorphic. A failure is expected:
  it is the known ceiling of colour refinement, and the census measures it.

The core test enumerates **every labelled graph** of order 3 to 6 and counts the
distinct signatures. Since every labelling of every graph is fed in, an
invariance bug shows up as far too many distinct signatures, and a completeness
failure as too few.

| order | labelled graphs | expected distinct signatures | why |
|---|---|---|---|
| 3 | 8 | 4 | all graphs separated (OEIS A000088) |
| 4 | 64 | 11 | idem |
| 5 | 1 024 | 34 | idem |
| 6 | 32 768 | 152 | 156 classes, minus the four merging pairs |

The four pairs at order 6 are the known ones, and they are asserted *explicitly*
as a positive control: a test that never finds them is itself suspect.

- `C6` and `2×C3` — the two 2-regular graphs;
- `K3,3` and the triangular prism — the two 3-regular graphs;
- `K3,3 − e` and `prism − e` — both of degree sequence `3,3,3,3,2,2`;
- their complements — both of degree sequence `3,3,2,2,2,2`.

The last two are the ones that are easy to miss: they are not regular, but they
share the quotient `A(2) ↔ B(4)` where each `A` vertex has two neighbours in `B`
and each `B` vertex has one in `A` and two in `B`. Colour refinement counts
neighbours per class, so it cannot see *which* ones — in one graph the two
`B`-neighbours of an `A` vertex are opposite in the induced `C4`, in the other
they are adjacent.

Other tests: invariance under 64 random relabellings for seven shapes (up to 16
vertices), determinism, the internal consistency of the record (`views` sum to
`size`, a settled pass has one view per class), and the cross-check against the
tree signature (the tree's budget explodes on `K18` where the refinement settles
immediately; a graph the tree resolves completely is also resolved by the
refinement).

## graph6

The current colouring is shown as a **graph6** string (the red graph; blue is the
complement). Paste any graph6 string of 3–18 vertices and press *Load* to bring
that graph into the editor. Encoding: one header byte `n + 63`, then the upper
triangle of the adjacency matrix packed six bits per byte.

## Notes

- The expansion budget is 30 000 signatures. Very symmetric colourings (all red,
  all blue) make the refinement expand indefinitely, so the page stops and says
  so instead of freezing.
- 18 vertices = 153 edges, drawn as chords; clicking near an edge picks the
  closest one.
