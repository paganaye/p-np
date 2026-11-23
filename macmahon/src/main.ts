import { PIECES, pieceLabel, RED } from "./core/pieces.ts";
import { REFERENCE_GRID } from "./core/reference.ts";
import { boardPatternSvg, boardSvgFromEdges, edgesOf, patternSvg, pieceSvg } from "./ui/render.ts";
import { BoardPreview } from "./ui/preview.ts";
import { PatternPreview } from "./ui/patternPreview.ts";
import { enumerateRefinements } from "./core/refine.ts";

const SIG = ["R", "B", "L"]; // red, white, blue

function mountGallery(): void {
    const host = document.querySelector<HTMLDivElement>("#pieces-gallery");
    if (!host) return;
    host.innerHTML = PIECES.map((edges, i) => {
        const signature = edges.map((c) => SIG[c]).join("");
        return (
            `<figure class="piece-card" title="Tile ${pieceLabel(i)} — ${signature}">` +
            pieceSvg(edges, 1.6) +
            `<figcaption class="mt-1.5 flex items-baseline justify-between font-mono text-[10px] tracking-wide text-muted">` +
            `<b class="font-semibold text-ink">${pieceLabel(i)}</b><span>${signature}</span>` +
            `</figcaption>` +
            `</figure>`
        );
    }).join("");
}

function mountBoard(): void {
    const host = document.getElementById("hero-board");
    if (host) host.innerHTML = boardSvgFromEdges(REFERENCE_GRID, 6, 1.1);
}

/* ------------------------------------------------------------------ */
/* The two-colour projection (step 5)                                  */
/* ------------------------------------------------------------------ */

/** 1 = red, 0 = anything else. */
function projectEdges(edges: readonly number[]): number[] {
    return edges.map((colour) => (colour === RED ? 1 : 0));
}

function canonicalPattern(bits: readonly number[]): string {
    let best = bits.join("");
    let current = [...bits];
    for (let turn = 0; turn < 3; turn++) {
        current = [current[3], current[0], current[1], current[2]];
        const key = current.join("");
        if (key < best) best = key;
    }
    return best;
}

function mountProjection(): void {
    const patterns = new Map<string, number[]>();
    for (const tile of PIECES) {
        const key = canonicalPattern(projectEdges(tile));
        if (!patterns.has(key)) patterns.set(key, key.split("").map(Number));
    }

    const tilesHost = document.getElementById("projected-tiles");
    if (tilesHost) {
        const reds = (bits: readonly number[]): number => bits.reduce((sum, v) => sum + v, 0);
        tilesHost.innerHTML = [...patterns.values()]
            .sort((a, b) => reds(a) - reds(b))
            .map((bits) => `<figure class="m-0">${patternSvg(bits, 1.6)}</figure>`)
            .join("");
    }
}

const skeletons: number[][][] = [];
const refinedBoards: Uint8Array[] = [];
let autoRefineAfterStep5 = false;

function setupPatternMachine(): void {
    const card = document.querySelector<HTMLElement>('[data-kind="patterns"]');
    if (!card) return;
    const button = card.querySelector<HTMLButtonElement>("[data-run]");
    const previewHost = card.querySelector<HTMLElement>("[data-preview]");
    const gallery = document.getElementById("skeletons");
    if (!button || !previewHost) return;

    const drawGallery = (): void => {
        if (!gallery) return;
        gallery.innerHTML = "";
        skeletons.forEach((cells, index) => {
            const figure = document.createElement("figure");
            figure.className = "m-0";
            figure.id = `skeleton-${index}`;
            figure.innerHTML =
                `<div class="board">${boardPatternSvg(cells, 6, 1)}</div>` +
                `<figcaption class="caption"><span>#${index + 1}</span> <b class="refined"></b></figcaption>`;
            gallery.appendChild(figure);
        });
    };

    const preview = new PatternPreview(previewHost, (cells) => {
        skeletons.push(cells);
        drawGallery();
    });

    let timer: number | undefined;
    let startedAt = 0;

    const stopAll = (label: string): void => {
        if (timer !== undefined) {
            window.clearInterval(timer);
            timer = undefined;
        }
        preview.stop();
        button.textContent = label;
    };

    const tick = (): void => {
        const elapsed = (performance.now() - startedAt) / 1000;
        const stats = preview.getStats();
        write(card, "elapsed", `${elapsed.toFixed(1)} s`);
        write(card, "placements", stats.placements.toLocaleString("en-US"));
        write(card, "deadends", stats.deadEnds.toLocaleString("en-US"));
        write(card, "solutions", String(stats.solutions));
        if (preview.isFinished()) {
            // skeletons.sort((a, b) => {
            //     const cornerA = allRedCell(a);
            //     const cornerB = allRedCell(b);
            //     if (cornerA !== cornerB) return cornerA - cornerB;
            //     const keyA = a.map((bits) => bits.join("")).join("");
            //     const keyB = b.map((bits) => bits.join("")).join("");
            //     return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
            // });
            drawGallery();
            stopAll("Done");
            if (autoRefineAfterStep5) {
                autoRefineAfterStep5 = false;
                if (skeletons.length > 0) document.getElementById("refine")?.click();
            }
        }
    };

    button.addEventListener("click", () => {
        if (timer !== undefined) {
            stopAll("Run again");
            return;
        }
        skeletons.length = 0;
        drawGallery();
        preview.reset();
        preview.start();
        startedAt = performance.now();
        tick();
        timer = window.setInterval(tick, 100);
        button.textContent = "Stop";
    });
}


