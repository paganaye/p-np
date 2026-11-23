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
```

## Structure

- `src/core/signature.ts` — port of `ramsey-v2/graph_signature_v2.py`: degree,
  resolution step, loop length, final index, neighbourhood expansion, canonical
  order.
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
