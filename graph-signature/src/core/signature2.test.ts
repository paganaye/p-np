import { describe, expect, it } from "vitest";
import { firstPass } from "./signature2.ts";

type Matrix = boolean[][];

/*
 * Signature 2 is being rebuilt one pass at a time, so only pass 1 exists. These
 * tests pin down exactly what that pass promises:
 *
 * - it groups the vertices by red degree, highest degree first;
 * - it keeps the input order inside a tied block (arbitrary, but it must be
 *   deterministic);
 * - it freezes the vertices that are alone in their block;
 * - the block profile — degrees and sizes — is the same for every relabelling.
 *
 * What is *not* promised yet: any canonical graph6. The order inside a tied
 * block is the input order, so two labelled copies of the same graph can
 * disagree on it.
 */

// ---------------------------------------------------------------- builders ---

function emptyGraph(n: number): Matrix {
    return Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
}

function addEdges(matrix: Matrix, edges: ReadonlyArray<readonly number[]>): Matrix {
    for (const [a, b] of edges) {
        matrix[a][b] = true;
        matrix[b][a] = true;
    }
    return matrix;
}

function path(n: number): Matrix {
    const edges: Array<[number, number]> = [];
    for (let i = 0; i + 1 < n; i++) edges.push([i, i + 1]);
    return addEdges(emptyGraph(n), edges);
}

function cycle(n: number): Matrix {
    return addEdges(path(n), [[n - 1, 0]]);
}

function complete(n: number): Matrix {
    const edges: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) edges.push([i, j]);
    return addEdges(emptyGraph(n), edges);
}

function star(centre: number, leaves: number): Matrix {
    const edges: Array<[number, number]> = [];
    for (let i = 0; i < leaves; i++) edges.push([centre, i + 1]);
    return addEdges(emptyGraph(leaves + 1), edges);
}

function completeBipartite(a: number, b: number): Matrix {
    const edges: Array<[number, number]> = [];
    for (let i = 0; i < a; i++) for (let j = 0; j < b; j++) edges.push([i, a + j]);
    return addEdges(emptyGraph(a + b), edges);
}

// ---------------------------------------------------------------- helpers ---

function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function randomGraph(n: number, seed: number): Matrix {
    const random = mulberry32(seed);
    const matrix = emptyGraph(n);
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (random() < 0.5) {
                matrix[i][j] = true;
                matrix[j][i] = true;
            }
        }
    }
    return matrix;
}

function shuffle(n: number, random: () => number): number[] {
    const permutation = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        const swap = permutation[i];
        permutation[i] = permutation[j];
        permutation[j] = swap;
    }
    return permutation;
}

function permute(matrix: Matrix, permutation: readonly number[]): Matrix {
    const out = emptyGraph(matrix.length);
    for (let i = 0; i < matrix.length; i++) {
        for (let j = 0; j < matrix.length; j++) {
            if (matrix[i][j]) out[permutation[i]][permutation[j]] = true;
        }
    }
    return out;
}

/** The label-free content of a pass: each block's degree and size, in order. */
function profile(matrix: Matrix): string {
    return firstPass(matrix)
        .log[0].blocks.map((block) => `${block.degree}:${block.members.length}`)
        .join(" ");
}

// ------------------------------------------------------------------ tests ---

describe("pass 1 — sort by red degree", () => {
    it("groups by degree and puts the highest first", () => {
        const blocks = firstPass(path(5)).log[0].blocks;

        expect(blocks.map((block) => block.degree)).toEqual([2, 1]);
        expect(blocks.map((block) => block.members.length)).toEqual([3, 2]);
    });

    it("keeps the input order inside a tied block", () => {
        expect(firstPass(path(5)).order).toEqual([1, 2, 3, 0, 4]);
    });

    it("sorts the degrees strictly downwards", () => {
        const blocks = firstPass(randomGraph(14, 3)).log[0].blocks;

        for (let i = 1; i < blocks.length; i++) {
            expect(blocks[i - 1].degree).toBeGreaterThan(blocks[i].degree);
        }
    });

    it("covers every vertex exactly once", () => {
        const state = firstPass(randomGraph(15, 7));

        expect([...state.order].sort((a, b) => a - b)).toEqual(
            Array.from({ length: 15 }, (_, i) => i),
        );
    });

    it("stops after pass 1", () => {
        expect(firstPass(complete(6)).log).toHaveLength(1);
    });
});

describe("groups", () => {
    /*
     * A group is the unit the next pass will refine: a set of vertices that share
     * a key. `frozen` and `tied` are properties of a *group*, not of a vertex —
     * that is the whole point of numbering them.
     */
    it("numbers the groups by position, 1 to n", () => {
        const blocks = firstPass(star(0, 5)).log[0].blocks;
        let next = 1;

        for (const block of blocks) {
            expect(block.start).toBe(next);
            next += block.members.length;
        }

        expect(next).toBe(6);
        expect(blocks.map((block) => block.degree)).toEqual([5, 1]);
    });

    it("gives a tied group several numbers and a frozen group one", () => {
        const blocks = firstPass(path(5)).log[0].blocks;

        // Path P5: three vertices of degree 2, then two of degree 1.
        expect(blocks[0].start).toBe(1);
        expect(blocks[0].members).toHaveLength(3); // #1–#3, tied
        expect(blocks[1].start).toBe(4);
        expect(blocks[1].members).toHaveLength(2); // #4–#5, tied
    });

    it("freezes a group of one", () => {
        const [centre, leaves] = firstPass(star(0, 5)).log[0].blocks;

        expect(centre.members).toEqual([0]);
        expect(leaves.members).toEqual([1, 2, 3, 4, 5]);
    });

    it("has a single tied group in a regular graph", () => {
        for (const matrix of [complete(9), cycle(8), emptyGraph(6)]) {
            const entry = firstPass(matrix).log[0];

            expect(entry.blocks).toHaveLength(1);
            expect(entry.blocks[0].members).toHaveLength(matrix.length);
        }
    });

    it("makes the groups a partition of the vertices", () => {
        const entry = firstPass(randomGraph(12, 5)).log[0];
        const flatten = entry.blocks.flatMap((block) => block.members);

        expect([...flatten].sort((a, b) => a - b)).toEqual(
            Array.from({ length: 12 }, (_, i) => i),
        );
        expect(entry.order).toEqual(flatten);
    });
});

describe("invariance of the profile", () => {
    /*
     * The profile is what a pass leaves behind when you ignore *which* vertex is
     * which: the degrees and sizes of the blocks, in order. That must not depend
     * on the labelling, otherwise nothing downstream can be canonical.
     */
    it("does not change under relabelling", () => {
        const shapes = [
            path(7),
            cycle(8),
            star(0, 6),
            completeBipartite(3, 3),
            randomGraph(12, 5),
            randomGraph(16, 11),
        ];

        for (const matrix of shapes) {
            const expected = profile(matrix);
            const random = mulberry32(2024);

            for (let round = 0; round < 32; round++) {
                expect(profile(permute(matrix, shuffle(matrix.length, random)))).toBe(expected);
            }
        }
    });

    it("is deterministic", () => {
        const matrix = randomGraph(11, 7);

        expect(profile(matrix)).toBe(profile(matrix));
        expect(firstPass(matrix).order).toEqual(firstPass(matrix).order);
    });
});
