/**
 * Les 24 carrés de Mac Mahon.
 *
 * Un carré est décrit par ses 4 couleurs d'arêtes dans l'ordre (Nord, Est, Sud, Ouest).
 * On identifie les pièces à rotation près : parmi les 3^4 = 81 coloriages,
 * il ne reste que 24 colliers distincts (formule de Burnside).
 */

export type Edges = readonly [number, number, number, number];

/** Rouge = 0, Blanc = 1, Bleu = 2. */
export const RED = 0;
export const WHITE = 1;
export const BLUE = 2;
export const COLOR_COUNT = 3;

export const COLOR_NAMES = ["rouge", "blanc", "bleu"] as const;
export const COLOR_HEX = ["#d1495b", "#fbfaf6", "#3a7ca5"] as const;
export const COLOR_DARK = ["#a8324a", "#d8d4c8", "#265b7c"] as const;

/** Rotation de 90° dans le sens horaire : (N,E,S,W) -> (W,N,E,S). */
export function rotateCW(e: Edges): Edges {
    return [e[3], e[0], e[1], e[2]];
}

function lessThan(a: Edges, b: Edges): boolean {
    for (let i = 0; i < 4; i++) {
        if (a[i] !== b[i]) return a[i] < b[i];
    }
    return false;
}

/** Représentant canonique d'une pièce, rotation la plus petite au sens lexicographique. */
export function canonical(e: Edges): Edges {
    let best: Edges = e;
    let cur: Edges = e;
    for (let i = 0; i < 3; i++) {
        cur = rotateCW(cur);
        if (lessThan(cur, best)) best = cur;
    }
    return best;
}

function buildPieces(): Edges[] {
    const seen = new Map<string, Edges>();
    for (let a = 0; a < COLOR_COUNT; a++) {
        for (let b = 0; b < COLOR_COUNT; b++) {
            for (let c = 0; c < COLOR_COUNT; c++) {
                for (let d = 0; d < COLOR_COUNT; d++) {
                    const canon = canonical([a, b, c, d]);
                    seen.set(canon.join(""), canon);
                }
            }
        }
    }
    return [...seen.values()].sort((x, y) => (x.join("") < y.join("") ? -1 : 1));
}

/** Les 24 pièces, indexées de 0 à 23 (étiquette A..X). */
export const PIECES: readonly Edges[] = buildPieces();
export const PIECE_COUNT = PIECES.length;

/** Étiquette d'une pièce : A, B, ... X. */
export function pieceLabel(index: number): string {
    return String.fromCharCode(65 + index);
}

/**
 * Orientations précalculées, aplaties dans un Int8Array.
 * code = piece * 4 + orientation, et les 4 couleurs sont à (code * 4 + {0,1,2,3}).
 */
export const ORI: Int8Array = (() => {
    const out = new Int8Array(PIECE_COUNT * 4 * 4);
    let k = 0;
    for (let p = 0; p < PIECE_COUNT; p++) {
        let e = PIECES[p];
        for (let o = 0; o < 4; o++) {
            out[k++] = e[0];
            out[k++] = e[1];
            out[k++] = e[2];
            out[k++] = e[3];
            e = rotateCW(e);
        }
    }
    return out;
})();

/** Nombre de pièces ayant exactement k couleurs distinctes (utile pour la page). */
export function piecesByDistinctColors(): number[] {
    const buckets = [0, 0, 0, 0];
    for (const p of PIECES) buckets[new Set(p).size]++;
    return buckets;
}

/** Signature lisible d'une pièce, par ex. "RBBR". */
export function pieceSignature(index: number): string {
    const letters = ["R", "B", "L"]; // Rouge, Blanc, bLeu
    return PIECES[index].map((c) => letters[c]).join("");
}
