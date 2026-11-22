# MacMahon's squares

A static page — **Vite + TypeScript + Tailwind CSS v4** — about the MacMahon squares
puzzle: 24 tiles, 3 colours, one 6 × 4 rectangle, and **1.75 × 10³⁸** possible
arrangements.

## Run

```bash
pnpm install    # or npm install
pnpm dev        # http://localhost:5173
pnpm build      # static build in dist/
```

## Structure

- `index.html` — the page, all copy in English, styled with Tailwind utilities.
- `src/style.css` — Tailwind import, theme tokens, and the few component classes
  for the tiles and boards.
- `src/core/pieces.ts` — builds the 24 tiles from the 3⁴ = 81 colourings,
  canonicalised up to rotation (Burnside).
- `src/core/reference.ts` — one known 6 × 4 solution, stored as edge tuples.
- `src/ui/render.ts` — turns tiles and boards into SVG.
- `src/main.ts` — mounts the gallery and the hero board.

## The numbers on the page

- 3⁴ = 81 colourings → **24** tiles up to rotation.
- 24! = 620 448 401 733 239 439 360 000.
- 4²⁴ = 281 474 976 710 656.
- 24! × 4²⁴ = 174 640 699 428 027 308 978 246 462 377 820 160 000 ≈ **1.75 × 10³⁸**.
- At one billion per second: ≈ 5.5 × 10²¹ years, about 400 billion ages of the universe.
- The 6 × 4 board has **12 261** solutions (found in 1964 in roughly 40 hours).

## The counting machine

Section 05 shows four machines side by side, each with a live 6 × 4 preview
(one tile every 100 ms):

0. brute force — fills every cell unchecked, throws the board away;
1. pruning — a tile is only placed if it matches its left and upper neighbour,
   and a dead branch is taken back tile by tile;
2. pruning again, plus one rule — the all-red tile is forbidden outside the
   top-left quarter (÷ 4).

The counters run at 10 boards per second; step 0 shows the arrangement total,
the projected duration, iterations, completion and solutions found. Steps 1
and 2 count placements, dead ends and solutions.
