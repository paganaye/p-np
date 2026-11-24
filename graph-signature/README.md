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

Being rebuilt from scratch, as a **sort, one pass at a time**, whose end product
is meant to be a **canonical graph6** — the same string for every graph
isomorphic to this one. Only **pass 1** exists today.

The goal is not a JSON tree but a string: the red graph re-indexed in the
canonical order and encoded as graph6, so two graphs can be compared with `===`.

How a pass works:

- the vertices are numbered `1..n` by the current order. A pass cuts them into
  **groups**, each a contiguous range of those numbers: `#1` for a frozen group,
  `#2–#4` for a tied one. The range is the group's identity — later passes refine
  a group by its position, never by its members' labels;
- a group of one is **frozen**: no later pass can move that vertex across
  another group. A group of two or more is **tied**, and only tied groups have
  anything left to refine;
- the key is built from numbers only; the `A…R` labels are for reading the log and
  never enter a key;
- a pass works **inside** the groups of the previous one, so the order is
  subdivided in place and never re-sorted: a group never crosses its neighbour,
  and once two vertices are ordered they stay ordered.

Pass 1 sorts by red degree, highest first. The full-width panel under the graph is
the log: one row per group, with its position range, its degree, its members and
its state (frozen or tied) — plus the graph6 of the current order, flagged as
provisional because tied groups still keep their input order.

Not there yet, and the reason it matters: a canonical graph6 needs a total order.
When a block cannot be split, the order inside it is arbitrary, and only **twins**
(the vertices interchangeable without touching anything else) make that order
harmless. `C6` is the counterexample — vertex-transitive, no twins, so different
orders give genuinely different matrices.

Full write-up, with the fields explained one by one and worked examples:
[docs/signature-2.md](docs/signature-2.md), and the French version
[docs/signature-2-fr.md](docs/signature-2-fr.md).

## Tests

```bash
pnpm test          # vitest run
pnpm test:watch
```

The suite pins down what **pass 1** promises, and nothing more:

- it groups by red degree, highest first, and the degrees of the blocks decrease
  strictly;
- the groups' position ranges are contiguous — `1..n` with no gap — and their
  members concatenate to the order;
- a group of one is frozen; a regular graph has exactly one tied group;
- the input order is kept inside a tied group (arbitrary, but deterministic);
- the **profile** — each block's degree and size, in order — is the same for every
  relabelling, checked on six shapes over 32 random permutations each;
- the module stops after pass 1 on purpose.

What is *not* tested, because it is not true yet: that the graph6 is canonical.
The order inside a tied block is the input order, so two labelled copies of the
same graph can still disagree.

The previous, multi-pass version had a heavier suite — an exhaustive enumeration
of every labelled graph of order 3 to 6, with the four known collisions at order
6 spelled out. That suite died with the implementation; the enumeration harness
is worth bringing back once the new version reaches a total order.

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
