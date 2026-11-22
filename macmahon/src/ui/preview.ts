/**
 * Aperçu animé : un plateau 6 × 4 qui se remplit pièce par pièce.
 *
 * - mode "brute"  : la machine pose des pièces au hasard sans rien vérifier,
 *                   puis jette le plateau une fois plein.
 * - mode "pruned" : elle ne pose que des pièces compatibles ; dès qu'une branche
 *                   est morte, elle retire la pièce et essaie la suivante.
 * - lockAllRed    : interdit la pièce toute rouge en dehors du quart haut-gauche.
 */
import { PIECE_COUNT, PIECES, RED } from "../core/pieces.ts";
import { edgesOf, pieceSvg } from "./render.ts";

const W = 6;
const H = 4;
const N = W * H;
const BORDER = 0;
const QUARTER_ROWS = 2; // top half
const QUARTER_COLS = 3; // left half

const ALL_RED_PIECE = PIECES.findIndex((tile) => tile.every((colour) => colour === RED));

export interface PreviewStats {
    placements: number;
    deadEnds: number;
    solutions: number;
}

interface Frame {
    idx: number;
    options: number[];
    next: number;
}

export class BoardPreview {
    private cells: Array<number | null> = new Array(N).fill(null);
    private used = 0;
    private frames: Frame[] = [];
    private timer: number | undefined;
    private seed: number;
    private stats: PreviewStats = { placements: 0, deadEnds: 0, solutions: 0 };

    constructor(
        private readonly host: HTMLElement,
        private readonly mode: "brute" | "pruned",
        seed = 12345,
        private readonly lockAllRed = false,
    ) {
        this.seed = seed >>> 0;
        this.render();
    }

    start(): void {
        if (this.timer !== undefined) return;
        this.timer = window.setInterval(() => this.step(), 100);
    }

    stop(): void {
        if (this.timer === undefined) return;
        window.clearInterval(this.timer);
        this.timer = undefined;
    }

    reset(): void {
        this.cells = new Array(N).fill(null);
        this.used = 0;
        this.frames = [];
        this.stats = { placements: 0, deadEnds: 0, solutions: 0 };
        this.render();
    }

    getStats(): PreviewStats {
        return { ...this.stats };
    }

    private random(): number {
        this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
        return this.seed / 4294967296;
    }

    private step(): void {
        if (this.mode === "brute") this.bruteStep();
        else this.prunedStep();
        this.render();
    }

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

    private prunedStep(): void {
        if (this.frames.length === 0) {
            this.frames.push(this.frameFor(0));
            return;
        }
        const top = this.frames[this.frames.length - 1];

        if (top.idx === N) {
            this.stats.solutions++;
            this.flash("is-solved");
            this.backtrack();
            return;
        }

        if (top.next >= top.options.length) {
            this.backtrack();
            return;
        }

        const code = top.options[top.next++];
        this.used |= 1 << (code >> 2);
        this.cells[top.idx] = code;
        this.stats.placements++;

        // The all-red tile must still have somewhere to go in the quarter.
        // If not, this placement is already a dead end: cut the branch now
        // instead of discovering it when the whole board is full.
        if (this.lockAllRed && !this.allRedReachable()) {
            this.used &= ~(1 << (code >> 2));
            this.cells[top.idx] = null;
            this.stats.deadEnds++;
            return;
        }

        this.frames.push(this.frameFor(top.idx + 1));
    }

    /** Can the all-red tile still be placed in an empty cell of the quarter? */
    private allRedReachable(): boolean {
        if (this.used & (1 << ALL_RED_PIECE)) return true;
        for (let idx = 0; idx < N; idx++) {
            const r = (idx / W) | 0;
            const c = idx % W;
            if (r >= QUARTER_ROWS || c >= QUARTER_COLS) continue;
            if (this.cells[idx] !== null) continue;
            if (this.fits(idx, ALL_RED_PIECE)) return true;
        }
        return false;
    }

    /** Necessary condition: an orientation of `piece` matching the known edges. */
    private fits(idx: number, piece: number): boolean {
        const r = (idx / W) | 0;
        const c = idx % W;
        const above = r > 0 ? this.cells[idx - W] : null;
        const leftCell = c > 0 ? this.cells[idx - 1] : null;
        const up = r === 0 ? BORDER : above === null ? -1 : edgesOf(above)[2];
        const left = c === 0 ? BORDER : leftCell === null ? -1 : edgesOf(leftCell)[1];

        for (let orientation = 0; orientation < 4; orientation++) {
            const e = edgesOf(piece * 4 + orientation);
            if (up >= 0 && e[0] !== up) continue;
            if (left >= 0 && e[3] !== left) continue;
            if (r === H - 1 && e[2] !== BORDER) continue;
            if (c === W - 1 && e[1] !== BORDER) continue;
            return true;
        }
        return false;
    }

    private backtrack(): void {
        const done = this.frames.pop();
        if (!done) return;
        if (done.idx > 0) {
            const code = this.cells[done.idx - 1];
            if (code !== null) {
                this.used &= ~(1 << (code >> 2));
                this.cells[done.idx - 1] = null;
                this.stats.deadEnds++;
            }
        }
    }

    /** Toutes les poses légales pour la case idx, dans un ordre aléatoire. */
    private frameFor(idx: number): Frame {
        const options: number[] = [];
        const r = (idx / W) | 0;
        const c = idx % W;
        const up = r > 0 ? edgesOf(this.cells[idx - W] as number)[2] : BORDER;
        const left = c > 0 ? edgesOf(this.cells[idx - 1] as number)[1] : BORDER;
        const inQuarter = r < QUARTER_ROWS && c < QUARTER_COLS;

        for (let piece = 0; piece < PIECE_COUNT; piece++) {
            if (this.used & (1 << piece)) continue;
            if (this.lockAllRed && piece === ALL_RED_PIECE && !inQuarter) continue;
            for (let orientation = 0; orientation < 4; orientation++) {
                const e = edgesOf(piece * 4 + orientation);
                if (e[0] !== up) continue;
                if (e[3] !== left) continue;
                if (r === H - 1 && e[2] !== BORDER) continue;
                if (c === W - 1 && e[1] !== BORDER) continue;
                options.push(piece * 4 + orientation);
            }
        }

        for (let i = options.length - 1; i > 0; i--) {
            const j = (this.random() * (i + 1)) | 0;
            const tmp = options[i];
            options[i] = options[j];
            options[j] = tmp;
        }

        return { idx, options, next: 0 };
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
