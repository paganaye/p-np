/**
 * La machine du step 5 : un plateau 6 × 4 rempli avec les 6 motifs bicolores
 * (multiplicités comprises), la pièce tout rouge confinée au quart haut-gauche.
 *
 * Comme les steps 1 à 4, elle cumule les optimisations précédentes : élagage
 * immédiat, orientations distinctes, et surtout le choix de la case la plus
 * contrainte (MRV).
 */
import { patternOrientations, projectedPatterns } from "../core/projected.ts";
import { patternSvg } from "./render.ts";

const W = 6;
const H = 4;
const N = W * H;
const BORDER = 1;
const QUARTER_ROWS = 2; // top half
const QUARTER_COLS = 3; // left half

// Batching: many search steps per repaint.
const FRAME_MS = 80;
const COMPUTE_MS = 10;
const MAX_STEPS_PER_FRAME = 4000;

interface Pattern {
    bits: number[];
    count: number;
    orientations: number[][];
}

interface Option {
    pattern: number;
    bits: number[];
}

export interface PatternStats {
    placements: number;
    deadEnds: number;
    solutions: number;
}

export class PatternPreview {
    private readonly patterns: Pattern[];
    private remaining: number[];
    private cells: Array<number[] | null> = new Array(N).fill(null);
    private walker: Generator<void> | null = null;
    private timer: number | undefined;
    private stats: PatternStats = { placements: 0, deadEnds: 0, solutions: 0 };
    private readonly allRed: number;
    private finished = false;

    constructor(
        private readonly host: HTMLElement,
        private readonly onSolution: (cells: number[][]) => void,
    ) {
        this.patterns = projectedPatterns().map((pattern) => ({
            bits: pattern.bits,
            count: pattern.count,
            orientations: patternOrientations(pattern.bits),
        }));
        this.remaining = this.patterns.map((pattern) => pattern.count);
        this.allRed = this.patterns.findIndex((pattern) => pattern.bits.every((bit) => bit === 1));
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
        this.remaining = this.patterns.map((pattern) => pattern.count);
        this.walker = null;
        this.finished = false;
        this.stats = { placements: 0, deadEnds: 0, solutions: 0 };
        this.render();
    }

    getStats(): PatternStats {
        return { ...this.stats };
    }

    isFinished(): boolean {
        return this.finished;
    }

    private frame(): void {
        if (!this.walker) this.walker = this.walk();
        const deadline = performance.now() + COMPUTE_MS;
        let steps = 0;

        while (steps < MAX_STEPS_PER_FRAME) {
            const result = this.walker.next();
            steps++;
            if (result.done) {
                this.finished = true;
                this.stop();
                this.render();
                return;
            }
            if ((steps & 63) === 0 && performance.now() >= deadline) break;
        }

        this.render();
    }

    private *walk(): Generator<void> {
        const cell = this.pickCell();
        if (cell < 0) {
            this.stats.solutions++;
            this.onSolution(this.cells.map((bits) => [...(bits as number[])]));
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

        for (const option of options) {
            this.remaining[option.pattern]--;
            this.cells[cell] = option.bits;
            this.stats.placements++;
            yield;

            yield* this.walk();

            this.remaining[option.pattern]++;
            this.cells[cell] = null;
            this.stats.deadEnds++;
            yield;
        }
    }

    /** The empty cell with the fewest legal options (MRV). */
    private pickCell(): number {
        let best = -1;
        let bestCount = Number.POSITIVE_INFINITY;

        for (let cell = 0; cell < N; cell++) {
            if (this.cells[cell] !== null) continue;
            const count = this.optionsFor(cell).length;
            if (count < bestCount) {
                bestCount = count;
                best = cell;
                if (count === 0) break;
            }
        }

        return best;
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
            r === 0 ? BORDER : north === null ? -1 : north[2],
            c === W - 1 ? BORDER : east === null ? -1 : east[3],
            r === H - 1 ? BORDER : south === null ? -1 : south[0],
            c === 0 ? BORDER : west === null ? -1 : west[1],
        ];
    }

    private optionsFor(cell: number): Option[] {
        const [needN, needE, needS, needW] = this.requirements(cell);
        const r = (cell / W) | 0;
        const c = cell % W;
        const inQuarter = r < QUARTER_ROWS && c < QUARTER_COLS;
        const options: Option[] = [];

        for (let p = 0; p < this.patterns.length; p++) {
            if (this.remaining[p] === 0) continue;
            // Symmetry: the all-red pattern is confined to the top-left quarter.
            if (p === this.allRed && !inQuarter) continue;
            for (const bits of this.patterns[p].orientations) {
                if (needN >= 0 && bits[0] !== needN) continue;
                if (needE >= 0 && bits[1] !== needE) continue;
                if (needS >= 0 && bits[2] !== needS) continue;
                if (needW >= 0 && bits[3] !== needW) continue;
                options.push({ pattern: p, bits });
            }
        }

        return options;
    }

    private flash(className: string): void {
        this.host.classList.add(className);
        window.setTimeout(() => this.host.classList.remove(className), 400);
    }

    private render(): void {
        let html = "";
        for (const bits of this.cells) {
            html += bits === null ? `<div class="preview__empty"></div>` : patternSvg(bits, 1.2);
        }
        this.host.innerHTML = `<div class="preview__grid">${html}</div>`;
    }
}
