/**
 * Aperçu animé : un plateau 6 × 4 qui se remplit pièce par pièce.
 *
 * - mode "brute"  : la machine pose des pièces au hasard sans rien vérifier,
 *                   puis jette le plateau une fois plein.
 * - mode "pruned" : elle ne pose que des pièces compatibles ; dès qu'une branche
 *                   est morte, elle retire la pièce et essaie la suivante.
 *
 * Options cumulables :
 * - lockAllRed       : interdit la pièce toute rouge hors du quart haut-gauche ;
 * - distinctRotations: n'essaie que les rotations réellement distinctes ;
 * - mostConstrained  : choisit toujours la case vide au plus petit domaine (MRV).
 */
import { PIECE_COUNT, PIECES, RED } from "../core/pieces.ts";
import { edgesOf, pieceSvg } from "./render.ts";

const W = 6;
const H = 4;
const N = W * H;
const BORDER = 0;
const QUARTER_ROWS = 2; // top half
const QUARTER_COLS = 3; // left half

// Batching: many search steps per repaint, so the machine computes fast
// while the board is only redrawn a dozen times per second.
const FRAME_MS = 80;
const COMPUTE_MS = 10;
const MAX_STEPS_PER_FRAME = 4000;
const BRUTE_STEPS_PER_FRAME = 3;

const ALL_RED_PIECE = PIECES.findIndex((tile) => tile.every((colour) => colour === RED));

const ALL_ROTATIONS = [0, 1, 2, 3];

/**
 * Orientations réellement distinctes de chaque pièce :
 * 1 pour les monochromes, 2 pour les pièces invariantes par 180°, 4 sinon.
 */
const DISTINCT_ROTATIONS: number[][] = PIECES.map((tile) => {
    const seen = new Set<string>();
    const kept: number[] = [];
    let edges = [...tile];
    for (let orientation = 0; orientation < 4; orientation++) {
        const key = edges.join("");
        if (!seen.has(key)) {
            seen.add(key);
            kept.push(orientation);
        }
        edges = [edges[3], edges[0], edges[1], edges[2]];
    }
    return kept;
});

export interface PreviewStats {
    placements: number;
    deadEnds: number;
    solutions: number;
}

export class BoardPreview {
    private cells: Array<number | null> = new Array(N).fill(null);
    private used = 0;
    private timer: number | undefined;
    private seed: number;
    private stats: PreviewStats = { placements: 0, deadEnds: 0, solutions: 0 };
    private walker: Generator<void> | null = null;

    constructor(
        private readonly host: HTMLElement,
        private readonly mode: "brute" | "pruned",
        seed = 12345,
        private readonly lockAllRed = false,
        private readonly distinctRotations = false,
        private readonly mostConstrained = false,
    ) {
        this.seed = seed >>> 0;
        this.render();
    }

    start(): void {
        if (this.timer !== undefined) return;
        this.timer = window.setInterval(() => this.frame(), FRAME_MS);
    }

    stop(): void {
        if (this.timer === undefined) return;
        window.clearInterval(this.timer);
        this.timer = undefined;
    }

    reset(): void {
        this.cells = new Array(N).fill(null);
        this.used = 0;
        this.walker = null;
        this.stats = { placements: 0, deadEnds: 0, solutions: 0 };
        this.render();
    }

    getStats(): PreviewStats {
        return { ...this.stats };
    }

    /* ---------------------------------------------------------------- */

    private random(): number {
        this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
        return this.seed / 4294967296;
    }

    private frame(): void {
        if (this.mode === "brute") {
            // Cheap steps: keep the board readable instead of filling it instantly.
            for (let i = 0; i < BRUTE_STEPS_PER_FRAME; i++) this.bruteStep();
            this.render();
            return;
        }

        if (!this.walker) this.walker = this.walk();
        const deadline = performance.now() + COMPUTE_MS;
        let steps = 0;

        while (steps < MAX_STEPS_PER_FRAME) {
            const result = this.walker.next();
            steps++;
            if (result.done) {
                // The whole tree has been explored: start a fresh walk.
                this.cells = new Array(N).fill(null);
                this.used = 0;
                this.walker = this.walk();
                break;
            }
            if ((steps & 63) === 0 && performance.now() >= deadline) break;
        }

        this.render();
    }

    /* ---------------------------------------------------------------- */
    /* Brute force: fill everything, check nothing                         */
    /* ---------------------------------------------------------------- */

    private bruteStep(): void {
        const idx = this.cells.indexOf(null);
        if (idx < 0) {
            this.flash("is-invalid");
            this.cells = new Array(N).fill(null);
            this.used = 0;
            return;
        }
        for (let attempt = 0; attempt < 512; attempt++) {
            const code = (this.random() * PIECE_COUNT * 4) | 0;
            const bit = 1 << (code >> 2);
            if (this.used & bit) continue;
            this.used |= bit;
            this.cells[idx] = code;
            this.stats.placements++;
            return;
        }
    }

    /* ---------------------------------------------------------------- */
    /* Pruned search: one placement (or removal) per tick                  */
    /* ---------------------------------------------------------------- */

