import { PIECES, pieceLabel } from "./core/pieces.ts";
import { REFERENCE_GRID } from "./core/reference.ts";
import { boardSvgFromEdges, pieceSvg } from "./ui/render.ts";
import { BoardPreview } from "./ui/preview.ts";

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

mountGallery();
mountBoard();

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