mountGallery();
mountBoard();
mountProjection();
setupPatternMachine();
const QUARTERS = 4;

/** Applique la symétrie du quart demandé à un plateau du quart haut-gauche. */
function transformBoard(codes: Uint8Array, quarter: number): number[][] {
    const W = 6;
    const H = 4;
    const cells: number[][] = new Array(W * H);

    for (let cell = 0; cell < W * H; cell++) {
        const r = (cell / W) | 0;
        const c = cell % W;
        const edges = edgesOf(codes[cell]);
        let nr = r;
        let nc = c;
        let ne = edges;

        if (quarter === 1) {
            // left-right mirror
            nc = W - 1 - c;
            ne = [edges[0], edges[3], edges[2], edges[1]];
        } else if (quarter === 2) {
            // top-bottom mirror
            nr = H - 1 - r;
            ne = [edges[2], edges[1], edges[0], edges[3]];
        } else if (quarter === 3) {
            // 180° rotation
            nr = H - 1 - r;
            nc = W - 1 - c;
            ne = [edges[2], edges[3], edges[0], edges[1]];
        }

        cells[nr * W + nc] = ne;
    }

    return cells;
}

function showSolution(index: number): void {
    const host = document.getElementById("solution-board");
    const label = document.getElementById("solution-label");
    if (!host || refinedBoards.length === 0) return;

    const total = refinedBoards.length * QUARTERS;
    const position = Math.min(Math.max(index, 1), total);
    const zero = position - 1;
    const quarter = Math.floor(zero / refinedBoards.length);
    const local = zero % refinedBoards.length;

    host.classList.remove("hidden");
    host.innerHTML = boardSvgFromEdges(transformBoard(refinedBoards[local], quarter), 6, 1.1);
    if (label) label.textContent = `#${position} / ${total}`;
}

function setupSolutionBrowser(): void {
    const slider = document.getElementById("solution-slider") as HTMLInputElement | null;
    const input = document.getElementById("solution-index") as HTMLInputElement | null;
    if (slider) {
        slider.addEventListener("input", () => {
            if (input) input.value = slider.value;
            showSolution(Number(slider.value));
        });
    }
    if (input) {
        input.addEventListener("change", () => {
            if (slider) slider.value = input.value;
            showSolution(Number(input.value));
        });
    }
}

function setupRefine(): void {
    const button = document.getElementById("refine") as HTMLButtonElement | null;
    const stats = document.getElementById("refine-stats");
    const slider = document.getElementById("solution-slider") as HTMLInputElement | null;
    const input = document.getElementById("solution-index") as HTMLInputElement | null;
    if (!button || !stats) return;

    button.addEventListener("click", () => {
        if (skeletons.length === 0) {
            autoRefineAfterStep5 = true;
            stats.textContent = "Running step 5 first…";
            const step5 = document.querySelector<HTMLButtonElement>('[data-kind="patterns"] [data-run]');
            if (step5 && step5.textContent !== "Stop") step5.click();
            return;
        }
        button.disabled = true;
        refinedBoards.length = 0;
        let index = 0;
        let total = 0;
        const started = performance.now();

        const next = (): void => {
            const boards = enumerateRefinements(skeletons[index]);
            total += boards.length;
            for (const board of boards) refinedBoards.push(board);
            const badge = document.querySelector<HTMLElement>(`#skeleton-${index} .refined`);
            if (badge) badge.textContent = `· ${boards.length}`;
            index += 1;
            stats.textContent = `${index} / ${skeletons.length} skeletons recoloured — ${total} boards so far`;
            if (index < skeletons.length) {
                window.setTimeout(next, 0);
                return;
            }
            const seconds = ((performance.now() - started) / 1000).toFixed(1);
            stats.textContent =
                `${total} boards in ${seconds} s — every complete board whose all-red tile ` +
                `is in the top-left quarter. Browse them below.`;
            button.disabled = false;
            if (slider) {
                slider.min = "1";
                slider.max = String(refinedBoards.length * QUARTERS);
                slider.value = "1";
            }
            if (input) {
                input.min = "1";
                input.max = String(refinedBoards.length * QUARTERS);
                input.value = "1";
            }
            showSolution(1);
        };

        window.setTimeout(next, 0);
    });
}

