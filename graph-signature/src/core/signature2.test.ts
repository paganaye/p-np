import { describe, expect, it } from "vitest";
import { advance, areTwins, depthBudget, firstPass, treeKey } from "./signature2.ts";
import type { SortState } from "./signature2.ts";

type Matrix = boolean[][];

/*
 * The signature is a sort whose key is a **walk tree**: from a vertex, follow
 * every path and mark a branch that comes back to one of its ancestors, with the
 * distance it took. These tests pin down that this really is stronger than
 * counting neighbours — the triangle and the square are the case that fails any
 * neighbour counting and yet must be separated.
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

function disjoint(...blocks: readonly Matrix[]): Matrix {
    const matrix = emptyGraph(blocks.reduce((sum, block) => sum + block.length, 0));
    let offset = 0;
    for (const block of blocks) {
        for (let i = 0; i < block.length; i++) {
            for (let j = 0; j < block.length; j++) {
                if (block[i][j]) matrix[offset + i][offset + j] = true;
            }
        }
        offset += block.length;
    }
    return matrix;
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

function runAll(matrix: Matrix): SortState {
    let state = firstPass(matrix);
    for (let pass = 0; pass < 20; pass++) {
        const next = advance(state, matrix);
        if (next === state) break;
        state = next;
    }
    return state;
}

function groupOf(state: SortState, vertex: number): number {
    const last = state.log[state.log.length - 1];
    for (const block of last.blocks) if (block.members.includes(vertex)) return block.start;
    return -1;
}

/** Position, degree and size of every group after the last pass. */
function profileOf(state: SortState): string {
    return state.log[state.log.length - 1].blocks
        .map((block) => `${block.start}:${block.degree}:${block.members.length}`)
        .join(" ");
}

function neighboursOf(matrix: Matrix): number[][] {
    return matrix.map((row) => row.flatMap((red, index) => (red ? [index] : [])));
}

// ------------------------------------------------------------------ tests ---

describe("the walk tree", () => {
    const noPositions = (n: number) => new Array<number>(n).fill(0);

    it("separates a triangle from a square at depth 3", () => {
        const triangle = neighboursOf(cycle(3));
        const square = neighboursOf(cycle(4));

        expect(treeKey(triangle, noPositions(3), 0, 2)).toBe(treeKey(square, noPositions(4), 0, 2));
        expect(treeKey(triangle, noPositions(3), 0, 3)).not.toBe(
            treeKey(square, noPositions(4), 0, 3),
        );
    });

    it("marks the return with the distance it took", () => {
        const triangle = neighboursOf(cycle(3));
        expect(treeKey(triangle, noPositions(3), 0, 3)).toContain("^3@");
        expect(treeKey(triangle, noPositions(3), 0, 2)).not.toContain("^3@");
    });

    it("is the degree at depth 1", () => {
        const p5 = neighboursOf(path(5));
        expect(treeKey(p5, noPositions(5), 0, 1)).toBe("p0(p0)");
        expect(treeKey(p5, noPositions(5), 2, 1)).toBe("p0(p0p0)");
    });

    it("carries the position of each node", () => {
        const p5 = neighboursOf(path(5));
        const positions = [0, 1, 1, 1, 0];
        expect(treeKey(p5, positions, 1, 1)).toContain("p0");
        expect(treeKey(p5, positions, 1, 1)).toContain("p1");
    });
});

describe("twins", () => {
    it("finds none between two vertices of different neighbourhoods", () => {
        const p5 = path(5);
        expect(areTwins(p5, 1, 2)).toBe(false);
    });

    it("finds the opposite vertices of a square", () => {
        const square = cycle(4);
        expect(areTwins(square, 0, 2)).toBe(true);
        expect(areTwins(square, 0, 1)).toBe(false);
    });

    it("marks a complete graph as one twin group", () => {
        const block = firstPass(complete(9)).log[0].blocks[0];
        expect(block.members).toHaveLength(9);
        expect(block.twins).toBe(true);
    });
});

describe("the sort", () => {
    it("orders by degree first", () => {
        const state = firstPass(path(5));
        expect(state.order).toEqual([1, 2, 3, 0, 4]);
        expect(state.log[0].blocks.map((block) => block.degree)).toEqual([2, 1]);
    });

    it("splits P5's middle group at depth 2", () => {
        const matrix = path(5);
        const pass = advance(firstPass(matrix), matrix).log[1];

        expect(pass.target).toBe(1);
        expect(pass.pinned).toBeUndefined();
        expect(pass.blocks.map((block) => block.members)).toEqual([[2], [1, 3], [0, 4]]);
    });

    it("pins instead of splitting when the keys agree", () => {
        const matrix = addEdges(emptyGraph(18), [
            [0, 1],
            [2, 3],
        ]);
        const first = firstPass(matrix);
        expect(first.log[0].blocks[0].members).toEqual([0, 1, 2, 3]);

        const second = advance(first, matrix);
        expect(second.log[1].pinned).toBe(0);
        expect(second.log[1].blocks[0].members).toEqual([0]);

        const third = advance(second, matrix);
        const groups = third.log[2].blocks.map((block) => block.members);
        expect(groups[0]).toEqual([0]);
        expect(groups.find((members) => members.includes(1))).toEqual([1]);
    });

    it("separates the triangle from the square", () => {
        const matrix = disjoint(cycle(3), cycle(4), emptyGraph(11));
        const state = runAll(matrix);

        expect(groupOf(state, 0)).not.toBe(groupOf(state, 3));
        expect(state.log.length).toBeGreaterThanOrEqual(3);
    });

    it("keeps the profile invariant under relabelling when nothing was pinned", () => {
        const shapes = [path(6), randomGraph(10, 3), randomGraph(12, 5)];

        for (const matrix of shapes) {
            const state = runAll(matrix);
            if (state.log.some((pass) => pass.pinned !== undefined)) continue;

            const expected = profileOf(state);
            const random = mulberry32(11);

            for (let round = 0; round < 12; round++) {
                const permuted = permute(matrix, shuffle(matrix.length, random));
                expect(profileOf(runAll(permuted))).toBe(expected);
            }
        }
    });
});

describe("the depth budget", () => {
    it("shrinks as the degree grows", () => {
        expect(depthBudget(complete(18))).toBeLessThan(depthBudget(cycle(8)));
        expect(depthBudget(cycle(8))).toBeGreaterThanOrEqual(6);
    });
});
