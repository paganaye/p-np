/**
 * Step 6 — recolorier un squelette.
 *
 * Un squelette fixe, pour chaque arête du plateau, si elle est rouge ou non.
 * Une vraie pièce ne peut donc aller dans une case que si ses arêtes rouges
 * coïncident avec le motif, et il reste à faire coïncider les couleurs
 * (blanc / bleu) des arêtes non rouges avec les voisines.
 *
 * Même moteur que les autres steps : pièces uniques, rotations distinctes,
 * et case la plus contrainte d'abord (MRV).
 */
import { PIECES, PIECE_COUNT, RED } from "./pieces.ts";

const W = 6;
const H = 4;
const N = W * H;

interface Candidate {
    piece: number;
    code: number; // piece * 4 + rotation
    edges: number[]; // N, E, S, W
}

interface Rotation {
    index: number;
    edges: number[];
}

/** Rotations réellement distinctes de chaque pièce. */
const ORIENTATIONS: Rotation[][] = PIECES.map((tile) => {
    const seen = new Set<string>();
    const out: Rotation[] = [];
    let edges = [...tile];
    for (let index = 0; index < 4; index++) {
        const key = edges.join("");
        if (!seen.has(key)) {
            seen.add(key);
            out.push({ index, edges });
        }
        edges = [edges[3], edges[0], edges[1], edges[2]];
    }
    return out;
});

/**
 * Toutes les façons de poser les 24 pièces dans un squelette donné.
 * Chaque plateau est renvoyé sous forme de 24 codes (pièce * 4 + orientation).
 */
export function enumerateRefinements(skeleton: readonly (readonly number[])[]): Uint8Array[] {
    const candidates: Candidate[][] = [];

    for (let cell = 0; cell < N; cell++) {
        const bits = skeleton[cell];
        const list: Candidate[] = [];
        for (let piece = 0; piece < PIECE_COUNT; piece++) {
            for (const rotation of ORIENTATIONS[piece]) {
                let matches = true;
                for (let side = 0; side < 4; side++) {
                    if ((rotation.edges[side] === RED) !== (bits[side] === 1)) {
                        matches = false;
                        break;
                    }
                }
                if (matches) {
                    list.push({ piece, code: piece * 4 + rotation.index, edges: rotation.edges });
                }
            }
        }
        candidates.push(list);
    }

    const placed: Array<Candidate | null> = new Array(N).fill(null);
    const board = new Int8Array(N);
    const boards: Uint8Array[] = [];
    let used = 0;

    const compatible = (cell: number, candidate: Candidate): boolean => {
        const r = (cell / W) | 0;
        const c = cell % W;
        if (r > 0) {
            const up = placed[cell - W];
            if (up && candidate.edges[0] !== up.edges[2]) return false;
        }
        if (r < H - 1) {
            const down = placed[cell + W];
            if (down && candidate.edges[2] !== down.edges[0]) return false;
        }
        if (c > 0) {
            const left = placed[cell - 1];
            if (left && candidate.edges[3] !== left.edges[1]) return false;
        }
        if (c < W - 1) {
            const right = placed[cell + 1];
            if (right && candidate.edges[1] !== right.edges[3]) return false;
        }
        return true;
    };

    const viable = (cell: number): Candidate[] => {
        const options: Candidate[] = [];
        for (const candidate of candidates[cell]) {
            if (used & (1 << candidate.piece)) continue;
            if (!compatible(cell, candidate)) continue;
            options.push(candidate);
        }
        return options;
    };

    const dfs = (): void => {
        let bestCell = -1;
        let bestOptions: Candidate[] | null = null;

        for (let cell = 0; cell < N; cell++) {
            if (placed[cell]) continue;
            const options = viable(cell);
            if (options.length === 0) return;
            if (!bestOptions || options.length < bestOptions.length) {
                bestCell = cell;
                bestOptions = options;
                if (options.length === 1) break;
            }
        }

        if (!bestOptions) {
            boards.push(Uint8Array.from(board));
            return;
        }

        for (const candidate of bestOptions) {
            placed[bestCell] = candidate;
            board[bestCell] = candidate.code;
            used |= 1 << candidate.piece;
            dfs();
            used &= ~(1 << candidate.piece);
            placed[bestCell] = null;
        }
    };

    dfs();
    return boards;
}
