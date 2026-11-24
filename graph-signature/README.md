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

The key is a **walk tree**, not a neighbour count. From a vertex, follow every
path, and when a branch comes back to one of its own ancestors, write the
distance it took (`^3`). Counting neighbours cannot tell a triangle from a
square: both are 2-regular, every vertex sees two neighbours of degree two,
forever. The trees do: at depth 3 the triangle's has a `^3` return and the
square's does not.

- **Pass 1** looks one ring deep — that is the red degree, highest first.
- **Pass `p`** refines the first *tied* group (one that is neither a singleton nor
  a set of twins), keying each member by its walk tree `p` rings deep. Members
  sharing a key stay together, the others split. The children take the parent's
  slot, so the order is subdivided in place and never re-sorted across groups.
- A group that does not split at depth `p` is retried at depth `p + 1`.
- A group of one is **frozen** — nothing can move that vertex across another
  group.
- A group whose members are pairwise **twins** (a swap exchanges them without
  touching any other edge) can never be split, and its order is harmless: the
  matrix is the same whatever it is.

The depth is capped by the size of the tree: the key grows like
`degree^depth`, so for a vertex of degree 17 the budget stops at depth 3, and
for a cycle it reaches 6. Past that the sort stops and the string is flagged
provisional.

The log under the graph shows, for each pass, the depth it used, the group it
worked on, the key of every group it produced, the resulting order, and the full
state after the pass.

### When is the string canonical?

When **every group is a singleton or a set of twins**. Then the order inside a
group cannot change the matrix, so `graph6 canonical` is identical for every
isomorphic copy.

Otherwise the order inside a tied group is the input order and the string is
flagged *provisional*. That is the known ceiling: `K18` minus a perfect matching
is vertex-transitive with no twins, so no invariant and no depth can order it —
only individualization (pin a vertex, refine, and keep the smallest certificate
over the choices) would.

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

- the walk tree is the degree at depth 1, and it separates a triangle from a
  square at depth 3 while depth 2 still calls them equal;
- a return is written with its distance (`^3`), which is the whole difference;
- twins are found where they exist (the opposite vertices of a square, every pair
  of a complete graph) and not elsewhere;
- pass 1 orders by degree, highest first, with contiguous ranges `1..n`;
- `advance` copies the key honestly: on `P5` the degree-2 group `#1–#3` splits
  into `[2]` and `[1,3]`, because the middle vertex's depth-2 tree is bigger;
- the triangle is separated from the square once the depth reaches 3;
- the **profile** — each group's position, degree and size — is the same for every
  relabelling, checked on several shapes over random permutations;
- the depth budget shrinks as the degree grows (3 for `K18`, 6 for a cycle).

What is *not* tested, because it is not true yet: that the canonical string is
invariant when a tied group of non-twins remains. That case is flagged in the
page, not hidden.
