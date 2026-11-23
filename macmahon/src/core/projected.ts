/**
 * Step 5 — le sous-problème à deux couleurs.
 *
 * On repeint blanc et bleu en « non rouge ». Les 24 pièces se projettent sur
 * 6 motifs bicolores, avec leurs multiplicités (6 fois le motif sans rouge,
 * 8 fois celui à un rouge, etc.). La machine de l'aperçu énumère les plateaux
 * valides de ce problème réduit, la pièce tout rouge étant fixée dans le coin
 * haut-gauche (comme au step 2) : ce sont les squelettes rouge / non-rouge.
 */
import { PIECES, RED } from "./pieces.ts";

export interface ProjectedPattern {
    /** N, E, S, W — 1 = rouge, 0 = non rouge. */
    bits: number[];
    /** Nombre de pièces d'origine qui se projettent sur ce motif. */
    count: number;
}

function rotate(bits: readonly number[]): number[] {
    return [bits[3], bits[0], bits[1], bits[2]];
}

function canonical(bits: readonly number[]): string {
    let best = bits.join("");
    let current = [...bits];
    for (let i = 0; i < 3; i++) {
        current = rotate(current);
        const key = current.join("");
        if (key < best) best = key;
    }
    return best;
}

/** Les 6 motifs bicolores, avec le nombre de pièces qui s'y projettent. */
export function projectedPatterns(): ProjectedPattern[] {
    const counts = new Map<string, number>();
    for (const tile of PIECES) {
        const key = canonical(tile.map((colour) => (colour === RED ? 1 : 0)));
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, count]) => ({ bits: key.split("").map(Number), count }));
}

/** Les rotations distinctes d'un motif, dans l'ordre N, E, S, W. */
export function patternOrientations(bits: readonly number[]): number[][] {
    const seen = new Set<string>();
    const out: number[][] = [];
    let current = [...bits];
    for (let i = 0; i < 4; i++) {
        const key = current.join("");
        if (!seen.has(key)) {
            seen.add(key);
            out.push(current);
        }
        current = rotate(current);
    }
    return out;
}