setupRefine();
setupSolutionBrowser();

/* ------------------------------------------------------------------ */
/* The counting machine                                                */
/* ------------------------------------------------------------------ */

const TOTAL_ARRANGEMENTS = 174640699428027308978246462377820160000n; // 24! × 4²⁴
const SECONDS_PER_BOARD = 0.1; // the counter's speed: 10 boards per second
const SECONDS_PER_YEAR = 31_557_600;

const SUPS: Record<string, string> = {
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
    "-": "⁻",
};

function superscript(n: number): string {
    return String(n)
        .split("")
        .map((c) => SUPS[c] ?? c)
        .join("");
}

/** 1.746 × 10³⁸ */
function sci(x: number, digits = 2): string {
    if (!Number.isFinite(x) || x === 0) return "0";
    let exponent = Math.floor(Math.log10(Math.abs(x)));
    let mantissa = x / 10 ** exponent;
    if (Math.abs(mantissa) >= 10 ** digits) {
        mantissa /= 10;
        exponent += 1;
    }
    return `${mantissa.toFixed(digits)} × 10${superscript(exponent)}`;
}

function grouped(n: bigint): string {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function output(root: HTMLElement, name: string): HTMLElement | null {
    return root.querySelector<HTMLElement>(`[data-out="${name}"]`);
}

function write(root: HTMLElement, name: string, value: string): void {
    const el = output(root, name);
    if (el) el.textContent = value;
}

/** Small visual beat each time a counter moves. */
function flash(el: HTMLElement | null): void {
    if (!el) return;
    el.classList.remove("tickflash");
    void el.offsetWidth;
    el.classList.add("tickflash");
}

function setupMachine(): void {
    const cards = document.querySelectorAll<HTMLElement>(".experiment");
    let index = 0;

    for (const card of cards) {
        if (card.dataset.kind === "patterns") continue;
        index += 1;
        const kind = card.dataset.kind === "prune" ? "prune" : "count";
        const divisor = Number(card.dataset.divisor ?? "1");
        const total = TOTAL_ARRANGEMENTS / BigInt(divisor);
        const totalNumber = Number(total);

        const previewHost = card.querySelector<HTMLElement>("[data-preview]");
        if (!previewHost) continue;

        const preview = new BoardPreview(
            previewHost,
            kind === "prune" ? "pruned" : "brute",
            index * 7919 + 13,
            card.dataset.lock === "quarter",
            card.dataset.orientations === "distinct",
            card.dataset.order === "mrv",
        );

        if (kind === "count") {
            const years = (totalNumber * SECONDS_PER_BOARD) / SECONDS_PER_YEAR;
            write(card, "total", sci(totalNumber, 3));
            write(card, "eta", `${sci(years, 1)} yr`);
            output(card, "total")?.setAttribute("title", `${grouped(total)} arrangements`);
        }

        const button = card.querySelector<HTMLButtonElement>("[data-run]");
        if (!button) continue;

        let timer: number | undefined;
        let startedAt = 0;

        const stop = (): void => {
            if (timer !== undefined) {
                window.clearInterval(timer);
                timer = undefined;
            }
            preview.stop();
            button.textContent = "Run again";
        };

        const tick = (): void => {
            const elapsed = (performance.now() - startedAt) / 1000;
            const stats = preview.getStats();

            write(card, "elapsed", `${elapsed.toFixed(1)} s`);
            write(card, "sols", String(stats.solutions));

            if (kind === "count") {
                const iterations = Math.floor(elapsed / SECONDS_PER_BOARD + 1e-9);
                const percent = (iterations / totalNumber) * 100;
                write(card, "iter", iterations.toLocaleString("en-US"));
                write(card, "pct", percent === 0 ? "0 %" : `${sci(percent, 1)} %`);
                flash(output(card, "iter"));
            } else {
                write(card, "placements", stats.placements.toLocaleString("en-US"));
                write(card, "deadends", stats.deadEnds.toLocaleString("en-US"));
            }
        };

        button.addEventListener("click", () => {
            if (timer !== undefined) {
                stop();
                return;
            }
            startedAt = performance.now();
            preview.reset();
            preview.start();
            tick();
            timer = window.setInterval(tick, 100);
            button.textContent = "Stop";
        });
    }
}

setupMachine();
