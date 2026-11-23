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
- The 6 × 4 board has **106 624** solutions: 26 656 with the all-red tile in one
  quarter, times four quarters.

## The counting machine

Section 05 shows five machines side by side, each with a live 6 × 4 preview
(one tile every 100 ms):

0. brute force — fills every cell unchecked, throws the board away;
1. pruning — a tile is only placed if it matches its left and upper neighbour,
   and a dead branch is taken back tile by tile;
2. pruning again, plus one rule — the all-red tile is forbidden outside the
   top-left quarter (÷ 4);
3. same, and only the distinct rotations of each tile are tried
   (4²⁴ → 4¹⁸ × 2³ = ÷ 512);
4. same, but the next empty cell is always the one with the fewest legal
   placements (MRV) instead of reading order.

Then comes the real trick: project the board onto two colours (white and blue
become one pale blue). The 24 tiles collapse onto 6 patterns with fixed
multiplicities (and the all-red pattern confined to the top-left quarter, as in
step 2); that reduced puzzle has 20 solutions (skeletons). A sixth machine (`PatternPreview`) fills a 6 × 4 board with the six patterns at
0.1 s per tile — most constrained cell first, like step 4 — and adds each
skeleton it finds to a gallery.

Step 6 (`refine.ts`) then recolours each skeleton with the 24 real tiles: a tile
only fits a cell if its red edges match the skeleton, and the white/blue edges
must still match their neighbours. Each skeleton gets its own count and the
total is displayed — it covers every board whose all-red tile is in the
top-left quarter. A number field and a slider then let you browse all the
recoloured boards, one at a time. Fill each skeleton with the
original tiles and you get the full answer.

Both engines batch their work: many search steps inside a 10 ms budget, then a
single repaint every 80 ms. The boards are redrawn a dozen times per second
while the search runs hundreds of times faster than one step per tick. (The
brute-force card keeps a small cap of 3 tiles per frame so the board stays
readable.)

The counters run at 10 boards per second; step 0 shows the arrangement total,
the projected duration, iterations, completion and solutions found. Steps 1 to 4
count placements, dead ends and solutions.

## The conclusion

Step 0, at ten boards per second, would need 5.5 × 10²⁹ years to walk
1.75 × 10³⁸ arrangements. Steps 5 and 6 take about seven seconds in a browser:
project the board onto two colours (20 skeletons, 6 s), then recolour each
skeleton (26 656 boards in one quarter, 0.5 s), then × 4 quarters = 106 624.
The lesson is that almost none of the 10³⁸ carries useful information — the red
skeleton does, and once it is fixed only a handful of choices remain.
