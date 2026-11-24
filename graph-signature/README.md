# Graph signatures

A live view of a complete graph with two edge colours, from **K3** to **K18** (a
slider and a number field). Click an edge to flip it between red and blue.

The signature of the **red** graph (blue is its complement) is a **canonical
graph6**: the same string for every graph isomorphic to this one, whatever the
order its vertices happen to be numbered in.

Same stack as `macmahon/`: Vite + TypeScript + Tailwind CSS v4.

## Run

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build
pnpm test
```

## Structure

- `src/core/signature2.ts` — the signature: a sort, one pass at a time (see below).
- `src/core/signature2.test.ts` — the test suite.
- `src/core/graph6.ts` — graph6 encoding and decoding.
- `src/ui/graphView.ts` — SVG drawing on a circle, click to toggle an edge
  (nearest-segment hit testing), hover highlight.
- `src/main.ts` — colouring state, buttons (random / all red / all blue / shuffle
  labels), and the rendering of the signature, the graph6 strings and the pass log.
- `vitest.config.ts` — separate from `vite.config.ts` so the tests never pull the
  Tailwind plugin into a Node run.
- `docs/signature-2.md` — historical design notes for an earlier version, in
  English; `docs/signature-2-fr.md` is the French one.

## The signature

The signature is a **sort**. Vertices are numbered `1..n` by the current order,
and a pass cuts them into **groups**, each a contiguous range of those numbers
(`#1` for a group of one, `#2–#4` for a group of three). The range is the group's
identity — later passes refine a group by its position, never by its members'
labels.

The key is a **ball**, not a neighbour count: everything within distance `d` of
the vertex, with the edges inside. Its size is bounded by the graph — at most `n`
vertices — and it stops growing once `d` reaches the diameter, so the number of rings is a
property of the graph rather than a setting.

The key is not the whole ball (deciding whether two balls are isomorphic is a
graph isomorphism problem of its own); it is a label-free shadow of it. For each
distance ring: how many vertices, their sorted degrees, how many edges inside the
ring, how many back to the previous one. That is already enough to tell a triangle
from a square at radius 1 — the triangle's first ring has an edge inside it, the
square's does not.

- **Pass 1** looks one ring out — that is the red degree, highest first.
- **Pass `p`** refines the first *tied* group (one that is neither a singleton nor
  a set of twins), keying each member by its ball `p` rings out. Members sharing a
  key stay together, the others split; the children take the parent's slot, so the
  order is subdivided in place.
- When the keys separate nothing, the sort records the miss and goes one ring
  further out, up to the diameter.
- Once the diameter is reached and a group still refuses to split, the search
  **pins** it: each member in turn is taken out of the group, the whole sort is
  run again, and the branch that gives the smallest graph6 wins. A pin is
  therefore never a choice, only a comparison.
- A group of one is **frozen** — nothing can move that vertex across another
  group.
- A group whose members are pairwise **twins** (a swap exchanges them without
  touching any other edge) can never be split, and its order is harmless: the
  matrix is the same whatever it is.

The key of a vertex is short: the degree, then one section per ring, each written
`positions|inside|back` — the sorted group positions of the ring, the edges inside
it, and the edges back to the previous ring. Degrees are not listed separately: a
group holds one degree, so a position already carries it.

The **Compare two nodes** panel picks two vertices and walks their balls ring by
ring: the degree first, then each ring, stopping at the first disagreement and
naming the first position where the two rings differ. That is the comparison the
sort itself performs, shown step by step.

The log under the graph shows, for each pass, the ring it used, the group it
worked on, the key of every group it produced, the resulting order, and the full
state after the pass.

### When is the string canonical?

When **every group is a singleton or a set of twins**. Then the order inside a
group cannot change the matrix, so `graph6 canonical` is identical for every
isomorphic copy.

Otherwise the order inside a tied group is the input order and the string is
flagged *provisional* — which can only happen if the search itself is incomplete,
since a group that resists every distance is pinned and its branches compared.

The search is bounded at 1000 branches. Past that it throws
`SearchTooLargeError` instead of freezing: the page catches it, shows the sort as
far as it got, prints `—` for the canonical string and says `gave up`. A graph
that is too hard is reported, never hidden.

The **Shuffle labels** button renumbers the vertices without adding or removing a
single edge: `graph6 input` moves, `graph6 canonical` must not. It is a one-click
check of the invariant.

## graph6

The panel shows two strings:

- **input order** — the red graph as it is currently numbered;
- **canonical order** — the same graph re-indexed by the signature, with a note
  saying whether that string is canonical or provisional.

Paste any graph6 string of 3–18 vertices in the field and press *Load* to bring
that graph into the editor. Encoding: a header byte `n + 63`, then the upper
triangle of the adjacency matrix packed six bits per byte.

The rest of the page shows the same object in readable form:

- **adjacency matrix, twice** — once in the input order, once in the canonical
  order, both labelled with the input letters. The upper triangle of the
  canonical one, read row by row, is exactly the bit stream graph6 encodes, so
  the canonical string can be checked by hand. Clicking any cell flips that edge
  in both grids;
- **red edges** — an adjacency list over the canonical positions `1…n`.

The current colouring is saved to `localStorage` under `graph-signature:graph6`
on every change, and restored on the next visit. A stored string that no longer
decodes, or that falls outside 3–18 vertices, is ignored and a fresh random
colouring is generated instead.

## Tests

```bash
pnpm test          # vitest run
pnpm test:watch
```

The suite pins down what the sort promises today:

- the ball key is the degree at radius 1, and it separates a triangle from a
  square at radius 1 already — the triangle's first ring has an edge inside it,
  the square's does not;
- a ball stops growing at the diameter, so the number of rings is the graph's own;
- twins are found where they exist (the opposite vertices of a square, every pair
  of a complete graph) and not elsewhere;
- pass 1 orders by degree, highest first, with contiguous ranges `1..n`;
- `advance` copies the key honestly: on `P5` the degree-2 group splits into `[2]`
  and `[1,3]`, because the middle vertex's ball is not the others';
- a square sharing a vertex with a triangle settles with no pin at all;
- two disjoint edges get pinned, and every relabelling gives the same string;
- `K18` minus a perfect matching throws `SearchTooLargeError` rather than hanging;
- every labelled graph of order 6 is enumerated and the costliest one is reported:
  **33 branches**, for `K4` with two pendant vertices attached on opposite sides
  (`Ezm_`). The cost is the branch count, not wall time, so the number is stable.
- the **profile** — each group's position, degree and size — is the same for every
  relabelling when nothing was pinned.

What is *not* tested, because it is not true yet: that the canonical string is
invariant when a tied group of non-twins remains. That case is flagged in the
page, not hidden.