    private *walk(): Generator<void> {
        const cell = this.pickCell();
        if (cell < 0) {
            this.stats.solutions++;
            this.flash("is-solved");
            yield;
            return;
        }

        const options = this.optionsFor(cell);
        if (options.length === 0) {
            this.stats.deadEnds++;
            yield;
            return;
        }

        for (const code of options) {
            this.place(cell, code);
            this.stats.placements++;
            yield;

            // The all-red tile must still have somewhere to go in the quarter.
            if (!this.lockAllRed || this.allRedReachable()) {
                yield* this.walk();
            }

            this.unplace(cell);
            this.stats.deadEnds++;
            yield;
        }
    }

    private place(cell: number, code: number): void {
        this.used |= 1 << (code >> 2);
        this.cells[cell] = code;
    }

    private unplace(cell: number): void {
        const code = this.cells[cell];
        if (code === null) return;
        this.used &= ~(1 << (code >> 2));
        this.cells[cell] = null;
    }

    /** First empty cell in reading order, or the one with the fewest options. */
    private pickCell(): number {
        let best = -1;
        let bestCount = Number.POSITIVE_INFINITY;

        for (let cell = 0; cell < N; cell++) {
            if (this.cells[cell] !== null) continue;
            if (!this.mostConstrained) return cell;
            const count = this.optionsFor(cell).length;
            if (count < bestCount) {
                bestCount = count;
                best = cell;
                if (count === 0) break;
            }
        }

        return this.mostConstrained ? best : -1;
    }

    /** Known colours around a cell; -1 means “not placed yet”. Order N, E, S, W. */
    private requirements(cell: number): [number, number, number, number] {
        const r = (cell / W) | 0;
        const c = cell % W;
        const north = r > 0 ? this.cells[cell - W] : null;
        const south = r < H - 1 ? this.cells[cell + W] : null;
        const west = c > 0 ? this.cells[cell - 1] : null;
        const east = c < W - 1 ? this.cells[cell + 1] : null;

        return [
            r === 0 ? BORDER : north === null ? -1 : edgesOf(north)[2],
            c === W - 1 ? BORDER : east === null ? -1 : edgesOf(east)[3],
            r === H - 1 ? BORDER : south === null ? -1 : edgesOf(south)[0],
            c === 0 ? BORDER : west === null ? -1 : edgesOf(west)[1],
        ];
    }

    /** Every legal placement for a cell, in random order. */
    private optionsFor(cell: number): number[] {
        const [needN, needE, needS, needW] = this.requirements(cell);
        const r = (cell / W) | 0;
        const c = cell % W;
        const inQuarter = r < QUARTER_ROWS && c < QUARTER_COLS;
        const options: number[] = [];

        for (let piece = 0; piece < PIECE_COUNT; piece++) {
            if (this.used & (1 << piece)) continue;
            if (this.lockAllRed && piece === ALL_RED_PIECE && !inQuarter) continue;
            const rotations = this.distinctRotations ? DISTINCT_ROTATIONS[piece] : ALL_ROTATIONS;
            for (const orientation of rotations) {
                const e = edgesOf(piece * 4 + orientation);
                if (needN >= 0 && e[0] !== needN) continue;
                if (needE >= 0 && e[1] !== needE) continue;
                if (needS >= 0 && e[2] !== needS) continue;
                if (needW >= 0 && e[3] !== needW) continue;
                options.push(piece * 4 + orientation);
            }
        }

        for (let i = options.length - 1; i > 0; i--) {
            const j = (this.random() * (i + 1)) | 0;
            const tmp = options[i];
            options[i] = options[j];
            options[j] = tmp;
        }

        return options;
    }

    /** Can the all-red tile still be placed in an empty cell of the quarter? */
    private allRedReachable(): boolean {
        if (this.used & (1 << ALL_RED_PIECE)) return true;
        for (let cell = 0; cell < N; cell++) {
            const r = (cell / W) | 0;
            const c = cell % W;
            if (r >= QUARTER_ROWS || c >= QUARTER_COLS) continue;
            if (this.cells[cell] !== null) continue;
            if (this.fits(cell, ALL_RED_PIECE)) return true;
        }
        return false;
    }

    /** Necessary condition: an orientation of `piece` matching the known edges. */
    private fits(cell: number, piece: number): boolean {
        const [needN, needE, needS, needW] = this.requirements(cell);
        for (let orientation = 0; orientation < 4; orientation++) {
            const e = edgesOf(piece * 4 + orientation);
            if (needN >= 0 && e[0] !== needN) continue;
            if (needE >= 0 && e[1] !== needE) continue;
            if (needS >= 0 && e[2] !== needS) continue;
            if (needW >= 0 && e[3] !== needW) continue;
            return true;
        }
        return false;
    }

    /* ---------------------------------------------------------------- */

    private flash(className: string): void {
        this.host.classList.add(className);
        window.setTimeout(() => this.host.classList.remove(className), 400);
    }

    private render(): void {
        let html = "";
        for (const code of this.cells) {
            html +=
                code === null
                    ? `<div class="preview__empty"></div>`
                    : pieceSvg(edgesOf(code), 1.2);
        }
        this.host.innerHTML = `<div class="preview__grid">${html}</div>`;
    }
}
